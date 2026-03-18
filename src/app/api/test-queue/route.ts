import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { processPendingSources } from '@/lib/queue/processor';

const prisma = new PrismaClient();

export const GET = async () => {
    try {
        console.log('Resetting all sources to pending...');
        await prisma.learningSource.updateMany({
            data: { status: 'pending' }
        });

        console.log('Triggering pending source processor directly...');
        // We pass undefined for userId to process all pending sources
        const results = await processPendingSources(undefined, { batchSize: 5 });

        return NextResponse.json({
            processed: results.length,
            results: results.map(r => ({
                sourceId: r.sourceId,
                success: r.success,
                chunksCreated: r.chunksCreated,
                error: r.error,
                time: r.processingTimeMs
            }))
        });
    } catch (err) {
        console.error('Queue processing failed:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
};
