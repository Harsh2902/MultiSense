
import { createClient } from '@/lib/supabase/server';
import { VectorStoreInterface, RagDocument, DocumentChunk, SearchResult } from '../types';

export class SupabaseVectorStore implements VectorStoreInterface {

    async saveDocument(doc: RagDocument): Promise<string> {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('documents')
            .insert({
                user_id: doc.userId,
                title: doc.title,
                original_filename: doc.originalFilename,
                file_path: doc.filePath,
                file_type: doc.fileType,
                mime_type: doc.mimeType,
                metadata: doc.metadata,
                status: doc.status || 'pending',
            })
            .select('id')
            .single();

        if (error) throw new Error(`Failed to save document: ${error.message}`);
        return data.id;
    }

    async updateDocumentStatus(id: string, status: RagDocument['status'], errorMessage?: string): Promise<void> {
        const supabase = await createClient();

        const updateData: any = { status, updated_at: new Date().toISOString() };
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }

        const { error } = await supabase
            .from('documents')
            .update(updateData)
            .eq('id', id);

        if (error) throw new Error(`Failed to update document status: ${error.message}`);
    }

    async saveChunks(chunks: DocumentChunk[]): Promise<void> {
        if (chunks.length === 0) return;
        const supabase = await createClient();

        // Batch insert
        const { error } = await supabase
            .from('document_chunks')
            .insert(chunks.map(chunk => ({
                document_id: chunk.documentId,
                content: chunk.content,
                chunk_index: chunk.chunkIndex,
                embedding: chunk.embedding, // Vector type needs string or array, supabase-js handles array usually?
                // Note: pgvector in supabase-js often expects a string "[1,2,3]" or array depending on version.
                // Assuming array works or we coerce.
                metadata: chunk.metadata
            })));

        if (error) throw new Error(`Failed to save chunks: ${error.message}`);
    }

    async similaritySearch(queryEmbedding: number[], limit: number = 5, filterUserId?: string): Promise<SearchResult[]> {
        const supabase = await createClient();

        const rpcParams: any = {
            query_embedding: queryEmbedding,
            match_threshold: 0.5, // TODO: Make configurable
            match_count: limit,
        };

        // If we need to filter by user, the RPC function must support it
        if (filterUserId) {
            rpcParams.filter_user_id = filterUserId;
        }

        const { data, error } = await supabase.rpc('match_document_chunks', rpcParams);

        if (error) throw new Error(`Vector search failed: ${error.message}`);

        return (data as any[]).map(row => ({
            id: row.id,
            documentId: row.document_id,
            content: row.content,
            similarity: row.similarity,
            metadata: row.metadata
        }));
    }
}
