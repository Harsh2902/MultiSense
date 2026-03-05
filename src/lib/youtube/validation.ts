// =============================================================================
// YouTube URL Validation - SSRF-safe URL validation
// =============================================================================

import { getInnertube } from './client';
import type { YouTubeVideoMetadata } from '@/types/youtube';
import { YOUTUBE_LIMITS } from '@/types/youtube';

// =============================================================================
// URL Patterns (SSRF Protection)
// =============================================================================

const YOUTUBE_URL_PATTERNS = [
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})(?:&.*)?$/,
    /^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.*)?$/,
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.*)?$/,
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?.*)?$/,
];

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// =============================================================================
// URL Validation
// =============================================================================

export interface UrlValidationResult {
    valid: boolean;
    videoId?: string;
    canonicalUrl?: string;
    error?: string;
}

export function validateYouTubeUrl(url: string): UrlValidationResult {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'URL is required' };
    }

    const trimmedUrl = url.trim();

    for (const pattern of YOUTUBE_URL_PATTERNS) {
        const match = trimmedUrl.match(pattern);
        if (match && match[1]) {
            const videoId = match[1];

            if (!isValidVideoId(videoId)) {
                return { valid: false, error: 'Invalid video ID format' };
            }

            const canonicalUrl = buildCanonicalUrl(videoId);

            return {
                valid: true,
                videoId,
                canonicalUrl,
            };
        }
    }

    return { valid: false, error: 'Invalid YouTube URL format' };
}

export function isValidVideoId(videoId: string): boolean {
    return VIDEO_ID_REGEX.test(videoId);
}

export function buildCanonicalUrl(videoId: string): string {
    if (!isValidVideoId(videoId)) {
        throw new Error('Invalid video ID');
    }
    return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getThumbnailUrl(videoId: string): string {
    if (!isValidVideoId(videoId)) {
        throw new Error('Invalid video ID');
    }
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// =============================================================================
// Metadata Fetching
// =============================================================================

export async function fetchVideoMetadata(
    videoId: string
): Promise<YouTubeVideoMetadata> {
    if (!isValidVideoId(videoId)) {
        throw new Error('Invalid video ID');
    }

    const canonicalUrl = buildCanonicalUrl(videoId);

    try {
        const yt = await getInnertube();
        const info = await yt.getBasicInfo(videoId);

        return {
            videoId,
            title: info.basic_info.title || 'Unknown Title',
            channel: info.basic_info.author || 'Unknown Channel',
            durationSeconds: info.basic_info.duration || 0,
            thumbnailUrl: info.basic_info.thumbnail?.[0]?.url || getThumbnailUrl(videoId),
            isAvailable: true,
            hasTranscript: true, // Optimistic assumption, verified later
            canonicalUrl,
        };
    } catch (error: any) {
        console.error('Metadata fetch failed:', error);

        // Fallback or return failed state
        return {
            videoId,
            title: '',
            channel: '',
            durationSeconds: 0,
            thumbnailUrl: getThumbnailUrl(videoId),
            isAvailable: false,
            hasTranscript: false,
            canonicalUrl,
        };
    }
}

// =============================================================================
// Validation Logic
// =============================================================================

export function validateDuration(
    durationSeconds: number,
    maxSeconds: number = YOUTUBE_LIMITS.MAX_DURATION_SECONDS
): { valid: boolean; error?: string } {
    if (durationSeconds <= 0) {
        return { valid: true }; // Unknown duration allowed
    }

    if (durationSeconds > maxSeconds) {
        const maxMinutes = Math.floor(maxSeconds / 60);
        const actualMinutes = Math.floor(durationSeconds / 60);
        return {
            valid: false,
            error: `Video is ${actualMinutes} minutes. Maximum allowed is ${maxMinutes} minutes.`,
        };
    }

    return { valid: true };
}
