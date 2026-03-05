// =============================================================================
// Metrics - Lightweight observability for LLM, embedding, RAG, and queue ops
// =============================================================================

import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

interface MetricEntry {
    count: number;
    totalDurationMs: number;
    minDurationMs: number;
    maxDurationMs: number;
    lastRecorded: number;
}

interface LLMMetric {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    timestamp: number;
}

// =============================================================================
// In-Memory Counters
// =============================================================================

const operationMetrics = new Map<string, MetricEntry>();
const recentLLMCalls: LLMMetric[] = [];
const MAX_RECENT = 100;

// =============================================================================
// Duration Tracking
// =============================================================================

/**
 * Measure the duration of an async operation and record metrics.
 */
export async function trackDuration<T>(
    name: string,
    fn: () => Promise<T>
): Promise<T> {
    const start = performance.now();
    try {
        const result = await fn();
        const durationMs = performance.now() - start;
        recordMetric(name, durationMs);
        return result;
    } catch (error) {
        const durationMs = performance.now() - start;
        recordMetric(`${name}.error`, durationMs);
        throw error;
    }
}

function recordMetric(name: string, durationMs: number): void {
    const existing = operationMetrics.get(name);
    if (existing) {
        existing.count += 1;
        existing.totalDurationMs += durationMs;
        existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
        existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
        existing.lastRecorded = Date.now();
    } else {
        operationMetrics.set(name, {
            count: 1,
            totalDurationMs: durationMs,
            minDurationMs: durationMs,
            maxDurationMs: durationMs,
            lastRecorded: Date.now(),
        });
    }
}

// =============================================================================
// Domain-Specific Trackers
// =============================================================================

/**
 * Track an LLM API call with token usage.
 */
export function trackLLMCall(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    durationMs: number
): void {
    const metric: LLMMetric = {
        provider,
        model,
        inputTokens,
        outputTokens,
        durationMs,
        timestamp: Date.now(),
    };

    recentLLMCalls.push(metric);
    if (recentLLMCalls.length > MAX_RECENT) {
        recentLLMCalls.shift();
    }

    recordMetric(`llm.${provider}.${model}`, durationMs);

    logger.debug('LLM call completed', {
        provider,
        model,
        inputTokens,
        outputTokens,
        durationMs: Math.round(durationMs),
    });
}

/**
 * Track an embedding batch operation.
 */
export function trackEmbeddingBatch(count: number, durationMs: number): void {
    recordMetric('embedding.batch', durationMs);
    logger.debug('Embedding batch completed', {
        count,
        durationMs: Math.round(durationMs),
        perItemMs: Math.round(durationMs / Math.max(count, 1)),
    });
}

/**
 * Track a RAG retrieval operation.
 */
export function trackRAGRetrieval(chunksReturned: number, durationMs: number): void {
    recordMetric('rag.retrieval', durationMs);
    logger.debug('RAG retrieval completed', {
        chunksReturned,
        durationMs: Math.round(durationMs),
    });
}

/**
 * Track a background queue job.
 */
export function trackQueueJob(
    type: string,
    status: 'completed' | 'failed',
    durationMs: number
): void {
    recordMetric(`queue.${type}.${status}`, durationMs);
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Get a snapshot of all metrics for health/monitoring endpoints.
 */
export function getMetricsSnapshot(): Record<string, {
    count: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
}> {
    const snapshot: Record<string, { count: number; avgMs: number; minMs: number; maxMs: number }> = {};

    for (const [name, entry] of Array.from(operationMetrics.entries())) {
        snapshot[name] = {
            count: entry.count,
            avgMs: Math.round(entry.totalDurationMs / entry.count),
            minMs: Math.round(entry.minDurationMs),
            maxMs: Math.round(entry.maxDurationMs),
        };
    }

    return snapshot;
}

/**
 * Get recent LLM call metrics.
 */
export function getRecentLLMMetrics(): LLMMetric[] {
    return [...recentLLMCalls];
}

/**
 * Flush metrics summary to logs. Call periodically or at shutdown.
 */
export function flushMetrics(): void {
    const snapshot = getMetricsSnapshot();
    if (Object.keys(snapshot).length === 0) return;

    logger.info('Metrics flush', { metrics: snapshot });

    // Calculate total LLM token usage
    const totalTokens = recentLLMCalls.reduce(
        (acc, m) => ({
            input: acc.input + m.inputTokens,
            output: acc.output + m.outputTokens,
        }),
        { input: 0, output: 0 }
    );

    if (totalTokens.input > 0 || totalTokens.output > 0) {
        logger.info('LLM token usage summary', {
            recentCalls: recentLLMCalls.length,
            totalInputTokens: totalTokens.input,
            totalOutputTokens: totalTokens.output,
        });
    }
}
