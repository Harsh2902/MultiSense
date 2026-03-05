// =============================================================================
// RAG Types - Types for Retrieval-Augmented Generation
// =============================================================================

// =============================================================================
// Configuration Constants
// =============================================================================

/**
 * RAG configuration constants
 */
export const RAG_CONFIG = {
    /** Default number of chunks to retrieve */
    DEFAULT_K: 5,

    /** Default similarity threshold (0-1) */
    DEFAULT_THRESHOLD: 0.5,

    /** Maximum context tokens to include */
    MAX_CONTEXT_TOKENS: 4000,

    /** Embedding dimension (Gemini embedding-001) */
    EMBEDDING_DIMENSION: 768,

    /** Batch size for embedding generation */
    EMBEDDING_BATCH_SIZE: 20,

    /** Embedding API timeout in milliseconds */
    EMBEDDING_TIMEOUT_MS: 30000,

    /** Maximum retries for embedding API */
    MAX_EMBEDDING_RETRIES: 3,
} as const;

// =============================================================================
// Retrieval Types
// =============================================================================

/**
 * Configuration for retrieval operations
 */
export interface RetrievalConfig {
    /** Number of chunks to retrieve */
    k: number;

    /** Minimum similarity threshold (0-1) */
    threshold: number;

    /** Maximum context tokens */
    maxContextTokens: number;
}

/**
 * Default retrieval configuration
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
    k: RAG_CONFIG.DEFAULT_K,
    threshold: RAG_CONFIG.DEFAULT_THRESHOLD,
    maxContextTokens: RAG_CONFIG.MAX_CONTEXT_TOKENS,
};

/**
 * Retrieved chunk with similarity score
 */
export interface RetrievedChunk {
    /** Chunk ID */
    id: string;

    /** Source ID this chunk belongs to */
    sourceId: string;

    /** Chunk content */
    content: string;

    /** Chunk index within source */
    chunkIndex: number;

    /** Cosine similarity score (0-1) */
    similarity: number;

    /** Source metadata */
    sourceMetadata?: {
        title?: string;
        fileName?: string;
        sourceType?: string;
    };
}

/**
 * Context built from retrieved chunks
 */
export interface RagContext {
    /** Retrieved chunks (sorted by source order) */
    chunks: RetrievedChunk[];

    /** Formatted context string for LLM */
    formattedContext: string;

    /** Estimated token count */
    tokenCount: number;

    /** Whether context was truncated */
    truncated: boolean;

    /** Number of chunks before deduplication */
    rawChunkCount: number;
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
    /** Generate embedding for single text */
    embed(text: string): Promise<number[]>;

    /** Generate embeddings for multiple texts (batch) */
    batchEmbed(texts: string[]): Promise<number[][]>;

    /** Get embedding dimension */
    readonly dimension: number;

    /** Provider name for logging */
    readonly name: string;
}

/**
 * Result of embedding generation
 */
export interface EmbeddingResult {
    /** Successfully embedded chunk IDs */
    success: string[];

    /** Failed chunk IDs */
    failed: string[];

    /** Total embeddings generated */
    count: number;
}

// =============================================================================
// Prompt Types
// =============================================================================

/**
 * Hallucination prevention system prompt
 */
export const RAG_SYSTEM_PROMPT = `You are a learning assistant helping students study from their uploaded materials.

CRITICAL RULES:
1. Answer ONLY using the provided CONTEXT below.
2. If the answer is not in the CONTEXT, respond with: "I couldn't find this information in your uploaded materials. Try uploading more relevant content or asking a different question."
3. Do NOT use any external knowledge or make assumptions.
4. When possible, quote or paraphrase specific passages from the context.
5. If the context only partially answers the question, clearly state what IS available and what is NOT.
6. Be helpful and educational in your responses.

CONTEXT:
{context}

Remember: Your knowledge is LIMITED to the context above. Do not hallucinate or invent information.`;

/**
 * Response when no context is found
 */
export const NO_CONTEXT_RESPONSE =
    "I couldn't find any relevant information in your uploaded materials for this question. " +
    "Please try:\n" +
    "• Uploading more files or videos related to this topic\n" +
    "• Rephrasing your question\n" +
    "• Asking about a different topic covered in your materials";

// =============================================================================
// Database Types (matching Supabase)
// =============================================================================

/**
 * Embedding row in database
 */
export interface EmbeddingRow {
    id: string;
    chunk_id: string;
    embedding: number[];
    model: string;
    created_at: string;
}

/**
 * Match result from pgvector RPC
 */
export interface MatchChunkResult {
    id: string;
    content: string;
    chunk_index: number;
    source_id: string;
    source_title: string;
    source_file_name: string;
    source_type: string;
    similarity: number;
}
