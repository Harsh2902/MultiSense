// =============================================================================
// YouTube Module Index
// =============================================================================

export {
    validateYouTubeUrl,
    isValidVideoId,
    buildCanonicalUrl,
    getThumbnailUrl,
    fetchVideoMetadata,
    validateDuration,
    type UrlValidationResult,
} from './validation';

export {
    extractTranscript,
    getDurationFromTranscript,
    transcriptToTimestampedText,
} from './transcript';

export {
    isFrameExtractionEnabled,
    calculateFrameTimestamps,
    extractFrames,
    processFrameOcr,
} from './frames';

export {
    mergeContent,
} from './merger';
