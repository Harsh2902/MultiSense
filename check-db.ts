import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDb() {
    try {
        console.log('Checking Source Chunks...');
        const chunks = await prisma.$queryRaw<any[]>`
            SELECT id, token_count, content, 
                   CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
            FROM source_chunks 
            ORDER BY created_at DESC 
            LIMIT 2
        `;

        for (const c of chunks) {
            console.log(`- Chunk ${c.id} | Tokens: ${c.token_count}`);
            console.log(`  Content Preview: ${String(c.content).substring(0, 50)}...`);
            console.log(`  Has Embedding: ${c.has_embedding ? 'Yes' : 'No'}`);
            if (c.has_embedding) {
                console.log(`  Embedding defined: true`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
