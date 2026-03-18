// =============================================================================
// AI Configuration - Centralized provider settings
// =============================================================================

import type { LLMProviderType, EmbeddingProviderType } from '@/types/ai.types';

// =============================================================================
// Active Provider Selection
// =============================================================================

/** Active LLM provider (change this to switch providers globally) */
export const ACTIVE_LLM_PROVIDER: LLMProviderType = 'ollama';

/** Active embedding provider */
export const ACTIVE_EMBEDDING_PROVIDER: EmbeddingProviderType = 'ollama';

// =============================================================================
// Provider Endpoints
// =============================================================================

export const PROVIDER_ENDPOINTS = {
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        envKey: 'GROQ_API_KEY',
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        envKey: 'OPENAI_API_KEY',
    },
    anthropic: {
        baseUrl: 'https://api.anthropic.com/v1',
        envKey: 'ANTHROPIC_API_KEY',
    },
    google: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1',
        envKey: 'GOOGLE_AI_API_KEY',
    },
    ollama: {
        baseUrl: 'http://localhost:11434',
        envKey: 'OLLAMA_BASE_URL',
    },
} as const;

// =============================================================================
// Default Generation Parameters
// =============================================================================

export const AI_DEFAULTS = {
    /** Default temperature for LLM generation */
    temperature: 0.3,

    /** Default max response tokens */
    maxTokens: 4096,

    /** Request timeout in milliseconds */
    requestTimeoutMs: 120_000,

    /** Streaming chunk timeout (no data for this long = abort) */
    streamTimeoutMs: 10_000,

    /** Maximum retries for transient failures */
    maxRetries: 3,

    /** Base delay for exponential backoff (ms) */
    retryBaseDelayMs: 1000,
} as const;

// =============================================================================
// Embedding Configuration
// =============================================================================

export const EMBEDDING_CONFIG = {
    /** Embedding vector dimension */
    dimension: 1536,

    /** Batch size for bulk embedding */
    batchSize: 20,

    /** API timeout for embedding calls */
    timeoutMs: 30_000,

    /** Max retries */
    maxRetries: 3,
} as const;

// =============================================================================
// RAG Configuration
// =============================================================================

export const RAG_DEFAULTS = {
    /** Default number of chunks to retrieve */
    defaultK: 5,

    /** Default similarity threshold */
    defaultThreshold: 0.7,

    /** Max context tokens for prompt */
    maxContextTokens: 4000,
} as const;
