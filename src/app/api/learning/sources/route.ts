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
import { ValidationError, ConflictError, ExternalServiceError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { ListSourcesResponse, UploadFileResponse } from '@/types/learning';
import { storage } from '@/lib/storage';

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
    const queryResult = listSourcesQuerySchema.safeParse({
        conversation_id: searchParams.get('conversation_id'),
        status: searchParams.get('status'),
        limit: searchParams.get('limit'),
    });

    if (!queryResult.success) {
        throw new ValidationError('Validation failed', queryResult.error.flatten());
    }

    const learningService = new LearningService(auth.userId);
    const sources = await learningService.listSources(
        queryResult.data.conversation_id,
        {
            status: queryResult.data.status as any,
            limit: queryResult.data.limit,
        }
    );

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
        conversationResult.data.conversation_id,
        contentHash
    );
    if (duplicate) {
        throw new ConflictError('This file has already been uploaded');
    }

    const storagePath = learningService.generateStoragePath(
        conversationResult.data.conversation_id,
        file.name
    );

    const { error: uploadError } = await storage.upload(storagePath, buffer);

    if (uploadError) {
        throw new ExternalServiceError('storage', uploadError as unknown as Error);
    }

    const source = await learningService.createSource({
        conversation_id: conversationResult.data.conversation_id,
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
        conversationResult.data.conversation_id
    );

    return NextResponse.json<UploadFileResponse>(
        { source },
        { status: 201 }
    );
}, { timeoutMs: 60_000 });
