// =============================================================================
// Learning Sources API Routes - List and upload sources
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, checkRateLimit, withApiHandler } from '@/lib/api';
import { LearningService } from '@/services/learning.service';
import { getProcessingQueue, initializeQueue } from '@/lib/queue';
import {
    uploadFileSchema,
    fileMetadataSchema,
    listSourcesQuerySchema,
} from '@/lib/validations/learning';
import { validateFileType, validateFileSize, generateContentHash } from '@/lib/files';
import { ValidationError, ConflictError, ExternalServiceError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { ListSourcesResponse, UploadFileResponse } from '@/types/learning';
import { storage } from '@/lib/storage';
import { prisma } from '@/lib/prisma';

// =============================================================================
// Initialize Queue Processor (Lazy)
// =============================================================================

let queueInitialized = false;

function ensureQueueInitialized() {
    if (queueInitialized) return;

    initializeQueue(async (job) => {
        const learningService = new LearningService(job.user_id);
        await learningService.processSource(job.source_id);
    });

    queueInitialized = true;
}

// =============================================================================
// GET /api/learning/sources - List learning sources
// =============================================================================

export const GET = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const searchParams = request.nextUrl.searchParams;
    const rawConversationId = searchParams.get('conversation_id') || undefined;
    const rawStatus = searchParams.get('status') || undefined;
    const rawLimit = searchParams.get('limit') || undefined;

    const queryResult = listSourcesQuerySchema.safeParse({
        conversation_id: rawConversationId,
        status: rawStatus,
        limit: rawLimit,
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const allowedStatuses = ['pending', 'processing', 'completed', 'failed'] as const;
    const fallbackLimit = Number(rawLimit);
    const fallbackQuery = {
        conversation_id: rawConversationId && uuidRegex.test(rawConversationId) ? rawConversationId : undefined,
        status: allowedStatuses.includes(rawStatus as any) ? rawStatus as (typeof allowedStatuses)[number] : undefined,
        limit: Number.isFinite(fallbackLimit) && fallbackLimit >= 1 && fallbackLimit <= 100
            ? Math.trunc(fallbackLimit)
            : 20,
    };

    const query = queryResult.success ? queryResult.data : fallbackQuery;
    if (!queryResult.success) {
        console.warn('[Learning API] Invalid list query params, using fallback defaults', {
            conversation_id: rawConversationId,
            status: rawStatus,
            limit: rawLimit,
        });
    }

    const learningService = new LearningService(auth.userId);
    let sources: Awaited<ReturnType<LearningService['listSources']>>;
    try {
        sources = await learningService.listSources(
            query.conversation_id,
            {
                status: query.status as any,
                limit: query.limit,
            }
        );
    } catch (error) {
        console.error('[Learning API] Failed to list sources, returning empty fallback:', error);
        sources = [];
    }

    return NextResponse.json<ListSourcesResponse>({
        sources,
        count: sources.length,
    });
});

// =============================================================================
// POST /api/learning/sources - Upload a file
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const rateLimitError = await checkRateLimit(auth.userId, 'upload');
    if (rateLimitError) return rateLimitError;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversation_id') as string | null;

    if (!file) {
        throw new ValidationError('No file provided');
    }

    const conversationResult = uploadFileSchema.safeParse({
        conversation_id: conversationId,
    });
    if (!conversationResult.success) {
        throw new ValidationError('Validation failed', conversationResult.error.flatten());
    }

    if (conversationResult.data.conversation_id) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationResult.data.conversation_id,
                user_id: auth.userId,
            },
            select: { id: true },
        });

        if (!conversation) {
            throw new NotFoundError('Conversation', conversationResult.data.conversation_id);
        }
    }

    const metadataResult = fileMetadataSchema.safeParse({
        filename: file.name,
        mime_type: file.type,
        size: file.size,
    });
    if (!metadataResult.success) {
        throw new ValidationError('Invalid file', metadataResult.error.flatten());
    }

    const buffer = await file.arrayBuffer();

    const fileValidation = await validateFileType(
        buffer,
        metadataResult.data.mime_type
    );
    if (!fileValidation.valid) {
        throw new ValidationError(fileValidation.error || 'Invalid file type');
    }

    const sizeError = validateFileSize(file.size, fileValidation.file_type);
    if (sizeError) {
        throw new ValidationError(sizeError);
    }

    // Check for duplicate (by hash)
    const contentHash = await generateContentHash(buffer);
    const learningService = new LearningService(auth.userId);

    const duplicate = await learningService.checkDuplicate(
        conversationResult.data.conversation_id || null,
        contentHash
    );
    if (duplicate) {
        throw new ConflictError('This file has already been uploaded');
    }

    const storagePath = learningService.generateStoragePath(
        conversationResult.data.conversation_id || null,
        file.name
    );

    const { error: uploadError } = await storage.upload(storagePath, buffer);

    if (uploadError) {
        throw new ExternalServiceError('storage', uploadError as unknown as Error);
    }

    const source = await learningService.createSource({
        conversation_id: conversationResult.data.conversation_id || null,
        original_filename: file.name,
        file_type: fileValidation.file_type!,
        file_size: file.size,
        mime_type: fileValidation.mime_type!,
        storage_path: storagePath,
    });

    // Queue for processing (non-blocking)
    ensureQueueInitialized();
    await getProcessingQueue().add(
        source.id,
        auth.userId,
        conversationResult.data.conversation_id || null
    );

    return NextResponse.json<UploadFileResponse>(
        { source },
        { status: 201 }
    );
}, { timeoutMs: 60_000 });
