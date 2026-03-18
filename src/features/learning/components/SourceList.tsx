// =============================================================================
// SourceList - Display learning sources with processing status
// =============================================================================

'use client';

import { memo } from 'react';
import { ErrorDisplay, Skeleton } from '@/features/shared/components';
import clsx from 'clsx';
import { MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
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
    onOpenChat?: (source: LearningSourceRow) => void;
}

// =============================================================================
// Single Source Item
// =============================================================================

const SourceItem = memo(function SourceItem({
    source,
    onDelete,
    onRetry,
    onOpenChat,
}: {
    source: LearningSourceRow;
    onDelete: (id: string) => void;
    onRetry: (id: string) => void;
    onOpenChat?: (source: LearningSourceRow) => void;
}) {
    const isQueued = source.status === 'pending';
    const isProcessing = source.status === 'processing';
    const isFailed = source.status === 'failed';
    const isComplete = source.status === 'completed';
    const canOpen = isComplete && !!onOpenChat;

    const sourceBadge = source.source_type === 'youtube' ? 'YT' : 'DOC';

    return (
        <div
            className={clsx(
                'flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:bg-zinc-800/50 hover:border-zinc-600 transition-all duration-300 group',
                (isProcessing || isQueued) && 'animate-pulse',
                isFailed && 'border-red-500/30 bg-red-500/5',
                canOpen && 'cursor-pointer',
            )}
            onClick={() => {
                if (canOpen && onOpenChat) {
                    onOpenChat(source);
                }
            }}
        >
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 shadow-sm text-xs font-semibold tracking-wide text-zinc-300">
                    {sourceBadge}
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
                        {isQueued && (
                            <span className="text-xs text-amber-300 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                                Queued
                            </span>
                        )}
                        {isProcessing && (
                            <span className="text-xs text-indigo-400 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                Processing...
                            </span>
                        )}
                        {isFailed && <span className="text-xs text-red-400">Processing failed</span>}
                        {isFailed && source.error_message && (
                            <span className="text-xs text-red-300/90 border-l border-red-500/30 pl-2 max-w-[32rem] truncate" title={source.error_message}>
                                {source.error_message}
                            </span>
                        )}
                        {source.metadata?.chunk_count != null && (
                            <span className="text-xs text-zinc-500 border-l border-zinc-700 pl-2">
                                {source.metadata.chunk_count} chunks
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className={clsx('flex items-center gap-1 transition-opacity', canOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                {canOpen && (
                    <button
                        type="button"
                        className="p-2 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-lg transition-all text-zinc-500"
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpenChat(source);
                        }}
                        aria-label={`Open chat for ${source.title || 'source'}`}
                    >
                        <MessageSquare className="h-4 w-4" />
                    </button>
                )}
                {isFailed && (
                    <button
                        type="button"
                        className="p-2 hover:bg-indigo-500/10 hover:text-indigo-400 rounded-lg transition-all text-zinc-500"
                        onClick={(event) => {
                            event.stopPropagation();
                            onRetry(source.id);
                        }}
                        aria-label={`Retry ${source.title || 'source'}`}
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                )}
                <button
                    type="button"
                    className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-zinc-500"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(source.id);
                    }}
                    aria-label={`Delete ${source.title || 'source'}`}
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
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
    onOpenChat,
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
                <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4 text-sm font-semibold text-zinc-500">
                    LIB
                </div>
                <p className="text-zinc-400 font-medium">No sources yet</p>
                <p className="text-sm text-zinc-500">Upload files or add YouTube links to start</p>
            </div>
        );
    }

    return (
        <div className="grid gap-3" role="list" aria-label="Learning sources">
            {sources.map((source) => (
                <SourceItem
                    key={source.id}
                    source={source}
                    onDelete={onDelete}
                    onRetry={onRetry}
                    onOpenChat={onOpenChat}
                />
            ))}
        </div>
    );
}
