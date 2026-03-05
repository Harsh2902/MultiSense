// =============================================================================
// useChatStream - Streaming SSE hook (local state, NOT React Query)
// =============================================================================

'use client';

import { useState, useRef, useCallback } from 'react';
import { sendMessageStream } from '@/features/chat/api';
import type { MessageRow, StreamEventData } from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

interface StreamState {
    /** Whether a stream is currently active */
    isStreaming: boolean;
    /** Accumulated content from tokens */
    content: string;
    /** Error message if stream failed */
    error: string | null;
    /** Message ID assigned by the server */
    messageId: string | null;
}

interface UseChatStreamOptions {
    /** Called when streaming completes — persist final message into RQ cache */
    onComplete?: (message: MessageRow) => void;
    /** Called on stream error */
    onError?: (error: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Manages streaming chat state via LOCAL STATE (not React Query cache).
 *
 * Key design decision (per user feedback):
 * - Streaming tokens are accumulated in local useState
 * - On 'done' event, the finalized message is passed to `onComplete`
 * - The parent hook (useConversation.appendMessage) persists it to RQ cache
 * - This avoids fighting React Query's update batching during rapid SSE tokens
 */
export function useChatStream({ onComplete, onError }: UseChatStreamOptions = {}) {
    const [state, setState] = useState<StreamState>({
        isStreaming: false,
        content: '',
        error: null,
        messageId: null,
    });




    // AbortController for "Stop generating" button
    const abortRef = useRef<AbortController | null>(null);
    // Double-submit prevention
    const sendingRef = useRef(false);

    /**
     * Send a message and stream the response.
     * Returns the user message optimistically added.
     */
    const send = useCallback(async (
        conversationId: string,
        content: string,
        onUserMessage?: (msg: Partial<MessageRow>) => void
    ) => {
        // --- Double-submit guard ---
        if (sendingRef.current) return;
        sendingRef.current = true;

        // Reset stream state
        setState({
            isStreaming: true,
            content: '',
            error: null,
            messageId: null,
        });

        // Create abort controller
        const controller = new AbortController();
        abortRef.current = controller;

        // Optimistic user message
        const optimisticUserMsg: Partial<MessageRow> = {
            id: `temp-${Date.now()}`,
            conversation_id: conversationId,
            role: 'user',
            content,
            metadata: {},
            token_count: null,
            created_at: new Date().toISOString(),
        };
        onUserMessage?.(optimisticUserMsg);

        try {
            const response = await sendMessageStream(
                conversationId,
                content,
                controller.signal
            );

            // Parse SSE stream
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';
            let finalMessageId: string | null = null;
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Split on double newline (SSE format)
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';

                for (const part of parts) {
                    const dataLine = part
                        .split('\n')
                        .find(line => line.startsWith('data: '));

                    if (!dataLine) continue;

                    try {
                        const event: StreamEventData = JSON.parse(
                            dataLine.slice(6)
                        );

                        switch (event.type) {
                            case 'start':
                                finalMessageId = event.message_id;
                                setState(prev => ({
                                    ...prev,
                                    messageId: event.message_id,
                                }));
                                break;

                            case 'token':
                                accumulatedContent += event.content;
                                setState(prev => ({
                                    ...prev,
                                    content: accumulatedContent,
                                }));
                                break;

                            case 'done':
                                finalMessageId = event.message_id;
                                tokenCount = event.token_count;
                                break;

                            case 'error':
                                setState(prev => ({
                                    ...prev,
                                    isStreaming: false,
                                    error: event.error,
                                }));
                                onError?.(event.error);
                                return;
                        }
                    } catch (e) {
                        console.error('[useChatStream] Parse error:', e);
                        // Skip malformed events
                    }
                }
            }

            // Stream completed — build final message and persist to RQ cache
            const finalMessage: MessageRow = {
                id: finalMessageId || `msg-${Date.now()}`,
                conversation_id: conversationId,
                role: 'assistant',
                content: accumulatedContent,
                metadata: { finish_reason: 'stop' },
                token_count: tokenCount,
                created_at: new Date().toISOString(),
            };

            setState({
                isStreaming: false,
                content: accumulatedContent,
                error: null,
                messageId: finalMessage.id,
            });

            onComplete?.(finalMessage);
        } catch (error) {
            // Aborted by user (Stop generating)
            if (error instanceof DOMException && error.name === 'AbortError') {
                setState(prev => ({
                    ...prev,
                    isStreaming: false,
                    error: null, // Not an error — user cancelled
                }));
                return;
            }

            const errorMsg = error instanceof Error ? error.message : 'Stream failed';
            setState(prev => ({
                ...prev,
                isStreaming: false,
                error: errorMsg,
            }));
            onError?.(errorMsg);
        } finally {
            sendingRef.current = false;
            abortRef.current = null;
        }
    }, [onComplete, onError]);

    /**
     * Abort the current stream (Stop generating button).
     */
    const abort = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    return {
        ...state,
        send,
        abort,
    };
}
