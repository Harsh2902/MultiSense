import { PrismaClient } from '@prisma/client';
import { GeminiEmbeddingProvider } from './src/lib/embeddings/gemini';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function runEmbeddings() {
    try {
        console.log('Fetching chunks with no embeddings...');
        const chunks = await prisma.sourceChunk.findMany({
            where: {
                content: { not: '' }
            },
            take: 5
        });

        if (chunks.length === 0) {
            console.log('No chunks found to embed.');
            return;
        }

        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');

        console.log('Initializing Gemini provider...');
        const provider = new GeminiEmbeddingProvider({ apiKey });

        for (const chunk of chunks) {
            console.log(`Embedding chunk ${chunk.id}...`);
            const embedding = await provider.embed(chunk.content);
            console.log(`Generated ${embedding.length} dimensions. Storing...`);

            const vectorString = `[${embedding.join(',')}]`;
            await prisma.$executeRawUnsafe(
                `UPDATE "source_chunks" SET embedding = $1::vector WHERE id = $2`,
                vectorString,
                chunk.id
            );
            console.log(`Stored chunk ${chunk.id} successfully!`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

runEmbeddings();
