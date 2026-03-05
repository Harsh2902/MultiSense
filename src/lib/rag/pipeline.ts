
import { RagDocument, LoaderInterface, DocumentChunk } from './types';
import { ChunkingStrategy } from './processing/chunking';
import { OllamaEmbedder } from './embeddings/ollama';
import { SupabaseVectorStore } from './vector-store/supabase';
import { PDFLoader } from './ingestion/pdf-loader';
import { TextLoader } from './ingestion/text-loader';

export class RagPipeline {
    private chunker: ChunkingStrategy;
    private embedder: OllamaEmbedder;
    private store: SupabaseVectorStore;

    constructor() {
        this.chunker = new ChunkingStrategy();
        this.embedder = new OllamaEmbedder();
        this.store = new SupabaseVectorStore();
    }

    async processDocument(doc: RagDocument): Promise<void> {
        try {
            await this.store.updateDocumentStatus(doc.id!, 'processing');

            // 1. Select Loader
            let loader: LoaderInterface;
            if (doc.mimeType === 'application/pdf') {
                loader = new PDFLoader();
            } else if (doc.mimeType.startsWith('text/')) {
                loader = new TextLoader();
            } else {
                throw new Error(`Unsupported mime type: ${doc.mimeType}`);
            }

            // 2. Load & Extract Text
            // Note: doc.filePath is assumed to be a local path here.
            // If it's in Supabase Storage, we need a step to download it to a temp path.
            // For now, assuming caller handles download or it's local.
            const { text, metadata } = await loader.load(doc.filePath, doc.mimeType);

            // 3. Chunk
            const chunks = this.chunker.createChunks(doc.id!, text, { ...doc.metadata, ...metadata });

            // 4. Embed & Save (Batching to save VRAM/Network)
            // Process in small batches (e.g., 5 at a time)
            const BATCH_SIZE = 5;
            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batch = chunks.slice(i, i + BATCH_SIZE);

                // Embed
                const embeddings = await this.embedder.embedBatch(batch.map(c => c.content));

                // Assign embeddings
                batch.forEach((chunk, idx) => {
                    chunk.embedding = embeddings[idx];
                });

                // Save
                await this.store.saveChunks(batch);
            }

            await this.store.updateDocumentStatus(doc.id!, 'completed');

        } catch (error: any) {
            console.error('Pipeline Error:', error);
            await this.store.updateDocumentStatus(doc.id!, 'failed', error.message);
            throw error;
        }
    }
}
