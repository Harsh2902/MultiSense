// =============================================================================
// Learning Hooks - React Query hooks for sources and uploads
// =============================================================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { queryKeys } from '@/lib/react-query';
import { useBackgroundJob } from '@/features/shared/hooks';
import {
    fetchSources,
    fetchSource,
    deleteSource,
    retrySource,
    uploadFile,
    submitYouTube,
} from '@/features/learning/api';
import type { LearningSourceRow } from '@/types/learning';

// =============================================================================
// useSources - Manage learning sources list
// =============================================================================

export function useSources(conversationId: string | null) {
    const queryClient = useQueryClient();
    const sourcesQueryKey = queryKeys.learning.sources(conversationId ?? 'all');
    const allSourcesQueryKey = queryKeys.learning.sources('all');
    const sidebarSourcesQueryKey = ['sidebar-learning-sources'] as const;

    const query = useQuery({
        queryKey: sourcesQueryKey,
        queryFn: () => fetchSources(conversationId),
    });

    const deleteMutation = useMutation({
        mutationFn: (sourceId: string) => deleteSource(sourceId),
        onMutate: async (sourceId: string) => {
            await Promise.all([
                queryClient.cancelQueries({ queryKey: sourcesQueryKey }),
                queryClient.cancelQueries({ queryKey: allSourcesQueryKey }),
                queryClient.cancelQueries({ queryKey: sidebarSourcesQueryKey }),
            ]);

            const previousScoped = queryClient.getQueryData<{ sources: LearningSourceRow[] }>(sourcesQueryKey);
            const previousAll = queryClient.getQueryData<{ sources: LearningSourceRow[] }>(allSourcesQueryKey);
            const previousSidebar = queryClient.getQueryData<LearningSourceRow[]>(sidebarSourcesQueryKey);

            queryClient.setQueryData<{ sources: LearningSourceRow[] } | undefined>(
                sourcesQueryKey,
                (old) => old
                    ? { ...old, sources: old.sources.filter((source) => source.id !== sourceId) }
                    : old
            );

            queryClient.setQueryData<{ sources: LearningSourceRow[] } | undefined>(
                allSourcesQueryKey,
                (old) => old
                    ? { ...old, sources: old.sources.filter((source) => source.id !== sourceId) }
                    : old
            );

            queryClient.setQueryData<LearningSourceRow[] | undefined>(
                sidebarSourcesQueryKey,
                (old) => old
                    ? old.filter((source) => source.id !== sourceId)
                    : old
            );

            return {
                previousScoped,
                previousAll,
                previousSidebar,
            };
        },
        onError: (_error, _sourceId, context) => {
            if (!context) return;

            queryClient.setQueryData(sourcesQueryKey, context.previousScoped);
            queryClient.setQueryData(allSourcesQueryKey, context.previousAll);
            queryClient.setQueryData(sidebarSourcesQueryKey, context.previousSidebar);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: sourcesQueryKey,
            });
            queryClient.invalidateQueries({
                queryKey: allSourcesQueryKey,
            });
            queryClient.invalidateQueries({
                queryKey: sidebarSourcesQueryKey,
            });
        },
    });

    const retryMutation = useMutation({
        mutationFn: (sourceId: string) => retrySource(sourceId),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: sourcesQueryKey,
            });
        },
    });

    return {
        sources: (query.data?.sources ?? []) as LearningSourceRow[],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        remove: deleteMutation.mutateAsync,
        retry: retryMutation.mutateAsync,
    };
}

// =============================================================================
// useFileUpload - Upload with progress
// =============================================================================

export function useFileUpload(conversationId: string | null) {
    const queryClient = useQueryClient();
    const sourcesQueryKey = queryKeys.learning.sources(conversationId ?? 'all');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const upload = useCallback(async (file: File) => {
        if (isUploading) return null;

        setIsUploading(true);
        setError(null);

        try {
            const result = await uploadFile(conversationId, file);
            queryClient.invalidateQueries({
                queryKey: sourcesQueryKey,
            });
            return result.source;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setError(msg);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, [conversationId, isUploading, queryClient, sourcesQueryKey]);

    return { upload, isUploading, error, clearError: () => setError(null) };
}

// =============================================================================
// useYouTubeSubmit - Submit YouTube URL
// =============================================================================

export function useYouTubeSubmit(conversationId: string | null) {
    const queryClient = useQueryClient();
    const sourcesQueryKey = queryKeys.learning.sources(conversationId ?? 'all');

    const mutation = useMutation({
        mutationFn: async (url: string) => {
            if (!conversationId) {
                throw new Error('Please select a library before adding YouTube videos');
            }
            return submitYouTube(conversationId, url);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: sourcesQueryKey,
            });
        },
    });

    return {
        submit: mutation.mutateAsync,
        isSubmitting: mutation.isPending,
        error: mutation.error,
    };
}

// =============================================================================
// useSourceProcessing - Poll source processing status
// =============================================================================

export function useSourceProcessing(sourceId: string | null) {
    const queryClient = useQueryClient();

    return useBackgroundJob<{ source: LearningSourceRow }>({
        jobId: sourceId,
        fetchJob: (id) => fetchSource(id),
        isComplete: (data) => data.source.status === 'completed',
        isFailed: (data) => data.source.status === 'failed',
        onComplete: () => {
            // Invalidate source list when processing finishes
            if (sourceId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.learning.all,
                });
            }
        },
        initialInterval: 2000,
        maxInterval: 8000,
    });
}
