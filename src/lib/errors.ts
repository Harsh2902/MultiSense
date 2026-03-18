// =============================================================================
// Centralized Error System - Typed errors for the entire application
// =============================================================================

import { AIProviderError } from '@/types/ai.types';

// =============================================================================
// Base Error
// =============================================================================

/**
 * Base application error.
 * All custom errors extend this. Only operational errors are shown to clients.
 */
export class AppError extends Error {
    /** Machine-readable error code (e.g. 'VALIDATION_ERROR', 'NOT_FOUND') */
    readonly code: string;
    /** HTTP status code */
    readonly statusCode: number;
    /** Additional structured details (safe to expose to client) */
    readonly details?: unknown;
    /** If true, this is an expected error (bad input, not found, etc.) */
    readonly isOperational: boolean;

    constructor(
        message: string,
        code: string,
        statusCode: number,
        options?: { details?: unknown; isOperational?: boolean; cause?: Error }
    ) {
        super(message, { cause: options?.cause });
        this.name = 'AppError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = options?.details;
        this.isOperational = options?.isOperational ?? true;
    }
}

// =============================================================================
// Specific Error Types
// =============================================================================

export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 'VALIDATION_ERROR', 400, { details });
        this.name = 'ValidationError';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource = 'Resource', id?: string) {
        const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
        super(msg, 'NOT_FOUND', 404);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 'CONFLICT', 409);
        this.name = 'ConflictError';
    }
}

export class RateLimitedError extends AppError {
    readonly retryAfterMs?: number;

    constructor(retryAfterMs?: number) {
        super('Rate limit exceeded', 'RATE_LIMITED', 429, {
            details: retryAfterMs ? { retryAfterMs } : undefined,
        });
        this.name = 'RateLimitedError';
        this.retryAfterMs = retryAfterMs;
    }
}

export class BudgetExceededError extends AppError {
    constructor(budget: { used: number; budget: number; remaining: number }) {
        super('Daily token budget exceeded', 'BUDGET_EXCEEDED', 429, {
            details: {
                used: budget.used,
                budget: budget.budget,
                remaining: budget.remaining,
            },
        });
        this.name = 'BudgetExceededError';
    }
}

export class ExternalServiceError extends AppError {
    readonly service: string;

    constructor(service: string, cause?: Error) {
        super(
            `External service error: ${service}`,
            'EXTERNAL_SERVICE_ERROR',
            502,
            { isOperational: true, cause }
        );
        this.name = 'ExternalServiceError';
        this.service = service;
    }
}

export class InternalError extends AppError {
    constructor(message = 'Internal server error', cause?: Error) {
        super(message, 'INTERNAL_ERROR', 500, {
            isOperational: false,
            cause,
        });
        this.name = 'InternalError';
    }
}

export class RequestTimeoutError extends AppError {
    constructor(message = 'Request timed out while processing') {
        super(message, 'TIMEOUT', 504);
        this.name = 'RequestTimeoutError';
    }
}

// =============================================================================
// Error Normalizer
// =============================================================================

/**
 * Convert any thrown value into an AppError.
 * Handles: AppError, AIProviderError, Zod errors, Supabase errors, plain Error, unknown.
 */
export function normalizeError(err: unknown): AppError {
    // Already an AppError
    if (err instanceof AppError) {
        return err;
    }

    // AI Provider errors (including subclasses like ProviderUnavailableError)
    if (err instanceof AIProviderError) {
        if (err.code === 'RATE_LIMIT' || err.code === 'RATE_LIMITED') {
            return new RateLimitedError();
        }
        if (err.code === 'TOKEN_LIMIT') {
            return new ValidationError(err.message, { provider: err.provider });
        }
        return new ExternalServiceError(
            err.provider || 'ai',
            err
        );
    }

    // AI provider-like errors from other module instances / boundaries
    if (err instanceof Error && 'provider' in err && 'code' in err) {
        const aiErr = err as Error & { code?: string; provider?: string };
        if (aiErr.code === 'RATE_LIMIT' || aiErr.code === 'RATE_LIMITED') {
            return new RateLimitedError();
        }
        if (aiErr.code === 'TOKEN_LIMIT') {
            return new ValidationError(aiErr.message, { provider: aiErr.provider });
        }
        if (aiErr.provider) {
            return new ExternalServiceError(aiErr.provider, aiErr);
        }
    }

    // Study tool errors
    if (err instanceof Error && err.name === 'StudyToolError') {
        const studyErr = err as Error & { code?: string };
        const code = studyErr.code || 'STUDY_ERROR';
        if (code === 'INSUFFICIENT_CONTEXT' || code === 'TOKEN_OVERFLOW') {
            return new ValidationError(studyErr.message, { code });
        }
        if (code === 'CONCURRENT_GENERATION') {
            return new ConflictError(studyErr.message);
        }
        if (code === 'RATE_LIMITED') {
            return new RateLimitedError();
        }
        if (code === 'NOT_FOUND') {
            return new NotFoundError(studyErr.message);
        }
        return new AppError(studyErr.message, code, 400);
    }

    // YouTube errors
    if (err instanceof Error && err.name === 'YouTubeError') {
        const ytErr = err as Error & { code: string };
        if (ytErr.code === 'DUPLICATE' || ytErr.code === 'PROCESSING_CONFLICT') {
            return new ConflictError(ytErr.message);
        }
        return new ValidationError(ytErr.message, { code: ytErr.code });
    }

    // Zod validation errors
    if (err instanceof Error && err.name === 'ZodError') {
        const zodErr = err as Error & { flatten?: () => unknown };
        return new ValidationError(
            'Validation failed',
            zodErr.flatten ? zodErr.flatten() : undefined
        );
    }

    // Supabase/Postgres errors
    if (err instanceof Error && 'code' in err) {
        const pgErr = err as Error & { code: string; details?: string };
        if (pgErr.code === '23505') {
            return new ConflictError('Duplicate entry: ' + (pgErr.details || pgErr.message));
        }
        if (pgErr.code === '23503') {
            return new NotFoundError('Referenced resource');
        }
        if (pgErr.code === 'PGRST116') {
            return new NotFoundError();
        }
    }

    // Generic Error
    if (err instanceof Error) {
        if (err.message.toLowerCase().includes('request timeout')) {
            return new RequestTimeoutError();
        }
        return new InternalError(err.message, err);
    }

    // Unknown
    return new InternalError(String(err));
}

// =============================================================================
// API Response Builder
// =============================================================================

/** Standard API error response shape */
export interface ApiErrorResponse {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
}

/**
 * Convert an AppError to a client-safe API response body.
 * Never leaks stack traces or internal details for non-operational errors.
 */
export function toApiResponse(err: AppError, requestId: string): {
    body: ApiErrorResponse;
    status: number;
    headers?: Record<string, string>;
} {
    const body: ApiErrorResponse = {
        code: err.code,
        message: err.isOperational ? err.message : 'Internal server error',
        requestId,
    };

    // Only include details for operational errors
    if (err.isOperational && err.details) {
        body.details = err.details;
    }

    const headers: Record<string, string> = {};
    if (err instanceof RateLimitedError && err.retryAfterMs) {
        headers['Retry-After'] = String(Math.ceil(err.retryAfterMs / 1000));
    }

    return {
        body,
        status: err.statusCode,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
}
