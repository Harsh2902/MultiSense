// =============================================================================
// Messages API Routes - GET messages for a conversation
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { ChatService } from '@/services/chat.service';
import {
    getConversationParamsSchema,
    listMessagesQuerySchema,
} from '@/lib/validations/chat';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { MessageRow, PaginatedResponse } from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

interface RouteContext {
    params: Promise<{ conversationId: string }>;
}

// =============================================================================
// GET /api/chat/conversations/[conversationId]/messages - List messages
// =============================================================================

export const GET = withApiHandler(async (
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getConversationParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid conversation ID', paramsResult.error.flatten());
    }

    const searchParams = request.nextUrl.searchParams;
    const queryResult = listMessagesQuerySchema.safeParse({
        limit: searchParams.get('limit') || undefined,
        cursor: searchParams.get('cursor') || undefined,
        before: searchParams.get('before') || undefined,
    });

    if (!queryResult.success) {
        throw new ValidationError('Validation failed', queryResult.error.flatten());
    }

    const chatService = new ChatService(auth.userId);
    const conversation = await chatService.getConversation(paramsResult.data.conversationId);
    if (!conversation) {
        throw new NotFoundError('Conversation', paramsResult.data.conversationId);
    }

    const messages = await chatService.getMessages(
        paramsResult.data.conversationId,
        queryResult.data
    );

    return NextResponse.json<PaginatedResponse<MessageRow>>(messages);
});
