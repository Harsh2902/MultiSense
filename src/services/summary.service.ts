// =============================================================================
// Summary Service - Generate and manage summaries via RAG
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    SummaryRow,
    SummaryType,
    GeneratedSummary,
    SummaryResponse,
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
        const { data: summary, error: createError } = await this.supabase
            .from('summaries')
            .insert({
                user_id: this.userId,
                conversation_id: conversationId,
                summary_type: summaryType,
                title: this.getSummaryTitle(summaryType, topic),
                status: 'generating',
                version: nextVersion,
                metadata: { topic, summaryType, contextTokens: context.tokenCount },
            })
            .select()
            .single();

        if (createError || !summary) {
            // Check for unique constraint violation (concurrent generation)
            if (createError?.code === '23505') {
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
            const debit = await debitTokenBudget(this.supabase, {
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
            const { data: updated, error: updateError } = await this.supabase
                .from('summaries')
                .update({
                    title: generated.title || summary.title,
                    content: generated.content,
                    status: 'ready',
                    word_count: wordCount,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', summary.id)
                .select()
                .single();

            if (updateError || !updated) {
                await this.markSummaryFailed(summary.id);
                throw new StudyToolError('Failed to store summary', 'STORE_FAILED');
            }

            return { summary: updated };
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
        let query = this.supabase
            .from('summaries')
            .select('*')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('status', 'ready')
            .order('created_at', { ascending: false });

        if (summaryType) {
            query = query.eq('summary_type', summaryType);
        }

        const { data: summaries } = await query;

        return (summaries || []).map((s: SummaryRow) => ({ summary: s }));
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count } = await this.supabase
            .from('summaries')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', this.userId)
            .gte('created_at', oneHourAgo);

        if ((count ?? 0) >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
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
        const { data } = await this.supabase
            .from('summaries')
            .select('version')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('summary_type', summaryType)
            .order('version', { ascending: false })
            .limit(1);

        return (data?.[0]?.version ?? 0) + 1;
    }

    private async markSummaryFailed(summaryId: string): Promise<void> {
        await this.supabase
            .from('summaries')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', summaryId);
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
