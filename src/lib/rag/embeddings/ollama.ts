
import { EmbedderInterface } from '../types';
import { PROVIDER_ENDPOINTS, AI_DEFAULTS } from '@/config/ai';

export class OllamaEmbedder implements EmbedderInterface {
    readonly dimension = 768; // nomic-embed-text
    private baseUrl: string;
    private model: string;

    constructor(baseUrl: string = 'http://localhost:11434', model: string = 'nomic-embed-text') {
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
            throw new Error(`Ollama Embedding Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        // Ollama doesn't support batch embeddings natively in one call usually, 
        // need to check API. Assuming serial for safety on low VRAM.
        const embeddings: number[][] = [];
        for (const text of texts) {
            embeddings.push(await this.embed(text));
        }
        return embeddings;
    }
}
