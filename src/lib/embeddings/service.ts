// =============================================================================
// Embedding Service - Batch embedding with retry logic
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmbeddingProvider, EmbeddingResult } from '@/types/rag';
import { RAG_CONFIG } from '@/types/rag';
import { createEmbeddingProvider } from './provider';
import { EMBEDDING_MODELS } from '@/config/models';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for generating and storing embeddings
 */
export class EmbeddingService {
    private supabase: SupabaseClient;
    private provider: EmbeddingProvider;

    constructor(supabase: SupabaseClient, provider?: EmbeddingProvider) {
        this.supabase = supabase;
        this.provider = provider || createEmbeddingProvider();
    }

    // ===========================================================================
    // Generate Embeddings for Source
    // ===========================================================================

    /**
     * Generate embeddings for all chunks of a source
     * Called immediately after chunking (not lazy)
     */
    async embedSourceChunks(sourceId: string): Promise<EmbeddingResult> {
        // 1. Get all chunks for this source
        const { data: chunks, error: fetchError } = await this.supabase
            .from('source_chunks')
            .select('id, content')
            .eq('source_id', sourceId)
            .order('chunk_index', { ascending: true });

        if (fetchError) {
            throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
        }

        if (!chunks || chunks.length === 0) {
            return { success: [], failed: [], count: 0 };
        }

        // 2. Process in batches
        const typedChunks = chunks as Array<{ id: string; content: string }>;
        const result: EmbeddingResult = { success: [], failed: [], count: 0 };
        const batches = this.chunkArray(typedChunks, RAG_CONFIG.EMBEDDING_BATCH_SIZE);

        for (const batch of batches) {
            await this.processBatch(batch, result);
        }

        return result;
    }

    // ===========================================================================
    // Batch Processing
    // ===========================================================================

    /**
     * Process a batch of chunks
     */
    private async processBatch(
        chunks: Array<{ id: string; content: string }>,
        result: EmbeddingResult
    ): Promise<void> {
        const texts = chunks.map(c => c.content);

        try {
            // Try batch embedding first
            const embeddings = await this.withRetry(
                () => this.provider.batchEmbed(texts),
                RAG_CONFIG.MAX_EMBEDDING_RETRIES
            );

            // Store embeddings
            await this.storeEmbeddings(chunks, embeddings);

            result.success.push(...chunks.map(c => c.id));
            result.count += chunks.length;
        } catch (batchError) {
            // Batch failed, try individual chunks
            console.warn('[Embedding] Batch failed, trying individual chunks');

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (!chunk) continue;

                try {
                    const embedding = await this.withRetry(
                        () => this.provider.embed(chunk.content),
                        RAG_CONFIG.MAX_EMBEDDING_RETRIES
                    );

                    await this.storeEmbedding(chunk.id, embedding);
                    result.success.push(chunk.id);
                    result.count++;
                } catch {
                    result.failed.push(chunk.id);
                }
            }
        }
    }

    // ===========================================================================
    // Storage
    // ===========================================================================

    /**
     * Store multiple embeddings
     */
    private async storeEmbeddings(
        chunks: Array<{ id: string }>,
        embeddings: number[][]
    ): Promise<void> {
        const rows = chunks.map((chunk, i) => ({
            chunk_id: chunk.id,
            embedding: embeddings[i],
            model: EMBEDDING_MODELS.openai.default,
        }));

        const { error } = await this.supabase
            .from('embeddings')
            .upsert(rows, { onConflict: 'chunk_id' });

        if (error) {
            throw new Error(`Failed to store embeddings: ${error.message}`);
        }
    }

    /**
     * Store single embedding
     */
    private async storeEmbedding(chunkId: string, embedding: number[]): Promise<void> {
        const { error } = await this.supabase
            .from('embeddings')
            .upsert({
                chunk_id: chunkId,
                embedding,
                model: EMBEDDING_MODELS.openai.default,
            }, { onConflict: 'chunk_id' });

        if (error) {
            throw new Error(`Failed to store embedding: ${error.message}`);
        }
    }

    // ===========================================================================
    // Generate Query Embedding
    // ===========================================================================

    /**
     * Generate embedding for a query (for retrieval)
     */
    async embedQuery(query: string): Promise<number[]> {
        return this.withRetry(
            () => this.provider.embed(query),
            RAG_CONFIG.MAX_EMBEDDING_RETRIES
        );
    }

    // ===========================================================================
    // Utilities
    // ===========================================================================

    /**
     * Retry wrapper with exponential backoff
     */
    private async withRetry<T>(
        fn: () => Promise<T>,
        maxRetries: number
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt < maxRetries) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delayMs = Math.pow(2, attempt) * 1000;
                    await this.delay(delayMs);
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const result: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }
}

// =============================================================================
// Export
// =============================================================================

// EmbeddingService is exported via class declaration
