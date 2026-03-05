// =============================================================================
// YouTube Service - Orchestrates YouTube video processing
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    YouTubeVideoMetadata,
    YouTubeProcessingConfig,
    MergedContentResult,
} from '@/types/youtube';
import { DEFAULT_YOUTUBE_CONFIG, YOUTUBE_LIMITS } from '@/types/youtube';
import type { LearningSourceRow as LearningSource, ProcessingStatus } from '@/types/learning';
import {
    validateYouTubeUrl,
    fetchVideoMetadata,
    validateDuration,
    extractTranscript,
    getDurationFromTranscript,
    calculateFrameTimestamps,
    extractFrames,
    mergeContent,
} from '@/lib/youtube';
import { normalizeText } from '@/lib/files/normalizer';
import { chunkText } from '@/lib/files/chunker';

// =============================================================================
// Service Class
// =============================================================================

export class YouTubeService {
    private supabase: SupabaseClient;
    private userId: string;
    private config: YouTubeProcessingConfig;

    constructor(
        supabase: SupabaseClient,
        userId: string,
        config: Partial<YouTubeProcessingConfig> = {}
    ) {
        this.supabase = supabase;
        this.userId = userId;
        this.config = { ...DEFAULT_YOUTUBE_CONFIG, ...config };
    }

    // ===========================================================================
    // Submit Video
    // ===========================================================================

    /**
     * Submit YouTube video for processing
     * 
     * FLOW:
     * 1. Validate URL (SSRF protection)
     * 2. Fetch metadata (check availability)
     * 3. Validate duration
     * 4. Check for duplicates
     * 5. Create learning source
     * 6. Queue for processing
     */
    async submitVideo(
        url: string,
        conversationId: string
    ): Promise<{ source: LearningSource; metadata: YouTubeVideoMetadata }> {
        // 1. Validate URL
        const urlValidation = validateYouTubeUrl(url);
        if (!urlValidation.valid || !urlValidation.videoId) {
            throw new YouTubeError(
                urlValidation.error || 'Invalid YouTube URL',
                'INVALID_URL'
            );
        }

        const { videoId, canonicalUrl } = urlValidation;

        // 2. Fetch metadata
        const metadata = await fetchVideoMetadata(videoId);
        if (!metadata.isAvailable) {
            throw new YouTubeError(
                'Video is not available (private, deleted, or region-locked)',
                'VIDEO_UNAVAILABLE'
            );
        }

        // 3. Get duration from transcript if not available from metadata
        let durationSeconds = metadata.durationSeconds;
        if (durationSeconds === 0) {
            // We'll validate during processing when we get the transcript
            durationSeconds = 0;
        }

        // 4. Validate duration (if known)
        if (durationSeconds > 0) {
            const durationCheck = validateDuration(durationSeconds, this.config.maxDurationSeconds);
            if (!durationCheck.valid) {
                throw new YouTubeError(durationCheck.error!, 'VIDEO_TOO_LONG');
            }
        }

        // 5. Check for duplicates
        const existing = await this.checkDuplicate(conversationId, videoId);
        if (existing) {
            throw new YouTubeError(
                'This video has already been added to this conversation',
                'DUPLICATE'
            );
        }

        // 6. Create learning source
        const source = await this.createSource(
            conversationId,
            videoId,
            metadata,
            canonicalUrl!
        );

        return { source, metadata };
    }

    // ===========================================================================
    // Process Video
    // ===========================================================================

    /**
     * Process YouTube video (called by queue processor)
     * 
     * FLOW:
     * 1. Atomically claim processing
     * 2. Extract transcript
     * 3. Validate duration (from transcript)
     * 4. Extract frames (if enabled)
     * 5. Merge content
     * 6. Normalize and chunk
     * 7. Save chunks
     * 8. Mark completed
     */
    async processVideo(sourceId: string): Promise<{ chunksCreated: number }> {
        // 1. Claim processing
        const claimed = await this.claimProcessing(sourceId);
        if (!claimed) {
            throw new YouTubeError('Source not available for processing', 'PROCESSING_CONFLICT');
        }

        const source = claimed;
        const videoId = source.metadata?.videoId as string;

        // Debug Log
        const log = (msg: string) => {
            try {
                const fs = require('fs');
                const path = require('path');
                fs.appendFileSync(path.join(process.cwd(), 'youtube-debug.log'), `[Service] ${new Date().toISOString()}: ${msg}\n`);
            } catch { }
        };

        if (!videoId) {
            await this.markFailed(sourceId, 'Missing video ID in source metadata');
            throw new YouTubeError('Missing video ID', 'INVALID_SOURCE');
        }

        try {
            log(`Starting processing for ${videoId}`);

            // 2. Extract transcript
            const transcript = await extractTranscript(videoId);
            log(`Transcript extracted. Available: ${transcript.available}, Error: ${transcript.error}`);

            if (!transcript.available && !this.config.enableFrameExtraction) {
                // No transcript and no frame extraction = no content
                await this.markFailed(sourceId, transcript.error || 'No transcript available');
                throw new YouTubeError(
                    transcript.error || 'No transcript available',
                    'NO_CONTENT'
                );
            }

            // 3. Validate duration from transcript
            if (transcript.available) {
                const duration = getDurationFromTranscript(transcript);
                const durationCheck = validateDuration(duration, this.config.maxDurationSeconds);

                if (!durationCheck.valid) {
                    await this.markFailed(sourceId, durationCheck.error!);
                    throw new YouTubeError(durationCheck.error!, 'VIDEO_TOO_LONG');
                }

                // Update source with duration
                await this.updateSourceMetadata(sourceId, { durationSeconds: duration });
            }

            // 4. Extract frames (if enabled)
            // Use metadata duration as fallback if transcript missing/empty
            const transcriptDuration = getDurationFromTranscript(transcript);
            const videoDuration = transcriptDuration > 0
                ? transcriptDuration
                : (source.metadata as any)?.durationSeconds || 0;

            const timestamps = calculateFrameTimestamps(videoDuration);
            const frames = await extractFrames(videoId, timestamps);
            log(`Frames extracted. Count: ${frames.frames.length}`);

            // 5. Merge content
            const merged = mergeContent(
                transcript,
                frames,
                this.config.deduplicationThreshold
            );
            log(`Content merged. Word count: ${merged.wordCount}`);

            if (merged.wordCount < 50) {
                // Determine specific cause
                let errorMessage = 'Not enough content extracted from video';
                if (!transcript.available && transcript.error) {
                    errorMessage = `Content extraction failed: ${transcript.error}`;
                } else if (frames.error) {
                    errorMessage += ` (${frames.error})`;
                }

                await this.markFailed(sourceId, errorMessage);
                throw new YouTubeError(
                    errorMessage,
                    'INSUFFICIENT_CONTENT'
                );
            }

            // 6. Normalize and chunk
            const normalized = normalizeText(merged.fullText);
            const chunked = chunkText(normalized);
            log(`Text chunked. Chunks: ${chunked.chunks.length}`);

            // 7. Save chunks
            const chunks = await this.saveChunks(
                sourceId,
                chunked.chunks.map((c, i) => ({
                    content: c.content,
                    index: i,
                    tokenCount: (c as any).tokenCount || Math.ceil(c.content.length / 4) // Fallback estimation
                }))
            );
            log(`Chunks saved to DB.`);

            // 7b. Generate embeddings (CRITICAL for RAG)
            log(`Importing EmbeddingService...`);
            const { EmbeddingService } = await import('@/lib/embeddings/service');
            const embeddingService = new EmbeddingService(this.supabase);

            log(`Starting embedding generation...`);
            await embeddingService.embedSourceChunks(sourceId);
            log(`Embeddings generated.`);

            // 8. Mark completed
            await this.markCompleted(sourceId, {
                wordCount: merged.wordCount,
                chunkCount: chunks.length,
                sources: merged.sources,
            });
            log(`Source marked completed.`);

            return { chunksCreated: chunks.length };
        } catch (error) {
            log(`ERROR in processVideo: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
            if (error instanceof YouTubeError) {
                throw error; // Already handled
            }

            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.markFailed(sourceId, message);
            throw error;
        }
    }

    // ===========================================================================
    // Database Operations
    // ===========================================================================

    private async checkDuplicate(
        conversationId: string,
        videoId: string
    ): Promise<LearningSource | null> {
        const { data } = await this.supabase
            .from('learning_sources')
            .select('*')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('source_url', `https://www.youtube.com/watch?v=${videoId}`)
            .limit(1)
            .single();

        return data;
    }

    private async createSource(
        conversationId: string,
        videoId: string,
        metadata: YouTubeVideoMetadata,
        canonicalUrl: string
    ): Promise<LearningSource> {
        const { data, error } = await this.supabase
            .from('learning_sources')
            .insert({
                user_id: this.userId,
                conversation_id: conversationId,
                source_type: 'youtube',
                source_url: canonicalUrl,
                title: metadata.title,
                original_filename: metadata.title,
                file_type: 'txt', // Use 'txt' as we extract transcript, 'video' is restricted by DB constraint
                status: 'pending' as ProcessingStatus,
                metadata: {
                    videoId,
                    title: metadata.title,
                    channel: metadata.channel,
                    thumbnailUrl: metadata.thumbnailUrl,
                    durationSeconds: metadata.durationSeconds,
                },
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    private async claimProcessing(sourceId: string): Promise<LearningSource | null> {
        const { data, error } = await this.supabase
            .from('learning_sources')
            .update({
                status: 'processing' as ProcessingStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', sourceId)
            .eq('user_id', this.userId)
            .in('status', ['pending', 'processing'])
            .select()
            .single();

        if (error || !data) return null;
        return data;
    }

    private async updateSourceMetadata(
        sourceId: string,
        updates: Record<string, unknown>
    ): Promise<void> {
        await this.supabase.rpc('update_source_metadata', {
            p_source_id: sourceId,
            p_updates: updates,
        });
    }

    private async saveChunks(
        sourceId: string,
        chunks: Array<{ content: string; index: number; tokenCount: number }>
    ): Promise<Array<{ id: string }>> {
        const { data, error } = await this.supabase
            .from('source_chunks')
            .insert(
                chunks.map((chunk) => ({
                    source_id: sourceId,
                    content: chunk.content,
                    chunk_index: chunk.index,
                    token_count: chunk.tokenCount,
                    metadata: {},
                }))
            )
            .select('id');

        if (error) throw error;
        return data || [];
    }

    private async markCompleted(
        sourceId: string,
        stats: Record<string, unknown>
    ): Promise<void> {
        await this.supabase
            .from('learning_sources')
            .update({
                status: 'completed' as ProcessingStatus,
                updated_at: new Date().toISOString(),
                metadata: this.supabase.rpc('jsonb_merge', {
                    target: 'metadata',
                    patch: { processingStats: stats },
                }),
            })
            .eq('id', sourceId);
    }

    private async markFailed(sourceId: string, error: string): Promise<void> {
        await this.supabase
            .from('learning_sources')
            .update({
                status: 'failed' as ProcessingStatus,
                updated_at: new Date().toISOString(),
                error_message: error,
            })
            .eq('id', sourceId);
    }
}

// =============================================================================
// Error Class
// =============================================================================

export class YouTubeError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'YouTubeError';
        this.code = code;
    }
}
