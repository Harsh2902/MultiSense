// =============================================================================
// Inject Message API Route - POST /api/chat/inject
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf } from '@/lib/api';
import { ChatService } from '@/services/chat.service';
import { z } from 'zod';
import type { ApiError, MessageMetadata } from '@/types/chat';

const injectMessageSchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID'),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    metadata: z.record(z.any()).optional(),
});

export const POST = async (request: NextRequest): Promise<Response> => {
    // 1. CSRF check
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    // 2. Authenticate
    const auth = await requireAuth();
    if (!auth.success) return auth.error;

    // 3. Parse and validate body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json<ApiError>(
            { error: 'Invalid JSON', code: 'VALIDATION_ERROR' },
            { status: 400 }
        );
    }

    const validationResult = injectMessageSchema.safeParse(body);
    if (!validationResult.success) {
        return NextResponse.json<ApiError>(
            {
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: validationResult.error.flatten(),
            },
            { status: 400 }
        );
    }

    const { conversation_id, role, content, metadata } = validationResult.data;

    // 4. Verify conversation exists AND belongs to user
    const chatService = new ChatService(auth.userId);
    const conversation = await chatService.getConversation(conversation_id);

    if (!conversation || conversation.user_id !== auth.userId) {
        return NextResponse.json<ApiError>(
            { error: 'Conversation not found', code: 'NOT_FOUND' },
            { status: 404 }
        );
    }

    try {
        // 5. Inject the message
        const message = await chatService.addMessage(
            conversation_id,
            role,
            content,
            metadata as MessageMetadata
        );

        // Update conversation title if this is the first exchange
        const history = await chatService.getContextMessages(conversation_id, 2);
        if (history.length <= 1 && role === 'user') {
            const newTitle = ChatService.generateTitle(content);
            await chatService.updateConversation(conversation_id, {
                title: newTitle,
            });
        }

        return NextResponse.json({ success: true, message });
    } catch (error) {
        console.error('[API] POST /api/chat/inject error:', error);
        return NextResponse.json<ApiError>(
            {
                error: 'Failed to inject message',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
};
