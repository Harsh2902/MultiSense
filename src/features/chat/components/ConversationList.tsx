// =============================================================================
// ConversationList - Sidebar conversation list with CRUD
// =============================================================================

'use client';

import { memo, useCallback } from 'react';
import { ConversationListSkeleton } from '@/features/shared/components';
import { ErrorDisplay } from '@/features/shared/components';
import clsx from 'clsx';
import type { ConversationWithPreview } from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

interface ConversationListProps {
    /** Conversations from hook */
    conversations: ConversationWithPreview[];
    /** Currently selected conversation ID */
    activeId: string | null;
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: unknown;
    /** Select a conversation */
    onSelect: (id: string) => void;
    /** Create a new conversation */
    onCreate: () => void;
    /** Delete a conversation */
    onDelete: (id: string) => void;
    /** Retry fetching */
    onRetry: () => void;
}

// =============================================================================
// Single Item (memoized)
// =============================================================================

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ConversationItem = memo(function ConversationItem({
    conversation,
    isActive,
    onSelect,
    onDelete,
}: {
    conversation: ConversationWithPreview;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const preview = conversation.last_message?.content || 'No messages yet';
    const truncatedPreview = preview.length > 60
        ? preview.substring(0, 60) + '...'
        : preview;

    return (
        <button
            type="button"
            className={clsx(
                'relative flex w-full flex-col gap-1 rounded-lg border border-transparent p-3 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50 group',
                isActive && 'bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-50',
                !isActive && 'text-zinc-700 dark:text-zinc-300'
            )}
            onClick={() => onSelect(conversation.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`${conversation.title}, ${conversation.message_count} messages`}
        >
            <div className="flex w-full flex-col gap-1 overflow-hidden">
                <span className="truncate font-medium">{conversation.title}</span>
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{truncatedPreview}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 h-5">
                <span className="flex items-center gap-1">
                    {conversation.mode === 'learning' ? '📚' : '💬'}
                </span>

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-red-500"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            aria-label={`Delete ${conversation.title}`}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the conversation, all messages, and any uploaded files.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    onDelete(conversation.id);
                                }}
                                className="bg-red-500 hover:bg-red-600 text-white focus:ring-red-500 border-transparent"
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </button>
    );
});

// =============================================================================
// Component
// =============================================================================

/**
 * Conversation sidebar list.
 * No business logic — receives all data and callbacks from parent.
 */
export function ConversationList({
    conversations,
    activeId,
    isLoading,
    error,
    onSelect,
    onCreate,
    onDelete,
    onRetry,
}: ConversationListProps) {
    if (isLoading) {
        return <ConversationListSkeleton />;
    }

    if (error) {
        return <ErrorDisplay error={error} onRetry={onRetry} compact />;
    }

    return (
        <nav className="conversation-list" aria-label="Conversations">
            {/* New conversation button */}
            <button
                type="button"
                className="conversation-list__new-btn"
                onClick={onCreate}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Conversation
            </button>

            {/* Conversation items */}
            {conversations.length === 0 ? (
                <p className="conversation-list__empty">No conversations yet</p>
            ) : (
                <div className="conversation-list__items" role="list">
                    {conversations.map(conv => (
                        <ConversationItem
                            key={conv.id}
                            conversation={conv}
                            isActive={conv.id === activeId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </nav>
    );
}
