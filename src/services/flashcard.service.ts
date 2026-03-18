// =============================================================================
// Flashcard Service - Generate and manage flashcards via RAG (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
    FlashcardSetRow,
    FlashcardRow,
    GeneratedFlashcard,
    FlashcardSetResponse,
    FlashcardSetStatus
} from '@/types/study';
import {
    STUDY_CONFIG,
    FLASHCARD_SYSTEM_PROMPT,
    INSUFFICIENT_CONTEXT_MESSAGE,
} from '@/types/study';
import { RagService } from '@/services/rag.service';
import { createLLMProvider } from '@/lib/ai/registry';
import { estimateTokens, parseLlmJson } from '@/lib/ai/tokens';
import { debitTokenBudget } from '@/lib/token-governance';
import { BudgetExceededError } from '@/lib/errors';
import type { LLMProvider } from '@/types/ai.types';
import { StudyToolError } from '@/services/quiz.service';

// =============================================================================
// Service
// =============================================================================

export class FlashcardService {
    private userId: string;
    private ragService: RagService;
    private llm: LLMProvider;

    constructor(userId: string) {
        this.userId = userId;
        this.ragService = new RagService(userId);
        this.llm = createLLMProvider();
    }

    // ===========================================================================
    // Generate Flashcards
    // ===========================================================================

    async generateFlashcards(
        conversationId: string,
        topic?: string
    ): Promise<FlashcardSetResponse> {
        // 1. Rate limit check
        await this.checkRateLimit();

        // 2. Check for concurrent generation
        await this.checkConcurrentGeneration(conversationId);

        // 3. Retrieve context via RAG
        const query = topic
            ? `Key concepts, definitions, and facts about: ${topic}`
            : 'All key concepts, definitions, important terms, and facts from the study material';

        const context = await this.ragService.retrieveContext(conversationId, query, {
            k: 8,
            threshold: 0.7,
            maxContextTokens: STUDY_CONFIG.MAX_PROMPT_TOKENS,
        });

        // 4. Check minimum context
        if (
            context.chunks.length < STUDY_CONFIG.MIN_CONTEXT_CHUNKS ||
            context.tokenCount < STUDY_CONFIG.MIN_CONTEXT_TOKENS
        ) {
            throw new StudyToolError(INSUFFICIENT_CONTEXT_MESSAGE, 'INSUFFICIENT_CONTEXT');
        }

        // 5. Create flashcard set (status: generating)
        let set;
        try {
            set = await prisma.flashcardSet.create({
                data: {
                    user_id: this.userId,
                    conversation_id: conversationId,
                    title: topic ? `Flashcards: ${topic}` : 'Flashcards',
                    status: 'generating',
                    card_count: STUDY_CONFIG.FLASHCARD_COUNT,
                    metadata: { topic, contextTokens: context.tokenCount } as Prisma.JsonObject,
                }
            });
        } catch (error) {
            throw new StudyToolError('Failed to create flashcard set', 'CREATE_FAILED');
        }

        try {
            // 6. Build prompt and call LLM
            const systemPrompt = FLASHCARD_SYSTEM_PROMPT
                .replace('{count}', String(STUDY_CONFIG.FLASHCARD_COUNT))
                .replace('{context}', context.formattedContext);

            const userMessage = topic
                ? `Generate ${STUDY_CONFIG.FLASHCARD_COUNT} flashcards about "${topic}" from the provided context.`
                : `Generate ${STUDY_CONFIG.FLASHCARD_COUNT} flashcards covering the key concepts from the provided context.`;

            // 7. Token budget check
            const promptTokens = estimateTokens(systemPrompt + userMessage);
            if (promptTokens > STUDY_CONFIG.MAX_PROMPT_TOKENS) {
                throw new StudyToolError('Context too large for flashcard generation', 'TOKEN_OVERFLOW');
            }

            // 7b. Atomic budget enforcement
            const debit = await debitTokenBudget({
                userId: this.userId,
                feature: 'flashcard',
                provider: 'groq',
                inputTokens: promptTokens,
                outputTokens: 4096,
            });
            if (!debit.allowed) {
                await this.markSetFailed(set.id);
                throw new BudgetExceededError(debit);
            }

            const llmResponse = await this.llm.generate({
                systemPrompt,
                userMessage,
                maxTokens: 1536,
                temperature: 0.2,
                jsonMode: true,
            });

            // 8. Parse and validate response
            let parsed: GeneratedFlashcard[] | { error: string };
            try {
                parsed = parseLlmJson<GeneratedFlashcard[] | { error: string }>(
                    llmResponse.content
                );
            } catch (parseError) {
                await this.markSetFailed(set.id);
                throw new StudyToolError(
                    'The model returned an invalid flashcard format. Please try again.',
                    'PARSE_ERROR'
                );
            }

            if (!Array.isArray(parsed)) {
                if ('error' in parsed && parsed.error === 'insufficient_context') {
                    await this.markSetFailed(set.id);
                    throw new StudyToolError(INSUFFICIENT_CONTEXT_MESSAGE, 'INSUFFICIENT_CONTEXT');
                }
                throw new StudyToolError('Invalid flashcard response from LLM', 'PARSE_ERROR');
            }

            // 9. Validate cards
            const validCards = parsed.filter(c => c.front && c.back);

            if (validCards.length === 0) {
                await this.markSetFailed(set.id);
                throw new StudyToolError('No valid flashcards generated', 'GENERATION_FAILED');
            }

            // 10. Store flashcards
            const chunkIds = context.chunks.map(c => c.id);

            await prisma.flashcard.createMany({
                data: validCards.map((c, i) => ({
                    set_id: set.id,
                    card_index: i,
                    front: c.front,
                    back: c.back,
                    is_learned: false,
                    review_count: 0,
                    source_chunk_ids: chunkIds,
                }))
            });

            const cards = await prisma.flashcard.findMany({
                where: { set_id: set.id },
                orderBy: { card_index: 'asc' }
            });

            // 11. Mark set ready
            const updated = await prisma.flashcardSet.update({
                where: { id: set.id },
                data: {
                    status: 'ready',
                    card_count: validCards.length,
                }
            });

            const returnedSet = { ...updated, status: updated.status as FlashcardSetStatus, created_at: updated.created_at.toISOString(), updated_at: updated.updated_at.toISOString() } as unknown as FlashcardSetRow;

            return { set: returnedSet, cards: cards as unknown as FlashcardRow[] };
        } catch (error) {
            if (error instanceof StudyToolError) throw error;
            await this.markSetFailed(set.id);
            throw error;
        }
    }

    // ===========================================================================
    // Mark Flashcard
    // ===========================================================================

    async markFlashcard(
        flashcardId: string,
        isLearned: boolean
    ): Promise<FlashcardRow> {
        // 1. Verify ownership via RLS (join through set)
        const card = await prisma.flashcard.findUnique({
            where: { id: flashcardId },
            include: {
                set: { select: { user_id: true } }
            }
        });

        if (!card || card.set.user_id !== this.userId) {
            throw new StudyToolError('Flashcard not found', 'NOT_FOUND');
        }

        // 2. Update card
        const updated = await prisma.flashcard.update({
            where: { id: flashcardId },
            data: {
                is_learned: isLearned,
                review_count: { increment: 1 },
                last_reviewed_at: new Date(),
            }
        });

        return { ...updated, created_at: updated.created_at.toISOString(), last_reviewed_at: updated.last_reviewed_at?.toISOString() ?? null } as unknown as FlashcardRow;
    }

    // ===========================================================================
    // Get Flashcard Sets
    // ===========================================================================

    async getFlashcardSets(conversationId: string): Promise<FlashcardSetResponse[]> {
        const sets = await prisma.flashcardSet.findMany({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                status: 'ready'
            },
            orderBy: { created_at: 'desc' },
            include: {
                flashcards: {
                    orderBy: { card_index: 'asc' }
                }
            }
        });

        if (!sets || sets.length === 0) return [];

        const results: FlashcardSetResponse[] = sets.map((s: any) => ({
            set: { ...s, status: s.status as FlashcardSetStatus, created_at: s.created_at.toISOString(), updated_at: s.updated_at.toISOString() } as unknown as FlashcardSetRow,
            cards: s.flashcards.map((c: any) => ({
                ...c,
                created_at: c.created_at.toISOString(),
                last_reviewed_at: c.last_reviewed_at?.toISOString() ?? null
            })) as unknown as FlashcardRow[]
        }));

        return results;
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000);

        const count = await prisma.flashcardSet.count({
            where: {
                user_id: this.userId,
                created_at: { gte: oneHourAgo }
            }
        });

        if (count >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
            throw new StudyToolError(
                'Rate limit exceeded. Please wait before generating more flashcards.',
                'RATE_LIMITED'
            );
        }
    }

    private async checkConcurrentGeneration(conversationId: string): Promise<void> {
        const concurrent = await prisma.flashcardSet.findFirst({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                status: 'generating'
            },
            select: { id: true }
        });

        if (concurrent) {
            throw new StudyToolError(
                'Flashcards are already being generated for this conversation',
                'CONCURRENT_GENERATION'
            );
        }
    }

    private async markSetFailed(setId: string): Promise<void> {
        await prisma.flashcardSet.update({
            where: { id: setId },
            data: { status: 'failed' }
        });
    }
}
