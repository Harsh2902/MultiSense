// =============================================================================
// MessageList - Scrollable message history with auto-scroll
// =============================================================================

'use client';

import { memo, useRef, useEffect, useCallback, useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { StreamingMessage } from './StreamingMessage';
import { MessageSkeleton } from '@/features/shared/components';
import clsx from 'clsx';
import type { MessageRow } from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

interface MessageListProps {
    /** Messages from React Query cache */
    messages: MessageRow[];
    /** Loading state for initial fetch */
    isLoading: boolean;
    /** Current streaming state */
    stream: {
        isStreaming: boolean;
        content: string;
        error: string | null;
    };
    /** Abort streaming */
    onAbort?: () => void;
    /** Retry last message */
    onRetry?: () => void;
}

// =============================================================================
// Single Message (memoized)
// =============================================================================

const ChatMessage = memo(function ChatMessage({ message }: { message: MessageRow }) {
    const isUser = message.role === 'user';

    const renderedContent = useMemo(() => {
        if (isUser) return null; // User messages rendered as plain text
        return renderMarkdown(message.content);
    }, [message.content, isUser]);

    return (
        <div
            className={clsx(
                'message',
                isUser ? 'message--user' : 'message--assistant',
            )}
            role="article"
            aria-label={`${isUser ? 'Your' : 'AI'} message`}
        >
            {/* Avatar */}
            <div
                className={clsx(
                    'message__avatar',
                    isUser ? 'message__avatar--user' : 'message__avatar--ai',
                )}
                aria-hidden="true"
            >
                {isUser ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                )}
            </div>

            {/* Content */}
            <div className="message__body">
                {isUser ? (
                    <p className="message__content message__content--plain">
                        {message.content}
                    </p>
                ) : (
                    <div
                        className="message__content prose"
                        dangerouslySetInnerHTML={{ __html: renderedContent! }}
                    />
                )}

                {/* Error metadata indicator */}
                {message.metadata?.error && (
                    <div className="message__error-badge" role="status">
                        Generation had an error
                    </div>
                )}
            </div>
        </div>
    );
});

// =============================================================================
// Message List
// =============================================================================

/**
 * Scrollable message list with:
 * - Auto-scroll to bottom on new messages
 * - Memoized individual messages (handles 200+ messages)
 * - Loading skeleton
 * - Streaming message at the bottom
 */
export function MessageList({
    messages,
    isLoading,
    stream,
    onAbort,
    onRetry,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isNearBottomRef = useRef(true);

    // Track whether user is near bottom for auto-scroll
    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const threshold = 100;
        const { scrollTop, scrollHeight, clientHeight } = container;
        isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < threshold;
    }, []);

    // Auto-scroll when new content arrives
    useEffect(() => {
        if (isNearBottomRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, stream.content]);

    // Scroll to bottom button
    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    if (isLoading) {
        return (
            <div className="message-list message-list--loading">
                {Array.from({ length: 3 }, (_, i) => (
                    <MessageSkeleton key={i} />
                ))}
            </div>
        );
    }

    return (
        <div
            className="message-list"
            ref={containerRef}
            onScroll={handleScroll}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
        >
            {/* Empty state */}
            {messages.length === 0 && !stream.isStreaming && (
                <div className="message-list__empty">
                    <p>Start a conversation by typing a message below.</p>
                </div>
            )}

            {/* Rendered messages from cache */}
            {messages.map(message => (
                <ChatMessage key={message.id} message={message} />
            ))}

            {/* Active streaming message */}
            {(stream.isStreaming || stream.content || stream.error) && (
                <StreamingMessage
                    content={stream.content}
                    isStreaming={stream.isStreaming}
                    error={stream.error}
                    onAbort={onAbort}
                    onRetry={onRetry}
                />
            )}

            {/* Scroll anchor */}
            <div ref={bottomRef} />

            {/* Scroll to bottom button (appears when scrolled up) */}
            {!isNearBottomRef.current && (
                <button
                    type="button"
                    className="message-list__scroll-btn"
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
            )}
        </div>
    );
}
