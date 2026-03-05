
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EmbeddingProvider } from '@/types/rag';

interface GeminiEmbeddingConfig {
    apiKey: string;
    model?: string;
}

const DEFAULT_MODEL = 'models/gemini-embedding-001';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
    private client: GoogleGenerativeAI;
    private model: string;

    // Gemini embeddings are 768 dimensions
    readonly dimension = 768;
    readonly name = 'gemini';

    constructor(config: GeminiEmbeddingConfig) {
        this.client = new GoogleGenerativeAI(config.apiKey);
        this.model = config.model || DEFAULT_MODEL;
    }

    async embed(text: string): Promise<number[]> {
        const model = this.client.getGenerativeModel({ model: this.model });
        const result = await model.embedContent(text);
        const embedding = result.embedding;
        return embedding.values;
    }

    async batchEmbed(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        // Gemini doesn't support batch embedding in the same way as OpenAI's single endpoint
        // We have to iterate, but we can do it concurrently
        // Rate limits might be an issue, so we should be careful

        const promises = texts.map(text => this.embed(text));
        return Promise.all(promises);
    }
}
