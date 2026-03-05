// =============================================================================
// Graceful Shutdown Manager
// =============================================================================

import { logger } from '@/lib/logger';
import { flushMetrics } from '@/lib/metrics';

// =============================================================================
// State
// =============================================================================

let isShuttingDown = false;
const shutdownCallbacks: Array<{ name: string; fn: () => Promise<void> }> = [];

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if the application is shutting down.
 * Use this to reject new work during shutdown.
 */
export function isShutdown(): boolean {
    return isShuttingDown;
}

/**
 * Register a callback to be called during graceful shutdown.
 * Callbacks are executed in order of registration.
 */
export function onShutdown(name: string, fn: () => Promise<void>): void {
    shutdownCallbacks.push({ name, fn });
}

/**
 * Initiate graceful shutdown.
 * Runs all registered callbacks, then exits.
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Shutdown initiated (${signal})`, { signal });

    // Flush metrics before shutdown
    try {
        flushMetrics();
    } catch {
        // Best effort
    }

    // Execute shutdown callbacks
    for (const { name, fn } of shutdownCallbacks) {
        try {
            logger.info(`Shutdown: ${name}`);
            await fn();
        } catch (error) {
            logger.error(`Shutdown callback failed: ${name}`, error);
        }
    }

    logger.info('Shutdown complete');

    // Exit after a brief delay to allow log flushing
    setTimeout(() => {
        process.exit(0);
    }, 500);
}

// =============================================================================
// Signal Handlers
// =============================================================================

/**
 * Install signal handlers. Call once at application boot.
 * Safe to call multiple times (idempotent).
 */
let handlersInstalled = false;

export function installShutdownHandlers(): void {
    if (handlersInstalled) return;
    handlersInstalled = true;

    if (typeof process !== 'undefined') {
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
            gracefulShutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
        });

        logger.debug('Shutdown handlers installed');
    }
}
