// =============================================================================
// YouTube Frame Extraction - Optional frame extraction with OCR
// =============================================================================

import type { ExtractedFrame, FrameExtractionResult } from '@/types/youtube';
import { YOUTUBE_LIMITS } from '@/types/youtube';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Check if frame extraction is enabled
 * Requires FFmpeg to be installed
 */
export function isFrameExtractionEnabled(): boolean {
    return process.env.ENABLE_FRAME_EXTRACTION === 'true';
}

// =============================================================================
// Frame Timestamps Calculation
// =============================================================================

/**
 * Calculate frame extraction timestamps
 * 
 * SAMPLING STRATEGY:
 * - Target: min(MAX_FRAMES, ceil(duration / 0.75))
 * - Interval: duration / target
 * - Skip first and last 5 seconds (intro/outro)
 * 
 * Mathematical justification:
 * - Educational content changes slides every 30-90 seconds
 * - 45-second average captures most transitions
 * - Cap at MAX_FRAMES limits processing time
 * 
 * @param durationSeconds - Video duration in seconds
 * @returns Array of timestamps in seconds
 */
export function calculateFrameTimestamps(durationSeconds: number): number[] {
    if (durationSeconds <= 10) {
        return []; // Too short for useful frames
    }

    // Calculate target frame count
    const durationMinutes = durationSeconds / 60;
    const targetFrames = Math.min(
        YOUTUBE_LIMITS.MAX_FRAMES,
        Math.ceil(durationMinutes / 0.75)
    );

    // Calculate interval
    const usableDuration = durationSeconds - 10; // Skip first/last 5 seconds
    const interval = usableDuration / targetFrames;

    // Enforce minimum interval
    const effectiveInterval = Math.max(interval, YOUTUBE_LIMITS.MIN_FRAME_INTERVAL_SECONDS);

    // Generate timestamps
    const timestamps: number[] = [];
    let currentTime = 5; // Start at 5 seconds

    while (currentTime < durationSeconds - 5 && timestamps.length < YOUTUBE_LIMITS.MAX_FRAMES) {
        timestamps.push(currentTime);
        currentTime += effectiveInterval;
    }

    return timestamps;
}

// =============================================================================
// Frame Extraction (Placeholder - requires FFmpeg)
// =============================================================================

/**
 * Extract frames from YouTube video
 * 
 * NOTE: This is a placeholder implementation. Full implementation requires:
 * - FFmpeg binary installed
 * - yt-dlp or ytdl-core for video download
 * - Significant CPU/memory resources
 * 
 * For serverless (Vercel), use transcript-only mode.
 * For dedicated server, implement with fluent-ffmpeg + yt-dlp.
 * 
 * @param videoId - YouTube video ID
 * @param timestamps - Timestamps to extract
 * @returns Frame extraction result
 */
// Note: In a real implementation, we would use proper dependency injection or check for binary existence.
// For now, we assume ffmpeg is available in the environment if this feature is enabled.

import { YtDlp } from './ytdlp';
import ffmpeg from 'fluent-ffmpeg';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Extract frames from YouTube video
 * 
 * IMPLEMENTATION:
 * 1. Download video to temp file using yt-dlp (more reliable than ytdl-core)
 * 2. Extract frames at timestamps using fluent-ffmpeg
 * 3. Run OCR on extracted frames
 * 4. Cleanup temp files
 */
export async function extractFrames(
    videoId: string,
    timestamps: number[]
): Promise<FrameExtractionResult> {
    if (!isFrameExtractionEnabled()) {
        return {
            frames: [],
            frameCount: 0,
            enabled: false,
            error: 'Frame extraction is disabled. Set ENABLE_FRAME_EXTRACTION=true to enable.',
        };
    }

    if (timestamps.length === 0) {
        return {
            frames: [],
            frameCount: 0,
            enabled: true,
            error: 'No timestamps provided for extraction.',
        };
    }

    const tempDir = await createTempDir(videoId);
    const videoPath = join(tempDir, 'video.mp4');
    const frames: ExtractedFrame[] = [];

    try {
        console.log(`[Frames] Downloading video ${videoId} to ${videoPath}...`);

        // 1. Download video using yt-dlp
        try {
            await YtDlp.getInstance().downloadVideo(videoId, videoPath);
            console.log('[Frames] Download complete. Extracting frames...');
        } catch (downloadError: any) {
            console.error('[Frames] Video download failed:', downloadError);
            throw new Error(`Video download failed: ${downloadError.message}`);
        }

        // 2. Extract frames & OCR in parallel (with concurrency limit ideally, but 20 is small)
        // We'll process sequentially to avoid spawning 20 ffmpeg processes at once
        for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];
            if (timestamp === undefined) continue;
            const frameFilename = `frame-${i}.jpg`;
            const framePath = join(tempDir, frameFilename);

            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(videoPath)
                        .screenshots({
                            timestamps: [timestamp],
                            filename: frameFilename,
                            folder: tempDir,
                            size: '1280x720' // Normalize size for OCR
                        })
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err));
                });

                // 3. Run OCR
                const ocrResult = await processFrameOcr(framePath);

                if (ocrResult.hasText) {
                    // Update timestamp (ocrResult timestamp is initially 0)
                    const frameWithTimestamp: ExtractedFrame = {
                        ...ocrResult,
                        timestampSeconds: timestamp
                    };
                    frames.push(frameWithTimestamp);
                }
            } catch (err: any) {
                console.warn(`[Frames] Failed to extract/OCR frame at ${timestamp}s:`, err);
                // Continue with other frames
            }
        }

        return {
            frames,
            frameCount: frames.length,
            enabled: true,
        };

    } catch (error) {
        console.error('[Frames] Extraction failed:', error);
        return {
            frames: [],
            frameCount: 0,
            enabled: true,
            error: error instanceof Error ? error.message : 'Unknown error during extraction',
        };
    } finally {
        await cleanupTempDir(tempDir);
    }
}

// =============================================================================
// OCR Processing
// =============================================================================

/**
 * Run OCR on extracted frame
 * Uses Phase 5 OCR infrastructure with timeout
 */
export async function processFrameOcr(
    framePath: string,
    timeoutMs: number = YOUTUBE_LIMITS.FRAME_OCR_TIMEOUT_MS
): Promise<ExtractedFrame> {
    const timestampSeconds = 0; // Will be passed in real implementation

    try {
        // Dynamic import to avoid loading Tesseract unless needed
        const { extractFromImage } = await import('@/lib/files/extractors');

        // Read frame file
        const frameBuffer = await fs.readFile(framePath);

        // Run OCR with timeout
        const result = await withTimeout(
            extractFromImage(frameBuffer.buffer),
            timeoutMs,
            'Frame OCR timeout'
        );

        return {
            timestampSeconds,
            ocrText: result.text,
            confidence: result.metadata?.ocr_confidence ?? 0,
            hasText: result.text.length > 10,
        };
    } catch (error) {
        return {
            timestampSeconds,
            ocrText: '',
            confidence: 0,
            hasText: false,
        };
    }
}

// =============================================================================
// Temp Directory Management
// =============================================================================

async function createTempDir(videoId: string): Promise<string> {
    const dir = join(tmpdir(), `youtube-frames-${videoId}-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

async function cleanupTempDir(dir: string): Promise<void> {
    try {
        await fs.rm(dir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
}

// =============================================================================
// Utilities
// =============================================================================

async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle!);
        return result;
    } catch (error) {
        clearTimeout(timeoutHandle!);
        throw error;
    }
}
