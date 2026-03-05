// =============================================================================
// Idempotency Utilities - Prevent duplicate operations
// =============================================================================

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a deterministic idempotency key from input parts.
 * Used to prevent duplicate operations (quiz submissions, file processing, etc.)
 */
export function generateIdempotencyKey(...parts: string[]): string {
    const input = parts.join(':');
    return createHash('sha256').update(input).digest('hex');
}

// =============================================================================
// Check & Execute
// =============================================================================

interface IdempotencyResult<T> {
    /** Whether this was a new execution or a cached result */
    isNew: boolean;
    /** The result of the operation */
    result: T;
}

/**
 * Execute a function with idempotency protection using the background_jobs table.
 *
 * If an operation with the same idempotency key has already completed,
 * the cached result is returned without re-execution.
 *
 * @param supabase - Supabase client
 * @param key - Unique idempotency key for this operation
 * @param type - Job type identifier
 * @param fn - Function to execute if not already completed
 * @returns IdempotencyResult with isNew flag and result
 */
export async function withIdempotency<T>(
    supabase: SupabaseClient,
    key: string,
    type: string,
    fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
    // 1. Check if already completed
    const { data: existing } = await supabase
        .from('background_jobs')
        .select('status, payload')
        .eq('idempotency_key', key)
        .single();

    if (existing?.status === 'completed') {
        logger.debug('Idempotent operation already completed', { key, type });
        return {
            isNew: false,
            result: existing.payload?.result as T,
        };
    }

    if (existing?.status === 'processing') {
        logger.warn('Idempotent operation already in progress', { key, type });
        throw new Error(`Operation already in progress: ${type}`);
    }

    // 2. Create or update the job record
    const { error: insertError } = await supabase
        .from('background_jobs')
        .upsert(
            {
                type,
                idempotency_key: key,
                status: 'processing',
                payload: {},
                started_at: new Date().toISOString(),
            },
            { onConflict: 'idempotency_key' }
        );

    if (insertError) {
        logger.error('Failed to claim idempotent job', insertError, { key, type });
        throw insertError;
    }

    // 3. Execute the operation
    try {
        const result = await fn();

        // 4. Mark as completed with result
        await supabase
            .from('background_jobs')
            .update({
                status: 'completed',
                payload: { result },
                completed_at: new Date().toISOString(),
            })
            .eq('idempotency_key', key);

        return { isNew: true, result };
    } catch (error) {
        // 5. Mark as failed
        await supabase
            .from('background_jobs')
            .update({
                status: 'failed',
                last_error: error instanceof Error ? error.message : String(error),
            })
            .eq('idempotency_key', key);

        throw error;
    }
}

/**
 * Check if an operation has already been completed.
 * Useful for quick checks before starting expensive work.
 */
export async function checkIdempotency(
    supabase: SupabaseClient,
    key: string
): Promise<{ completed: boolean; result?: unknown }> {
    const { data } = await supabase
        .from('background_jobs')
        .select('status, payload')
        .eq('idempotency_key', key)
        .single();

    if (data?.status === 'completed') {
        return { completed: true, result: data.payload?.result };
    }

    return { completed: false };
}
