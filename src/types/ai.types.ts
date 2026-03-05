// =============================================================================
// AI Provider Types - Unified interfaces for LLM & Embedding providers
// =============================================================================

// =============================================================================
// LLM Provider Interface
// =============================================================================

/**
 * Input to an LLM generation call.
 * Provider-agnostic — no Groq/OpenAI-specific fields.
 */
export interface LLMInput {
    /** System prompt */
    systemPrompt: string;

    /** User message */
    userMessage: string;

    /** Maximum tokens in the response */
    maxTokens?: number;

    /** Temperature (0-2, lower = more deterministic) */
    temperature?: number;

    /** Whether to request JSON output */
    jsonMode?: boolean;

    /** AbortController signal for cancellation */
    signal?: AbortSignal;
}

/**
 * Output from an LLM generation call.
 */
export interface LLMOutput {
    /** Generated text content */
    content: string;

    /** Model used for generation */
    model: string;

    /** Token usage accounting */
    usage: TokenUsage;

    /** Reason generation stopped */
    finishReason: 'stop' | 'length' | 'content_filter' | 'error' | string;
}

/**
 * A single chunk from a streaming LLM response.
 */
export interface LLMChunk {
    /** Delta text content */
    content: string;

    /** Whether this is the final chunk */
    done: boolean;

    /** Cumulative usage (only present on final chunk) */
    usage?: TokenUsage;
}

/**
 * LLM provider interface.
 * Any LLM backend (Groq, OpenAI, Anthropic, Google) must implement this.
 */
export interface LLMProvider {
    /** Provider name for logging and identification */
    readonly name: string;

    /** Generate a complete response */
    generate(input: LLMInput): Promise<LLMOutput>;

    /** Stream a response chunk-by-chunk */
    stream(input: LLMInput): AsyncIterable<LLMChunk>;
}

// =============================================================================
// Embedding Provider Interface
// =============================================================================

/**
 * Embedding provider interface.
 * Any embedding backend (OpenAI, Cohere, local) must implement this.
 */
export interface EmbeddingProvider {
    /** Provider name for logging */
    readonly name: string;

    /** Embedding vector dimension */
    readonly dimension: number;

    /** Generate embedding for single text */
    embed(text: string): Promise<number[]>;

    /** Generate embeddings for multiple texts (batch) */
    batchEmbed(texts: string[]): Promise<number[][]>;
}

// =============================================================================
// Token Usage
// =============================================================================

/**
 * Token usage accounting — provider-agnostic format.
 */
export interface TokenUsage {
    /** Tokens in the prompt/input */
    promptTokens: number;

    /** Tokens in the completion/output */
    completionTokens: number;

    /** Total tokens consumed */
    totalTokens: number;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/** Supported LLM provider identifiers */
export type LLMProviderType = 'groq' | 'openai' | 'anthropic' | 'google' | 'ollama';

/** Supported embedding provider identifiers */
export type EmbeddingProviderType = 'openai' | 'cohere' | 'local' | 'ollama';

/**
 * Configuration for creating a provider instance.
 */
export interface ProviderConfig {
    /** Provider type */
    type: LLMProviderType | EmbeddingProviderType;

    /** API key (override env var) */
    apiKey?: string;

    /** Base URL (override default) */
    baseUrl?: string;

    /** Model name (override default) */
    model?: string;
}

// =============================================================================
// Unified Error Hierarchy
// =============================================================================

/**
 * Base error for all AI provider errors.
 * Prevents raw API errors from leaking to clients.
 */
export class AIProviderError extends Error {
    /** Error code for programmatic handling */
    readonly code: string;

    /** Provider that caused the error */
    readonly provider: string;

    /** HTTP status code from provider (if applicable) */
    readonly statusCode?: number;

    /** Whether this error is retryable */
    readonly retryable: boolean;

    constructor(
        message: string,
        code: string,
        provider: string,
        options?: { statusCode?: number; retryable?: boolean; cause?: Error }
    ) {
        super(message, { cause: options?.cause });
        this.name = 'AIProviderError';
        this.code = code;
        this.provider = provider;
        this.statusCode = options?.statusCode;
        this.retryable = options?.retryable ?? false;
    }
}

/**
 * Rate limit exceeded by the AI provider.
 */
export class RateLimitError extends AIProviderError {
    /** Seconds until rate limit resets (if known) */
    readonly retryAfterMs?: number;

    constructor(provider: string, retryAfterMs?: number) {
        super(
            `Rate limit exceeded for ${provider}. ${retryAfterMs ? `Retry after ${Math.ceil(retryAfterMs / 1000)}s.` : 'Please wait.'}`,
            'RATE_LIMITED',
            provider,
            { statusCode: 429, retryable: true }
        );
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Token limit exceeded (input too large or output would overflow).
 */
export class TokenLimitError extends AIProviderError {
    /** Tokens requested */
    readonly requested: number;

    /** Maximum allowed */
    readonly maximum: number;

    constructor(provider: string, requested: number, maximum: number) {
        super(
            `Token limit exceeded: ${requested} requested, ${maximum} maximum`,
            'TOKEN_LIMIT',
            provider,
            { retryable: false }
        );
        this.name = 'TokenLimitError';
        this.requested = requested;
        this.maximum = maximum;
    }
}

/**
 * Provider is unavailable (down, network error, timeout).
 */
export class ProviderUnavailableError extends AIProviderError {
    constructor(provider: string, cause?: Error) {
        super(
            `AI provider ${provider} is currently unavailable`,
            'PROVIDER_UNAVAILABLE',
            provider,
            { statusCode: 503, retryable: true, cause }
        );
        this.name = 'ProviderUnavailableError';
    }
}

/**
 * Provider returned an invalid or unparseable response.
 */
export class ProviderResponseError extends AIProviderError {
    constructor(provider: string, detail: string) {
        super(
            `Invalid response from ${provider}: ${detail}`,
            'INVALID_RESPONSE',
            provider,
            { retryable: false }
        );
        this.name = 'ProviderResponseError';
    }
}
