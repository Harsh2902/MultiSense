
import { OllamaEmbedder } from '../src/lib/rag/embeddings/ollama';
import { QwenLLM } from '../src/lib/rag/llm/qwen';
import { ChunkingStrategy } from '../src/lib/rag/processing/chunking';

async function testRagComponents() {
    console.log('--- Testing RAG Components ---\n');

    // 1. Test Qwen LLM
    try {
        console.log('1. Testing QwenLLM (qwen2.5:3b)...');
        const llm = new QwenLLM();
        const response = await llm.generate('What is the capital of France?');
        console.log('✅ LLM Response:', response.slice(0, 50) + '...');
    } catch (e: any) {
        console.error('❌ LLM Failed:', e.message);
    }

    // 2. Test Embedder
    try {
        console.log('\n2. Testing OllamaEmbedder (nomic-embed-text)...');
        const embedder = new OllamaEmbedder();
        const vector = await embedder.embed('Test sentence');
        console.log(`✅ Embedding Generated. Dim: ${vector.length}`);
    } catch (e: any) {
        console.error('❌ Embedder Failed:', e.message);
    }

    // 3. Test Chunking
    try {
        console.log('\n3. Testing ChunkingStrategy...');
        const strategy = new ChunkingStrategy({ chunkSize: 20, chunkOverlap: 5 });
        const text = "This is a long sentence that should be split into multiple chunks for testing purposes.";
        const chunks = strategy.createChunks('test-doc', text);
        console.log(`✅ Chunks created: ${chunks.length}`);
        chunks.forEach(c => console.log(`   [${c.chunkIndex}] "${c.content}"`));
    } catch (e: any) {
        console.error('❌ Chunking Failed:', e.message);
    }
}

testRagComponents();
