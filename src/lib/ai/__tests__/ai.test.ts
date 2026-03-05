// =============================================================================
// AI Provider Tests - Example tests using mock providers
// =============================================================================

import { MockLLMProvider, MockEmbeddingProvider } from '../providers/mock.provider';
import { estimateTokens, parseLlmJson, checkTokenBudget } from '../tokens';
import { TokenLimitError } from '@/types/ai.types';

// =============================================================================
// Test: Mock LLM Provider
// =============================================================================

describe('MockLLMProvider', () => {
    it('should return configured response', async () => {
        const mockQuiz = JSON.stringify([
            {
                question: 'What is photosynthesis?',
                options: ['A', 'B', 'C', 'D'],
                correct_option_index: 0,
                explanation: 'Test explanation',
            },
        ]);
        const provider = new MockLLMProvider([mockQuiz]);

        const result = await provider.generate({
            systemPrompt: 'You are a quiz generator.',
            userMessage: 'Generate a quiz about biology.',
            jsonMode: true,
        });

        expect(result.content).toBe(mockQuiz);
        expect(result.finishReason).toBe('stop');
        expect(result.usage.totalTokens).toBeGreaterThan(0);
        expect(provider.callCount).toBe(1);
        expect(provider.calls[0]?.systemPrompt).toContain('quiz generator');
    });

    it('should cycle through multiple responses', async () => {
        const provider = new MockLLMProvider(['first', 'second']);

        const r1 = await provider.generate({ systemPrompt: '', userMessage: 'a' });
        const r2 = await provider.generate({ systemPrompt: '', userMessage: 'b' });
        const r3 = await provider.generate({ systemPrompt: '', userMessage: 'c' });

        expect(r1.content).toBe('first');
        expect(r2.content).toBe('second');
        expect(r3.content).toBe('first'); // cycles
    });

    it('should stream response word by word', async () => {
        const provider = new MockLLMProvider(['hello world test']);
        const chunks: string[] = [];

        for await (const chunk of provider.stream({ systemPrompt: '', userMessage: '' })) {
            chunks.push(chunk.content);
        }

        expect(chunks.join('')).toBe('hello world test');
    });
});

// =============================================================================
// Test: Mock Embedding Provider
// =============================================================================

describe('MockEmbeddingProvider', () => {
    it('should return vectors of correct dimension', async () => {
        const provider = new MockEmbeddingProvider(1536);
        const vector = await provider.embed('test text');

        expect(vector).toHaveLength(1536);
        expect(vector.every(v => v >= -1 && v <= 1)).toBe(true);
    });

    it('should return deterministic vectors', async () => {
        const provider = new MockEmbeddingProvider();
        const v1 = await provider.embed('same text');
        const v2 = await provider.embed('same text');

        expect(v1).toEqual(v2);
    });

    it('should batch embed multiple texts', async () => {
        const provider = new MockEmbeddingProvider(384);
        const results = await provider.batchEmbed(['text1', 'text2', 'text3']);

        expect(results).toHaveLength(3);
        expect(results[0]).toHaveLength(384);
    });
});

// =============================================================================
// Test: Token Utilities
// =============================================================================

describe('Token Utilities', () => {
    it('should estimate tokens for text', () => {
        const tokens = estimateTokens('This is a test sentence with several words.');
        expect(tokens).toBeGreaterThan(0);
        expect(tokens).toBeLessThan(50);
    });

    it('should return 0 for empty text', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('should check token budget and return max output tokens', () => {
        const maxOutput = checkTokenBudget('quiz', 1000, 'groq');
        expect(maxOutput).toBe(2048);
    });

    it('should throw TokenLimitError when input exceeds budget', () => {
        expect(() => checkTokenBudget('quiz', 99999, 'groq')).toThrow(TokenLimitError);
    });
});

// =============================================================================
// Test: JSON Parsing
// =============================================================================

describe('parseLlmJson', () => {
    it('should parse clean JSON', () => {
        const result = parseLlmJson<{ key: string }>('{"key": "value"}');
        expect(result.key).toBe('value');
    });

    it('should strip markdown code fences', () => {
        const result = parseLlmJson<{ key: string }>('```json\n{"key": "value"}\n```');
        expect(result.key).toBe('value');
    });

    it('should strip generic code fences', () => {
        const result = parseLlmJson<{ key: string }>('```\n{"key": "value"}\n```');
        expect(result.key).toBe('value');
    });
});
