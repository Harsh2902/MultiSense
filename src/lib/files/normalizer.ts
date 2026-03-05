// =============================================================================
// Text Normalizer - Clean and normalize extracted text
// =============================================================================

// =============================================================================
// Text Cleaning
// =============================================================================

/**
 * Clean and normalize extracted text
 * 
 * @param text - Raw extracted text
 * @returns Cleaned text
 */
export function normalizeText(text: string): string {
    let normalized = text;

    // 1. Normalize Unicode (NFC normalization)
    normalized = normalized.normalize('NFC');

    // 2. Replace common problematic characters
    normalized = normalized
        // Smart quotes to regular quotes
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        // Em/en dashes to regular dashes
        .replace(/[\u2013\u2014]/g, '-')
        // Ellipsis to three dots
        .replace(/\u2026/g, '...')
        // Non-breaking spaces to regular spaces
        .replace(/\u00A0/g, ' ')
        // Zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '');

    // 3. Remove control characters (except newlines and tabs)
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 4. Normalize whitespace
    normalized = normalized
        // Multiple spaces to single space
        .replace(/ +/g, ' ')
        // Multiple newlines to double newline (paragraph break)
        .replace(/\n{3,}/g, '\n\n')
        // Remove trailing whitespace from lines
        .replace(/ +\n/g, '\n')
        // Remove leading whitespace from lines
        .replace(/\n +/g, '\n');

    // 5. Trim
    normalized = normalized.trim();

    return normalized;
}

/**
 * Remove excess whitespace while preserving structure
 */
export function collapseWhitespace(text: string): string {
    return text
        .replace(/ +/g, ' ')
        .replace(/\n{2,}/g, '\n\n')
        .trim();
}

// =============================================================================
// Text Analysis
// =============================================================================

/**
 * Detect if text is mostly garbage/noise
 * Useful for OCR quality check
 * 
 * @param text - Text to analyze
 * @returns True if text appears to be garbage
 */
export function isGarbageText(text: string): boolean {
    if (text.length < 10) return true;

    // Count alphanumeric ratio
    const alphanumeric = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const ratio = alphanumeric / text.length;

    // Less than 30% alphanumeric is suspicious
    if (ratio < 0.3) return true;

    // Check for repeated characters
    const repeatedPattern = /(.)\1{5,}/g;
    const repeats = (text.match(repeatedPattern) || []).length;
    if (repeats > text.length / 50) return true;

    return false;
}

/**
 * Detect language of text (simple heuristic)
 * Returns ISO 639-1 code or 'unknown'
 */
export function detectLanguage(text: string): string {
    // Simple English detection based on common words
    const englishWords = /\b(the|is|are|was|were|have|has|had|been|being|be|will|would|could|should|may|might|must|shall|can|need|do|does|did|a|an|and|or|but|if|then|else|when|where|what|which|who|whom|whose|this|that|these|those|it|its)\b/gi;

    const matches = text.match(englishWords) || [];
    const wordCount = text.split(/\s+/).length;

    if (matches.length / wordCount > 0.1) {
        return 'en';
    }

    return 'unknown';
}

// =============================================================================
// Text Segmentation
// =============================================================================

/**
 * Split text into paragraphs
 * 
 * @param text - Normalized text
 * @returns Array of paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
    return text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

/**
 * Split text into sentences
 * 
 * @param text - Normalized text
 * @returns Array of sentences
 */
export function splitIntoSentences(text: string): string[] {
    // Simple sentence splitting (handles common cases)
    return text
        .replace(/([.!?])\s+/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/**
 * Detect section headers in text
 * Returns array of {title, startIndex} objects
 */
export function detectHeaders(text: string): { title: string; startIndex: number }[] {
    const headers: { title: string; startIndex: number }[] = [];
    const lines = text.split('\n');
    let currentIndex = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // Heuristics for header detection:
        // 1. Short lines (< 80 chars)
        // 2. Ends without period
        // 3. Contains numbers or keywords
        const isShort = trimmed.length > 0 && trimmed.length < 80;
        const noPeriod = !trimmed.endsWith('.');
        const hasNumbering = /^[\d.]+\s+\w/.test(trimmed);
        const hasKeywords = /^(chapter|section|part|introduction|conclusion|summary|abstract)/i.test(trimmed);
        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

        if (isShort && noPeriod && (hasNumbering || hasKeywords || isAllCaps)) {
            headers.push({
                title: trimmed,
                startIndex: currentIndex,
            });
        }

        currentIndex += line.length + 1;
    }

    return headers;
}
