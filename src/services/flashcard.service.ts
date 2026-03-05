// =============================================================================
// Flashcard Service - Generate and manage flashcards via RAG
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    FlashcardSetRow,
    FlashcardRow,
    GeneratedFlashcard,
    FlashcardSetResponse,
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
    private supabase: SupabaseClient;
    private userId: string;
    private ragService: RagService;
    private llm: LLMProvider;

    constructor(supabase: SupabaseClient, userId: string) {
        this.supabase = supabase;
        this.userId = userId;
        this.ragService = new RagService(supabase, userId);
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
        const { data: set, error: createError } = await this.supabase
            .from('flashcard_sets')
            .insert({
                user_id: this.userId,
                conversation_id: conversationId,
                title: topic ? `Flashcards: ${topic}` : 'Flashcards',
                status: 'generating',
                card_count: STUDY_CONFIG.FLASHCARD_COUNT,
                metadata: { topic, contextTokens: context.tokenCount },
            })
            .select()
            .single();

        if (createError || !set) {
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
            const debit = await debitTokenBudget(this.supabase, {
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
                jsonMode: true,
            });

            // 8. Parse and validate response
            const parsed = parseLlmJson<GeneratedFlashcard[] | { error: string }>(
                llmResponse.content
            );

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
            const { data: cards, error: cError } = await this.supabase
                .from('flashcards')
                .insert(
                    validCards.map((c, i) => ({
                        set_id: set.id,
                        card_index: i,
                        front: c.front,
                        back: c.back,
                        is_learned: false,
                        review_count: 0,
                        source_chunk_ids: chunkIds,
                    }))
                )
                .select();

            if (cError) {
                await this.markSetFailed(set.id);
                throw new StudyToolError('Failed to store flashcards', 'STORE_FAILED');
            }

            // 11. Mark set ready
            await this.supabase
                .from('flashcard_sets')
                .update({
                    status: 'ready',
                    card_count: validCards.length,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', set.id);

            const updatedSet = { ...set, status: 'ready' as const, card_count: validCards.length };

            return { set: updatedSet, cards: cards || [] };
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
        const { data: card, error: fetchError } = await this.supabase
            .from('flashcards')
            .select(`
        *,
        flashcard_sets!inner(user_id)
      `)
            .eq('id', flashcardId)
            .single();

        if (fetchError || !card) {
            throw new StudyToolError('Flashcard not found', 'NOT_FOUND');
        }

        // 2. Update card
        const { data: updated, error: updateError } = await this.supabase
            .from('flashcards')
            .update({
                is_learned: isLearned,
                review_count: (card.review_count || 0) + 1,
                last_reviewed_at: new Date().toISOString(),
            })
            .eq('id', flashcardId)
            .select()
            .single();

        if (updateError || !updated) {
            throw new StudyToolError('Failed to update flashcard', 'UPDATE_FAILED');
        }

        return updated;
    }

    // ===========================================================================
    // Get Flashcard Sets
    // ===========================================================================

    async getFlashcardSets(conversationId: string): Promise<FlashcardSetResponse[]> {
        const { data: sets } = await this.supabase
            .from('flashcard_sets')
            .select('*')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('status', 'ready')
            .order('created_at', { ascending: false });

        if (!sets || sets.length === 0) return [];

        const results: FlashcardSetResponse[] = [];
        for (const set of sets) {
            const { data: cards } = await this.supabase
                .from('flashcards')
                .select('*')
                .eq('set_id', set.id)
                .order('card_index', { ascending: true });

            results.push({ set, cards: cards || [] });
        }

        return results;
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count } = await this.supabase
            .from('flashcard_sets')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', this.userId)
            .gte('created_at', oneHourAgo);

        if ((count ?? 0) >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
            throw new StudyToolError(
                'Rate limit exceeded. Please wait before generating more flashcards.',
                'RATE_LIMITED'
            );
        }
    }

    private async checkConcurrentGeneration(conversationId: string): Promise<void> {
        const { data } = await this.supabase
            .from('flashcard_sets')
            .select('id')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('status', 'generating')
            .limit(1);

        if (data && data.length > 0) {
            throw new StudyToolError(
                'Flashcards are already being generated for this conversation',
                'CONCURRENT_GENERATION'
            );
        }
    }

    private async markSetFailed(setId: string): Promise<void> {
        await this.supabase
            .from('flashcard_sets')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', setId);
    }
}
