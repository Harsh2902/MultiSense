// =============================================================================
// Learning Service - File processing and learning source management
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
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

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Learning Service Class
// =============================================================================

/**
 * Service for managing learning sources and file processing
 * 
 * Responsibilities:
 * - Learning source CRUD operations
 * - File processing orchestration
 * - Chunk management
 * - Duplicate detection
 * - Status tracking
 */
export class LearningService {
    constructor(
        private readonly supabase: SupabaseClient<any>,
        private readonly userId: string
    ) { }

    // ===========================================================================
    // Learning Source CRUD
    // ===========================================================================

    /**
     * Create a new learning source (pending processing)
     */
    async createSource(options: CreateSourceOptions): Promise<LearningSourceRow> {
        // Generate title from filename
        const title = this.generateTitle(options.original_filename);

        const { data, error } = await this.supabase
            .from('learning_sources')
            .insert({
                user_id: this.userId,
                conversation_id: options.conversation_id,
                source_type: 'file',
                title,
                original_filename: options.original_filename,
                file_type: options.file_type,
                file_size: options.file_size,
                storage_path: options.storage_path,
                status: 'pending' as ProcessingStatus,
                metadata: {
                    mime_type: options.mime_type,
                } as any,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create source: ${error.message}`);
        }

        return data as LearningSourceRow;
    }

    /**
     * Get learning source by ID
     * RLS ensures user can only access their own sources
     */
    async getSource(sourceId: string): Promise<LearningSourceRow | null> {
        const { data, error } = await this.supabase
            .from('learning_sources')
            .select('*')
            .eq('id', sourceId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw new Error(`Failed to get source: ${error.message}`);
        }

        return data as LearningSourceRow;
    }

    /**
     * List learning sources for a conversation
     */
    async listSources(
        conversationId?: string,
        options?: { status?: ProcessingStatus; limit?: number }
    ): Promise<LearningSourceRow[]> {
        let query = this.supabase
            .from('learning_sources')
            .select('*')
            .eq('user_id', this.userId)
            .order('created_at', { ascending: false })
            .limit(options?.limit ?? 50);

        if (conversationId) {
            query = query.eq('conversation_id', conversationId);
        }

        if (options?.status) {
            query = query.eq('status', options.status);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to list sources: ${error.message}`);
        }

        return (data ?? []) as LearningSourceRow[];
    }

    /**
     * Update learning source status
     */
    async updateSourceStatus(
        sourceId: string,
        status: ProcessingStatus,
        metadata?: Partial<LearningSourceMetadata>,
        error_message?: string
    ): Promise<void> {
        const updates: Record<string, unknown> = {
            status,
            updated_at: new Date().toISOString(),
        };

        if (error_message !== undefined) {
            updates['error_message'] = error_message;
        }

        // Merge metadata if provided
        if (metadata) {
            const existing = await this.getSource(sourceId);
            updates['metadata'] = {
                ...(existing?.metadata ?? {}),
                ...metadata,
            };
        }

        const { error } = await this.supabase
            .from('learning_sources')
            .update(updates)
            .eq('id', sourceId);

        if (error) {
            throw new Error(`Failed to update source: ${error.message}`);
        }
    }

    /**
     * Delete learning source and associated data
     */
    async deleteSource(sourceId: string): Promise<void> {
        // Get source to find storage path
        const source = await this.getSource(sourceId);
        if (!source) {
            throw new Error('Source not found');
        }

        // Verify ownership (defense-in-depth)
        if (source.user_id !== this.userId) {
            throw new Error('Source not found');
        }

        // Delete from storage
        if (source.storage_path) {
            await this.supabase.storage
                .from('learning-files')
                .remove([source.storage_path]);
        }

        // Delete chunks (cascade should handle this, but explicit for safety)
        await this.supabase
            .from('source_chunks')
            .delete()
            .eq('source_id', sourceId);

        // Delete source
        const { error } = await this.supabase
            .from('learning_sources')
            .delete()
            .eq('id', sourceId);

        if (error) {
            throw new Error(`Failed to delete source: ${error.message}`);
        }
    }

    // ===========================================================================
    // Duplicate Detection
    // ===========================================================================

    /**
     * Check if file content already exists (by hash)
     * Prevents duplicate processing of same file
     */
    async checkDuplicate(
        conversationId: string,
        contentHash: string
    ): Promise<LearningSourceRow | null> {
        const { data, error } = await this.supabase
            .from('learning_sources')
            .select('*')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .contains('metadata', { hash: contentHash })
            .limit(1);

        if (error) {
            console.error('Duplicate check failed:', error);
            return null;
        }

        return (data?.[0] as LearningSourceRow) ?? null;
    }

    // ===========================================================================
    // File Processing
    // ===========================================================================

    /**
     * Process a source file
     * Extracts text, normalizes, chunks, and saves
     * 
     * RACE CONDITION PREVENTION:
     * - Atomically set status to 'processing' with check
     * - If already processing, return early
     */
    async processSource(sourceId: string): Promise<ProcessingResult> {
        const startTime = Date.now();

        // 1. Atomically claim processing (prevent double processing)
        const { data: claimed, error: claimError } = await this.supabase
            .from('learning_sources')
            .update({
                status: 'processing' as ProcessingStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', sourceId)
            .eq('status', 'pending') // Only if currently pending
            .select()
            .single();

        if (claimError || !claimed) {
            // Either not found, not pending, or already processing
            return { success: false, chunks_created: 0, error: 'Source not available for processing' };
        }

        const source = claimed as LearningSourceRow;

        try {
            // 2. Download file from storage
            const { data: fileData, error: downloadError } = await this.supabase.storage
                .from('learning-files')
                .download(source.storage_path!);

            if (downloadError || !fileData) {
                throw new Error(`Failed to download file: ${downloadError?.message}`);
            }

            const buffer = await fileData.arrayBuffer();

            // 3. Generate content hash for deduplication
            const hash = await generateContentHash(buffer);

            // 4. Check for duplicate
            const duplicate = await this.checkDuplicate(source.conversation_id, hash);
            if (duplicate && duplicate.id !== sourceId) {
                await this.updateSourceStatus(sourceId, 'failed', undefined,
                    'Duplicate file already processed');
                return { success: false, chunks_created: 0, error: 'Duplicate file' };
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
            // Update source with failure
            const errorMessage = error instanceof Error ? error.message : 'Processing failed';

            // Increment retry count
            const metadata: Partial<LearningSourceMetadata> = {
                retry_count: ((source.metadata as LearningSourceMetadata)?.retry_count ?? 0) + 1,
            };

            await this.updateSourceStatus(sourceId, 'failed', metadata, errorMessage);

            return { success: false, chunks_created: 0, error: errorMessage };
        }
    }

    // ===========================================================================
    // Chunk Management
    // ===========================================================================

    /**
     * Save chunks for a source
     */
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
            metadata: chunk.metadata as any,
        }));

        // Insert in batches to avoid payload limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const { error } = await this.supabase
                .from('source_chunks')
                .insert(batch);

            if (error) {
                throw new Error(`Failed to save chunks: ${error.message}`);
            }
        }
    }

    /**
     * Get chunks for a source
     */
    async getChunks(sourceId: string): Promise<SourceChunkRow[]> {
        const { data, error } = await this.supabase
            .from('source_chunks')
            .select('*')
            .eq('source_id', sourceId)
            .order('chunk_index', { ascending: true });

        if (error) {
            throw new Error(`Failed to get chunks: ${error.message}`);
        }

        return (data ?? []) as SourceChunkRow[];
    }

    // ===========================================================================
    // Storage Path Generation
    // ===========================================================================

    /**
     * Generate storage path for user file
     * Structure: {user_id}/{conversation_id}/{timestamp}_{filename}
     * 
     * This ensures:
     * - User isolation (each user has their own folder)
     * - Conversation grouping
     * - Unique filenames via timestamp
     */
    generateStoragePath(
        conversationId: string,
        filename: string
    ): string {
        const sanitized = sanitizeFilename(filename);
        const timestamp = Date.now();
        return `${this.userId}/${conversationId}/${timestamp}_${sanitized}`;
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    /**
     * Generate title from filename
     */
    private generateTitle(filename: string): string {
        // Remove extension
        const withoutExt = filename.replace(/\.[^.]+$/, '');
        // Replace underscores/dashes with spaces
        const spaced = withoutExt.replace(/[_-]/g, ' ');
        // Capitalize first letter of each word
        return spaced
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .slice(0, 100); // Limit length
    }
}
