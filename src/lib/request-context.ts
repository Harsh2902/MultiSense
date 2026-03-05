// =============================================================================
// Request Context - AsyncLocalStorage for per-request state
// =============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';

// =============================================================================
// Types
// =============================================================================

export interface RequestContext {
    /** Unique request identifier */
    requestId: string;
    /** Authenticated user ID (set after auth) */
    userId?: string;
    /** Request start time (for duration tracking) */
    startTime: number;
    /** Request path */
    path?: string;
    /** Request method */
    method?: string;
}

// =============================================================================
// Storage
// =============================================================================

const contextStorage = new AsyncLocalStorage<RequestContext>();

// =============================================================================
// Public API
// =============================================================================

/**
 * Run a function within a request context.
 * Creates a new context with a unique requestId and start time.
 */
export function withRequestContext<T>(
    fn: () => T | Promise<T>,
    initial?: Partial<RequestContext>
): T | Promise<T> {
    const ctx: RequestContext = {
        requestId: initial?.requestId || crypto.randomUUID(),
        userId: initial?.userId,
        startTime: initial?.startTime || Date.now(),
        path: initial?.path,
        method: initial?.method,
    };

    return contextStorage.run(ctx, fn);
}

/**
 * Get the current request context, or undefined if not in a request.
 */
export function getRequestContext(): RequestContext | undefined {
    return contextStorage.getStore();
}

/**
 * Get the current request ID, or 'no-request' if not in a request.
 */
export function getRequestId(): string {
    return contextStorage.getStore()?.requestId || 'no-request';
}

/**
 * Set the userId on the current request context (called after auth).
 */
export function setRequestUserId(userId: string): void {
    const ctx = contextStorage.getStore();
    if (ctx) {
        ctx.userId = userId;
    }
}

/**
 * Get elapsed time since request start.
 */
export function getRequestDuration(): number {
    const ctx = contextStorage.getStore();
    if (!ctx) return 0;
    return Date.now() - ctx.startTime;
}
