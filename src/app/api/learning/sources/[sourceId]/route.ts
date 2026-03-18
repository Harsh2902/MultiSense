// =============================================================================
// Single Learning Source API Routes - GET, DELETE, retry
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, withApiHandler } from '@/lib/api';
import { LearningService } from '@/services/learning.service';
import { getProcessingQueue } from '@/lib/queue';
import { getSourceParamsSchema, linkSourceConversationSchema } from '@/lib/validations/learning';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { LearningSourceRow, ProcessingStatusResponse } from '@/types/learning';
import { prisma } from '@/lib/prisma';

// =============================================================================
// Types
// =============================================================================

interface RouteContext {
    params: Promise<{ sourceId: string }>;
}

// =============================================================================
// GET /api/learning/sources/[sourceId] - Get source with status
// =============================================================================

export const GET = withApiHandler(async (
    _request: NextRequest,
    context: RouteContext
): Promise<NextResponse> => {
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
});

// =============================================================================
// DELETE /api/learning/sources/[sourceId] - Delete source
// =============================================================================

export const DELETE = withApiHandler(async (
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> => {
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
});

// =============================================================================
// POST /api/learning/sources/[sourceId]/retry - Retry failed processing
// =============================================================================

export const POST = withApiHandler(async (
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> => {
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
});

// =============================================================================
// PATCH /api/learning/sources/[sourceId] - Link source to conversation
// =============================================================================

export const PATCH = withApiHandler(async (
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> => {
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

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ValidationError('Invalid JSON');
    }

    const bodyResult = linkSourceConversationSchema.safeParse(body);
    if (!bodyResult.success) {
        throw new ValidationError('Validation failed', bodyResult.error.flatten());
    }

    const learningService = new LearningService(auth.userId);
    const source = await learningService.getSource(paramsResult.data.sourceId);
    if (!source || source.user_id !== auth.userId) {
        throw new NotFoundError('Source', paramsResult.data.sourceId);
    }

    const conversation = await prisma.conversation.findFirst({
        where: {
            id: bodyResult.data.conversation_id,
            user_id: auth.userId,
        },
        select: { id: true },
    });

    if (!conversation) {
        throw new NotFoundError('Conversation', bodyResult.data.conversation_id);
    }

    const updated = await learningService.linkSourceToConversation(
        paramsResult.data.sourceId,
        bodyResult.data.conversation_id
    );

    return NextResponse.json<{ source: LearningSourceRow }>({ source: updated });
});
