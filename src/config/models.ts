// =============================================================================
// Model Configuration - Centralized model names & token limits
// =============================================================================

// =============================================================================
// LLM Models
// =============================================================================

export const LLM_MODELS = {
    groq: { default: 'gemma3:4b', large: 'gemma3:4b' },
    openai: { default: 'gemma3:4b', large: 'gemma3:4b' },
    anthropic: { default: 'gemma3:4b', large: 'gemma3:4b' },
    google: { default: 'gemma3:4b', large: 'gemma3:4b', flash25: 'gemma3:4b' },
    ollama: { default: 'gemma3:4b', large: 'gemma3:4b' },
} as const;

// =============================================================================
// Embedding Models
// =============================================================================

export const EMBEDDING_MODELS = {
    openai: {
        default: 'text-embedding-3-small',
        large: 'text-embedding-3-large',
        dimensions: {
            'text-embedding-3-small': 1536,
            'text-embedding-3-large': 3072,
        },
    },
    google: {
        default: 'models/gemini-embedding-001',
        dimensions: {
            'models/gemini-embedding-001': 768,
        },
    },
    ollama: {
        default: 'all-minilm',
        dimensions: {
            'all-minilm': 384,
            'nomic-embed-text': 768,
            'mxbai-embed-large': 1024,
            'gemma3:4b': 2560, // approximate, or use if it supports embeddings
        },
    },
} as const;

// =============================================================================
// Per-Feature Token Limits
// =============================================================================

/**
 * Maximum OUTPUT tokens per feature.
 * Prevents runaway generation and controls cost.
 */
export const FEATURE_TOKEN_LIMITS = {
    /** Chat conversation response */
    chat: {
        maxOutputTokens: 4096,
        maxInputTokens: 8000,
        safetyBuffer: 200,
    },

    /** Quiz generation */
    quiz: {
        maxOutputTokens: 2048,
        maxInputTokens: 6000,
        safetyBuffer: 200,
    },

    /** Flashcard generation */
    flashcard: {
        maxOutputTokens: 2048,
        maxInputTokens: 6000,
        safetyBuffer: 200,
    },

    /** Summary generation */
    summary: {
        maxOutputTokens: 3072,
        maxInputTokens: 8000,
        safetyBuffer: 200,
    },
} as const;

/** Feature names for type safety */
export type FeatureName = keyof typeof FEATURE_TOKEN_LIMITS;

// =============================================================================
// Model Context Windows (for reference / guardrails)
// =============================================================================

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    'llama-3.1-8b-instant': 131072,
    'llama-3.1-70b-versatile': 131072,
    'gpt-4o-mini': 128000,
    'gpt-4o': 128000,
    'claude-3-haiku-20240307': 200000,
    'claude-3-5-sonnet-20241022': 200000,
    'gemini-1.5-flash': 1048576,
    'gemini-1.5-pro': 2097152,
} as const;
