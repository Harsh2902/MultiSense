// =============================================================================
// AI Gateway - Provider-agnostic AI inference abstraction
// =============================================================================

import type { ContextMessage } from '@/types/chat';
import { aiConfig } from '@/config/env';
import { isProviderAvailable, recordSuccess, recordFailure } from '@/lib/ai/circuit-breaker';

// =============================================================================
// Types
// =============================================================================

/**
 * AI provider types
 */
export type AIProvider = 'groq' | 'openai' | 'anthropic' | 'google' | 'ollama';

/**
 * Options for AI completion
 */
export interface CompletionOptions {
    messages: ContextMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

/**
 * Non-streaming completion response
 */
export interface CompletionResponse {
    content: string;
    model: string;
    tokenCount: number;
    finishReason: string;
}

/**
 * Streaming completion chunk
 */
export interface CompletionChunk {
    content: string;
    done: boolean;
    finishReason?: string;
}

/**
 * AI Gateway error with structured information
 */
export class AIGatewayError extends Error {
    constructor(
        message: string,
        public code: string,
        public status: number,
        public provider: AIProvider,
        public retryable: boolean = false
    ) {
        super(message);
        this.name = 'AIGatewayError';
    }
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Get base URL for a provider
 */
function getProviderBaseUrl(provider: AIProvider): string {
    switch (provider) {
        case 'groq':
            return aiConfig.groqBaseUrl;
        case 'openai':
            return 'https://api.openai.com/v1';
        case 'anthropic':
            return 'https://api.anthropic.com/v1';
        case 'google':
            return 'https://generativelanguage.googleapis.com/v1beta/openai'; // OpenAI compatible endpoint
        case 'ollama':
            return process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

/**
 * Get API key for a provider
 */
function getProviderApiKey(provider: AIProvider): string {
    switch (provider) {
        case 'groq':
            return aiConfig.groqApiKey;
        case 'openai':
            return process.env.OPENAI_API_KEY ?? '';
        case 'anthropic':
            return process.env.ANTHROPIC_API_KEY ?? '';
        case 'google':
            return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
        case 'ollama':
            return 'ollama'; // Dummy key required by some libs
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

/**
 * Parse error response from provider
 */
function parseProviderError(
    provider: AIProvider,
    status: number,
    errorBody: string
): AIGatewayError {
    let message = 'AI provider error';
    let code = 'PROVIDER_ERROR';
    let retryable = false;

    try {
        const parsed = JSON.parse(errorBody);
        message = parsed.error?.message || parsed.message || errorBody;
        code = parsed.error?.code || parsed.error?.type || 'PROVIDER_ERROR';
    } catch {
        message = errorBody;
    }

    // Determine if retryable based on status code
    if (status === 429) {
        code = 'RATE_LIMITED';
        retryable = true;
    } else if (status === 500 || status === 502 || status === 503 || status === 404) { // 404 retryable for local dev (model loading)
        code = 'PROVIDER_UNAVAILABLE';
        retryable = true;
    } else if (status === 400 && message.toLowerCase().includes('token')) {
        code = 'TOKEN_LIMIT_EXCEEDED';
        retryable = false;
    }

    return new AIGatewayError(message, code, status, provider, retryable);
}

// =============================================================================
// AI Gateway Class
// =============================================================================

/**
 * AI Gateway for provider-agnostic inference
 * 
 * Currently supports:
 * - Groq
 * - OpenAI
 * - Anthropic
 * - Google (via OpenAI compat)
 * - Ollama (Local)
 * 
 * All providers use OpenAI-compatible API format
 */
export class AIGateway {
    private provider: AIProvider;
    private baseUrl: string;
    private apiKey: string;
    private maxRetries: number;
    private retryDelayMs: number;

    constructor(
        provider: AIProvider = aiConfig.provider,
        options?: { maxRetries?: number; retryDelayMs?: number }
    ) {
        this.provider = provider;
        this.baseUrl = getProviderBaseUrl(provider);
        this.apiKey = getProviderApiKey(provider);
        this.maxRetries = options?.maxRetries ?? 2;
        this.retryDelayMs = options?.retryDelayMs ?? 1000;
    }

    /**
     * Create a chat completion (non-streaming) with retry logic
     */
    async complete(options: CompletionOptions): Promise<CompletionResponse> {
        // Circuit breaker check
        if (!isProviderAvailable(this.provider)) {
            throw new AIGatewayError(
                `Provider ${this.provider} is temporarily unavailable (circuit open)`,
                'CIRCUIT_OPEN',
                503,
                this.provider,
                true
            );
        }

        const {
            messages,
            model = aiConfig.defaultModel,
            temperature = aiConfig.temperature,
            maxTokens = aiConfig.maxTokens,
        } = options;

        let lastError: AIGatewayError | null = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: messages.map(m => ({ role: m.role, content: m.content })),
                        temperature,
                        max_tokens: maxTokens,
                        stream: false,
                    }),
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    const error = parseProviderError(this.provider, response.status, errorBody);

                    // If retryable and we have retries left, continue
                    if (error.retryable && attempt < this.maxRetries) {
                        lastError = error;
                        console.warn(`[AIGateway] Retryable error (attempt ${attempt + 1}):`, error.message);
                        await this.delay(this.retryDelayMs * (attempt + 1)); // Exponential backoff
                        continue;
                    }

                    throw error;
                }

                const data = await response.json();
                const choice = data.choices?.[0];

                if (!choice) {
                    throw new AIGatewayError(
                        'No completion returned from AI',
                        'EMPTY_RESPONSE',
                        200,
                        this.provider
                    );
                }

                return {
                    content: choice.message?.content ?? '',
                    model: data.model,
                    tokenCount: data.usage?.total_tokens ?? 0,
                    finishReason: choice.finish_reason ?? 'unknown',
                };
            } catch (error) {
                if (error instanceof AIGatewayError) {
                    if (!error.retryable) recordFailure(this.provider);
                    throw error;
                }
                // Network error - potentially retryable
                if (attempt < this.maxRetries) {
                    console.warn(`[AIGateway] Network error (attempt ${attempt + 1}):`, error);
                    await this.delay(this.retryDelayMs * (attempt + 1));
                    continue;
                }
                throw new AIGatewayError(
                    error instanceof Error ? error.message : 'Network error',
                    'NETWORK_ERROR',
                    0,
                    this.provider,
                    true
                );
            }
        }

        throw lastError || new AIGatewayError(
            'Max retries exceeded',
            'MAX_RETRIES',
            0,
            this.provider
        );
    }

    /**
     * Create a streaming chat completion
     */
    async *stream(options: CompletionOptions): AsyncGenerator<CompletionChunk> {
        // Circuit breaker check
        if (!isProviderAvailable(this.provider)) {
            throw new AIGatewayError(
                `Provider ${this.provider} is temporarily unavailable (circuit open)`,
                'CIRCUIT_OPEN',
                503,
                this.provider,
                true
            );
        }

        const {
            messages,
            model = aiConfig.defaultModel,
            temperature = aiConfig.temperature,
            maxTokens = aiConfig.maxTokens,
        } = options;

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature,
                max_tokens: maxTokens,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const error = parseProviderError(this.provider, response.status, errorBody);
            if (!error.retryable) recordFailure(this.provider);
            throw error;
        }

        // Stream started successfully — record provider availability
        recordSuccess(this.provider);

        const reader = response.body?.getReader();
        if (!reader) {
            throw new AIGatewayError(
                'No response body',
                'EMPTY_BODY',
                200,
                this.provider
            );
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;

                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const delta = json.choices?.[0]?.delta;
                            const finishReason = json.choices?.[0]?.finish_reason;

                            if (delta?.content) {
                                yield {
                                    content: delta.content,
                                    done: false,
                                };
                            }

                            if (finishReason) {
                                yield {
                                    content: '',
                                    done: true,
                                    finishReason,
                                };
                            }
                        } catch {
                            // Skip malformed JSON
                            continue;
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    getProvider(): AIProvider {
        return this.provider;
    }

    withProvider(provider: AIProvider): AIGateway {
        return new AIGateway(provider);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultGateway: AIGateway | null = null;

export function getAIGateway(): AIGateway {
    if (!defaultGateway) {
        defaultGateway = new AIGateway();
    }
    return defaultGateway;
}
