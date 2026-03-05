// =============================================================================
// Learning Source Types - Types for file processing and learning sources
// =============================================================================

import type { ConversationRow } from './chat';

// =============================================================================
// Source Types
// =============================================================================

/**
 * Type of learning source
 */
export type SourceType = 'file' | 'youtube';

/**
 * File types supported for upload
 */
export type FileType = 'pdf' | 'docx' | 'txt' | 'image';

/**
 * Processing status for async operations
 */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * MIME types we accept
 */
export const ALLOWED_MIME_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    // Images for OCR
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/webp': 'image/webp',
} as const;

/**
 * Map MIME type to file type
 */
export const MIME_TO_FILE_TYPE: Record<string, FileType> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/webp': 'image',
};

/**
 * Magic bytes for file type validation
 */
export const MAGIC_BYTES: Record<string, number[]> = {
    pdf: [0x25, 0x50, 0x44, 0x46],           // %PDF
    docx: [0x50, 0x4B, 0x03, 0x04],           // PK.. (ZIP)
    png: [0x89, 0x50, 0x4E, 0x47],            // .PNG
    jpeg: [0xFF, 0xD8, 0xFF],                  // JPEG SOI
    webp: [0x52, 0x49, 0x46, 0x46],           // RIFF (WebP container)
};

// =============================================================================
// Database Row Types
// =============================================================================

/**
 * Learning source row from public.learning_sources table
 */
export interface LearningSourceRow {
    id: string;
    user_id: string;
    conversation_id: string;
    source_type: SourceType;
    title: string;
    original_filename: string | null;
    file_type: FileType | null;
    file_size: number | null;
    storage_path: string | null;
    source_url: string | null;
    status: ProcessingStatus;
    error_message: string | null;
    metadata: LearningSourceMetadata;
    created_at: string;
    updated_at: string;
}

/**
 * Metadata stored with learning source
 */
export interface LearningSourceMetadata {
    mime_type?: string;
    page_count?: number;       // For PDF
    word_count?: number;       // Extracted text stats
    char_count?: number;
    chunk_count?: number;      // Number of chunks created
    processing_time_ms?: number;
    ocr_used?: boolean;        // Was OCR needed
    ocr_confidence?: number;   // OCR confidence score
    retry_count?: number;      // Number of processing retries
    hash?: string;             // Content hash for deduplication
    [key: string]: unknown;
}

/**
 * Source chunk row from public.source_chunks table
 */
export interface SourceChunkRow {
    id: string;
    source_id: string;
    chunk_index: number;
    content: string;
    token_count: number;
    metadata: ChunkMetadata;
    created_at: string;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
    page_number?: number;      // For PDF
    section_title?: string;    // Detected heading
    start_char?: number;       // Character offset in original
    end_char?: number;
    overlap_tokens?: number;   // Tokens overlapping with previous chunk
    [key: string]: unknown;
}

/**
 * Embedding row from public.embeddings table
 */
export interface EmbeddingRow {
    id: string;
    chunk_id: string;
    embedding: number[];       // Vector
    model: string;
    created_at: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to upload a file
 */
export interface UploadFileRequest {
    conversation_id: string;
    file: File;
}

/**
 * Response after file upload (processing started)
 */
export interface UploadFileResponse {
    source: LearningSourceRow;
    upload_url?: string;       // Pre-signed URL if using direct upload
}

/**
 * Get processing status response
 */
export interface ProcessingStatusResponse {
    source: LearningSourceRow;
    chunks_processed?: number;
    embeddings_generated?: number;
}

/**
 * List learning sources response
 */
export interface ListSourcesResponse {
    sources: LearningSourceRow[];
    count: number;
}

// =============================================================================
// Processing Pipeline Types
// =============================================================================

/**
 * Result of text extraction
 */
export interface ExtractionResult {
    text: string;
    metadata: {
        page_count?: number;
        word_count: number;
        char_count: number;
        ocr_used?: boolean;
        ocr_confidence?: number;
    };
}

/**
 * Result of text chunking
 */
export interface ChunkingResult {
    chunks: {
        content: string;
        token_count: number;
        metadata: ChunkMetadata;
    }[];
    total_tokens: number;
}

/**
 * File validation result
 */
export interface FileValidationResult {
    valid: boolean;
    file_type?: FileType;
    mime_type?: string;
    error?: string;
}

/**
 * Processing job status
 */
export interface ProcessingJob {
    source_id: string;
    user_id: string;
    conversation_id: string;
    status: ProcessingStatus;
    progress: number;          // 0-100
    current_step: string;
    started_at: string;
    completed_at?: string;
    error?: string;
}

// =============================================================================
// Chunking Configuration
// =============================================================================

/**
 * Chunking strategy configuration
 * 
 * REASONING:
 * - Target 512 tokens per chunk balances:
 *   - Context relevance (smaller = more focused)
 *   - Embedding quality (too small loses context)
 *   - Retrieval efficiency (fewer chunks to search)
 * - 50 token overlap prevents losing context at boundaries
 * - Max 1024 tokens handles edge cases (dense content)
 */
export const CHUNKING_CONFIG = {
    /** Target tokens per chunk */
    targetTokens: 512,

    /** Maximum tokens per chunk */
    maxTokens: 1024,

    /** Minimum tokens per chunk (merge if smaller) */
    minTokens: 100,

    /** Overlap tokens between chunks */
    overlapTokens: 50,

    /** Characters per token estimate */
    charsPerToken: 4,
} as const;

/**
 * File size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
    /** Maximum file size for any file (10MB for demo) */
    max: 10 * 1024 * 1024,

    /** Warning threshold (5MB) */
    warning: 5 * 1024 * 1024,

    /** Per-type limits */
    pdf: 10 * 1024 * 1024,
    docx: 10 * 1024 * 1024,
    txt: 5 * 1024 * 1024,
    image: 5 * 1024 * 1024,
} as const;
