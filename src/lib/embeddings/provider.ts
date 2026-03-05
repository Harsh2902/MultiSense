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

    readonly dimension = RAG_CONFIG.EMBEDDING_DIMENSION; // 1536 (might be wrong for Ollama models)
    // TODO: Make dimension dynamic based on model
    readonly name = 'ollama';

    constructor(baseUrl: string = 'http://localhost:11434', model: string = 'all-minilm') {
        this.baseUrl = baseUrl;
        this.model = model;
    }

    async embed(text: string): Promise<number[]> {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: text,
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama embedding failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    }

    async batchEmbed(texts: string[]): Promise<number[][]> {
        // Ollama doesn't support batch embeddings in /api/embeddings natively yet (one by one usually)
        // Check if /v1/embeddings supports it (OpenAI compatible)
        // For now, we'll just map over them concurrently
        return Promise.all(texts.map(t => this.embed(t)));
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

    if (aiConfig.provider === 'ollama') {
        return new OllamaEmbeddingProvider(
            process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            aiConfig.embeddingModel || 'all-minilm'
        );
    }

    // Prefer Gemini if available (free tier)
    const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey) {
        const { GeminiEmbeddingProvider } = require('./gemini');
        return new GeminiEmbeddingProvider({ apiKey: geminiKey });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        // Fallback to Ollama if no keys are present
        console.warn('No API keys found, falling back to Ollama');
        return new OllamaEmbeddingProvider();
    }

    return new OpenAIEmbeddingProvider({ apiKey });
}

// =============================================================================
// Export
// =============================================================================

// OpenAIEmbeddingProvider is exported via class declaration
