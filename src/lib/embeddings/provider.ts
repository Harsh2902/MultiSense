// =============================================================================
// OpenAI Embedding Provider - Abstraction for OpenAI embeddings
// =============================================================================

import type { EmbeddingProvider } from '@/types/rag';
import { RAG_CONFIG } from '@/types/rag';

// =============================================================================
// Configuration
// =============================================================================

interface OpenAIEmbeddingConfig {
    apiKey: string;
    model?: string;
    baseUrl?: string;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * OpenAI embedding provider
 * Uses text-embedding-3-small (1536 dimensions)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    readonly dimension = RAG_CONFIG.EMBEDDING_DIMENSION;
    readonly name = 'openai';

    constructor(config: OpenAIEmbeddingConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || DEFAULT_MODEL;
        this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    }

    /**
     * Generate embedding for single text
     */
    async embed(text: string): Promise<number[]> {
        const embeddings = await this.batchEmbed([text]);
        const result = embeddings[0];
        if (!result) {
            throw new Error('No embedding returned');
        }
        return result;
    }

    /**
     * Generate embeddings for multiple texts (batch)
     */
    async batchEmbed(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                input: texts,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as OpenAIEmbeddingResponse;

        // Sort by index to ensure correct order
        const sorted = data.data.sort((a, b) => a.index - b.index);
        return sorted.map(item => item.embedding);
    }
}

// =============================================================================
// Response Types
// =============================================================================

interface OpenAIEmbeddingResponse {
    object: string;
    data: Array<{
        object: string;
        index: number;
        embedding: number[];
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

// =============================================================================
// Factory Function
// =============================================================================

// =============================================================================
// Ollama Embedding Provider
// =============================================================================

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    private baseUrl: string;
    private model: string;

    readonly dimension = RAG_CONFIG.EMBEDDING_DIMENSION;
    readonly name = 'ollama';

    constructor(baseUrl: string = 'http://localhost:11434', model: string = 'nomic-embed-text') {
        // Strip trailing /v1 since Ollama's native API is at the root, not /v1
        this.baseUrl = baseUrl.replace(/\/v1\/?$/, '');
        this.model = model;
    }

    async embed(text: string): Promise<number[]> {
        const embedding = await this.requestEmbedding(text);

        if (embedding.length !== this.dimension) {
            throw new Error(
                `Ollama model "${this.model}" returned ${embedding.length}-dim embeddings, but database expects ${this.dimension}. ` +
                `Set OLLAMA_EMBEDDING_MODEL to a ${this.dimension}-dim model (recommended: nomic-embed-text).`
            );
        }

        return embedding;
    }

    async batchEmbed(texts: string[]): Promise<number[][]> {
        // Ollama typically embeds one input per request.
        return Promise.all(texts.map(t => this.embed(t)));
    }

    private async requestEmbedding(text: string): Promise<number[]> {
        // Try legacy endpoint first (widely supported), then modern /api/embed fallback.
        const legacy = await this.postEmbedding(`${this.baseUrl}/api/embeddings`, {
            model: this.model,
            prompt: text,
        });
        if (legacy.ok && legacy.embedding) {
            return legacy.embedding;
        }

        const modern = await this.postEmbedding(`${this.baseUrl}/api/embed`, {
            model: this.model,
            input: text,
        });
        if (modern.ok && modern.embedding) {
            return modern.embedding;
        }

        const errors: string[] = [];
        if (!legacy.ok) errors.push(legacy.error);
        if (!modern.ok) errors.push(modern.error);
        const reason = errors.join(' | ') || 'Unknown error';
        throw new Error(
            `Ollama embedding failed for model "${this.model}". ${reason}. ` +
            `If model is missing, run: ollama pull nomic-embed-text`
        );
    }

    private async postEmbedding(
        url: string,
        body: Record<string, string>
    ): Promise<{ ok: true; embedding: number[] } | { ok: false; error: string }> {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = (await response.text()).trim();
            return {
                ok: false,
                error: `${response.status} ${response.statusText}${errorBody ? `: ${errorBody}` : ''}`,
            };
        }

        const data = await response.json() as {
            embedding?: number[];
            embeddings?: number[][];
        };
        const embedding = Array.isArray(data.embedding)
            ? data.embedding
            : (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0]) ? data.embeddings[0] : null);

        if (!embedding) {
            return { ok: false, error: 'No embedding vector returned by Ollama' };
        }

        return { ok: true, embedding };
    }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create embedding provider from environment
 */
export function createEmbeddingProvider(): EmbeddingProvider {
    // Check config first
    const { aiConfig } = require('@/config/env');

    // Prefer Gemini if available
    const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log(`[EmbeddingProvider] Process env has GOOGLE_GENERATIVE_AI_API_KEY: ${!!geminiKey}`);

    if (geminiKey) {
        console.log('[EmbeddingProvider] Using GeminiEmbeddingProvider');
        const { GeminiEmbeddingProvider } = require('./gemini');
        return new GeminiEmbeddingProvider({ apiKey: geminiKey });
    }

    if (aiConfig.provider === 'ollama') {
        console.log('[EmbeddingProvider] Using OllamaEmbeddingProvider (warning: cloud deployment)');
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const configuredModel = process.env.OLLAMA_EMBEDDING_MODEL || aiConfig.embeddingModel || '';
        const ollamaEmbeddingModel = /^text-embedding-/i.test(configuredModel)
            ? 'nomic-embed-text'
            : configuredModel || 'nomic-embed-text';
        return new OllamaEmbeddingProvider(
            ollamaBaseUrl,
            ollamaEmbeddingModel
        );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.warn('[EmbeddingProvider] No API keys found, falling back to Ollama');
        return new OllamaEmbeddingProvider();
    }

    console.log('[EmbeddingProvider] Using OpenAIEmbeddingProvider');
    return new OpenAIEmbeddingProvider({ apiKey });
}

// =============================================================================
// Export
// =============================================================================

// OpenAIEmbeddingProvider is exported via class declaration
