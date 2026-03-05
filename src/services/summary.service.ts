// =============================================================================
// Summary Service - Generate and manage summaries via RAG (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
    SummaryRow,
    SummaryType,
    GeneratedSummary,
    SummaryResponse,
    SummaryStatus
} from '@/types/study';
import {
    STUDY_CONFIG,
    SUMMARY_PROMPTS,
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

export class SummaryService {
    private userId: string;
    private ragService: RagService;
    private llm: LLMProvider;

    constructor(userId: string) {
        this.userId = userId;
        this.ragService = new RagService(userId);
        this.llm = createLLMProvider();
    }

    // ===========================================================================
    // Generate Summary
    // ===========================================================================

    async generateSummary(
        conversationId: string,
        summaryType: SummaryType,
        topic?: string
    ): Promise<SummaryResponse> {
        // 1. Rate limit
        await this.checkRateLimit();

        // 2. Get next version number (preserves history)
        const nextVersion = await this.getNextVersion(conversationId, summaryType);

        // 3. Retrieve context via RAG
        const query = topic
            ? `Complete information about: ${topic}`
            : 'All key concepts, topics, and important information from the study material';

        const context = await this.ragService.retrieveContext(conversationId, query, {
            k: 10, // More chunks for summaries
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

        // 5. Create summary record (status: generating)
        let summary;
        try {
            summary = await prisma.summary.create({
                data: {
                    user_id: this.userId,
                    conversation_id: conversationId,
                    summary_type: summaryType,
                    title: this.getSummaryTitle(summaryType, topic),
                    status: 'generating',
                    version: nextVersion,
                    metadata: { topic, summaryType, contextTokens: context.tokenCount } as Prisma.JsonObject,
                }
            });
        } catch (createError: any) {
            // Check for unique constraint violation (concurrent generation)
            if (createError?.code === 'P2002') {
                throw new StudyToolError(
                    'A summary of this type is already being generated',
                    'CONCURRENT_GENERATION'
                );
            }
            throw new StudyToolError('Failed to create summary', 'CREATE_FAILED');
        }

        try {
            // 6. Build prompt and call LLM
            const promptTemplate = SUMMARY_PROMPTS[summaryType];
            const systemPrompt = promptTemplate.replace('{context}', context.formattedContext);

            const userMessage = topic
                ? `Create a ${summaryType} summary about "${topic}" from the provided context.`
                : `Create a ${summaryType} summary of all the provided study material.`;

            // 7. Token budget check
            const promptTokens = estimateTokens(systemPrompt + userMessage);
            if (promptTokens > STUDY_CONFIG.MAX_PROMPT_TOKENS) {
                throw new StudyToolError('Context too large for summary generation', 'TOKEN_OVERFLOW');
            }

            // 7b. Atomic budget enforcement
            // Note: debitTokenBudget internally should use Prisma now
            const debit = await debitTokenBudget({
                userId: this.userId,
                feature: 'summary',
                provider: 'groq',
                inputTokens: promptTokens,
                outputTokens: STUDY_CONFIG.SUMMARY_MAX_TOKENS,
            });

            if (!debit.allowed) {
                await this.markSummaryFailed(summary.id);
                throw new BudgetExceededError(debit);
            }

            const llmResponse = await this.llm.generate({
                systemPrompt,
                userMessage,
                maxTokens: STUDY_CONFIG.SUMMARY_MAX_TOKENS,
                jsonMode: true,
            });

            // 8. Parse response
            const parsed = parseLlmJson<GeneratedSummary | { error: string }>(
                llmResponse.content
            );

            if ('error' in parsed && parsed.error === 'insufficient_context') {
                await this.markSummaryFailed(summary.id);
                throw new StudyToolError(INSUFFICIENT_CONTEXT_MESSAGE, 'INSUFFICIENT_CONTEXT');
            }

            const generated = parsed as GeneratedSummary;

            if (!generated.content || generated.content.trim().length === 0) {
                await this.markSummaryFailed(summary.id);
                throw new StudyToolError('Empty summary generated', 'GENERATION_FAILED');
            }

            // 9. Calculate word count
            const wordCount = generated.content.trim().split(/\s+/).length;

            // 10. Update summary with content
            const updated = await prisma.summary.update({
                where: { id: summary.id },
                data: {
                    title: generated.title || summary.title,
                    content: generated.content,
                    status: 'ready',
                    word_count: wordCount,
                }
            });

            return { summary: { ...updated, summary_type: updated.summary_type as SummaryType, status: updated.status as SummaryStatus, created_at: updated.created_at.toISOString(), updated_at: updated.updated_at.toISOString() } as unknown as SummaryRow };
        } catch (error) {
            if (error instanceof StudyToolError) throw error;
            await this.markSummaryFailed(summary.id);
            throw error;
        }
    }

    // ===========================================================================
    // Get Summary
    // ===========================================================================

    async getSummary(
        conversationId: string,
        summaryType?: SummaryType
    ): Promise<SummaryResponse[]> {

        const summaries = await prisma.summary.findMany({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                status: 'ready',
                ...(summaryType ? { summary_type: summaryType } : {})
            },
            orderBy: { created_at: 'desc' }
        });

        return summaries.map((s) => ({ summary: { ...s, summary_type: s.summary_type as SummaryType, status: s.status as SummaryStatus, created_at: s.created_at.toISOString(), updated_at: s.updated_at.toISOString() } as unknown as SummaryRow }));
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000);
        const count = await prisma.summary.count({
            where: {
                user_id: this.userId,
                created_at: {
                    gte: oneHourAgo
                }
            }
        });

        if (count >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
            throw new StudyToolError(
                'Rate limit exceeded. Please wait before generating more summaries.',
                'RATE_LIMITED'
            );
        }
    }

    /**
     * Get next version number for summary regeneration.
     * Previous versions are preserved in the DB for history.
     */
    private async getNextVersion(
        conversationId: string,
        summaryType: SummaryType
    ): Promise<number> {
        const data = await prisma.summary.findFirst({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                summary_type: summaryType
            },
            select: { version: true },
            orderBy: { version: 'desc' },
        });

        return (data?.version ?? 0) + 1;
    }

    private async markSummaryFailed(summaryId: string): Promise<void> {
        await prisma.summary.update({
            where: { id: summaryId },
            data: { status: 'failed' }
        });
    }

    private getSummaryTitle(type: SummaryType, topic?: string): string {
        const prefix = {
            bullet: 'Bullet Summary',
            paragraph: 'Summary',
            exam: 'Exam Prep',
        }[type];

        return topic ? `${prefix}: ${topic}` : prefix;
    }
}
