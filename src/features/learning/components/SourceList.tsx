// =============================================================================
// SourceList - Display learning sources with processing status
// =============================================================================

'use client';

import { memo } from 'react';
import { ProcessingVisualizer } from './ProcessingVisualizer';
import { ErrorDisplay, Skeleton } from '@/features/shared/components';
import clsx from 'clsx';
import type { LearningSourceRow } from '@/types/learning';

// =============================================================================
// Types
// =============================================================================

interface SourceListProps {
    sources: LearningSourceRow[];
    isLoading: boolean;
    error: unknown;
    onDelete: (id: string) => void;
    onRetry: (id: string) => void;
    onRefetch: () => void;
}

// =============================================================================
// Single Source Item
// =============================================================================

const SourceItem = memo(function SourceItem({
    source,
    onDelete,
    onRetry,
}: {
    source: LearningSourceRow;
    onDelete: (id: string) => void;
    onRetry: (id: string) => void;
}) {
    const isProcessing = source.status === 'pending' || source.status === 'processing';
    const isFailed = source.status === 'failed';
    const isComplete = source.status === 'completed';

    const getSourceIcon = () => {
        switch (source.source_type) {
            case 'file': return '📄';
            case 'youtube': return '🎬';
            default: return '📎';
        }
    };

    return (
        <div className={clsx(
            'flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:bg-zinc-800/50 hover:border-zinc-600 transition-all duration-300 group',
            isProcessing && 'animate-pulse',
            isFailed && 'border-red-500/30 bg-red-500/5',
        )}>
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 shadow-sm text-xl">
                    {getSourceIcon()}
                </div>
                <div className="flex flex-col">
                    <span className="font-medium text-zinc-200">{source.title || source.original_filename || 'Untitled'}</span>
                    <div className="flex items-center gap-2">
                        {isComplete && (
                            <span className="text-xs text-green-400 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                                Ready for chat
                            </span>
                        )}
                        {isProcessing && (
                            <span className="text-xs text-indigo-400 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                Processing...
                            </span>
                        )}
                        {isFailed && <span className="text-xs text-red-400">Processing failed</span>}
                        {source.metadata?.chunk_count != null && (
                            <span className="text-xs text-zinc-500 border-l border-zinc-700 pl-2">
                                {source.metadata.chunk_count} chunks
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-zinc-500"
                onClick={() => onDelete(source.id)}
                aria-label={`Delete ${source.title || 'source'}`}
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
});

export function SourceList({
    sources,
    isLoading,
    error,
    onDelete,
    onRetry,
    onRefetch,
}: SourceListProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 2 }, (_, i) => (
                    <Skeleton key={i} height="4rem" className="bg-zinc-800/50 rounded-xl" />
                ))}
            </div>
        );
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={onRefetch} compact />;
    }

    if (sources.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4 text-2xl grayscale opacity-50">
                    📚
                </div>
                <p className="text-zinc-400 font-medium">No sources yet</p>
                <p className="text-sm text-zinc-500">Upload documents to start</p>
            </div>
        );
    }

    return (
        <div className="grid gap-3" role="list" aria-label="Learning sources">
            {sources.map(source => (
                <SourceItem
                    key={source.id}
                    source={source}
                    onDelete={onDelete}
                    onRetry={onRetry}
                />
            ))}
        </div>
    );
}
