// =============================================================================
// Conversations API Routes - CRUD operations for conversations
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, checkRateLimit, withApiHandler } from '@/lib/api';
import { ChatService } from '@/services/chat.service';
import {
    createConversationSchema,
    listConversationsQuerySchema
} from '@/lib/validations/chat';
import { ValidationError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { CreateConversationResponse, PaginatedResponse, ConversationWithPreview } from '@/types/chat';

// =============================================================================
// GET /api/chat/conversations - List user's conversations
// =============================================================================

export const GET = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const searchParams = request.nextUrl.searchParams;
    const queryResult = listConversationsQuerySchema.safeParse({
        limit: searchParams.get('limit') || undefined,
        cursor: searchParams.get('cursor') || undefined,
        mode: searchParams.get('mode') || undefined,
    });

    if (!queryResult.success) {
        throw new ValidationError('Validation failed', queryResult.error.flatten());
    }

    const chatService = new ChatService(auth.userId);
    const result = await chatService.listConversations(queryResult.data);

    return NextResponse.json<PaginatedResponse<ConversationWithPreview>>(result);
});

// =============================================================================
// POST /api/chat/conversations - Create a new conversation
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const rateLimitError = await checkRateLimit(auth.userId, 'chat');
    if (rateLimitError) return rateLimitError;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ValidationError('Invalid JSON');
    }

    const validationResult = createConversationSchema.safeParse(body);
    if (!validationResult.success) {
        throw new ValidationError('Validation failed', validationResult.error.flatten());
    }

    const chatService = new ChatService(auth.userId);
    const conversation = await chatService.createConversation(validationResult.data);

    return NextResponse.json<CreateConversationResponse>(
        { conversation },
        { status: 201 }
    );
});
