// =============================================================================
// Supabase-Based Queue Processor - Serverless-compatible processing
// =============================================================================

/**
 * SERVERLESS-COMPATIBLE QUEUE ARCHITECTURE
 * 
 * Problem: In-memory queues don't work on Vercel serverless because:
 * - Each function invocation runs in isolation
 * - State is lost between invocations
 * - Concurrent invocations don't share memory
 * 
 * Solution: Use Supabase as the queue (status column already exists):
 * 1. Upload API sets status='pending'
 * 2. processPendingSources() called by:
 *    - Webhook after upload
 *    - Cron job (every 1 min)
 *    - API route triggered by client polling
 * 3. Atomic claim prevents double-processing
 * 4. Status updates tracked in database
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ProcessingStatus, LearningSourceRow } from '@/types/learning';
import { LearningService } from '@/services/learning.service';
import { logger } from '@/lib/logger';
import { trackQueueJob } from '@/lib/metrics';

function logToFile(message: string) {
    try {
        const fs = require('fs');
        const path = require('path');
        const logFile = path.join(process.cwd(), 'youtube-debug.log');
        fs.appendFileSync(logFile, `[Queue] ${new Date().toISOString()}: ${message}\n`);
    } catch { }
}

// =============================================================================
// Configuration
// =============================================================================

export interface ProcessorConfig {
    /** Max sources to process per invocation */
    batchSize: number;
    /** Max processing time before timeout (ms) */
    processingTimeoutMs: number;
    /** Max retry attempts */
    maxRetries: number;
    /** Stale processing threshold - reset if processing for too long (ms) */
    staleThresholdMs: number;
}

const DEFAULT_CONFIG: ProcessorConfig = {
    batchSize: 5,
    processingTimeoutMs: 300000,  // 5 minutes per source
    maxRetries: 3,
    staleThresholdMs: 600000,    // 10 minutes
};

// =============================================================================
// Queue Processor
// =============================================================================

/**
 * Process pending sources from the database
 * 
 * This function is designed to be called from:
 * - API routes (triggered by client after upload)
 * - Cron jobs (periodic cleanup)
 * - Webhooks (if using external triggers)
 * 
 * RACE CONDITION PREVENTION:
 * - Uses atomic UPDATE...WHERE to claim sources
 * - Only one instance can claim a given source
 * - Stale processing detection resets abandoned jobs
 * 
 * @param supabase - Authenticated Supabase client
 * @param userId - User ID to process sources for (optional, all users if not specified)
 * @param config - Processing configuration
 * @returns Processing results
 */
export async function processPendingSources(
    supabase: SupabaseClient<Database>,
    userId?: string,
    config: Partial<ProcessorConfig> = {}
): Promise<ProcessingResult[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const results: ProcessingResult[] = [];

    logToFile(`Starting processPendingSources for user ${userId || 'all'}...`);

    // Force load env vars to ensure API keys (OPENAI, GROQ) are available in worker context
    try {
        const path = require('path');
        const dotenv = require('dotenv');
        const envPath = path.join(process.cwd(), '.env.local');
        dotenv.config({ path: envPath });
        logToFile(`Loaded environment from ${envPath}`);
    } catch (e) {
        logToFile(`Failed to load environment: ${e}`);
    }

    // 1. Reset stale processing jobs (safety net for crashed workers)
    // Uses DB server time via RPC — no JS clock dependency
    await resetStaleProcessing(supabase);

    // 2. Claim pending sources atomically
    const sources = await claimPendingSources(supabase, userId, cfg.batchSize);

    logToFile(`Claimed sources: ${sources.length}`);

    if (sources.length === 0) {
        return results;
    }

    // 3. Process each claimed source
    for (const source of sources) {
        logToFile(`Processing source: ${source.id} (${source.source_type})`);
        const startTime = Date.now();

        try {
            // Process with timeout
            const result = await withTimeout(
                processSource(supabase, source),
                cfg.processingTimeoutMs,
                `Processing timeout after ${cfg.processingTimeoutMs}ms`
            );

            const processingTimeMs = Date.now() - startTime;
            trackQueueJob('process_source', 'completed', processingTimeMs);
            logger.info('Source processed successfully', {
                sourceId: source.id,
                chunksCreated: result.chunks_created,
                processingTimeMs,
            });

            logToFile(`SUCCESS: Source ${source.id} processed in ${processingTimeMs}ms`);

            results.push({
                sourceId: source.id,
                success: result.success,
                chunksCreated: result.chunks_created,
                processingTimeMs,
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const processingTimeMs = Date.now() - startTime;

            logToFile(`FAILURE: Source ${source.id} failed after ${processingTimeMs}ms: ${errorMessage}`);

            trackQueueJob('process_source', 'failed', processingTimeMs);

            // Retry logic: attempts are tracked at the DB level by claim_pending_sources.
            // If attempts < max_attempts, reset to pending for re-claim.
            // The DB column `attempts` is incremented atomically in claim_pending_sources.
            const currentAttempts = (source as { attempts?: number }).attempts ?? 1;
            const maxAttempts = (source as { max_attempts?: number }).max_attempts ?? cfg.maxRetries;

            if (currentAttempts < maxAttempts) {
                logger.warn('Source processing failed, will retry', {
                    sourceId: source.id,
                    attempt: currentAttempts,
                    maxAttempts,
                    error: errorMessage,
                });
                await updateSourceStatus(supabase, source.id, 'pending', {
                    last_error: errorMessage,
                });
            } else {
                logger.error('Source processing permanently failed', error instanceof Error ? error : new Error(errorMessage), {
                    sourceId: source.id,
                    attempts: currentAttempts,
                });
                await updateSourceStatus(supabase, source.id, 'failed', {}, errorMessage);
            }

            results.push({
                sourceId: source.id,
                success: false,
                error: errorMessage,
                processingTimeMs,
            });
        }
    }

    return results;
}

// =============================================================================
// Core Processing
// =============================================================================

/**
 * Process a single source
 */
async function processSource(
    supabase: SupabaseClient<Database>,
    source: LearningSourceRow
): Promise<{ success: boolean; chunks_created: number }> {
    if (source.source_type === 'youtube') {
        const { YouTubeService } = await import('@/services/youtube.service');
        const youtubeService = new YouTubeService(supabase, source.user_id);
        const result = await youtubeService.processVideo(source.id);
        return {
            success: true,
            chunks_created: result.chunksCreated
        };
    }

    const learningService = new LearningService(supabase, source.user_id);
    return learningService.processSource(source.id);
}

/**
 * Claim pending sources atomically
 * Uses UPDATE...RETURNING to claim sources in a single atomic operation
 */
async function claimPendingSources(
    supabase: SupabaseClient<Database>,
    userId: string | undefined,
    limit: number
): Promise<LearningSourceRow[]> {
    // Use RPC for atomic claim operation
    const { data, error } = await supabase.rpc('claim_pending_sources', {
        p_user_id: userId ?? null,
        p_limit: limit,
    } as any);

    if (error) {
        logger.error('Failed to claim sources', error);
        return [];
    }

    return (data ?? []) as LearningSourceRow[];
}

/**
 * Reset sources that have been processing for too long.
 * Uses DB server time via RPC — eliminates JS clock drift vulnerability.
 * Sources that exceed max_attempts are marked 'failed' (dead-lettered).
 */
async function resetStaleProcessing(
    supabase: SupabaseClient<Database>
): Promise<void> {
    const { data, error } = await supabase.rpc('reset_stale_sources');

    if (error) {
        logger.error('Failed to reset stale sources', error);
    } else if (data && data > 0) {
        logger.warn(`Reset ${data} stale source(s)`, { resetCount: data });
    }
}

/**
 * Update source status with metadata
 */
async function updateSourceStatus(
    supabase: SupabaseClient<Database>,
    sourceId: string,
    status: ProcessingStatus,
    metadataUpdates: Record<string, unknown>,
    errorMessage?: string
): Promise<void> {
    // Get current metadata
    const { data: current } = await supabase
        .from('learning_sources')
        .select('metadata')
        .eq('id', sourceId)
        .single();

    const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
        metadata: {
            ...((current?.metadata as Record<string, unknown>) ?? {}),
            ...metadataUpdates,
        },
    };

    if (errorMessage !== undefined) {
        updates['error_message'] = errorMessage;
    }

    await supabase
        .from('learning_sources')
        .update(updates)
        .eq('id', sourceId);
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle!);
        return result;
    } catch (error) {
        clearTimeout(timeoutHandle!);
        throw error;
    }
}

// =============================================================================
// Types
// =============================================================================

export interface ProcessingResult {
    sourceId: string;
    success: boolean;
    chunksCreated?: number;
    error?: string;
    processingTimeMs: number;
}
