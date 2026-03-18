import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEmbeddingInsert() {
    try {
        console.log('Testing raw vector insert on the chunk...');
        const chunks = await prisma.sourceChunk.findMany({ take: 1 });
        const chunk = chunks[0];
        if (!chunk) {
            console.log('No chunks found to test.');
            return;
        }
        console.log(`Found chunk: ${chunk.id}`);

        // Create a mock 768-dimensional vector (Gemini size)
        const mockEmbedding = Array(768).fill(0.01);
        const vectorString = `[${mockEmbedding.join(',')}]`;

        console.log('Running raw SQL update...');
        // Execute the exact same query as EmbeddingService.storeEmbedding
        await prisma.$executeRawUnsafe(
            `UPDATE "source_chunks" SET "embedding" = $1::vector WHERE "id" = $2`,
            vectorString,
            chunk.id
        );

        console.log('Raw SQL update succeeded!');

        // Verify it was saved
        const verify = await prisma.$queryRawUnsafe<{ id: string, has_embedding: boolean }[]>(
            `SELECT id, embedding IS NOT NULL as has_embedding FROM "source_chunks" WHERE id = $1`,
            chunk.id
        );

        console.log('Verification result:', verify);

    } catch (e) {
        console.error('\n!!! Prisma Error !!!\n', e);
    } finally {
        await prisma.$disconnect();
    }
}

testEmbeddingInsert();
