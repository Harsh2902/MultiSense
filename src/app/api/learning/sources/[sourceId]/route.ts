// =============================================================================
// Single Learning Source API Routes - GET, DELETE, retry
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf } from '@/lib/api';
import { LearningService } from '@/services/learning.service';
import { getProcessingQueue } from '@/lib/queue';
import { getSourceParamsSchema } from '@/lib/validations/learning';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { LearningSourceRow, ProcessingStatusResponse } from '@/types/learning';

// =============================================================================
// Types
// =============================================================================

interface RouteContext {
    params: Promise<{ sourceId: string }>;
}

// =============================================================================
// GET /api/learning/sources/[sourceId] - Get source with status
// =============================================================================

export async function GET(
    _request: NextRequest,
    context: RouteContext
): Promise<NextResponse> {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getSourceParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid source ID');
    }

    const learningService = new LearningService(auth.userId);
    const source = await learningService.getSource(paramsResult.data.sourceId);

    if (!source || source.user_id !== auth.userId) {
        throw new NotFoundError('Source', paramsResult.data.sourceId);
    }

    // Get chunk count if completed
    let chunksProcessed: number | undefined;
    if (source.status === 'completed') {
        const chunks = await learningService.getChunks(source.id);
        chunksProcessed = chunks.length;
    }

    return NextResponse.json<ProcessingStatusResponse>({
        source,
        chunks_processed: chunksProcessed,
    });
}

// =============================================================================
// DELETE /api/learning/sources/[sourceId] - Delete source
// =============================================================================

export async function DELETE(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getSourceParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid source ID');
    }

    const learningService = new LearningService(auth.userId);
    const source = await learningService.getSource(paramsResult.data.sourceId);

    if (!source || source.user_id !== auth.userId) {
        throw new NotFoundError('Source', paramsResult.data.sourceId);
    }

    if (source.status === 'processing') {
        throw new ConflictError('Cannot delete source while processing');
    }

    await learningService.deleteSource(paramsResult.data.sourceId);

    return new NextResponse(null, { status: 204 });
}

// =============================================================================
// POST /api/learning/sources/[sourceId]/retry - Retry failed processing
// =============================================================================

export async function POST(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getSourceParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid source ID');
    }

    const learningService = new LearningService(auth.userId);
    const source = await learningService.getSource(paramsResult.data.sourceId);

    if (!source || source.user_id !== auth.userId) {
        throw new NotFoundError('Source', paramsResult.data.sourceId);
    }

    if (source.status !== 'failed') {
        throw new ConflictError('Only failed sources can be retried');
    }

    // Reset status to pending
    await learningService.updateSourceStatus(
        paramsResult.data.sourceId,
        'pending',
        { retry_count: (source.metadata?.retry_count ?? 0) + 1 }
    );

    // Re-queue for processing
    await getProcessingQueue().add(
        source.id,
        auth.userId,
        source.conversation_id
    );

    const updated = await learningService.getSource(paramsResult.data.sourceId);

    return NextResponse.json<LearningSourceRow>(updated!);
}
