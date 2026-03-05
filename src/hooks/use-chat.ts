// =============================================================================
// Chat Hooks - React hooks for chat functionality
// =============================================================================

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
    ConversationRow,
    ConversationWithPreview,
    MessageRow,
    PaginatedResponse,
    StreamEventType,
} from '@/types/chat';
import type { CreateConversationInput, SendMessageInput } from '@/lib/validations/chat';

// =============================================================================
// Types
// =============================================================================

/**
 * State for conversation list
 */
interface ConversationsState {
    conversations: ConversationWithPreview[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    cursor?: string;
}

/**
 * State for a single conversation with messages
 */
interface ConversationState {
    conversation: ConversationRow | null;
    messages: MessageRow[];
    isLoading: boolean;
    error: string | null;
}

/**
 * State for streaming response
 */
interface StreamState {
    isStreaming: boolean;
    content: string;
    error: string | null;
    /** ID of the assistant message being streamed */
    messageId: string | null;
}

// =============================================================================
// useConversations - Manage conversation list
// =============================================================================

/**
 * Hook for managing the conversation list
 */
export function useConversations() {
    const [state, setState] = useState<ConversationsState>({
        conversations: [],
        isLoading: true,
        error: null,
        hasMore: false,
    });

    /**
     * Fetch conversations
     */
    const fetchConversations = useCallback(async (cursor?: string) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const params = new URLSearchParams();
            params.set('limit', '20');
            if (cursor) params.set('cursor', cursor);

            const response = await fetch(`/api/chat/conversations?${params}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch conversations');
            }

            const data: PaginatedResponse<ConversationWithPreview> = await response.json();

            setState(prev => ({
                ...prev,
                conversations: cursor
                    ? [...prev.conversations, ...data.data]
                    : data.data,
                isLoading: false,
                hasMore: data.has_more,
                cursor: data.next_cursor,
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }, []);

    /**
     * Create a new conversation
     */
    const createConversation = useCallback(async (
        input?: CreateConversationInput
    ): Promise<ConversationRow | null> => {
        try {
            const response = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input ?? {}),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create conversation');
            }

            const { conversation } = await response.json();

            // Add to beginning of list
            setState(prev => ({
                ...prev,
                conversations: [
                    { ...conversation, message_count: 0 },
                    ...prev.conversations,
                ],
            }));

            return conversation;
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return null;
        }
    }, []);

    /**
     * Delete a conversation
     */
    const deleteConversation = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await fetch(`/api/chat/conversations/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete conversation');
            }

            // Remove from list
            setState(prev => ({
                ...prev,
                conversations: prev.conversations.filter(c => c.id !== id),
            }));

            return true;
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return false;
        }
    }, []);

    /**
     * Load more conversations (pagination)
     */
    const loadMore = useCallback(() => {
        if (state.hasMore && state.cursor && !state.isLoading) {
            fetchConversations(state.cursor);
        }
    }, [state.hasMore, state.cursor, state.isLoading, fetchConversations]);

    // Initial fetch
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    return {
        ...state,
        fetchConversations,
        createConversation,
        deleteConversation,
        loadMore,
    };
}

// =============================================================================
// useConversation - Manage single conversation with messages
// =============================================================================

/**
 * Hook for managing a single conversation and its messages
 */
export function useConversation(conversationId: string | null) {
    const [state, setState] = useState<ConversationState>({
        conversation: null,
        messages: [],
        isLoading: true,
        error: null,
    });

    /**
     * Fetch conversation and messages
     */
    const fetchConversation = useCallback(async () => {
        if (!conversationId) {
            setState({ conversation: null, messages: [], isLoading: false, error: null });
            return;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Fetch conversation and messages in parallel
            const [convResponse, msgResponse] = await Promise.all([
                fetch(`/api/chat/conversations/${conversationId}`),
                fetch(`/api/chat/conversations/${conversationId}/messages?limit=50`),
            ]);

            if (!convResponse.ok) {
                const error = await convResponse.json();
                throw new Error(error.error || 'Failed to fetch conversation');
            }

            if (!msgResponse.ok) {
                const error = await msgResponse.json();
                throw new Error(error.error || 'Failed to fetch messages');
            }

            const conversation = await convResponse.json();
            const messagesData: PaginatedResponse<MessageRow> = await msgResponse.json();

            setState({
                conversation,
                messages: messagesData.data,
                isLoading: false,
                error: null,
            });
        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }, [conversationId]);

    /**
     * Add a message to the local state
     */
    const addMessage = useCallback((message: MessageRow) => {
        setState(prev => ({
            ...prev,
            messages: [...prev.messages, message],
        }));
    }, []);

    /**
     * Update a message in local state
     */
    const updateMessage = useCallback((messageId: string, updates: Partial<MessageRow>) => {
        setState(prev => ({
            ...prev,
            messages: prev.messages.map(m =>
                m.id === messageId ? { ...m, ...updates } : m
            ),
        }));
    }, []);

    // Fetch on mount or when ID changes
    useEffect(() => {
        fetchConversation();
    }, [fetchConversation]);

    return {
        ...state,
        fetchConversation,
        addMessage,
        updateMessage,
    };
}

// =============================================================================
// useChatStream - Streaming chat responses with double-submit prevention
// =============================================================================

/**
 * Hook for managing streaming chat responses
 * Includes frontend double-submit prevention
 */
export function useChatStream() {
    const [state, setState] = useState<StreamState>({
        isStreaming: false,
        content: '',
        error: null,
        messageId: null,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    // Track in-flight requests per conversation (frontend double-submit prevention)
    const inFlightRef = useRef<Set<string>>(new Set());

    /**
     * Send a message and stream the response
     * 
     * DOUBLE-SUBMIT PREVENTION:
     * 1. Frontend: Tracks in-flight requests per conversation
     * 2. Backend: Returns 409 Conflict if already processing
     * 
     * ABORT CONTROLLER:
     * - AbortController.signal is passed to fetch()
     * - When cancelled, fetch throws AbortError
     * - Server detects client disconnect via controller.desiredSize === null
     */
    const sendMessage = useCallback(async (
        input: SendMessageInput,
        onToken?: (token: string) => void,
        onComplete?: (messageId: string) => void,
        onError?: (error: string, code?: string) => void
    ) => {
        const { conversation_id } = input;

        // Frontend double-submit check
        if (inFlightRef.current.has(conversation_id)) {
            const error = 'A message is already being sent';
            setState(prev => ({ ...prev, error }));
            onError?.(error, 'DUPLICATE_REQUEST');
            return;
        }

        // Abort any existing stream (different conversation)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Mark as in-flight
        inFlightRef.current.add(conversation_id);
        abortControllerRef.current = new AbortController();

        setState({ isStreaming: true, content: '', error: null, messageId: null });

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const error = await response.json();

                // Handle conflict (backend double-submit prevention)
                if (response.status === 409) {
                    throw new Error(error.error || 'Message already being processed');
                }

                throw new Error(error.error || 'Failed to send message');
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let assistantMessageId: string | null = null;

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            switch (data.type as StreamEventType) {
                                case 'start':
                                    // Store the assistant message ID for updates
                                    assistantMessageId = data.assistant_message_id;
                                    setState(prev => ({
                                        ...prev,
                                        messageId: assistantMessageId,
                                    }));
                                    break;

                                case 'token':
                                    fullContent += data.content;
                                    setState(prev => ({
                                        ...prev,
                                        content: fullContent,
                                    }));
                                    onToken?.(data.content);
                                    break;

                                case 'done':
                                    setState({
                                        isStreaming: false,
                                        content: fullContent,
                                        error: null,
                                        messageId: data.message_id,
                                    });
                                    onComplete?.(data.message_id);
                                    break;

                                case 'error':
                                    setState({
                                        isStreaming: false,
                                        content: fullContent,
                                        error: data.error,
                                        messageId: assistantMessageId,
                                    });
                                    onError?.(data.error, data.code);
                                    break;
                            }
                        } catch {
                            // Skip malformed JSON
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // User cancelled - not an error state
                setState(prev => ({ ...prev, isStreaming: false }));
                return;
            }

            const message = error instanceof Error ? error.message : 'Stream failed';
            setState(prev => ({ ...prev, isStreaming: false, error: message }));
            onError?.(message);
        } finally {
            // Remove from in-flight
            inFlightRef.current.delete(conversation_id);
            abortControllerRef.current = null;
        }
    }, []);

    /**
     * Cancel the current stream
     * 
     * PROPAGATION:
     * 1. AbortController.abort() triggers AbortError in fetch
     * 2. Server detects disconnect and saves partial content
     */
    const cancelStream = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setState(prev => ({ ...prev, isStreaming: false }));
    }, []);

    /**
     * Clear the current content
     */
    const clearContent = useCallback(() => {
        setState({ isStreaming: false, content: '', error: null, messageId: null });
    }, []);

    /**
     * Check if a specific conversation is currently streaming
     */
    const isConversationStreaming = useCallback((conversationId: string): boolean => {
        return inFlightRef.current.has(conversationId);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    return {
        ...state,
        sendMessage,
        cancelStream,
        clearContent,
        isConversationStreaming,
    };
}

// =============================================================================
// useRealtimeMessages - Placeholder (Supabase Realtime removed)
// =============================================================================

/**
 * Placeholder hook — Supabase Realtime was removed during migration to Neon/Prisma.
 * Real-time sync can be re-added later using WebSockets or polling.
 */
export function useRealtimeMessages(
    _conversationId: string | null,
    _onNewMessage: (message: MessageRow) => void,
    _onMessageUpdate?: (message: MessageRow) => void
) {
    // No-op: realtime not available with Prisma/Neon
}

