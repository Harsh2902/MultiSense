// =============================================================================
// Content Merger - Merge transcript and OCR text with deduplication
// =============================================================================

import type {
    TranscriptResult,
    TranscriptSegment,
    FrameExtractionResult,
    ExtractedFrame,
    ContentBucket,
    MergedContentResult,
} from '@/types/youtube';
import { DEFAULT_YOUTUBE_CONFIG } from '@/types/youtube';

// =============================================================================
// Merging
// =============================================================================

/**
 * Merge transcript and OCR content with deduplication
 * 
 * ALGORITHM:
 * 1. Create time buckets based on frame timestamps
 * 2. Assign transcript segments to buckets
 * 3. Add OCR text that doesn't duplicate transcript
 * 4. Use Levenshtein distance for similarity detection
 * 
 * @param transcript - Transcript extraction result
 * @param frames - Frame extraction result
 * @param deduplicationThreshold - Similarity threshold (0-1)
 * @returns Merged content
 */
export function mergeContent(
    transcript: TranscriptResult,
    frames: FrameExtractionResult,
    deduplicationThreshold: number = DEFAULT_YOUTUBE_CONFIG.deduplicationThreshold
): MergedContentResult {
    // If no frames or OCR disabled, return transcript only
    if (!frames.enabled || frames.frames.length === 0) {
        return transcriptOnlyResult(transcript);
    }

    // Create buckets from frames
    const buckets = createBuckets(frames.frames);

    // Assign transcript to buckets
    assignTranscriptToBuckets(buckets, transcript.segments);

    // Add unique OCR content
    let duplicatesRemoved = 0;
    for (const frame of frames.frames) {
        if (!frame.hasText) continue;

        // Find bucket for this frame
        const bucket = findBucket(buckets, frame.timestampSeconds);
        if (!bucket) continue;

        // Check if OCR duplicates nearby transcript
        const isDupe = isOcrDuplicate(
            frame.ocrText,
            bucket.transcriptText,
            deduplicationThreshold
        );

        if (isDupe) {
            duplicatesRemoved++;
        } else {
            bucket.ocrText += (bucket.ocrText ? ' ' : '') + frame.ocrText;
        }
    }

    // Combine all buckets
    for (const bucket of buckets) {
        if (bucket.transcriptText && bucket.ocrText) {
            bucket.combinedText = `${bucket.transcriptText}\n\n[Visual Content]: ${bucket.ocrText}`;
        } else {
            bucket.combinedText = bucket.transcriptText || bucket.ocrText;
        }
    }

    // Build full text
    const fullText = buckets
        .filter(b => b.combinedText)
        .map(b => b.combinedText)
        .join('\n\n');

    const wordCount = countWords(fullText);
    const transcriptWords = countWords(transcript.fullText);
    const ocrWords = frames.frames.reduce((sum, f) => sum + countWords(f.ocrText), 0);

    return {
        buckets,
        fullText,
        wordCount,
        sources: {
            transcriptWords,
            ocrWords,
            duplicatesRemoved,
        },
    };
}

// =============================================================================
// Bucket Management
// =============================================================================

function createBuckets(frames: ExtractedFrame[]): ContentBucket[] {
    const buckets: ContentBucket[] = [];

    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const nextFrame = frames[i + 1];
        if (!frame) continue;
        const start = frame.timestampSeconds;
        const end = nextFrame
            ? nextFrame.timestampSeconds
            : start + 60; // Assume 60s for last bucket

        buckets.push({
            startSeconds: start,
            endSeconds: end,
            transcriptText: '',
            ocrText: '',
            combinedText: '',
        });
    }

    return buckets;
}

function findBucket(buckets: ContentBucket[], timestamp: number): ContentBucket | null {
    for (const bucket of buckets) {
        if (timestamp >= bucket.startSeconds && timestamp < bucket.endSeconds) {
            return bucket;
        }
    }
    const lastBucket = buckets[buckets.length - 1];
    return lastBucket ?? null;
}

function assignTranscriptToBuckets(
    buckets: ContentBucket[],
    segments: TranscriptSegment[]
): void {
    for (const segment of segments) {
        const bucket = findBucket(buckets, segment.startSeconds);
        if (bucket) {
            bucket.transcriptText += (bucket.transcriptText ? ' ' : '') + segment.text;
        }
    }
}

// =============================================================================
// Deduplication
// =============================================================================

/**
 * Check if OCR text is a duplicate of transcript text
 * Uses Levenshtein distance normalized by length
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Short-circuit if length difference > 50%
 * - Only compare if OCR is non-empty
 */
function isOcrDuplicate(
    ocrText: string,
    transcriptText: string,
    threshold: number
): boolean {
    if (!ocrText || !transcriptText) return false;

    const ocrNorm = normalizeForComparison(ocrText);
    const transcriptNorm = normalizeForComparison(transcriptText);

    // Short-circuit: if length difference > 50%, not duplicate
    const lengthRatio = Math.min(ocrNorm.length, transcriptNorm.length) /
        Math.max(ocrNorm.length, transcriptNorm.length);
    if (lengthRatio < 0.5) return false;

    // Calculate similarity
    const similarity = calculateSimilarity(ocrNorm, transcriptNorm);

    return similarity > threshold;
}

/**
 * Normalize text for comparison
 */
function normalizeForComparison(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculate similarity using Levenshtein distance
 * Returns value between 0 (different) and 1 (identical)
 */
function calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);

    return 1 - (distance / maxLength);
}

/**
 * Levenshtein distance with optimization for long strings
 * Uses two-row approach to reduce memory
 */
function levenshteinDistance(a: string, b: string): number {
    // Limit to first 200 chars for performance
    const aLimited = a.substring(0, 200);
    const bLimited = b.substring(0, 200);

    const m = aLimited.length;
    const n = bLimited.length;

    // Use two rows instead of full matrix
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) {
        prev[j] = j;
    }

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = aLimited[i - 1] === bLimited[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,      // deletion
                curr[j - 1] + 1,  // insertion
                prev[j - 1] + cost // substitution
            );
        }
        [prev, curr] = [curr, prev];
    }

    return prev[n];
}

// =============================================================================
// Helpers
// =============================================================================

function transcriptOnlyResult(transcript: TranscriptResult): MergedContentResult {
    return {
        buckets: [],
        fullText: transcript.fullText,
        wordCount: transcript.wordCount,
        sources: {
            transcriptWords: transcript.wordCount,
            ocrWords: 0,
            duplicatesRemoved: 0,
        },
    };
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
