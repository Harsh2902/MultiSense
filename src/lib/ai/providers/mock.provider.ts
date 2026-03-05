// =============================================================================
// Mock AI Providers - For testing without real API calls
// =============================================================================

import type {
    LLMProvider,
    LLMInput,
    LLMOutput,
    LLMChunk,
    EmbeddingProvider,
} from '@/types/ai.types';

// =============================================================================
// Mock LLM Provider
// =============================================================================

/**
 * Mock LLM provider for unit tests.
 * Returns configurable responses without making API calls.
 */
export class MockLLMProvider implements LLMProvider {
    readonly name = 'mock';

    private responses: string[];
    private callIndex = 0;
    private _calls: LLMInput[] = [];

    /**
     * @param responses Array of responses to return in sequence.
     *                  Cycles through if more calls than responses.
     */
    constructor(responses: string[] = ['{"result": "mock response"}']) {
        this.responses = responses;
    }

    async generate(input: LLMInput): Promise<LLMOutput> {
        this._calls.push(input);
        const response = this.responses[this.callIndex % this.responses.length]!;
        this.callIndex++;

        return {
            content: response,
            model: 'mock-model',
            usage: {
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
            },
            finishReason: 'stop',
        };
    }

    async *stream(input: LLMInput): AsyncIterable<LLMChunk> {
        this._calls.push(input);
        const response = this.responses[this.callIndex % this.responses.length]!;
        this.callIndex++;

        // Split response into word-level chunks
        const words = response.split(' ');
        for (let i = 0; i < words.length; i++) {
            const isLast = i === words.length - 1;
            yield {
                content: words[i] + (isLast ? '' : ' '),
                done: isLast,
                usage: isLast ? {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                } : undefined,
            };
        }
    }

    /** Get all calls made to this provider */
    get calls(): LLMInput[] {
        return this._calls;
    }

    /** Get the number of calls made */
    get callCount(): number {
        return this._calls.length;
    }

    /** Reset call history */
    reset(): void {
        this._calls = [];
        this.callIndex = 0;
    }
}

// =============================================================================
// Mock Embedding Provider
// =============================================================================

/**
 * Mock embedding provider for unit tests.
 * Returns deterministic vectors based on text hash.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
    readonly name = 'mock';
    readonly dimension: number;

    private _calls: string[][] = [];

    constructor(dimension = 1536) {
        this.dimension = dimension;
    }

    async embed(text: string): Promise<number[]> {
        this._calls.push([text]);
        return this.deterministicVector(text);
    }

    async batchEmbed(texts: string[]): Promise<number[][]> {
        this._calls.push(texts);
        return texts.map(text => this.deterministicVector(text));
    }

    /**
     * Generate a deterministic vector from text.
     * Same text always produces same vector (useful for test assertions).
     */
    private deterministicVector(text: string): number[] {
        const vector: number[] = [];
        let hash = 0;

        // Simple hash function
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
        }

        // Generate vector from hash seed
        for (let i = 0; i < this.dimension; i++) {
            hash = ((hash * 1103515245 + 12345) & 0x7fffffff);
            vector.push((hash / 0x7fffffff) * 2 - 1); // Normalize to [-1, 1]
        }

        return vector;
    }

    /** Get all calls made to this provider */
    get calls(): string[][] {
        return this._calls;
    }

    /** Reset call history */
    reset(): void {
        this._calls = [];
    }
}
