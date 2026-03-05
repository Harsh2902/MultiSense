// =============================================================================
// Error Boundary - Feature-level error catching
// =============================================================================

'use client';

import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { ErrorDisplay } from './ErrorDisplay';

// =============================================================================
// Types
// =============================================================================

interface FeatureErrorBoundaryProps {
    /** Feature name for logging context */
    feature: string;
    /** Children to render */
    children: React.ReactNode;
    /** Custom fallback component */
    fallback?: React.ComponentType<FallbackProps>;
    /** Called when the boundary is reset */
    onReset?: () => void;
}

// =============================================================================
// Default Fallback
// =============================================================================

function DefaultFallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div className="error-boundary-fallback" role="alert">
            <ErrorDisplay
                error={error}
                onRetry={resetErrorBoundary}
            />
        </div>
    );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Feature-level error boundary.
 * Catches render errors within a feature and displays a recovery UI.
 *
 * Hierarchy:
 *   Root ErrorBoundary
 *     ├── Chat ErrorBoundary
 *     ├── Learning ErrorBoundary
 *     └── Study ErrorBoundary
 */
export function FeatureErrorBoundary({
    feature,
    children,
    fallback: FallbackComponent = DefaultFallback,
    onReset,
}: FeatureErrorBoundaryProps) {
    return (
        <ReactErrorBoundary
            FallbackComponent={FallbackComponent}
            onError={(error: unknown, info: { componentStack?: string | null }) => {
                // Structured logging for caught render errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[${feature}] Render error:`, {
                    error: errorMessage,
                    componentStack: info?.componentStack,
                });
            }}
            onReset={onReset}
        >
            {children}
        </ReactErrorBoundary>
    );
}

/**
 * Root-level error boundary for the entire application.
 */
export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ReactErrorBoundary
            FallbackComponent={({ error, resetErrorBoundary }) => (
                <div className="root-error-boundary" role="alert">
                    <div className="root-error-boundary__content">
                        <h1>Something went wrong</h1>
                        <p>An unexpected error occurred. Please try refreshing the page.</p>
                        <ErrorDisplay error={error} onRetry={resetErrorBoundary} />
                    </div>
                </div>
            )}
            onError={(error) => {
                console.error('[Root] Unhandled render error:', error);
            }}
        >
            {children}
        </ReactErrorBoundary>
    );
}
