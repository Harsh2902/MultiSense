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
    const rawLimit = searchParams.get('limit') || undefined;
    const rawCursor = searchParams.get('cursor') || undefined;
    const rawMode = searchParams.get('mode') || undefined;

    const queryResult = listConversationsQuerySchema.safeParse({
        limit: rawLimit,
        cursor: rawCursor,
        mode: rawMode,
    });

    const parsedLimit = Number(rawLimit);
    const fallbackMode: 'chat' | 'learning' | undefined =
        rawMode === 'chat' || rawMode === 'learning' ? rawMode : undefined;
    const fallbackQuery = {
        limit: Number.isFinite(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 100
            ? Math.trunc(parsedLimit)
            : 20,
        cursor: rawCursor,
        mode: fallbackMode,
    };
    const query = queryResult.success ? queryResult.data : fallbackQuery;
    if (!queryResult.success) {
        console.warn('[API] Invalid conversation list params, using fallback defaults:', {
            limit: rawLimit,
            cursor: rawCursor,
            mode: rawMode,
        });
    }

    const chatService = new ChatService(auth.userId);
    let result: PaginatedResponse<ConversationWithPreview>;
    try {
        result = await chatService.listConversations(query);
    } catch (error) {
        console.error('[API] Failed to list conversations. Returning empty list fallback:', error);
        result = {
            data: [],
            count: 0,
            has_more: false,
        };
    }

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
