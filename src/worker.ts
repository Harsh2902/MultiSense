// =============================================================================
// Standalone Worker Process — Background Queue Processor
// =============================================================================
//
// This is a standalone Node.js script that runs OUTSIDE of Next.js.
// It polls `learning_sources` for pending jobs and processes them.
//
// Usage:
//   npx tsx src/worker.ts
//
// Environment:
//   Requires DATABASE_URL, etc.
//   See .env.example for the full list.
//
// =============================================================================

import { processPendingSources } from '@/lib/queue/processor';
import { validateAllEnvVars } from '@/config/env';
import { installShutdownHandlers, isShutdown } from '@/lib/shutdown';
import { flushMetrics } from '@/lib/metrics';
import { logger } from '@/lib/logger';

// =============================================================================
// Configuration
// =============================================================================

const POLL_BASE_MS = parseInt(process.env.WORKER_POLL_BASE_MS || '2000', 10);
const POLL_MAX_MS = parseInt(process.env.WORKER_POLL_MAX_MS || '30000', 10);
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE || '5', 10);
const HEARTBEAT_INTERVAL_MS = 60_000; // Log heartbeat every 60s
const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;

// =============================================================================
// Poll Loop with Exponential Backoff
// =============================================================================

async function runWorker(): Promise<void> {
    // Boot validation
    const envResult = validateAllEnvVars();
    if (!envResult.valid) {
        logger.error('Worker boot failed: missing required environment variables', undefined, {
            missing: envResult.missing,
        });
        process.exit(1);
    }

    // Install shutdown handlers
    installShutdownHandlers();

    let currentInterval = POLL_BASE_MS;
    let totalProcessed = 0;
    let totalFailed = 0;
    let lastHeartbeat = Date.now();

    logger.info(`Worker starting`, {
        workerId: WORKER_ID,
        pollBaseMs: POLL_BASE_MS,
        pollMaxMs: POLL_MAX_MS,
        batchSize: BATCH_SIZE,
    });

    // Main loop
    while (!isShutdown()) {
        try {
            const results = await processPendingSources(undefined, {
                batchSize: BATCH_SIZE,
            });

            if (results.length > 0) {
                // Jobs found — reset to base interval
                currentInterval = POLL_BASE_MS;

                const succeeded = results.filter(r => r.success).length;
                const failed = results.length - succeeded;
                totalProcessed += succeeded;
                totalFailed += failed;

                logger.info(`Processed ${results.length} jobs`, {
                    succeeded,
                    failed,
                    totalProcessed,
                    totalFailed,
                });
            } else {
                // No jobs — exponential backoff
                currentInterval = Math.min(currentInterval * 2, POLL_MAX_MS);
            }

            // Heartbeat log
            if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
                lastHeartbeat = Date.now();
                logger.info('Worker heartbeat', {
                    workerId: WORKER_ID,
                    totalProcessed,
                    totalFailed,
                    currentIntervalMs: currentInterval,
                    uptimeSeconds: Math.round(process.uptime()),
                });

                // Periodic metrics flush
                flushMetrics();
            }
        } catch (error) {
            logger.error('Worker poll cycle error', error, {
                workerId: WORKER_ID,
            });

            // Back off on errors too
            currentInterval = Math.min(currentInterval * 2, POLL_MAX_MS);
        }

        // Wait before next poll (interruptible by shutdown)
        if (!isShutdown()) {
            await sleep(currentInterval);
        }
    }

    // Shutdown: flush metrics one last time
    logger.info('Worker shutting down', {
        workerId: WORKER_ID,
        totalProcessed,
        totalFailed,
    });
    flushMetrics();
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Entry Point
// =============================================================================

runWorker().catch(error => {
    logger.error('Worker fatal error', error);
    process.exit(1);
});
