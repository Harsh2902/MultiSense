// =============================================================================
// Environment Configuration - Centralized environment variable access
// =============================================================================

/**
 * Environment variables required for the application
 * All secrets should be defined in .env.local (not committed to git)
 */

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * Get required environment variable or throw
 * @param key - Environment variable name
 * @returns Value of the environment variable
 * @throws Error if variable is not defined
 */
function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(
            `Missing required environment variable: ${key}. ` +
            `Please add it to your .env.local file.`
        );
    }
    return value;
}

/**
 * Get optional environment variable with default
 * @param key - Environment variable name
 * @param defaultValue - Default value if not defined
 * @returns Value of the environment variable or default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
}

// =============================================================================
// Supabase Configuration
// =============================================================================

export const supabaseConfig = {
    /** Supabase project URL */
    url: getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),

    /** Supabase anonymous key (safe for client-side) */
    anonKey: getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),

    /** Supabase service role key (server-side only, bypasses RLS) */
    get serviceRoleKey(): string {
        if (typeof window !== 'undefined') {
            throw new Error('Service role key must not be accessed on client-side');
        }
        return getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    },
} as const;

// =============================================================================
// AI Provider Configuration
// =============================================================================

export const aiConfig = {
    /** Default AI provider */
    provider: getOptionalEnv('AI_PROVIDER', 'ollama') as 'groq' | 'openai' | 'anthropic' | 'ollama',

    /** Groq API key */
    get groqApiKey(): string {
        return getRequiredEnv('GROQ_API_KEY');
    },

    /** Groq API base URL */
    groqBaseUrl: getOptionalEnv('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),

    /** Default model for chat */
    defaultModel: getOptionalEnv('AI_DEFAULT_MODEL', 'llama-3.1-8b-instant'),

    /** Default model for embeddings */
    embeddingModel: getOptionalEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-small'),

    /** Embedding dimensions (must match model) */
    embeddingDimensions: parseInt(getOptionalEnv('AI_EMBEDDING_DIMENSIONS', '1536'), 10),

    /** Max tokens for responses */
    maxTokens: parseInt(getOptionalEnv('AI_MAX_TOKENS', '2048'), 10),

    /** Default temperature */
    temperature: parseFloat(getOptionalEnv('AI_TEMPERATURE', '0.7')),
} as const;

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

export const rateLimitConfig = {
    /** Upstash Redis REST URL */
    get redisUrl(): string {
        return getRequiredEnv('UPSTASH_REDIS_REST_URL');
    },

    /** Upstash Redis REST token */
    get redisToken(): string {
        return getRequiredEnv('UPSTASH_REDIS_REST_TOKEN');
    },

    /** Chat endpoint rate limit (requests per minute) */
    chatLimit: parseInt(getOptionalEnv('RATE_LIMIT_CHAT', '30'), 10),

    /** Upload endpoint rate limit (requests per minute) */
    uploadLimit: parseInt(getOptionalEnv('RATE_LIMIT_UPLOAD', '5'), 10),

    /** YouTube endpoint rate limit (requests per minute) */
    youtubeLimit: parseInt(getOptionalEnv('RATE_LIMIT_YOUTUBE', '3'), 10),
} as const;

// =============================================================================
// Application Configuration
// =============================================================================

export const appConfig = {
    /** Application URL */
    url: getOptionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

    /** Node environment */
    nodeEnv: getOptionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',

    /** Is production environment */
    isProduction: process.env.NODE_ENV === 'production',

    /** Is development environment */
    isDevelopment: process.env.NODE_ENV === 'development',

    /** Max file upload size in bytes (10MB) */
    maxFileSize: parseInt(getOptionalEnv('MAX_FILE_SIZE', String(10 * 1024 * 1024)), 10),

    /** Context window token limit */
    contextWindowTokens: parseInt(getOptionalEnv('CONTEXT_WINDOW_TOKENS', '4096'), 10),
} as const;

// =============================================================================
// Type Exports
// =============================================================================

export type AIProvider = typeof aiConfig.provider;

// =============================================================================
// Boot-Time Validation
// =============================================================================

interface EnvValidationResult {
    valid: boolean;
    missing: string[];
    warnings: string[];
}

/**
 * Validate all environment variables at application boot.
 * Required vars cause failures; optional vars generate warnings.
 * Call this once during application initialization.
 */
export function validateAllEnvVars(): EnvValidationResult {
    const required = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'GROQ_API_KEY',
    ];

    const optional = [
        { key: 'OPENAI_API_KEY', note: 'Needed for embeddings' },
        { key: 'UPSTASH_REDIS_REST_URL', note: 'Needed for rate limiting' },
        { key: 'UPSTASH_REDIS_REST_TOKEN', note: 'Needed for rate limiting' },
        { key: 'LOG_LEVEL', note: 'Defaults to "info"' },
        { key: 'DAILY_TOKEN_BUDGET', note: 'Defaults to 500000' },
        { key: 'MAX_PARALLEL_OCR', note: 'Defaults to 3' },
        { key: 'MAX_PARALLEL_EMBEDDINGS', note: 'Defaults to 5' },
        { key: 'MAX_PARALLEL_LLM', note: 'Defaults to 4' },
    ];

    const missing = required.filter(key => !process.env[key]);
    const warnings = optional
        .filter(({ key }) => !process.env[key])
        .map(({ key, note }) => `${key}: ${note}`);

    const valid = missing.length === 0;

    // Log results
    if (!valid) {
        console.error('[ENV] Missing required environment variables:', missing.join(', '));
    }
    if (warnings.length > 0) {
        console.warn('[ENV] Optional environment variables not set:', warnings.join('; '));
    }
    if (valid && warnings.length === 0) {
        console.log('[ENV] All environment variables validated ✓');
    }

    return { valid, missing, warnings };
}
