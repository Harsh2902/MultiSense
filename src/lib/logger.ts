// =============================================================================
// Structured Logger - JSON logging with levels and request context
// =============================================================================

import { getRequestContext } from './request-context';

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    requestId?: string;
    userId?: string;
    data?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        code?: string;
        stack?: string;
    };
    durationMs?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const CURRENT_LOG_LEVEL: LogLevel =
    (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// =============================================================================
// Core Logger
// =============================================================================

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

function formatError(err: unknown): LogEntry['error'] | undefined {
    if (!err) return undefined;
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            code: (err as Error & { code?: string }).code,
            stack: IS_PRODUCTION ? undefined : err.stack,
        };
    }
    return { name: 'Unknown', message: String(err) };
}

function emit(entry: LogEntry): void {
    if (IS_PRODUCTION) {
        // JSON to stdout for log aggregators
        const output = JSON.stringify(entry);
        if (entry.level === 'error') {
            process.stderr.write(output + '\n');
        } else {
            process.stdout.write(output + '\n');
        }
    } else {
        // Human-readable for development
        const prefix = `[${entry.level.toUpperCase()}]`;
        const reqId = entry.requestId ? ` [${entry.requestId.slice(0, 8)}]` : '';
        const duration = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : '';
        const base = `${prefix}${reqId} ${entry.message}${duration}`;

        if (entry.level === 'error') {
            console.error(base, entry.error || '', entry.data || '');
        } else if (entry.level === 'warn') {
            console.warn(base, entry.data || '');
        } else {
            console.log(base, entry.data || '');
        }
    }
}

function log(
    level: LogLevel,
    message: string,
    options?: {
        data?: Record<string, unknown>;
        error?: unknown;
        durationMs?: number;
        requestId?: string;
        userId?: string;
    }
): void {
    if (!shouldLog(level)) return;

    // Try to get request context if not explicitly provided
    let requestId = options?.requestId;
    let userId = options?.userId;
    if (!requestId || !userId) {
        try {
            const ctx = getRequestContext();
            if (ctx) {
                requestId = requestId || ctx.requestId;
                userId = userId || ctx.userId;
            }
        } catch {
            // No context available, that's fine
        }
    }

    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        requestId,
        userId,
        data: options?.data,
        error: formatError(options?.error),
        durationMs: options?.durationMs,
    };

    emit(entry);
}

// =============================================================================
// Public API
// =============================================================================

export const logger = {
    debug: (message: string, data?: Record<string, unknown>) =>
        log('debug', message, { data }),

    info: (message: string, data?: Record<string, unknown>) =>
        log('info', message, { data }),

    warn: (message: string, data?: Record<string, unknown>) =>
        log('warn', message, { data }),

    error: (message: string, error?: unknown, data?: Record<string, unknown>) =>
        log('error', message, { error, data }),

    /** Log with explicit duration */
    withDuration: (level: LogLevel, message: string, durationMs: number, data?: Record<string, unknown>) =>
        log(level, message, { durationMs, data }),
};

// =============================================================================
// Scoped Logger (for request context)
// =============================================================================

export interface RequestLogger {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, error?: unknown, data?: Record<string, unknown>) => void;
    withDuration: (level: LogLevel, message: string, durationMs: number, data?: Record<string, unknown>) => void;
}

/**
 * Create a logger scoped to a specific request.
 */
export function createRequestLogger(requestId: string, userId?: string): RequestLogger {
    return {
        debug: (message, data) => log('debug', message, { requestId, userId, data }),
        info: (message, data) => log('info', message, { requestId, userId, data }),
        warn: (message, data) => log('warn', message, { requestId, userId, data }),
        error: (message, error, data) => log('error', message, { requestId, userId, error, data }),
        withDuration: (level, message, durationMs, data) =>
            log(level, message, { requestId, userId, durationMs, data }),
    };
}
