// =============================================================================
// SummaryView - Markdown summary with copy and regenerate
// =============================================================================

'use client';

import { memo, useState, useCallback } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { Skeleton, ErrorDisplay } from '@/features/shared/components';
import clsx from 'clsx';
import type { SummaryRow } from '@/types/study';

// =============================================================================
// Types
// =============================================================================

interface SummaryViewProps {
    summary: SummaryRow | null;
    isLoading: boolean;
    isGenerating: boolean;
    error: unknown;
    copied: boolean;
    onCopy: () => void;
    onRegenerate: () => void;
    onRetry: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const SummaryView = memo(function SummaryView({
    summary,
    isLoading,
    isGenerating,
    error,
    copied,
    onCopy,
    onRegenerate,
    onRetry,
}: SummaryViewProps) {
    const [showConfirm, setShowConfirm] = useState(false);

    const handleRegenerate = useCallback(() => {
        setShowConfirm(false);
        onRegenerate();
    }, [onRegenerate]);

    if (isLoading || isGenerating) {
        return (
            <div className="summary-view summary-view--loading">
                <Skeleton width="60%" height="1.5rem" />
                <Skeleton lines={8} />
            </div>
        );
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={onRetry} />;
    }

    if (!summary) {
        return (
            <div className="summary-view summary-view--empty">
                <p>No summary generated yet.</p>
            </div>
        );
    }

    const html = renderMarkdown(summary.content);

    return (
        <div className="summary-view">
            {/* Header with actions */}
            <div className="summary-view__header">
                <h2 className="summary-view__title">{summary.title}</h2>
                <div className="summary-view__actions">
                    {/* Copy button */}
                    <button
                        type="button"
                        className="summary-view__action-btn"
                        onClick={onCopy}
                        aria-label="Copy to clipboard"
                    >
                        {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>

                    {/* Regenerate button */}
                    <button
                        type="button"
                        className="summary-view__action-btn"
                        onClick={() => setShowConfirm(true)}
                        aria-label="Regenerate summary"
                    >
                        🔄 Regenerate
                    </button>
                </div>
            </div>

            {/* Regenerate confirmation */}
            {showConfirm && (
                <div className="summary-view__confirm" role="alertdialog" aria-label="Confirm regeneration">
                    <p>Regenerate this summary? The current version will be replaced.</p>
                    <div className="summary-view__confirm-actions">
                        <button
                            type="button"
                            onClick={handleRegenerate}
                            className="summary-view__confirm-btn summary-view__confirm-btn--yes"
                        >
                            Regenerate
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowConfirm(false)}
                            className="summary-view__confirm-btn summary-view__confirm-btn--no"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Summary content */}
            <div
                className="summary-view__content prose"
                dangerouslySetInnerHTML={{ __html: html }}
            />

            {/* Meta info */}
            <div className="summary-view__meta">
                <span>{summary.word_count} words</span>
                <span>Type: {summary.summary_type}</span>
                <span>Generated: {new Date(summary.created_at).toLocaleDateString()}</span>
            </div>
        </div>
    );
});
