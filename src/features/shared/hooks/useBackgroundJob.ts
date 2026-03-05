// =============================================================================
// useBackgroundJob - Generic polling abstraction with exponential backoff
// =============================================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

type JobStatus = 'idle' | 'polling' | 'completed' | 'failed' | 'timeout';

interface UseBackgroundJobOptions<T> {
    /** Job identifier — polling starts when non-null */
    jobId: string | null;
    /** Fetch function for the job status */
    fetchJob: (id: string) => Promise<T>;
    /** Check if the job is complete */
    isComplete: (data: T) => boolean;
    /** Check if the job has failed */
    isFailed: (data: T) => boolean;
    /** Called when job completes */
    onComplete?: (data: T) => void;
    /** Called when job fails */
    onError?: (error: Error) => void;
    /** Called on each poll with updated data */
    onUpdate?: (data: T) => void;
    /** Initial poll interval in ms (default: 2000) */
    initialInterval?: number;
    /** Maximum poll interval in ms (default: 10000) */
    maxInterval?: number;
    /** Maximum total polling time in ms (default: 5 minutes) */
    maxPollTime?: number;
    /** Backoff multiplier (default: 1.5) */
    backoffFactor?: number;
}

interface UseBackgroundJobResult<T> {
    /** Current polling status */
    status: JobStatus;
    /** Latest fetched data */
    data: T | null;
    /** Error message if failed */
    error: string | null;
    /** Manually restart polling */
    restart: () => void;
    /** Stop polling */
    stop: () => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Generic background job polling hook.
 *
 * Features:
 * - Exponential backoff (2s → 3s → 4.5s → 6.75s → max 10s)
 * - Auto-stop on completed/failed
 * - Auto-stop after maxPollTime
 * - Cleanup on unmount
 *
 * Used for file ingestion, YouTube processing, quiz generation.
 */
export function useBackgroundJob<T>({
    jobId,
    fetchJob,
    isComplete,
    isFailed,
    onComplete,
    onError,
    onUpdate,
    initialInterval = 2000,
    maxInterval = 10000,
    maxPollTime = 5 * 60 * 1000,
    backoffFactor = 1.5,
}: UseBackgroundJobOptions<T>): UseBackgroundJobResult<T> {
    const [status, setStatus] = useState<JobStatus>('idle');
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);

    const intervalRef = useRef(initialInterval);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number>(0);
    const activeRef = useRef(false);

    const cleanup = useCallback(() => {
        activeRef.current = false;
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const poll = useCallback(async () => {
        if (!jobId || !activeRef.current) return;

        // Check timeout
        if (Date.now() - startTimeRef.current > maxPollTime) {
            setStatus('timeout');
            setError('Polling timed out');
            cleanup();
            return;
        }

        try {
            const result = await fetchJob(jobId);
            setData(result);
            onUpdate?.(result);

            if (isComplete(result)) {
                setStatus('completed');
                onComplete?.(result);
                cleanup();
                return;
            }

            if (isFailed(result)) {
                setStatus('failed');
                setError('Job failed');
                onError?.(new Error('Job failed'));
                cleanup();
                return;
            }

            // Schedule next poll with backoff
            intervalRef.current = Math.min(
                intervalRef.current * backoffFactor,
                maxInterval
            );

            if (activeRef.current) {
                timerRef.current = setTimeout(poll, intervalRef.current);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Polling error';
            setStatus('failed');
            setError(errorMsg);
            onError?.(err instanceof Error ? err : new Error(errorMsg));
            cleanup();
        }
    }, [jobId, fetchJob, isComplete, isFailed, onComplete, onError, onUpdate, maxPollTime, maxInterval, backoffFactor, cleanup]);

    const start = useCallback(() => {
        cleanup();
        setStatus('polling');
        setError(null);
        intervalRef.current = initialInterval;
        startTimeRef.current = Date.now();
        activeRef.current = true;
        poll();
    }, [cleanup, initialInterval, poll]);

    // Start polling when jobId changes
    useEffect(() => {
        if (jobId) {
            start();
        } else {
            cleanup();
            setStatus('idle');
            setData(null);
            setError(null);
        }

        return cleanup;
    }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        status,
        data,
        error,
        restart: start,
        stop: cleanup,
    };
}
