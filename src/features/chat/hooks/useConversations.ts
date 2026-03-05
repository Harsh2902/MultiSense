// =============================================================================
// useConversations - React Query hook for conversation list
// =============================================================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import {
    fetchConversations,
    fetchConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    fetchMessages,
} from '@/features/chat/api';
import type {
    CreateConversationRequest,
    UpdateConversationRequest,
    ConversationWithPreview,
    ConversationRow,
    MessageRow,
} from '@/types/chat';

// =============================================================================
// Conversation List
// =============================================================================

/**
 * Hook for the conversation list.
 * Fetches via React Query with automatic caching.
 */
export function useConversations() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: queryKeys.conversations.all,
        queryFn: () => fetchConversations(),
    });

    const createMutation = useMutation({
        mutationFn: (data: CreateConversationRequest) => createConversation(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteConversation(id),
        onMutate: async (id) => {
            // Optimistic removal
            await queryClient.cancelQueries({ queryKey: queryKeys.conversations.all });
            const previous = queryClient.getQueryData(queryKeys.conversations.all);
            queryClient.setQueryData(
                queryKeys.conversations.all,
                (old: { data: ConversationWithPreview[] } | undefined) => {
                    if (!old) return old;
                    return { ...old, data: old.data.filter(c => c.id !== id) };
                }
            );
            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(queryKeys.conversations.all, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
        },
    });

    return {
        conversations: (query.data?.data ?? []) as ConversationWithPreview[],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        create: createMutation.mutateAsync,
        isCreating: createMutation.isPending,
        remove: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
    };
}

// =============================================================================
// Single Conversation
// =============================================================================

/**
 * Hook for a single conversation and its messages.
 * Only fetches when conversationId is provided.
 */
export function useConversation(conversationId: string | null) {
    const queryClient = useQueryClient();

    const conversationQuery = useQuery({
        queryKey: queryKeys.conversations.detail(conversationId ?? ''),
        queryFn: () => fetchConversation(conversationId!),
        enabled: !!conversationId,
    });

    const messagesQuery = useQuery({
        queryKey: queryKeys.conversations.messages(conversationId ?? ''),
        queryFn: () => fetchMessages(conversationId!),
        enabled: !!conversationId,
    });

    const updateMutation = useMutation({
        mutationFn: (data: UpdateConversationRequest) =>
            updateConversation(conversationId!, data),
        onSuccess: (result) => {
            queryClient.setQueryData(
                queryKeys.conversations.detail(conversationId!),
                result
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
        },
    });

    /**
     * Append a message to the cache.
     * Called by streaming hook when message is finalized.
     */
    function appendMessage(message: MessageRow) {
        queryClient.setQueryData(
            queryKeys.conversations.messages(conversationId!),
            (old: { data: MessageRow[] } | undefined) => {
                if (!old) return { data: [message], count: 1, has_more: false };
                // Avoid duplicates
                const exists = old.data.some(m => m.id === message.id);
                if (exists) return old;
                return { ...old, data: [...old.data, message] };
            }
        );
    }

    return {
        conversation: conversationQuery.data?.conversation ?? null,
        messages: (messagesQuery.data?.data ?? []) as MessageRow[],
        isLoading: conversationQuery.isLoading || messagesQuery.isLoading,
        error: conversationQuery.error || messagesQuery.error,
        update: updateMutation.mutateAsync,
        isUpdating: updateMutation.isPending,
        appendMessage,
        refetchMessages: messagesQuery.refetch,
    };
}
