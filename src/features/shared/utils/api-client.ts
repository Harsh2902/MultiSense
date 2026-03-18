// =============================================================================
// API Client - Typed fetch wrapper with structured error parsing
// =============================================================================

'use client';

// =============================================================================
// Error Type
// =============================================================================

/**
 * Typed error from API responses.
 * Parses the backend's structured error format:
 * { error: { code, message, requestId, details? } }
 */
export class ApiClientError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly requestId?: string;
    public readonly details?: Record<string, unknown>;
    public readonly isRetryable: boolean;

    constructor(params: {
        message: string;
        code: string;
        statusCode: number;
        requestId?: string;
        details?: Record<string, unknown>;
    }) {
        super(params.message);
        this.name = 'ApiClientError';
        this.code = params.code;
        this.statusCode = params.statusCode;
        this.requestId = params.requestId;
        this.details = params.details;

        // 5xx errors and rate limits are retryable
        this.isRetryable =
            params.statusCode >= 500 ||
            params.statusCode === 429;
    }
}

// =============================================================================
// CSRF Token
// =============================================================================

function getCsrfToken(): string {
    if (typeof document === 'undefined') return '';
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute('content') || '';
}

// =============================================================================
// Base Fetch
// =============================================================================

interface RequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown;
    timeout?: number;
}

/**
 * Type-safe API fetch wrapper.
 * - Automatically adds CSRF token for mutations
 * - Parses structured error responses
 * - Handles network errors and timeouts
 * - Extracts X-Request-Id from responses
 */
export async function apiClient<T>(
    url: string,
    options: RequestOptions = {}
): Promise<T> {
    const { body, timeout = 300000, headers: extraHeaders, ...rest } = options;

    const isGetOrHead = !rest.method ||
        rest.method === 'GET' ||
        rest.method === 'HEAD';

    const headers: Record<string, string> = {
        ...(body !== undefined && !(body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
        ...(!isGetOrHead ? { 'X-CSRF-Token': getCsrfToken() } : {}),
        ...(extraHeaders as Record<string, string> || {}),
    };

    // Build fetch init
    const init: RequestInit = {
        ...rest,
        headers,
        body: body instanceof FormData
            ? body
            : body !== undefined
                ? JSON.stringify(body)
                : undefined,
    };

    // Race against timeout
    const controller = new AbortController();
    init.signal = options.signal || controller.signal;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, init);

        // Extract request ID from response
        const requestId = response.headers.get('X-Request-Id') || undefined;

        // No content
        if (response.status === 204) {
            return undefined as T;
        }

        // Parse response body
        let data: unknown;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        // Handle error responses
        if (!response.ok) {
            // Try to parse structured error
            const errorBody = data as Record<string, unknown>;
            const errorData = errorBody?.error as Record<string, unknown> | undefined;
            const topLevelMessage = typeof errorBody?.message === 'string'
                ? errorBody.message
                : undefined;
            const topLevelCode = typeof errorBody?.code === 'string'
                ? errorBody.code
                : undefined;

            throw new ApiClientError({
                message: (errorData?.message as string)
                    || topLevelMessage
                    || (errorBody?.error as string)
                    || `Request failed with status ${response.status}`,
                code: (errorData?.code as string) || topLevelCode || 'UNKNOWN_ERROR',
                statusCode: response.status,
                requestId: (errorData?.requestId as string) || requestId,
                details: errorData?.details as Record<string, unknown>,
            });
        }

        return data as T;
    } catch (error) {
        // Re-throw ApiClientError as-is
        if (error instanceof ApiClientError) {
            throw error;
        }

        // Handle abort/timeout
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new ApiClientError({
                message: 'Request timed out',
                code: 'TIMEOUT',
                statusCode: 408,
            });
        }

        // Network error
        if (error instanceof TypeError) {
            throw new ApiClientError({
                message: 'Network error — please check your connection',
                code: 'NETWORK_ERROR',
                statusCode: 0,
            });
        }

        // Unknown error
        throw new ApiClientError({
            message: error instanceof Error ? error.message : 'An unexpected error occurred',
            code: 'UNKNOWN_ERROR',
            statusCode: 0,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

// =============================================================================
// Convenience Methods
// =============================================================================

export const api = {
    get: <T>(url: string, options?: RequestOptions) =>
        apiClient<T>(url, { ...options, method: 'GET' }),

    post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
        apiClient<T>(url, { ...options, method: 'POST', body }),

    put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
        apiClient<T>(url, { ...options, method: 'PUT', body }),

    patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
        apiClient<T>(url, { ...options, method: 'PATCH', body }),

    delete: <T>(url: string, options?: RequestOptions) =>
        apiClient<T>(url, { ...options, method: 'DELETE' }),
} as const;

// =============================================================================
// Error Utilities
// =============================================================================

/** Human-readable error messages for common codes */
const ERROR_MESSAGES: Record<string, string> = {
    UNAUTHORIZED: 'You need to sign in to continue.',
    FORBIDDEN: 'You don\'t have permission to do that.',
    NOT_FOUND: 'The requested resource was not found.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    RATE_LIMITED: 'Too many requests. Please wait a moment.',
    CONFLICT: 'This action has already been performed.',
    AI_ERROR: 'The AI service is temporarily unavailable.',
    TIMEOUT: 'The request took too long. Please try again.',
    NETWORK_ERROR: 'Unable to connect. Check your internet connection.',
    INTERNAL_ERROR: 'Something went wrong on our end.',
};

/**
 * Get a user-friendly error message from an ApiClientError.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof ApiClientError) {
        return ERROR_MESSAGES[error.code] || error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'An unexpected error occurred.';
}
