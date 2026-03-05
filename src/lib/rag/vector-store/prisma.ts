import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { VectorStoreInterface, RagDocument, DocumentChunk, SearchResult } from '../types';

export class PrismaVectorStore implements VectorStoreInterface {

    async saveDocument(doc: RagDocument): Promise<string> {
        const data = await prisma.learningSource.create({
            data: {
                user_id: doc.userId,
                title: doc.title,
                original_filename: doc.originalFilename,
                file_type: doc.fileType,
                metadata: doc.metadata as Prisma.JsonObject,
                status: doc.status || 'pending',
                source_type: 'document',
            }
        });

        return data.id;
    }

    async updateDocumentStatus(id: string, status: RagDocument['status'], errorMessage?: string): Promise<void> {
        const updateData: any = { status };
        if (errorMessage) {
            updateData.error_message = errorMessage;
        }

        await prisma.learningSource.update({
            where: { id },
            data: updateData
        });
    }

    async saveChunks(chunks: DocumentChunk[]): Promise<void> {
        if (chunks.length === 0) return;

        // Batch insert using createMany
        await prisma.sourceChunk.createMany({
            data: chunks.map(chunk => ({
                source_id: chunk.documentId,
                content: chunk.content,
                chunk_index: chunk.chunkIndex,
                metadata: chunk.metadata as Prisma.JsonObject,
                token_count: Math.ceil(chunk.content.length / 4) // approximation if not provided
            }))
        });

        // For embeddings, we must use raw SQL because Prisma doesn't support pgvector inserting via createMany easily
        // Wait, if chunks have embeddings, we should update them:
        const chunksWithEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0);
        if (chunksWithEmbeddings.length > 0) {
            // we need the IDs of the inserted chunks to update them, but createMany doesn't return IDs.
            // Since this method is supposed to save both chunks and embeddings simultaneously if provided,
            // we should probably insert them one by one or fetch them.
            // Actually, in the current RAG pipeline, chunks are inserted without embeddings first,
            // and then EmbeddingService updates them.
            // If they are provided here, we'll do raw inserts

            // Just for safety if it's called with embeddings
            for (const chunk of chunksWithEmbeddings) {
                const vectorString = `[${chunk.embedding!.join(',')}]`;
                await prisma.$executeRawUnsafe(
                    `UPDATE "source_chunks" SET embedding = $1::vector WHERE source_id = $2 AND chunk_index = $3`,
                    vectorString,
                    chunk.documentId,
                    chunk.chunkIndex
                );
            }
        }
    }

    async similaritySearch(queryEmbedding: number[], limit: number = 5, filterUserId?: string): Promise<SearchResult[]> {
        const matchThreshold = 0.5;
        const vectorString = `[${queryEmbedding.join(',')}]`;

        // We use Prisma.sql to safely construct the query
        const query = filterUserId
            ? Prisma.sql`
                SELECT id, source_id as "documentId", content, metadata, 
                1 - (embedding <=> ${vectorString}::vector) as similarity
                FROM source_chunks
                WHERE 1 - (embedding <=> ${vectorString}::vector) > ${matchThreshold}
                  AND source_id IN (SELECT id FROM learning_sources WHERE user_id = ${filterUserId})
                ORDER BY embedding <=> ${vectorString}::vector
                LIMIT ${limit}
            `
            : Prisma.sql`
                SELECT id, source_id as "documentId", content, metadata, 
                1 - (embedding <=> ${vectorString}::vector) as similarity
                FROM source_chunks
                WHERE 1 - (embedding <=> ${vectorString}::vector) > ${matchThreshold}
                ORDER BY embedding <=> ${vectorString}::vector
                LIMIT ${limit}
            `;

        const rows = await prisma.$queryRaw<any[]>(query);

        return rows.map(row => ({
            id: row.id,
            documentId: row.documentId,
            content: row.content,
            similarity: row.similarity,
            metadata: row.metadata
        }));
    }
}
