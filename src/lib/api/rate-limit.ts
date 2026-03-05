// =============================================================================
// Rate Limiting - User + IP based rate limiting with Upstash Redis
// =============================================================================

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { getClientIP } from './csrf';
import type { ApiError } from '@/types/chat';

// =============================================================================
// Redis Client (Lazy Initialization)
// =============================================================================

let redis: Redis | null = null;

/**
 * Get or create Redis client
 * Lazy initialization to avoid errors when env vars are not set
 */
function getRedis(): Redis {
    if (!redis) {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!url || !token) {
            throw new Error(
                'Rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
            );
        }

        redis = new Redis({ url, token });
    }
    return redis;
}

// =============================================================================
// Rate Limiter Instances (Lazy Initialization)
// =============================================================================

type RateLimitType = 'chat' | 'upload' | 'youtube' | 'rag' | 'study';

const rateLimiters: Partial<Record<RateLimitType, Ratelimit>> = {};

/**
 * Rate limit configuration per endpoint type
 */
const RATE_LIMIT_CONFIG: Record<RateLimitType, { requests: number; window: string }> = {
    chat: { requests: 30, window: '1 m' },
    upload: { requests: 5, window: '1 m' },
    youtube: { requests: 3, window: '1 m' },
    rag: { requests: 60, window: '1 m' },
    study: { requests: 20, window: '1 m' },
};

/**
 * Get or create rate limiter for a specific type
 */
function getRateLimiter(type: RateLimitType): Ratelimit {
    if (!rateLimiters[type]) {
        const config = RATE_LIMIT_CONFIG[type];
        rateLimiters[type] = new Ratelimit({
            redis: getRedis(),
            limiter: Ratelimit.slidingWindow(config.requests, config.window as `${number} ${'s' | 'm' | 'h' | 'd'}`),
            analytics: true,
            prefix: `ratelimit:${type}`,
        });
    }
    return rateLimiters[type]!;
}

// =============================================================================
// Rate Limit Check
// =============================================================================

/**
 * Check rate limit for a user
 * Uses userId + IP combination to prevent distributed attacks
 * 
 * @param userId - The authenticated user's ID
 * @param type - The type of rate limit to check
 * @returns Error response if rate limited, null if allowed
 * 
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const auth = await requireAuth();
 *   if (!auth.success) return auth.error;
 *   
 *   const rateLimitError = await checkRateLimit(auth.user.id, 'chat');
 *   if (rateLimitError) return rateLimitError;
 *   
 *   // ... handle request
 * }
 * ```
 */
export async function checkRateLimit(
    userId: string,
    type: RateLimitType
): Promise<NextResponse<ApiError> | null> {
    try {
        const ip = await getClientIP();
        const identifier = `${userId}:${ip}`; // Combine userId + IP

        const limiter = getRateLimiter(type);
        const { success, limit, remaining, reset } = await limiter.limit(identifier);

        if (!success) {
            const retryAfter = Math.ceil((reset - Date.now()) / 1000);

            console.warn(`[RateLimit] User ${userId} exceeded ${type} limit`);

            return NextResponse.json<ApiError>(
                {
                    error: 'Rate limit exceeded',
                    code: 'RATE_LIMITED',
                    details: {
                        limit,
                        remaining,
                        retryAfter,
                    },
                },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(retryAfter),
                        'X-RateLimit-Limit': String(limit),
                        'X-RateLimit-Remaining': String(remaining),
                        'X-RateLimit-Reset': String(reset),
                    },
                }
            );
        }

        return null; // Allowed
    } catch (error) {
        // Redis unavailable — fall back to in-memory rate limiting
        console.warn('[RateLimit] Redis unavailable, using in-memory fallback:', error);
        return checkInMemoryFallback(userId, type);
    }
}

// =============================================================================
// In-Memory Fallback (when Redis is unavailable)
// =============================================================================

/** Fallback limit: stricter than Redis since it's per-instance */
const FALLBACK_LIMIT = 10;
const FALLBACK_WINDOW_MS = 60_000; // 1 minute

/** In-memory request timestamps per identifier */
const fallbackStore = new Map<string, number[]>();

/**
 * Simple sliding-window rate limiter using in-memory storage.
 * Only used when Redis connection fails.
 */
function checkInMemoryFallback(
    userId: string,
    type: RateLimitType
): NextResponse<ApiError> | null {
    const key = `fallback:${type}:${userId}`;
    const now = Date.now();
    const windowStart = now - FALLBACK_WINDOW_MS;

    // Get existing timestamps, filter out expired ones
    let timestamps = fallbackStore.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= FALLBACK_LIMIT) {
        console.warn(`[RateLimit] Fallback limit exceeded for ${userId} (${type})`);
        return NextResponse.json<ApiError>(
            {
                error: 'Rate limit exceeded',
                code: 'RATE_LIMITED',
                details: { limit: FALLBACK_LIMIT, remaining: 0, fallback: true },
            },
            { status: 429, headers: { 'Retry-After': '60' } }
        );
    }

    // Record this request
    timestamps.push(now);
    fallbackStore.set(key, timestamps);

    // Periodic cleanup: remove stale entries every ~100 checks
    if (Math.random() < 0.01) {
        fallbackStore.forEach((v: number[], k: string) => {
            const filtered = v.filter((t: number) => t > windowStart);
            if (filtered.length === 0) {
                fallbackStore.delete(k);
            } else {
                fallbackStore.set(k, filtered);
            }
        });
    }

    return null; // Allowed
}

// =============================================================================
// Exports
// =============================================================================

export { type RateLimitType };
