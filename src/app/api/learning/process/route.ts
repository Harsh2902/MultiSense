// =============================================================================
// Processing Trigger API - Trigger processing after upload
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { processPendingSources } from '@/lib/queue/processor';
import { setRequestUserId } from '@/lib/request-context';

// =============================================================================
// POST /api/learning/process - Trigger processing for pending sources
// =============================================================================

export const POST = withApiHandler(async (_request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.user.id);

    console.log(`[API] Triggering processing for user ${auth.user.id}`);
    try {
        const fs = await import('fs');
        const path = await import('path');
        const logFile = path.join(process.cwd(), 'youtube-debug.log');
        fs.appendFileSync(logFile, `[API] ${new Date().toISOString()}: Triggering processPendingSources for ${auth.user.id}\n`);
    } catch { }

    const results = await processPendingSources(
        auth.supabase,
        auth.user.id,
        { batchSize: 3 }
    );

    return NextResponse.json({
        processed: results.length,
        results: results.map(r => ({
            sourceId: r.sourceId,
            success: r.success,
            chunksCreated: r.chunksCreated,
            error: r.error,
            processingTimeMs: r.processingTimeMs,
        })),
    });
}, { timeoutMs: 300_000 });
