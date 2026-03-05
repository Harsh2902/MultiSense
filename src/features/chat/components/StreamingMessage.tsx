// =============================================================================
// StreamingMessage - Renders streaming AI response with markdown
// =============================================================================

'use client';

import { memo, useMemo } from 'react';
import { renderMarkdown, hasCodeBlocks } from '@/lib/markdown';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface StreamingMessageProps {
    /** Current accumulated content */
    content: string;
    /** Whether the stream is still active */
    isStreaming: boolean;
    /** Stream error message */
    error: string | null;
    /** Abort handler for "Stop generating" */
    onAbort?: () => void;
    /** Retry handler */
    onRetry?: () => void;
}

// =============================================================================
// Component (memoized for performance with 200+ messages)
// =============================================================================

/**
 * Renders the streaming AI response.
 * - Shows accumulated tokens as markdown
 * - Displays "Stop generating" button during stream
 * - Shows error state with retry option
 * - Memoized to avoid re-rendering sibling messages
 */
export const StreamingMessage = memo(function StreamingMessage({
    content,
    isStreaming,
    error,
    onAbort,
    onRetry,
}: StreamingMessageProps) {
    const hasCode = useMemo(() => hasCodeBlocks(content), [content]);

    // Only render markdown when content is substantial (avoid flicker)
    const renderedHtml = useMemo(() => {
        if (!content) return '';
        return renderMarkdown(content);
    }, [content]);

    return (
        <div
            className={clsx(
                'message message--assistant',
                isStreaming && 'message--streaming',
                hasCode && 'message--has-code',
            )}
            role="article"
            aria-label="AI response"
        >
            {/* Avatar */}
            <div className="message__avatar message__avatar--ai" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
            </div>

            {/* Content */}
            <div className="message__body">
                {content ? (
                    <div
                        className="message__content prose"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                ) : isStreaming ? (
                    <div className="message__thinking" aria-live="polite">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                    </div>
                ) : null}

                {/* Streaming cursor */}
                {isStreaming && content && (
                    <span className="message__cursor" aria-hidden="true" />
                )}

                {/* Error state */}
                {error && (
                    <div className="message__error" role="alert">
                        <p>{error}</p>
                        {onRetry && (
                            <button
                                type="button"
                                className="message__error-retry"
                                onClick={onRetry}
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}

                {/* Stop generating button */}
                {isStreaming && onAbort && (
                    <button
                        type="button"
                        className="message__stop-btn"
                        onClick={onAbort}
                        aria-label="Stop generating"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                        </svg>
                        Stop generating
                    </button>
                )}
            </div>
        </div>
    );
});
