// =============================================================================
// Learning Service - File processing and learning source management (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { storage } from '@/lib/storage';
import type {
    LearningSourceRow,
    LearningSourceMetadata,
    SourceChunkRow,
    ChunkMetadata,
    FileType,
    ProcessingStatus,
    ExtractionResult,
} from '@/types/learning';
import {
    validateFileType,
    validateFileSize,
    sanitizeFilename,
    generateContentHash,
    extractText,
    normalizeText,
    isGarbageText,
    chunkText,
} from '@/lib/files';

export interface CreateSourceOptions {
    conversation_id: string;
    original_filename: string;
    file_type: FileType;
    file_size: number;
    mime_type: string;
    storage_path: string;
}

export interface ProcessingResult {
    success: boolean;
    chunks_created: number;
    error?: string;
}

export class LearningService {
    constructor(private readonly userId: string) { }

    async createSource(options: CreateSourceOptions): Promise<LearningSourceRow> {
        const title = this.generateTitle(options.original_filename);

        const data = await prisma.learningSource.create({
            data: {
                user_id: this.userId,
                conversation_id: options.conversation_id,
                source_type: 'file',
                title,
                original_filename: options.original_filename,
                file_type: options.file_type,
                file_size: options.file_size,
                storage_path: options.storage_path,
                status: 'pending',
                metadata: { mime_type: options.mime_type } as Prisma.JsonObject,
            }
        });

        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString(), conversation_id: data.conversation_id || null } as unknown as LearningSourceRow;
    }

    async getSource(sourceId: string): Promise<LearningSourceRow | null> {
        const data = await prisma.learningSource.findUnique({
            where: { id: sourceId, user_id: this.userId }
        });

        if (!data) return null;

        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString(), conversation_id: data.conversation_id || null } as unknown as LearningSourceRow;
    }

    async listSources(
        conversationId?: string,
        options?: { status?: ProcessingStatus; limit?: number }
    ): Promise<LearningSourceRow[]> {
        const limit = options?.limit ?? 50;

        const where: Prisma.LearningSourceWhereInput = {
            user_id: this.userId,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...(options?.status ? { status: options.status } : {}),
        };

        const data = await prisma.learningSource.findMany({
            where,
            take: limit,
            orderBy: { created_at: 'desc' },
        });

        return data.map(d => ({ ...d, created_at: d.created_at.toISOString(), updated_at: d.updated_at.toISOString(), conversation_id: d.conversation_id || null })) as unknown as LearningSourceRow[];
    }

    async updateSourceStatus(
        sourceId: string,
        status: ProcessingStatus,
        metadata?: Partial<LearningSourceMetadata>,
        error_message?: string
    ): Promise<void> {
        const updates: Prisma.LearningSourceUpdateInput = {
            status,
        };

        if (error_message !== undefined) {
            updates.error_message = error_message;
        }

        if (metadata) {
            const existing = await this.getSource(sourceId);
            updates.metadata = {
                ...(existing?.metadata as Record<string, unknown> ?? {}),
                ...metadata,
            } as Prisma.JsonObject;
        }

        await prisma.learningSource.update({
            where: { id: sourceId, user_id: this.userId },
            data: updates
        });
    }

    async deleteSource(sourceId: string): Promise<void> {
        const source = await this.getSource(sourceId);
        if (!source || source.user_id !== this.userId) {
            throw new Error('Source not found');
        }

        if (source.storage_path) {
            await storage.remove([source.storage_path]);
        }

        // Deleting the source will implicitly cascade delete chunks due to onDelete: Cascade on Prisma schema
        await prisma.learningSource.delete({
            where: { id: sourceId }
        });
    }

    async checkDuplicate(
        conversationId: string,
        contentHash: string
    ): Promise<LearningSourceRow | null> {
        const data = await prisma.learningSource.findFirst({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                metadata: { path: ['hash'], equals: contentHash }
            }
        });

        return data ? { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString(), conversation_id: data.conversation_id || null } as unknown as LearningSourceRow : null;
    }

    async processSource(sourceId: string): Promise<ProcessingResult> {
        const startTime = Date.now();

        try {
            // 1. Atomically claim processing
            const claimed = await prisma.learningSource.update({
                where: { id: sourceId, status: 'pending' },
                data: { status: 'processing' }
            });

            const source = { ...claimed, created_at: claimed.created_at.toISOString(), updated_at: claimed.updated_at.toISOString() } as unknown as LearningSourceRow;

            // 2. Download file from storage
            if (!source.storage_path) throw new Error("No storage path provided for source");

            const { data: fileData, error: downloadError } = await storage.download(source.storage_path);

            if (downloadError || !fileData) {
                throw new Error(`Failed to download file: ${downloadError?.message}`);
            }

            const buffer = await fileData.arrayBuffer();

            // 3. Generate content hash for deduplication
            const hash = await generateContentHash(buffer);

            // 4. Check for duplicate
            if (source.conversation_id) {
                const duplicate = await this.checkDuplicate(source.conversation_id, hash);
                if (duplicate && duplicate.id !== sourceId) {
                    await this.updateSourceStatus(sourceId, 'failed', undefined, 'Duplicate file already processed');
                    return { success: false, chunks_created: 0, error: 'Duplicate file' };
                }
            }

            // 5. Extract text
            const extraction = await extractText(buffer, source.file_type!);

            // 6. Validate extraction quality
            if (!extraction.text || isGarbageText(extraction.text)) {
                throw new Error('Unable to extract meaningful text from file');
            }

            // 7. Normalize text
            const normalizedText = normalizeText(extraction.text);

            // 8. Chunk text
            const chunking = chunkText(normalizedText);

            // 9. Save chunks
            await this.saveChunks(sourceId, chunking.chunks);

            // 10. Update source with success
            const processingTime = Date.now() - startTime;
            await this.updateSourceStatus(sourceId, 'completed', {
                ...extraction.metadata,
                chunk_count: chunking.chunks.length,
                processing_time_ms: processingTime,
                hash,
            });

            return { success: true, chunks_created: chunking.chunks.length };

        } catch (error) {
            // Prisma will throw error if trying to update but it is NOT `pending` in the condition.
            if ((error as any).code === 'P2025') {
                return { success: false, chunks_created: 0, error: 'Source not available for processing' };
            }

            const existingSource = await this.getSource(sourceId);
            if (!existingSource) return { success: false, chunks_created: 0, error: 'Source not found' };

            const errorMessage = error instanceof Error ? error.message : 'Processing failed';
            const metadata: Partial<LearningSourceMetadata> = {
                retry_count: ((existingSource.metadata as LearningSourceMetadata)?.retry_count ?? 0) + 1,
            };

            await this.updateSourceStatus(sourceId, 'failed', metadata, errorMessage);
            return { success: false, chunks_created: 0, error: errorMessage };
        }
    }

    private async saveChunks(
        sourceId: string,
        chunks: Array<{ content: string; token_count: number; metadata: ChunkMetadata }>
    ): Promise<void> {
        if (chunks.length === 0) return;

        const rows = chunks.map((chunk, index) => ({
            source_id: sourceId,
            chunk_index: index,
            content: chunk.content,
            token_count: chunk.token_count,
            metadata: chunk.metadata as Prisma.JsonObject,
        }));

        await prisma.sourceChunk.createMany({
            data: rows
        });
    }

    async getChunks(sourceId: string): Promise<SourceChunkRow[]> {
        const data = await prisma.sourceChunk.findMany({
            where: { source_id: sourceId },
            orderBy: { chunk_index: 'asc' }
        });

        // The chunk currently has vector field. So we do simple mapping.
        return data.map(c => ({
            id: c.id,
            source_id: c.source_id,
            chunk_index: c.chunk_index,
            content: c.content,
            token_count: c.token_count,
            embedding: null, // Embeddings handles separately using raw queries in PGVector
            metadata: c.metadata as ChunkMetadata,
            created_at: c.created_at.toISOString()
        })) as SourceChunkRow[];
    }

    generateStoragePath(
        conversationId: string,
        filename: string
    ): string {
        const sanitized = sanitizeFilename(filename);
        const timestamp = Date.now();
        return `${this.userId}/${conversationId}/${timestamp}_${sanitized}`;
    }

    private generateTitle(filename: string): string {
        const withoutExt = filename.replace(/\.[^.]+$/, '');
        const spaced = withoutExt.replace(/[_-]/g, ' ');
        return spaced
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .slice(0, 100);
    }
}
