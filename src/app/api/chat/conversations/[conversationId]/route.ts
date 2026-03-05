// =============================================================================
// Single Conversation API Routes - GET, PATCH, DELETE
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, withApiHandler } from '@/lib/api';
import { ChatService } from '@/services/chat.service';
import {
    getConversationParamsSchema,
    updateConversationSchema
} from '@/lib/validations/chat';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { ConversationRow } from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

interface RouteContext {
    params: Promise<{ conversationId: string }>;
}

// =============================================================================
// GET /api/chat/conversations/[conversationId] - Get single conversation
// =============================================================================

export async function GET(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getConversationParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid conversation ID', paramsResult.error.flatten());
    }

    const chatService = new ChatService(auth.userId);
    const conversation = await chatService.getConversation(paramsResult.data.conversationId);

    if (!conversation) {
        throw new NotFoundError('Conversation', paramsResult.data.conversationId);
    }

    return NextResponse.json<ConversationRow>(conversation);
}

// =============================================================================
// PATCH /api/chat/conversations/[conversationId] - Update conversation
// =============================================================================

export async function PATCH(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse> {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const params = await context.params;
    const paramsResult = getConversationParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid conversation ID');
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ValidationError('Invalid JSON');
    }

    const validationResult = updateConversationSchema.safeParse(body);
    if (!validationResult.success) {
        throw new ValidationError('Validation failed', validationResult.error.flatten());
    }

    const chatService = new ChatService(auth.userId);
    const existing = await chatService.getConversation(paramsResult.data.conversationId);
    if (!existing) {
        throw new NotFoundError('Conversation', paramsResult.data.conversationId);
    }

    const updated = await chatService.updateConversation(
        paramsResult.data.conversationId,
        {
            ...validationResult.data,
            settings: validationResult.data.settings as any
        }
    );

    return NextResponse.json<ConversationRow>(updated);
}

// =============================================================================
// DELETE /api/chat/conversations/[conversationId] - Delete conversation
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
    const paramsResult = getConversationParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new ValidationError('Invalid conversation ID');
    }

    const chatService = new ChatService(auth.userId);
    const existing = await chatService.getConversation(paramsResult.data.conversationId);
    if (!existing) {
        throw new NotFoundError('Conversation', paramsResult.data.conversationId);
    }

    const { LearningService } = await import('@/services/learning.service');
    const learningService = new LearningService(auth.userId);

    const sources = await learningService.listSources(paramsResult.data.conversationId);

    await Promise.all(sources.map(async (source: any) => {
        try {
            await learningService.deleteSource(source.id);
        } catch (error) {
            console.error(`Failed to delete source ${source.id} during conversation deletion:`, error);
        }
    }));

    await chatService.deleteConversation(paramsResult.data.conversationId);

    return new NextResponse(null, { status: 204 });
}
