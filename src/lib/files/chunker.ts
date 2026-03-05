// =============================================================================
// Text Chunker - Token-aware text chunking for RAG
// =============================================================================

import { CHUNKING_CONFIG, type ChunkMetadata } from '@/types/learning';
import { splitIntoParagraphs, detectHeaders } from './normalizer';

// =============================================================================
// Types
// =============================================================================

/**
 * A chunk of text with metadata
 */
export interface TextChunk {
    content: string;
    token_count: number;
    metadata: ChunkMetadata;
}

/**
 * Result of chunking operation
 */
export interface ChunkingResult {
    chunks: TextChunk[];
    total_tokens: number;
    total_chunks: number;
}

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count from text
 * Uses character-based estimation (4 chars ≈ 1 token for English)
 * 
 * More accurate than word-based for mixed content
 * 
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
    // Base estimate: 4 characters per token
    const baseEstimate = Math.ceil(text.length / CHUNKING_CONFIG.charsPerToken);

    // Adjust for whitespace (tokens are denser in code/dense text)
    const whitespaceRatio = (text.match(/\s/g) || []).length / text.length;
    const adjustment = whitespaceRatio > 0.15 ? 0.9 : 1.1;

    return Math.ceil(baseEstimate * adjustment);
}

// =============================================================================
// Chunking Algorithm
// =============================================================================

/**
 * CHUNKING STRATEGY REASONING:
 * 
 * 1. Target Size: 512 tokens
 *    - Large enough to preserve context and semantic meaning
 *    - Small enough to fit multiple chunks in retrieval context
 *    - Optimal for embedding models (most trained on 512 token chunks)
 * 
 * 2. Overlap: 50 tokens
 *    - Prevents information loss at chunk boundaries
 *    - Maintains coherence when chunks are retrieved separately
 *    - ~10% overlap is industry standard
 * 
 * 3. Boundary Respect:
 *    - Prefer breaking at paragraph boundaries
 *    - Fall back to sentence boundaries
 *    - Last resort: word boundaries
 *    - Never break mid-word
 * 
 * 4. Minimum Size: 100 tokens
 *    - Chunks smaller than this are merged with next
 *    - Prevents tiny, low-context chunks
 */

/**
 * Split text into token-aware chunks
 * 
 * @param text - Normalized text to chunk
 * @param options - Optional chunking configuration
 * @returns Array of chunks with metadata
 */
export function chunkText(
    text: string,
    options?: Partial<typeof CHUNKING_CONFIG>
): ChunkingResult {
    const config = { ...CHUNKING_CONFIG, ...options };

    // Detect section headers for metadata
    const headers = detectHeaders(text);

    // Initial split by paragraphs
    const paragraphs = splitIntoParagraphs(text);

    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentTokens = 0;
    let currentStartChar = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokens(paragraph);

        // If paragraph alone exceeds max, split it
        if (paragraphTokens > config.maxTokens) {
            // Flush current chunk if exists
            if (currentChunk) {
                chunks.push(createChunk(
                    currentChunk,
                    currentTokens,
                    chunkIndex++,
                    currentStartChar,
                    currentStartChar + currentChunk.length,
                    headers
                ));
                currentStartChar += currentChunk.length;
                currentChunk = '';
                currentTokens = 0;
            }

            // Split large paragraph into smaller pieces
            const subChunks = splitLargeParagraph(paragraph, config);
            for (const sub of subChunks) {
                chunks.push(createChunk(
                    sub.content,
                    sub.tokens,
                    chunkIndex++,
                    currentStartChar,
                    currentStartChar + sub.content.length,
                    headers
                ));
                currentStartChar += sub.content.length;
            }
            continue;
        }

        // Check if adding paragraph exceeds target
        if (currentTokens + paragraphTokens > config.targetTokens) {
            // Flush current chunk if it meets minimum
            if (currentTokens >= config.minTokens) {
                chunks.push(createChunk(
                    currentChunk,
                    currentTokens,
                    chunkIndex++,
                    currentStartChar,
                    currentStartChar + currentChunk.length,
                    headers
                ));

                // Start new chunk with overlap from end of previous
                const overlap = getOverlapText(currentChunk, config.overlapTokens);
                currentStartChar += currentChunk.length - overlap.length;
                currentChunk = overlap + (overlap ? '\n\n' : '') + paragraph;
                currentTokens = estimateTokens(currentChunk);
            } else {
                // Current chunk too small, merge with paragraph
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
                currentTokens = estimateTokens(currentChunk);
            }
        } else {
            // Append paragraph to current chunk
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            currentTokens += paragraphTokens;
        }
    }

    // Flush final chunk
    if (currentChunk) {
        chunks.push(createChunk(
            currentChunk,
            currentTokens,
            chunkIndex,
            currentStartChar,
            currentStartChar + currentChunk.length,
            headers
        ));
    }

    // Calculate totals
    const totalTokens = chunks.reduce((sum, c) => sum + c.token_count, 0);

    return {
        chunks,
        total_tokens: totalTokens,
        total_chunks: chunks.length,
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a chunk with metadata
 */
function createChunk(
    content: string,
    tokenCount: number,
    index: number,
    startChar: number,
    endChar: number,
    headers: { title: string; startIndex: number }[]
): TextChunk {
    // Find applicable section header
    let sectionTitle: string | undefined;
    for (let i = headers.length - 1; i >= 0; i--) {
        if (headers[i]!.startIndex <= startChar) {
            sectionTitle = headers[i]!.title;
            break;
        }
    }

    return {
        content: content.trim(),
        token_count: tokenCount,
        metadata: {
            section_title: sectionTitle,
            start_char: startChar,
            end_char: endChar,
        },
    };
}

/**
 * Split a large paragraph that exceeds max tokens
 */
function splitLargeParagraph(
    paragraph: string,
    config: typeof CHUNKING_CONFIG
): { content: string; tokens: number }[] {
    const results: { content: string; tokens: number }[] = [];

    // Split by sentences first
    const sentences = paragraph.split(/(?<=[.!?])\s+/);

    let current = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);

        // If single sentence exceeds max, split by words
        if (sentenceTokens > config.maxTokens) {
            if (current) {
                results.push({ content: current.trim(), tokens: currentTokens });
                current = '';
                currentTokens = 0;
            }

            // Split by words
            const wordChunks = splitByWords(sentence, config.targetTokens);
            results.push(...wordChunks);
            continue;
        }

        if (currentTokens + sentenceTokens > config.targetTokens) {
            if (current) {
                results.push({ content: current.trim(), tokens: currentTokens });
            }
            current = sentence;
            currentTokens = sentenceTokens;
        } else {
            current += (current ? ' ' : '') + sentence;
            currentTokens += sentenceTokens;
        }
    }

    if (current) {
        results.push({ content: current.trim(), tokens: currentTokens });
    }

    return results;
}

/**
 * Split text by words when sentence splitting isn't enough
 */
function splitByWords(
    text: string,
    targetTokens: number
): { content: string; tokens: number }[] {
    const words = text.split(/\s+/);
    const results: { content: string; tokens: number }[] = [];

    let current: string[] = [];
    let currentTokens = 0;

    for (const word of words) {
        const wordTokens = estimateTokens(word + ' ');

        if (currentTokens + wordTokens > targetTokens && current.length > 0) {
            const content = current.join(' ');
            results.push({ content, tokens: estimateTokens(content) });
            current = [word];
            currentTokens = wordTokens;
        } else {
            current.push(word);
            currentTokens += wordTokens;
        }
    }

    if (current.length > 0) {
        const content = current.join(' ');
        results.push({ content, tokens: estimateTokens(content) });
    }

    return results;
}

/**
 * Get overlap text from end of chunk
 */
function getOverlapText(text: string, targetTokens: number): string {
    if (targetTokens <= 0) return '';

    // Work backwards from end
    const words = text.split(/\s+/);
    const overlap: string[] = [];
    let tokens = 0;

    for (let i = words.length - 1; i >= 0 && tokens < targetTokens; i--) {
        overlap.unshift(words[i]!);
        tokens = estimateTokens(overlap.join(' '));
    }

    return overlap.join(' ');
}
