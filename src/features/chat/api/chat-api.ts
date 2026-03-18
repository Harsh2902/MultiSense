// =============================================================================
// Chat API Adapter - All chat data fetching
// =============================================================================

import { api } from '@/features/shared/utils/api-client';
import type {
    ConversationRow,
    ConversationWithPreview,
    PaginatedResponse,
    MessageRow,
    CreateConversationRequest,
    CreateConversationResponse,
    UpdateConversationRequest,
} from '@/types/chat';

// =============================================================================
// Conversations
// =============================================================================

export async function fetchConversations(
    cursor?: string,
    mode?: 'chat' | 'learning'
): Promise<PaginatedResponse<ConversationWithPreview>> {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (mode) query.set('mode', mode);
    const params = query.toString() ? `?${query.toString()}` : '';
    return api.get<PaginatedResponse<ConversationWithPreview>>(`/api/chat/conversations${params}`);
}

export async function fetchConversation(id: string): Promise<{ conversation: ConversationRow }> {
    return api.get<{ conversation: ConversationRow }>(`/api/chat/conversations/${id}`);
}

export async function createConversation(data: CreateConversationRequest): Promise<CreateConversationResponse> {
    return api.post<CreateConversationResponse>('/api/chat/conversations', data);
}

export async function updateConversation(
    id: string,
    data: UpdateConversationRequest
): Promise<{ conversation: ConversationRow }> {
    return api.patch<{ conversation: ConversationRow }>(`/api/chat/conversations/${id}`, data);
}

export async function deleteConversation(id: string): Promise<void> {
    return api.delete<void>(`/api/chat/conversations/${id}`);
}

// =============================================================================
// Messages
// =============================================================================

export async function fetchMessages(
    conversationId: string
): Promise<PaginatedResponse<MessageRow>> {
    return api.get<PaginatedResponse<MessageRow>>(`/api/chat/conversations/${conversationId}/messages`);
}

// =============================================================================
// Streaming - NOT through React Query
// =============================================================================

/**
 * Send a message and return the SSE stream response.
 * Streaming is managed via local state, NOT React Query cache.
 * The final message is persisted to cache by the hook on completion.
 */
export async function sendMessageStream(
    conversationId: string,
    content: string,
    sourceId?: string,
    signal?: AbortSignal
): Promise<Response> {
    const csrfMeta = typeof document !== 'undefined'
        ? document.querySelector('meta[name="csrf-token"]')
        : null;
    const csrfToken = csrfMeta?.getAttribute('content') || '';

    const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
            conversation_id: conversationId,
            content,
            ...(sourceId ? { source_id: sourceId } : {}),
        }),
        signal,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorBody = errorData?.error;
        throw new Error(
            typeof errorBody === 'object'
                ? errorBody.message || 'Failed to send message'
                : errorBody || 'Failed to send message'
        );
    }

    return response;
}

export async function fetchGreetingStream(signal?: AbortSignal): Promise<Response> {
    const csrfMeta = typeof document !== 'undefined'
        ? document.querySelector('meta[name="csrf-token"]')
        : null;
    const csrfToken = csrfMeta?.getAttribute('content') || '';

    const response = await fetch('/api/chat/greeting', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        signal,
    });

    if (!response.ok) {
        throw new Error('Failed to fetch greeting');
    }

    return response;
}
