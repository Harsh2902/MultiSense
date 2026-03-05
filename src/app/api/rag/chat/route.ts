
import { NextRequest, NextResponse } from 'next/server';
import { OllamaEmbedder } from '@/lib/rag/embeddings/ollama';
import { SupabaseVectorStore } from '@/lib/rag/vector-store/supabase';
import { QwenLLM } from '@/lib/rag/llm/qwen';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const { message, history } = await req.json();
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Embed Query
        const embedder = new OllamaEmbedder();
        const queryEmbedding = await embedder.embed(message);

        // 2. Retrieve Context
        const store = new SupabaseVectorStore();
        // Limit to top 5 chunks
        const results = await store.similaritySearch(queryEmbedding, 5, user.id);

        if (results.length === 0) {
            return NextResponse.json({
                response: "I couldn't find any relevant documents in your library to answer this question."
            });
        }

        // 3. Construct Prompt
        const contextText = results.map(r => `[Source: ${r.metadata.source || 'Unknown'}]\n${r.content}`).join('\n\n');

        const systemPrompt = `You are a helpful AI assistant. Answer the user's question based ONLY on the provided context below.
If the answer is not in the context, say you don't know.

Context:
${contextText}`;

        // 4. Generate Response
        const llm = new QwenLLM();
        // Streaming response is better for UX, but for MVP standard generate is okay.
        // Let's use generate for simplicity first, or stream if UI supports it.
        // For now, simple JSON response to match existing basic verification.
        const response = await llm.generate(message, systemPrompt);

        return NextResponse.json({
            response,
            sources: results.map(r => ({ id: r.documentId, similarity: r.similarity }))
        });

    } catch (error: any) {
        console.error('RAG Chat Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
