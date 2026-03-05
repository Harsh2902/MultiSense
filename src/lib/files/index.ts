// =============================================================================
// Files Module Index - Central export point
// =============================================================================

export {
    validateFileType,
    validateFileSize,
    sanitizeFilename,
    generateContentHash,
} from './validation';

export {
    extractText,
    extractFromPDF,
    extractFromDOCX,
    extractFromTXT,
    extractFromImage,
} from './extractors';

export {
    normalizeText,
    collapseWhitespace,
    isGarbageText,
    detectLanguage,
    splitIntoParagraphs,
    splitIntoSentences,
    detectHeaders,
} from './normalizer';

export {
    chunkText,
    estimateTokens,
    type TextChunk,
    type ChunkingResult,
} from './chunker';
