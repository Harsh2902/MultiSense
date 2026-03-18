import { PrismaClient } from '@prisma/client';
import { processPendingSources } from './src/lib/queue/processor';

const prisma = new PrismaClient();

async function reprocess() {
    try {
        console.log('Resetting all sources to pending...');
        await prisma.learningSource.updateMany({
            data: { status: 'pending' }
        });

        console.log('Triggering pending source processor directly...');
        // We pass undefined for userId to process all pending sources
        const results = await processPendingSources(undefined, { batchSize: 5 });

        console.log(`Processed ${results.length} sources.`);
        for (const res of results) {
            console.log(`- Source ${res.sourceId}: Success=${res.success}, Chunks=${res.chunksCreated}, Error=${res.error}, Time=${res.processingTimeMs}ms`);
        }
    } catch (err) {
        console.error('Queue processing failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

reprocess();
