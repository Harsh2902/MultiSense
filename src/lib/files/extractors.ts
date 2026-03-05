// =============================================================================
// Text Extractors - Extract text from various file formats
// =============================================================================

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import mammoth from 'mammoth';
import { createWorker, PSM, OEM } from 'tesseract.js';
import type { ExtractionResult, FileType } from '@/types/learning';
import { FILE_SIZE_LIMITS } from '@/types/learning';

// =============================================================================
// Configuration
// =============================================================================

/**
 * OCR timeout in milliseconds
 * 60 seconds should be enough for most images
 */
const OCR_TIMEOUT_MS = 60000;

/**
 * Maximum image size for OCR (already enforced in FILE_SIZE_LIMITS)
 */
const MAX_OCR_IMAGE_SIZE = FILE_SIZE_LIMITS.image;

// Set PDF.js worker source (only needed in browser)
if (typeof window !== 'undefined') {
    GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

// =============================================================================
// PDF Extraction
// =============================================================================

/**
 * Extract text from PDF file
 * 
 * @param buffer - PDF file buffer
 * @returns Extracted text and metadata
 */
export async function extractFromPDF(
    buffer: ArrayBuffer
): Promise<ExtractionResult> {
    try {
        const uint8Array = new Uint8Array(buffer);
        const pdf = await getDocument({ data: uint8Array }).promise;

        const pageTexts: string[] = [];
        const pageCount = pdf.numPages;

        for (let i = 1; i <= pageCount; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Combine text items with proper spacing
            const pageText = textContent.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (pageText) {
                pageTexts.push(pageText);
            }
        }

        const text = pageTexts.join('\n\n');

        return {
            text,
            metadata: {
                page_count: pageCount,
                word_count: countWords(text),
                char_count: text.length,
            },
        };
    } catch (error) {
        throw new Error(
            `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// =============================================================================
// DOCX Extraction
// =============================================================================

/**
 * Extract text from DOCX file
 * 
 * @param buffer - DOCX file buffer
 * @returns Extracted text and metadata
 */
export async function extractFromDOCX(
    buffer: ArrayBuffer
): Promise<ExtractionResult> {
    try {
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        const text = result.value.trim();

        // Log any warnings
        if (result.messages.length > 0) {
            console.warn('[DOCX] Extraction warnings:', result.messages);
        }

        return {
            text,
            metadata: {
                word_count: countWords(text),
                char_count: text.length,
            },
        };
    } catch (error) {
        throw new Error(
            `DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// =============================================================================
// TXT Extraction
// =============================================================================

/**
 * Extract text from plain text file
 * 
 * @param buffer - TXT file buffer
 * @returns Extracted text and metadata
 */
export async function extractFromTXT(
    buffer: ArrayBuffer
): Promise<ExtractionResult> {
    try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(buffer).trim();

        return {
            text,
            metadata: {
                word_count: countWords(text),
                char_count: text.length,
            },
        };
    } catch (error) {
        throw new Error(
            `TXT extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// =============================================================================
// Image OCR Extraction (with timeout protection)
// =============================================================================

/**
 * Extract text from image using OCR
 * 
 * PROTECTIONS:
 * - Size limit enforced via FILE_SIZE_LIMITS.image (5MB)
 * - Timeout wrapper prevents runaway processing
 * - Worker is always terminated in finally block
 * 
 * @param buffer - Image file buffer
 * @returns Extracted text and metadata with OCR confidence
 */
export async function extractFromImage(
    buffer: ArrayBuffer
): Promise<ExtractionResult> {
    // Validate size (defense-in-depth, already checked at upload)
    if (buffer.byteLength > MAX_OCR_IMAGE_SIZE) {
        throw new Error(
            `Image too large for OCR. Maximum size is ${MAX_OCR_IMAGE_SIZE / 1024 / 1024}MB`
        );
    }

    // Wrap OCR in timeout
    return withTimeout(
        performOCR(buffer),
        OCR_TIMEOUT_MS,
        `OCR timed out after ${OCR_TIMEOUT_MS / 1000} seconds`
    );
}

/**
 * Perform OCR on image buffer
 */
async function performOCR(buffer: ArrayBuffer): Promise<ExtractionResult> {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        // Use CDN for faster loading in browser
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
    });

    try {
        // Configure for best accuracy
        await worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
        });

        const uint8Array = new Uint8Array(buffer);
        // Tesseract.js recognizes Buffer or similar array-like structures
        const { data } = await worker.recognize(Buffer.from(uint8Array));

        const text = data.text.trim();
        const confidence = data.confidence;

        return {
            text,
            metadata: {
                word_count: countWords(text),
                char_count: text.length,
                ocr_used: true,
                ocr_confidence: confidence,
            },
        };
    } catch (error) {
        throw new Error(
            `OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    } finally {
        // Always terminate worker to prevent memory leaks
        await worker.terminate();
    }
}

// =============================================================================
// Unified Extractor
// =============================================================================

/**
 * Extract text from file based on type
 * 
 * @param buffer - File buffer
 * @param fileType - Detected file type
 * @returns Extracted text and metadata
 */
export async function extractText(
    buffer: ArrayBuffer,
    fileType: FileType
): Promise<ExtractionResult> {
    switch (fileType) {
        case 'pdf':
            return extractFromPDF(buffer);
        case 'docx':
            return extractFromDOCX(buffer);
        case 'txt':
            return extractFromTXT(buffer);
        case 'image':
            return extractFromImage(buffer);
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Count words in text
 */
function countWords(text: string): number {
    return text
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0)
        .length;
}

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);
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
