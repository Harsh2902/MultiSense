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

    const query = useQuery({
        queryKey: queryKeys.learning.sources(conversationId ?? ''),
        queryFn: () => fetchSources(conversationId!),
        enabled: !!conversationId,
    });

    const deleteMutation = useMutation({
        mutationFn: (sourceId: string) => deleteSource(sourceId),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.learning.sources(conversationId ?? ''),
            });
        },
    });

    const retryMutation = useMutation({
        mutationFn: (sourceId: string) => retrySource(sourceId),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.learning.sources(conversationId ?? ''),
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
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const upload = useCallback(async (file: File) => {
        if (!conversationId || isUploading) return null;

        setIsUploading(true);
        setError(null);

        try {
            const result = await uploadFile(conversationId, file);
            queryClient.invalidateQueries({
                queryKey: queryKeys.learning.sources(conversationId),
            });
            return result.source;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setError(msg);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, [conversationId, isUploading, queryClient]);

    return { upload, isUploading, error, clearError: () => setError(null) };
}

// =============================================================================
// useYouTubeSubmit - Submit YouTube URL
// =============================================================================

export function useYouTubeSubmit(conversationId: string | null) {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: (url: string) => submitYouTube(conversationId!, url),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.learning.sources(conversationId ?? ''),
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
