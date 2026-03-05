// =============================================================================
// YouTube Service - Orchestrates YouTube video processing (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
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
    private userId: string;
    private config: YouTubeProcessingConfig;

    constructor(
        userId: string,
        config: Partial<YouTubeProcessingConfig> = {}
    ) {
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
        const videoId = typeof source.metadata === 'object' && source.metadata
            ? (source.metadata as any).videoId as string
            : undefined;

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
            const embeddingService = new EmbeddingService(); // Removed supabase dependency!

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
        const data = await prisma.learningSource.findFirst({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                source_url: `https://www.youtube.com/watch?v=${videoId}`
            }
        });

        return data ? { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as LearningSource : null;
    }

    private async createSource(
        conversationId: string,
        videoId: string,
        metadata: YouTubeVideoMetadata,
        canonicalUrl: string
    ): Promise<LearningSource> {
        const data = await prisma.learningSource.create({
            data: {
                user_id: this.userId,
                conversation_id: conversationId,
                source_type: 'youtube',
                source_url: canonicalUrl,
                title: metadata.title,
                original_filename: metadata.title,
                file_type: 'txt', // Use 'txt' as we extract transcript, 'video' is restricted by DB constraint
                status: 'pending',
                metadata: {
                    videoId,
                    title: metadata.title,
                    channel: metadata.channel,
                    thumbnailUrl: metadata.thumbnailUrl,
                    durationSeconds: metadata.durationSeconds,
                } as Prisma.JsonObject,
            }
        });

        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as LearningSource;
    }

    private async claimProcessing(sourceId: string): Promise<LearningSource | null> {
        try {
            const data = await prisma.learningSource.update({
                where: {
                    id: sourceId,
                    user_id: this.userId,
                    status: { in: ['pending', 'processing'] }
                },
                data: {
                    status: 'processing'
                }
            });

            return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as LearningSource;
        } catch (error) {
            // Usually triggered if the source doesn't exist or is not pending/processing
            return null;
        }
    }

    private async updateSourceMetadata(
        sourceId: string,
        updates: Record<string, unknown>
    ): Promise<void> {
        const current = await prisma.learningSource.findUnique({
            where: { id: sourceId },
            select: { metadata: true }
        });

        await prisma.learningSource.update({
            where: { id: sourceId },
            data: {
                metadata: {
                    ...((current?.metadata as Record<string, unknown>) ?? {}),
                    ...updates
                } as Prisma.JsonObject
            }
        });
    }

    private async saveChunks(
        sourceId: string,
        chunks: Array<{ content: string; index: number; tokenCount: number }>
    ): Promise<Array<{ id: string }>> {
        const rows = chunks.map((chunk) => ({
            source_id: sourceId,
            content: chunk.content,
            chunk_index: chunk.index,
            token_count: chunk.tokenCount,
            metadata: {},
        }));

        await prisma.sourceChunk.createMany({
            data: rows
        });

        // We need to return chunks with IDs. Since Prisma createMany doesn't return IDs natively for postgres, 
        // we fetch them immediately after (ordered by chunk_index).
        const inserted = await prisma.sourceChunk.findMany({
            where: { source_id: sourceId },
            orderBy: { chunk_index: 'asc' },
            select: { id: true }
        });

        return inserted;
    }

    private async markCompleted(
        sourceId: string,
        stats: Record<string, unknown>
    ): Promise<void> {
        const current = await prisma.learningSource.findUnique({
            where: { id: sourceId },
            select: { metadata: true }
        });

        await prisma.learningSource.update({
            where: { id: sourceId },
            data: {
                status: 'completed',
                metadata: {
                    ...((current?.metadata as Record<string, unknown>) ?? {}),
                    processingStats: stats
                } as Prisma.JsonObject
            }
        });
    }

    private async markFailed(sourceId: string, error: string): Promise<void> {
        await prisma.learningSource.update({
            where: { id: sourceId },
            data: {
                status: 'failed',
                error_message: error
            }
        });
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
