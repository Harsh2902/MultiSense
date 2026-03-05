// =============================================================================
// Embedding Service - Batch embedding with retry logic (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { EmbeddingProvider, EmbeddingResult } from '@/types/rag';
import { RAG_CONFIG } from '@/types/rag';
import { createEmbeddingProvider } from './provider';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for generating and storing embeddings
 */
export class EmbeddingService {
    private provider: EmbeddingProvider;

    constructor(provider?: EmbeddingProvider) {
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
        const chunks = await prisma.sourceChunk.findMany({
            where: { source_id: sourceId },
            select: { id: true, content: true },
            orderBy: { chunk_index: 'asc' }
        });

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
     * Uses Prisma raw SQL for vector operations
     */
    private async storeEmbeddings(
        chunks: Array<{ id: string }>,
        embeddings: number[][]
    ): Promise<void> {
        // Perform multiple raw updates sequentially or within a transaction
        // as standard Prisma functions don't support pgvector inserting

        await prisma.$transaction(
            chunks.map((chunk, i) => {
                const vectorString = `[${(embeddings[i] || []).join(',')}]`;
                return prisma.$executeRawUnsafe(
                    `UPDATE "source_chunks" SET embedding = $1::vector WHERE id = $2`,
                    vectorString,
                    chunk.id
                );
            })
        );
    }

    /**
     * Store single embedding
     * Uses Prisma raw SQL for vector operations
     */
    private async storeEmbedding(chunkId: string, embedding: number[]): Promise<void> {
        const vectorString = `[${embedding.join(',')}]`;
        await prisma.$executeRawUnsafe(
            `UPDATE "source_chunks" SET embedding = $1::vector WHERE id = $2`,
            vectorString,
            chunkId
        );
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
