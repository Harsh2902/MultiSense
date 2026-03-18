// =============================================================================
// Ollama LLM Provider - Implements LLMProvider interface
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
    ProviderUnavailableError,
    ProviderResponseError,
} from '@/types/ai.types';
import { PROVIDER_ENDPOINTS, AI_DEFAULTS } from '@/config/ai';
import { LLM_MODELS } from '@/config/models';

// =============================================================================
// Types (internal)
// =============================================================================

interface OllamaChatResponse {
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

interface OllamaStreamChunk {
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

export class OllamaLLMProvider implements LLMProvider {
    readonly name = 'ollama';

    private baseUrl: string;
    private model: string;

    constructor(config?: { baseUrl?: string; model?: string }) {
        this.baseUrl = config?.baseUrl || PROVIDER_ENDPOINTS.ollama.baseUrl;
        // Default to gemma3:4b if not specified, taking from models config or fallback
        this.model = config?.model || LLM_MODELS.ollama.default || 'gemma3:4b';
    }

    // ===========================================================================
    // Generate (non-streaming)
    // ===========================================================================

    async generate(input: LLMInput): Promise<LLMOutput> {
        let lastError: unknown;
        const retries = Math.max(0, AI_DEFAULTS.maxRetries);

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const body = this.buildRequestBody(input, false);

                const response = await this.fetchWithTimeout(
                    `${this.baseUrl}/v1/chat/completions`,
                    {
                        method: 'POST',
                        headers: this.buildHeaders(),
                        body: JSON.stringify(body),
                        signal: input.signal,
                    }
                );

                await this.handleErrorResponse(response);

                const data = (await response.json()) as OllamaChatResponse;
                const choice = data.choices?.[0];

                if (!choice) {
                    throw new ProviderResponseError('ollama', 'No choices in response');
                }

                return {
                    content: choice.message.content,
                    model: data.model,
                    usage: this.normalizeUsage(data.usage),
                    finishReason: choice.finish_reason,
                };
            } catch (error) {
                lastError = error;
                if (!this.shouldRetry(error) || attempt >= retries) {
                    throw error;
                }

                const backoffMs = AI_DEFAULTS.retryBaseDelayMs * (attempt + 1);
                await this.delay(backoffMs);
            }
        }

        throw (lastError instanceof Error
            ? lastError
            : new ProviderUnavailableError('ollama', new Error('Unknown retry failure')));
    }

    // ===========================================================================
    // Stream
    // ===========================================================================

    async *stream(input: LLMInput): AsyncIterable<LLMChunk> {
        const body = this.buildRequestBody(input, true);

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/v1/chat/completions`,
            {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: input.signal,
            }
        );

        await this.handleErrorResponse(response);

        if (!response.body) {
            throw new ProviderResponseError('ollama', 'No response body for stream');
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
                        const chunk = JSON.parse(data) as OllamaStreamChunk;
                        const choice = chunk.choices?.[0];
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
            // Ollama might ignore max_tokens or use num_predict
            max_tokens: input.maxTokens || AI_DEFAULTS.maxTokens,
            temperature: input.temperature ?? AI_DEFAULTS.temperature,
            stream,
        };

        if (input.jsonMode) {
            body.format = 'json'; // Ollama uses 'format': 'json'
        }

        if (stream) {
            // Request usage info in the final chunk (if supported by Ollama/OpenAI compat)
            body.stream_options = { include_usage: true };
        }

        return body;
    }

    private buildHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            // Ollama doesn't typically require auth, but we can add a dummy one if behind proxy
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
                    throw new AIProviderError('Request cancelled', 'CANCELLED', 'ollama');
                }
                throw new ProviderUnavailableError('ollama',
                    new Error('Request timed out')
                );
            }
            throw new ProviderUnavailableError('ollama',
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

        if (status >= 500) {
            throw new ProviderUnavailableError('ollama',
                new Error(`HTTP ${status}: ${errorBody}`)
            );
        }

        throw new AIProviderError(
            `Ollama API error: HTTP ${status}`,
            'API_ERROR',
            'ollama',
            { statusCode: status, retryable: false }
        );
    }

    private shouldRetry(error: unknown): boolean {
        if (error instanceof AIProviderError) {
            if (error.code === 'CANCELLED') {
                return false;
            }
            return error.retryable || error.code === 'PROVIDER_UNAVAILABLE';
        }
        return false;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private normalizeUsage(raw: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    } | undefined): TokenUsage {
        if (!raw) {
            return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        }
        return {
            promptTokens: raw.prompt_tokens,
            completionTokens: raw.completion_tokens,
            totalTokens: raw.total_tokens,
        };
    }
}
