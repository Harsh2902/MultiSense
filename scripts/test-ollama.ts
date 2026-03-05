
import { OllamaLLMProvider } from '../src/lib/ai/providers/ollama.provider';
import { OllamaEmbeddingProvider } from '../src/lib/embeddings/provider';

async function test() {
    console.log('Testing Ollama Integration...');

    // Test LLM
    try {
        console.log('\n--- Testing LLM (gemma3:4b) ---');
        const llm = new OllamaLLMProvider({ model: 'gemma3:4b' });
        const response = await llm.generate({
            systemPrompt: 'You are a helpful assistant.',
            userMessage: 'Say "Hello, Ollama is working!"',
        });
        console.log('LLM Response:', response.content);
    } catch (e: any) {
        console.error('LLM Test Failed:', e.message);
    }

    // Test Embeddings
    try {
        console.log('\n--- Testing Embeddings (all-minilm) ---');
        // Note: Check if 'all-minilm' is pulled only if default fails, but we assume user has it or we use gemma3?
        // Actually, Ollama embeddings endpoint usually requires an embedding model.
        // gemma3 can technically do embeddings but it's not ideal.
        const embeddingProvider = new OllamaEmbeddingProvider();
        const embedding = await embeddingProvider.embed('This is a test sentence.');
        console.log('Embedding Generated. Length:', embedding.length);
        console.log('First 5 values:', embedding.slice(0, 5));
    } catch (e: any) {
        console.error('Embedding Test Failed:', e.message);
        console.log('Tip: Ensure "all-minilm" model is pulled: "ollama pull all-minilm"');
    }
}

test();
