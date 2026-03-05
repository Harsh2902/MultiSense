// =============================================================================
// Learning Hooks - React hooks for file upload and sources
// =============================================================================

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
    LearningSourceRow,
    ProcessingStatus,
    ProcessingStatusResponse,
} from '@/types/learning';

// =============================================================================
// Types
// =============================================================================

/**
 * Upload progress state
 */
interface UploadState {
    isUploading: boolean;
    progress: number;
    error: string | null;
}

/**
 * Sources list state
 */
interface SourcesState {
    sources: LearningSourceRow[];
    isLoading: boolean;
    error: string | null;
}

// =============================================================================
// useSources - Manage learning sources list
// =============================================================================

/**
 * Hook for managing learning sources for a conversation
 */
export function useSources(conversationId: string | null) {
    const [state, setState] = useState<SourcesState>({
        sources: [],
        isLoading: true,
        error: null,
    });

    /**
     * Fetch sources
     */
    const fetchSources = useCallback(async () => {
        if (!conversationId) {
            setState({ sources: [], isLoading: false, error: null });
            return;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const params = new URLSearchParams();
            params.set('conversation_id', conversationId);

            const response = await fetch(`/api/learning/sources?${params}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch sources');
            }

            const data = await response.json();
            setState({
                sources: data.sources,
                isLoading: false,
                error: null,
            });
        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }, [conversationId]);

    /**
     * Delete a source
     */
    const deleteSource = useCallback(async (sourceId: string): Promise<boolean> => {
        try {
            const response = await fetch(`/api/learning/sources/${sourceId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete source');
            }

            // Remove from state
            setState(prev => ({
                ...prev,
                sources: prev.sources.filter(s => s.id !== sourceId),
            }));

            return true;
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return false;
        }
    }, []);

    /**
     * Retry processing a failed source
     */
    const retrySource = useCallback(async (sourceId: string): Promise<boolean> => {
        try {
            const response = await fetch(`/api/learning/sources/${sourceId}`, {
                method: 'POST',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to retry');
            }

            const updated = await response.json();

            // Update in state
            setState(prev => ({
                ...prev,
                sources: prev.sources.map(s =>
                    s.id === sourceId ? updated : s
                ),
            }));

            return true;
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return false;
        }
    }, []);

    /**
     * Add a source to the list (after upload)
     */
    const addSource = useCallback((source: LearningSourceRow) => {
        setState(prev => ({
            ...prev,
            sources: [source, ...prev.sources],
        }));
    }, []);

    /**
     * Update a source in the list
     */
    const updateSource = useCallback((source: LearningSourceRow) => {
        setState(prev => ({
            ...prev,
            sources: prev.sources.map(s =>
                s.id === source.id ? source : s
            ),
        }));
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    return {
        ...state,
        fetchSources,
        deleteSource,
        retrySource,
        addSource,
        updateSource,
    };
}

// =============================================================================
// useFileUpload - Handle file uploads with progress
// =============================================================================

/**
 * Hook for uploading files
 * 
 * DOUBLE-UPLOAD PREVENTION:
 * - Tracks upload in progress
 * - Prevents concurrent uploads to same conversation
 */
export function useFileUpload(conversationId: string | null) {
    const [state, setState] = useState<UploadState>({
        isUploading: false,
        progress: 0,
        error: null,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * Upload a file
     */
    const uploadFile = useCallback(async (
        file: File,
        onSuccess?: (source: LearningSourceRow) => void,
        onError?: (error: string) => void
    ): Promise<LearningSourceRow | null> => {
        if (!conversationId) {
            const error = 'No conversation selected';
            setState(prev => ({ ...prev, error }));
            onError?.(error);
            return null;
        }

        // Prevent double upload
        if (state.isUploading) {
            const error = 'Upload already in progress';
            onError?.(error);
            return null;
        }

        // Cancel any previous (shouldn't happen, but safety)
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        setState({ isUploading: true, progress: 0, error: null });

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('conversation_id', conversationId);

            // Note: XMLHttpRequest would allow progress tracking
            // Using fetch for simplicity in demo
            const response = await fetch('/api/learning/sources', {
                method: 'POST',
                body: formData,
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const data = await response.json();
            setState({ isUploading: false, progress: 100, error: null });
            onSuccess?.(data.source);
            return data.source;

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                setState({ isUploading: false, progress: 0, error: null });
                return null;
            }

            const message = error instanceof Error ? error.message : 'Upload failed';
            setState({ isUploading: false, progress: 0, error: message });
            onError?.(message);
            return null;

        } finally {
            abortControllerRef.current = null;
        }
    }, [conversationId, state.isUploading]);

    /**
     * Cancel upload
     */
    const cancelUpload = useCallback(() => {
        abortControllerRef.current?.abort();
        setState({ isUploading: false, progress: 0, error: null });
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    return {
        ...state,
        uploadFile,
        cancelUpload,
    };
}

// =============================================================================
// useSourcePolling - Poll for processing status updates
// =============================================================================

/**
 * Hook for polling source processing status
 * Polls while status is 'pending' or 'processing'
 */
export function useSourcePolling(
    sourceId: string | null,
    onUpdate?: (source: LearningSourceRow) => void
) {
    const [source, setSource] = useState<LearningSourceRow | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!sourceId) return null;

        try {
            const response = await fetch(`/api/learning/sources/${sourceId}`);

            if (!response.ok) {
                return null;
            }

            const data: ProcessingStatusResponse = await response.json();
            return data.source;
        } catch {
            return null;
        }
    }, [sourceId]);

    const startPolling = useCallback(() => {
        if (intervalRef.current || !sourceId) return;

        setIsPolling(true);

        const poll = async () => {
            const updated = await fetchStatus();

            if (updated) {
                setSource(updated);
                onUpdate?.(updated);

                // Stop polling if completed or failed
                if (updated.status === 'completed' || updated.status === 'failed') {
                    stopPolling();
                }
            }
        };

        // Initial fetch
        poll();

        // Poll every 2 seconds
        intervalRef.current = setInterval(poll, 2000);
    }, [sourceId, fetchStatus, onUpdate]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPolling(false);
    }, []);

    // Start polling when sourceId changes
    useEffect(() => {
        if (sourceId) {
            startPolling();
        }
        return stopPolling;
    }, [sourceId, startPolling, stopPolling]);

    return {
        source,
        isPolling,
        startPolling,
        stopPolling,
        refetch: fetchStatus,
    };
}
