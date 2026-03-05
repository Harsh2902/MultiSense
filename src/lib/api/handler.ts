// =============================================================================
// API Handler Wrapper - Centralized request handling for all API routes
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { withRequestContext, setRequestUserId, getRequestId, getRequestDuration } from '@/lib/request-context';
import { normalizeError, toApiResponse, type ApiErrorResponse } from '@/lib/errors';
import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

export interface HandlerOptions {
    /** Maximum request duration in ms (default: 30000) */
    timeoutMs?: number;
    /** Skip request logging for noisy endpoints */
    skipLogging?: boolean;
}

export type RouteHandler = (
    request: NextRequest,
    context?: any
) => Promise<NextResponse | Response>;

// =============================================================================
// Handler Wrapper
// =============================================================================

/**
 * Wrap an API route handler with production-grade cross-cutting concerns:
 * - Request context (requestId, userId, timing)
 * - Global timeout enforcement
 * - Error normalization → standard ApiErrorResponse
 * - Structured request/response logging
 * - X-Request-Id header on all responses
 * - Stack trace stripping in production
 */
export function withApiHandler(
    handler: RouteHandler,
    options: HandlerOptions = {}
): RouteHandler {
    const { timeoutMs = 30_000, skipLogging = false } = options;

    return async (request: NextRequest, routeContext?: any) => {
        return withRequestContext(async () => {
            const requestId = getRequestId();
            const method = request.method;
            const path = request.nextUrl.pathname;

            if (!skipLogging) {
                logger.info(`→ ${method} ${path}`, { method, path });
            }

            try {
                // Enforce global timeout
                const result = await withTimeout(
                    handler(request, routeContext),
                    timeoutMs,
                    `Request timeout after ${timeoutMs}ms`
                );

                // Attach requestId header to successful responses
                const response = result instanceof NextResponse
                    ? result
                    : new NextResponse(result.body, {
                        status: result.status,
                        headers: result.headers,
                    });

                response.headers.set('X-Request-Id', requestId);

                if (!skipLogging) {
                    const durationMs = getRequestDuration();
                    logger.withDuration('info', `← ${method} ${path} ${response.status}`, durationMs, {
                        method,
                        path,
                        status: response.status,
                    });
                }

                return response;
            } catch (err) {
                const appError = normalizeError(err);
                const durationMs = getRequestDuration();
                const { body, status, headers } = toApiResponse(appError, requestId);

                // Log error with appropriate severity
                if (appError.isOperational) {
                    logger.warn(`← ${method} ${path} ${status}`, {
                        method,
                        path,
                        code: appError.code,
                        durationMs,
                    });
                } else {
                    logger.error(`← ${method} ${path} ${status}`, err, {
                        method,
                        path,
                        code: appError.code,
                        durationMs,
                    });
                }

                const responseHeaders: Record<string, string> = {
                    'X-Request-Id': requestId,
                    'Content-Type': 'application/json',
                    ...(headers || {}),
                };

                return NextResponse.json<ApiErrorResponse>(body, {
                    status,
                    headers: responseHeaders,
                });
            }
        }, {
            path: request.nextUrl.pathname,
            method: request.method,
        }) as Promise<NextResponse | Response>;
    };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Helper to set userId in request context from within a handler.
 * Call this after auth succeeds.
 */
export { setRequestUserId };

/**
 * Wrap a promise with a timeout.
 */
async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(message));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId!);
    }
}
