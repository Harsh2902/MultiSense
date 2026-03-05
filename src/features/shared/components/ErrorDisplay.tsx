// =============================================================================
// Error Display - User-facing error component
// =============================================================================

'use client';

import { useState, useCallback } from 'react';
import { ApiClientError, getErrorMessage } from '@/features/shared/utils/api-client';

// =============================================================================
// Types
// =============================================================================

interface ErrorDisplayProps {
    /** The error to display */
    error: unknown;
    /** Optional retry handler — shows "Try Again" button if provided */
    onRetry?: () => void;
    /** Optional dismiss handler */
    onDismiss?: () => void;
    /** Compact mode — less padding */
    compact?: boolean;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Displays API errors with user-friendly messages.
 * Shows requestId in expandable debug section.
 * Never shows raw stack traces or technical details.
 */
export function ErrorDisplay({
    error,
    onRetry,
    onDismiss,
    compact = false,
    className = '',
}: ErrorDisplayProps) {
    const [showDebug, setShowDebug] = useState(false);

    const message = getErrorMessage(error);
    const requestId = error instanceof ApiClientError ? error.requestId : undefined;
    const errorCode = error instanceof ApiClientError ? error.code : undefined;
    const isRetryable = error instanceof ApiClientError ? error.isRetryable : false;

    const toggleDebug = useCallback(() => {
        setShowDebug(prev => !prev);
    }, []);

    return (
        <div
            className={`error-display ${compact ? 'error-display--compact' : ''} ${className}`}
            role="alert"
            aria-live="assertive"
        >
            {/* Error icon */}
            <div className="error-display__icon" aria-hidden="true">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 6v4m0 4h.01"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {/* Error content */}
            <div className="error-display__content">
                <p className="error-display__message">{message}</p>

                {/* Action buttons */}
                <div className="error-display__actions">
                    {onRetry && (isRetryable || !errorCode) && (
                        <button
                            type="button"
                            className="error-display__btn error-display__btn--retry"
                            onClick={onRetry}
                        >
                            Try Again
                        </button>
                    )}
                    {onDismiss && (
                        <button
                            type="button"
                            className="error-display__btn error-display__btn--dismiss"
                            onClick={onDismiss}
                        >
                            Dismiss
                        </button>
                    )}
                </div>

                {/* Debug info (expandable) */}
                {requestId && (
                    <div className="error-display__debug">
                        <button
                            type="button"
                            className="error-display__debug-toggle"
                            onClick={toggleDebug}
                            aria-expanded={showDebug}
                        >
                            {showDebug ? 'Hide' : 'Show'} details
                        </button>
                        {showDebug && (
                            <div className="error-display__debug-content">
                                {errorCode && <p>Code: <code>{errorCode}</code></p>}
                                <p>Request ID: <code>{requestId}</code></p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
