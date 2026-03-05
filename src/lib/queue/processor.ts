// =============================================================================
// Prisma-Based Queue Processor - Serverless-compatible processing
// =============================================================================

/**
 * SERVERLESS-COMPATIBLE QUEUE ARCHITECTURE
 * 
 * Problem: In-memory queues don't work on Vercel serverless because:
 * - Each function invocation runs in isolation
 * - State is lost between invocations
 * - Concurrent invocations don't share memory
 * 
 * Solution: Use Postgres (Prisma) as the queue (status column already exists):
 * 1. Upload API sets status='pending'
 * 2. processPendingSources() called by:
 *    - Webhook after upload
 *    - Cron job (every 1 min)
 *    - API route triggered by client polling
 * 3. Atomic claim prevents double-processing
 * 4. Status updates tracked in database
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
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

export async function processPendingSources(
    userId?: string,
    config: Partial<ProcessorConfig> = {}
): Promise<ProcessingResult[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const results: ProcessingResult[] = [];

    logToFile(`Starting processPendingSources for user ${userId || 'all'}...`);

    // Force load env vars
    try {
        const path = require('path');
        const dotenv = require('dotenv');
        const envPath = path.join(process.cwd(), '.env.local');
        dotenv.config({ path: envPath });
    } catch (e) {
        logToFile(`Failed to load environment: ${e}`);
    }

    // 1. Reset stale processing jobs
    await resetStaleProcessing(cfg.staleThresholdMs);

    // 2. Claim pending sources atomically
    const sources = await claimPendingSources(userId, cfg.batchSize);

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
                processSource(source),
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

            const md = source.metadata as Record<string, any>;
            const currentAttempts = md?.retry_count ?? 1;
            const maxAttempts = cfg.maxRetries;

            if (currentAttempts < maxAttempts) {
                logger.warn('Source processing failed, will retry', {
                    sourceId: source.id,
                    attempt: currentAttempts,
                    maxAttempts,
                    error: errorMessage,
                });
                await updateSourceStatus(source.id, 'pending', {
                    last_error: errorMessage,
                    retry_count: currentAttempts + 1
                });
            } else {
                logger.error('Source processing permanently failed', error instanceof Error ? error : new Error(errorMessage), {
                    sourceId: source.id,
                    attempts: currentAttempts,
                });
                await updateSourceStatus(source.id, 'failed', { retry_count: currentAttempts }, errorMessage);
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

async function processSource(
    source: LearningSourceRow
): Promise<{ success: boolean; chunks_created: number }> {
    if (source.source_type === 'youtube') {
        const { YouTubeService } = await import('@/services/youtube.service');
        const youtubeService = new YouTubeService(source.user_id);
        const result = await youtubeService.processVideo(source.id);
        return {
            success: true,
            chunks_created: result.chunksCreated
        };
    }

    const learningService = new LearningService(source.user_id);
    return learningService.processSource(source.id);
}

async function claimPendingSources(
    userId: string | undefined,
    limit: number
): Promise<LearningSourceRow[]> {
    try {
        // Raw PG query to atomically UPDATE returning claims
        let query = `
            UPDATE "LearningSource"
            SET status = 'processing', updated_at = NOW()
            WHERE id IN (
                SELECT id FROM "LearningSource"
                WHERE status = 'pending'
                ${userId ? `AND user_id = '${userId.replace(/'/g, "''")}'` : ''}
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT ${limit}
            )
            RETURNING *;
        `;

        const data = await prisma.$queryRawUnsafe<any[]>(query);
        return data.map(d => ({ ...d, created_at: d.created_at.toISOString(), updated_at: d.updated_at.toISOString() })) as unknown as LearningSourceRow[];
    } catch (error) {
        logger.error('Failed to claim sources', error as Error);
        return [];
    }
}

async function resetStaleProcessing(
    staleThresholdMs: number
): Promise<void> {
    try {
        const thresholdDate = new Date(Date.now() - staleThresholdMs);

        const result = await prisma.learningSource.updateMany({
            where: {
                status: 'processing',
                updated_at: {
                    lt: thresholdDate
                }
            },
            data: {
                status: 'pending'
            }
        });

        if (result.count > 0) {
            logger.warn(`Reset ${result.count} stale source(s)`, { resetCount: result.count });
        }
    } catch (error) {
        logger.error('Failed to reset stale sources', error as Error);
    }
}

async function updateSourceStatus(
    sourceId: string,
    status: ProcessingStatus,
    metadataUpdates: Record<string, unknown>,
    errorMessage?: string
): Promise<void> {
    const current = await prisma.learningSource.findUnique({
        where: { id: sourceId },
        select: { metadata: true }
    });

    const updates: Prisma.LearningSourceUpdateInput = {
        status,
        metadata: {
            ...((current?.metadata as Record<string, unknown>) ?? {}),
            ...metadataUpdates,
        } as Prisma.JsonObject,
    };

    if (errorMessage !== undefined) {
        updates.error_message = errorMessage;
    }

    await prisma.learningSource.update({
        where: { id: sourceId },
        data: updates
    });
}

// =============================================================================
// Utilities
// =============================================================================

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

export interface ProcessingResult {
    sourceId: string;
    success: boolean;
    chunksCreated?: number;
    error?: string;
    processingTimeMs: number;
}
