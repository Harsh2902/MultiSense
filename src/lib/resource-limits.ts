// =============================================================================
// Resource Limits - Concurrency control, timeouts, and memory protection
// =============================================================================

import { logger } from '@/lib/logger';

// =============================================================================
// Semaphore - Concurrency Limiter
// =============================================================================

/**
 * Counting semaphore for limiting concurrent operations.
 * Prevents resource exhaustion (e.g., too many OCR tasks or embedding calls).
 */
export class Semaphore {
    private current = 0;
    private queue: Array<() => void> = [];

    constructor(
        private readonly max: number,
        private readonly name: string = 'semaphore'
    ) { }

    /**
     * Acquire a permit. Waits if all permits are in use.
     */
    async acquire(): Promise<void> {
        if (this.current < this.max) {
            this.current++;
            return;
        }

        // Wait for a permit
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.current++;
                resolve();
            });
        });
    }

    /**
     * Release a permit, allowing a waiting caller to proceed.
     */
    release(): void {
        this.current--;
        const next = this.queue.shift();
        if (next) {
            next();
        }
    }

    /**
     * Execute a function with semaphore protection.
     */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    /** Current number of active permits */
    get active(): number { return this.current; }

    /** Number of callers waiting for a permit */
    get waiting(): number { return this.queue.length; }
}

// =============================================================================
// Pre-configured Semaphores
// =============================================================================

/** Maximum parallel OCR tasks (CPU-intensive) */
export const ocrSemaphore = new Semaphore(
    parseInt(process.env.MAX_PARALLEL_OCR || '3', 10),
    'ocr'
);

/** Maximum parallel embedding API calls */
export const embeddingSemaphore = new Semaphore(
    parseInt(process.env.MAX_PARALLEL_EMBEDDINGS || '5', 10),
    'embedding'
);

/** Maximum parallel LLM API calls */
export const llmSemaphore = new Semaphore(
    parseInt(process.env.MAX_PARALLEL_LLM || '4', 10),
    'llm'
);

// =============================================================================
// Timeout Wrapper
// =============================================================================

/**
 * Race a promise against a timeout. Throws on timeout.
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message?: string
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(message || `Operation timed out after ${ms}ms`));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId!);
    }
}

// =============================================================================
// Constants
// =============================================================================

/** Default API request timeout (30 seconds) */
export const API_TIMEOUT_MS = 30_000;

/** Processing job timeout (2 minutes) */
export const PROCESSING_TIMEOUT_MS = 120_000;

/** LLM call timeout (60 seconds) */
export const LLM_TIMEOUT_MS = 60_000;

// =============================================================================
// Memory Check
// =============================================================================

/**
 * Check approximate memory usage. Useful for deciding whether to accept work.
 * Only works in Node.js (not Edge runtime).
 */
export function getMemoryUsage(): { heapUsedMB: number; heapTotalMB: number; rssKB: number } | null {
    try {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const mem = process.memoryUsage();
            return {
                heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
                rssKB: Math.round(mem.rss / 1024),
            };
        }
    } catch {
        // Edge runtime or unavailable
    }
    return null;
}

/**
 * Log resource status for monitoring.
 */
export function logResourceStatus(): void {
    const memory = getMemoryUsage();
    const status = {
        ocr: { active: ocrSemaphore.active, waiting: ocrSemaphore.waiting },
        embedding: { active: embeddingSemaphore.active, waiting: embeddingSemaphore.waiting },
        llm: { active: llmSemaphore.active, waiting: llmSemaphore.waiting },
        memory,
    };

    logger.debug('Resource status', status);
}
