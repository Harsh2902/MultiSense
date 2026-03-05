// =============================================================================
// RAG Service - Retrieval-Augmented Generation
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    RetrievalConfig,
    RetrievedChunk,
    RagContext,
    MatchChunkResult,
} from '@/types/rag';
import {
    RAG_CONFIG,
    DEFAULT_RETRIEVAL_CONFIG,
    RAG_SYSTEM_PROMPT,
    NO_CONTEXT_RESPONSE,
} from '@/types/rag';
import { EmbeddingService } from '@/lib/embeddings';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for retrieval-augmented generation
 */
export class RagService {
    private supabase: SupabaseClient;
    private embeddingService: EmbeddingService;
    private userId: string;

    constructor(supabase: SupabaseClient, userId: string) {
        this.supabase = supabase;
        this.userId = userId;
        this.embeddingService = new EmbeddingService(supabase);
    }

    // ===========================================================================
    // Retrieve Context
    // ===========================================================================

    /**
     * Retrieve relevant context for a query
     * 
     * @param conversationId - Conversation to search within
     * @param query - User query
     * @param config - Retrieval configuration
     */
    async retrieveContext(
        conversationId: string,
        query: string,
        config: Partial<RetrievalConfig> = {}
    ): Promise<RagContext> {
        const cfg = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };

        // 1. Generate query embedding
        const queryEmbedding = await this.embeddingService.embedQuery(query);

        // 2. Search for matching chunks via RPC
        const { data: matches, error } = await this.supabase.rpc('match_chunks', {
            p_conversation_id: conversationId,
            p_embedding: queryEmbedding,
            p_threshold: cfg.threshold,
            p_limit: cfg.k,
        });

        if (error) {
            throw new Error(`Failed to retrieve chunks: ${error.message}`);
        }

        // 3. Convert to RetrievedChunk format
        const rawChunks: RetrievedChunk[] = (matches || []).map((m: MatchChunkResult) => ({
            id: m.id,
            sourceId: m.source_id,
            content: m.content,
            chunkIndex: m.chunk_index,
            similarity: m.similarity,
            sourceMetadata: {
                title: m.source_title,
                fileName: m.source_file_name,
                sourceType: m.source_type,
            },
        }));

        const rawChunkCount = rawChunks.length;

        // 4. Sort by source order (group by source, then by chunk index)
        const sorted = this.sortBySourceOrder(rawChunks);

        // 5. Deduplicate overlapping chunks
        const deduped = this.deduplicateOverlaps(sorted);

        // 6. Apply token limit
        const { chunks, truncated, tokenCount } = this.applyTokenLimit(
            deduped,
            cfg.maxContextTokens
        );

        // 7. Format context for LLM
        const formattedContext = this.formatContext(chunks);

        return {
            chunks,
            formattedContext,
            tokenCount,
            truncated,
            rawChunkCount,
        };
    }

    // ===========================================================================
    // Build Prompt
    // ===========================================================================

    /**
     * Build system prompt with context and hallucination prevention
     */
    buildSystemPrompt(context: RagContext): string {
        if (context.chunks.length === 0) {
            return ''; // Will use NO_CONTEXT_RESPONSE instead
        }

        return RAG_SYSTEM_PROMPT.replace('{context}', context.formattedContext);
    }

    /**
     * Check if we should skip LLM call (no context)
     */
    shouldSkipLlm(context: RagContext): boolean {
        return context.chunks.length === 0;
    }

    /**
     * Get canned response when no context found
     */
    getNoContextResponse(): string {
        return NO_CONTEXT_RESPONSE;
    }

    // ===========================================================================
    // Context Processing
    // ===========================================================================

    /**
     * Sort chunks by source order
     * Groups chunks by source, then sorts by chunk index
     */
    private sortBySourceOrder(chunks: RetrievedChunk[]): RetrievedChunk[] {
        return [...chunks].sort((a, b) => {
            // First sort by source ID
            const sourceCompare = a.sourceId.localeCompare(b.sourceId);
            if (sourceCompare !== 0) return sourceCompare;

            // Then by chunk index
            return a.chunkIndex - b.chunkIndex;
        });
    }

    /**
     * Remove duplicate content from overlapping chunks
     * Adjacent chunks may have overlapping content due to chunking strategy
     */
    private deduplicateOverlaps(chunks: RetrievedChunk[]): RetrievedChunk[] {
        if (chunks.length <= 1) return chunks;

        const result: RetrievedChunk[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const current = chunks[i];
            if (!current) continue;

            // Check if this chunk overlaps with the previous one
            if (i > 0) {
                const prev = chunks[i - 1];
                if (!prev) continue;

                // Only check overlap within same source and adjacent chunks
                if (current.sourceId === prev.sourceId &&
                    current.chunkIndex === prev.chunkIndex + 1) {
                    // Find overlap and remove from current
                    const overlapEnd = this.findOverlap(prev.content, current.content);
                    if (overlapEnd > 0) {
                        current.content = current.content.substring(overlapEnd);
                    }
                }
            }

            // Only add non-empty chunks
            if (current.content.trim().length > 0) {
                result.push(current);
            }
        }

        return result;
    }

    /**
     * Find overlap between end of text1 and start of text2
     * Returns length of overlap
     */
    private findOverlap(text1: string, text2: string): number {
        const maxOverlap = Math.min(200, text1.length, text2.length);

        for (let len = maxOverlap; len > 20; len--) {
            const end1 = text1.substring(text1.length - len);
            const start2 = text2.substring(0, len);

            if (end1 === start2) {
                return len;
            }
        }

        return 0;
    }

    /**
     * Apply token limit to chunks
     */
    private applyTokenLimit(
        chunks: RetrievedChunk[],
        maxTokens: number
    ): { chunks: RetrievedChunk[]; truncated: boolean; tokenCount: number } {
        const result: RetrievedChunk[] = [];
        let tokenCount = 0;
        let truncated = false;

        for (const chunk of chunks) {
            const chunkTokens = this.estimateTokens(chunk.content);

            if (tokenCount + chunkTokens > maxTokens) {
                truncated = true;
                break;
            }

            result.push(chunk);
            tokenCount += chunkTokens;
        }

        return { chunks: result, truncated, tokenCount };
    }

    /**
     * Estimate token count for text
     * 4 characters ≈ 1 token (conservative estimate)
     */
    private estimateTokens(text: string): number {
        // Count words and adjust
        const words = text.trim().split(/\s+/).length;
        const chars = text.length;

        // Use average of word-based and char-based estimate
        const wordEstimate = words * 1.3;
        const charEstimate = chars / 4;

        return Math.ceil((wordEstimate + charEstimate) / 2);
    }

    // ===========================================================================
    // Formatting
    // ===========================================================================

    /**
     * Format chunks for LLM context injection
     */
    private formatContext(chunks: RetrievedChunk[]): string {
        if (chunks.length === 0) return '';

        return chunks
            .map((chunk, index) => {
                const source = chunk.sourceMetadata?.title ||
                    chunk.sourceMetadata?.fileName ||
                    `Source ${index + 1}`;
                return `[${source}]:\n${chunk.content}`;
            })
            .join('\n\n---\n\n');
    }
}

// =============================================================================
// Export
// =============================================================================

// RagService is exported via class declaration
