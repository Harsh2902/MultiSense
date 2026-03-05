// =============================================================================
// Loading Skeleton - Content placeholder during fetch
// =============================================================================

'use client';

import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface SkeletonProps {
    /** Width — CSS value */
    width?: string;
    /** Height — CSS value */
    height?: string;
    /** Border radius */
    rounded?: boolean;
    /** Display as circle */
    circle?: boolean;
    /** Number of lines to render */
    lines?: number;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Animated loading skeleton for content placeholders.
 */
export function Skeleton({
    width = '100%',
    height = '1rem',
    rounded = true,
    circle = false,
    lines = 1,
    className = '',
}: SkeletonProps) {
    if (lines > 1) {
        return (
            <div className={clsx('skeleton-group', className)} role="status" aria-label="Loading">
                {Array.from({ length: lines }, (_, i) => (
                    <div
                        key={i}
                        className={clsx('skeleton', rounded && 'skeleton--rounded')}
                        style={{
                            width: i === lines - 1 ? '70%' : width,
                            height,
                        }}
                    />
                ))}
                <span className="sr-only">Loading...</span>
            </div>
        );
    }

    return (
        <div
            className={clsx(
                'skeleton',
                rounded && 'skeleton--rounded',
                circle && 'skeleton--circle',
                className
            )}
            style={{
                width: circle ? height : width,
                height,
            }}
            role="status"
            aria-label="Loading"
        >
            <span className="sr-only">Loading...</span>
        </div>
    );
}

// =============================================================================
// Presets
// =============================================================================

export function MessageSkeleton() {
    return (
        <div className="message-skeleton">
            <Skeleton circle height="2rem" />
            <div className="message-skeleton__content">
                <Skeleton width="30%" height="0.75rem" />
                <Skeleton lines={3} height="0.875rem" />
            </div>
        </div>
    );
}

export function ConversationListSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="conversation-list-skeleton" role="status" aria-label="Loading conversations">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="conversation-list-skeleton__item">
                    <Skeleton width="60%" height="0.875rem" />
                    <Skeleton width="90%" height="0.75rem" />
                </div>
            ))}
        </div>
    );
}

export function QuizSkeleton() {
    return (
        <div className="quiz-skeleton" role="status" aria-label="Loading quiz">
            <Skeleton width="70%" height="1.25rem" />
            <Skeleton lines={4} height="2.5rem" />
        </div>
    );
}
