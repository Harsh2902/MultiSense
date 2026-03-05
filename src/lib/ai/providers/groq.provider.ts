// =============================================================================
// Groq LLM Provider - Implements LLMProvider interface
// =============================================================================

import type {
    LLMProvider,
    LLMInput,
    LLMOutput,
    LLMChunk,
    TokenUsage,
} from '@/types/ai.types';
import {
    AIProviderError,
    RateLimitError,
    ProviderUnavailableError,
    ProviderResponseError,
} from '@/types/ai.types';
import { PROVIDER_ENDPOINTS, AI_DEFAULTS } from '@/config/ai';
import { LLM_MODELS } from '@/config/models';

// =============================================================================
// Types (internal, never exported)
// =============================================================================

interface GroqChatResponse {
    choices: Array<{
        message: { role: string; content: string };
        finish_reason: string;
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface GroqStreamChunk {
    choices: Array<{
        delta: { content?: string };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class GroqLLMProvider implements LLMProvider {
    readonly name = 'groq';

    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config?: { apiKey?: string; baseUrl?: string; model?: string }) {
        const envKey = config?.apiKey || process.env[PROVIDER_ENDPOINTS.groq.envKey];
        if (!envKey) {
            throw new AIProviderError(
                `${PROVIDER_ENDPOINTS.groq.envKey} is required`,
                'MISSING_API_KEY',
                'groq'
            );
        }

        this.apiKey = envKey;
        this.baseUrl = config?.baseUrl || PROVIDER_ENDPOINTS.groq.baseUrl;
        this.model = config?.model || LLM_MODELS.groq.default;
    }

    // ===========================================================================
    // Generate (non-streaming)
    // ===========================================================================

    async generate(input: LLMInput): Promise<LLMOutput> {
        const body = this.buildRequestBody(input, false);

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: input.signal,
            }
        );

        await this.handleErrorResponse(response);

        const data = (await response.json()) as GroqChatResponse;
        const choice = data.choices[0];

        if (!choice) {
            throw new ProviderResponseError('groq', 'No choices in response');
        }

        return {
            content: choice.message.content,
            model: data.model,
            usage: this.normalizeUsage(data.usage),
            finishReason: choice.finish_reason,
        };
    }

    // ===========================================================================
    // Stream
    // ===========================================================================

    async *stream(input: LLMInput): AsyncIterable<LLMChunk> {
        const body = this.buildRequestBody(input, true);

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: input.signal,
            }
        );

        await this.handleErrorResponse(response);

        if (!response.body) {
            throw new ProviderResponseError('groq', 'No response body for stream');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        yield { content: '', done: true };
                        return;
                    }

                    try {
                        const chunk = JSON.parse(data) as GroqStreamChunk;
                        const choice = chunk.choices[0];
                        if (!choice) continue;

                        const content = choice.delta.content || '';
                        const isDone = choice.finish_reason !== null;

                        yield {
                            content,
                            done: isDone,
                            usage: isDone && chunk.usage
                                ? this.normalizeUsage(chunk.usage)
                                : undefined,
                        };

                        if (isDone) return;
                    } catch {
                        // Skip malformed JSON chunks
                        continue;
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // ===========================================================================
    // Internal Helpers
    // ===========================================================================

    private buildRequestBody(
        input: LLMInput,
        stream: boolean
    ): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model: this.model,
            messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userMessage },
            ],
            max_tokens: input.maxTokens || AI_DEFAULTS.maxTokens,
            temperature: input.temperature ?? AI_DEFAULTS.temperature,
            stream,
        };

        if (input.jsonMode) {
            body.response_format = { type: 'json_object' };
        }

        if (stream) {
            // Request usage info in the final chunk
            body.stream_options = { include_usage: true };
        }

        return body;
    }

    private buildHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    private async fetchWithTimeout(
        url: string,
        init: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            AI_DEFAULTS.requestTimeoutMs
        );

        // Merge with external signal if provided
        const externalSignal = init.signal;
        if (externalSignal) {
            externalSignal.addEventListener('abort', () => controller.abort());
        }

        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                if (externalSignal?.aborted) {
                    throw new AIProviderError('Request cancelled', 'CANCELLED', 'groq');
                }
                throw new ProviderUnavailableError('groq',
                    new Error('Request timed out')
                );
            }
            throw new ProviderUnavailableError('groq',
                error instanceof Error ? error : new Error(String(error))
            );
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async handleErrorResponse(response: Response): Promise<void> {
        if (response.ok) return;

        const status = response.status;
        let errorBody = '';
        try {
            errorBody = await response.text();
        } catch {
            // ignore parse failures
        }

        if (status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
            throw new RateLimitError('groq', retryMs);
        }

        if (status >= 500) {
            throw new ProviderUnavailableError('groq',
                new Error(`HTTP ${status}: ${errorBody}`)
            );
        }

        throw new AIProviderError(
            `Groq API error: HTTP ${status}`,
            'API_ERROR',
            'groq',
            { statusCode: status, retryable: false }
        );
    }

    private normalizeUsage(raw: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }): TokenUsage {
        return {
            promptTokens: raw.prompt_tokens,
            completionTokens: raw.completion_tokens,
            totalTokens: raw.total_tokens,
        };
    }
}
