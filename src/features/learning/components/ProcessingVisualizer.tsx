// =============================================================================
// ProcessingVisualizer - Multi-phase processing status display
// =============================================================================

'use client';

import { memo, useMemo } from 'react';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

type ProcessingPhase = 'upload' | 'extraction' | 'embedding' | 'indexing' | 'completed' | 'failed';

interface ProcessingVisualizerProps {
    /** Current processing status from the source */
    status: string;
    /** Optional error message */
    error?: string | null;
    /** Retry handler */
    onRetry?: () => void;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// Phase Mapping
// =============================================================================

const PHASES: { key: ProcessingPhase; label: string; icon: string }[] = [
    { key: 'upload', label: 'Uploaded', icon: '📤' },
    { key: 'extraction', label: 'Extracting content', icon: '📄' },
    { key: 'embedding', label: 'Generating embeddings', icon: '🧠' },
    { key: 'indexing', label: 'Indexing for search', icon: '🗃️' },
    { key: 'completed', label: 'Ready', icon: '✅' },
];

function mapStatusToPhase(status: string): ProcessingPhase {
    switch (status) {
        case 'pending': return 'upload';
        case 'processing': return 'embedding'; // Map processing to mid-phase for visual effect
        case 'completed': return 'completed';
        case 'failed': return 'failed';
        default: return 'upload';
    }
}

// =============================================================================
// Component
// =============================================================================

/**
 * Visualizes multi-phase source processing.
 * Makes the system "feel intelligent" per requirements.
 */
export const ProcessingVisualizer = memo(function ProcessingVisualizer({
    status,
    error,
    onRetry,
    className,
}: ProcessingVisualizerProps) {
    const currentPhase = useMemo(() => mapStatusToPhase(status), [status]);
    const currentPhaseIndex = useMemo(
        () => PHASES.findIndex(p => p.key === currentPhase),
        [currentPhase]
    );

    if (currentPhase === 'failed') {
        return (
            <div className={clsx('processing-visualizer processing-visualizer--failed', className)} role="alert">
                <div className="processing-visualizer__error">
                    <span className="processing-visualizer__error-icon">❌</span>
                    <div>
                        <p className="processing-visualizer__error-message">
                            Processing failed
                        </p>
                        {error && (
                            <p className="processing-visualizer__error-detail">{error}</p>
                        )}
                        {onRetry && (
                            <button
                                type="button"
                                className="processing-visualizer__retry-btn"
                                onClick={onRetry}
                            >
                                Retry Processing
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={clsx('processing-visualizer', className)}
            role="progressbar"
            aria-valuenow={currentPhaseIndex}
            aria-valuemin={0}
            aria-valuemax={PHASES.length - 1}
            aria-label="Source processing progress"
        >
            <div className="processing-visualizer__phases">
                {PHASES.map((phase, index) => {
                    const isActive = index === currentPhaseIndex;
                    const isComplete = index < currentPhaseIndex;
                    const isPending = index > currentPhaseIndex;

                    return (
                        <div
                            key={phase.key}
                            className={clsx(
                                'processing-phase',
                                isActive && 'processing-phase--active',
                                isComplete && 'processing-phase--complete',
                                isPending && 'processing-phase--pending',
                            )}
                        >
                            <div className="processing-phase__icon">
                                {isComplete ? '✓' : phase.icon}
                            </div>
                            <span className="processing-phase__label">
                                {phase.label}
                            </span>
                            {isActive && currentPhase !== 'completed' && (
                                <span className="processing-phase__spinner" aria-hidden="true" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Progress bar */}
            <div className="processing-visualizer__bar">
                <div
                    className="processing-visualizer__bar-fill"
                    style={{
                        width: `${(currentPhaseIndex / (PHASES.length - 1)) * 100}%`,
                    }}
                />
            </div>
        </div>
    );
});
