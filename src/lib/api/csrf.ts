// =============================================================================
// CSRF Protection - Origin validation for mutation endpoints
// =============================================================================

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { ApiError } from '@/types/chat';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get allowed origins from environment
 * In production, should only allow the app's domain
 */
function getAllowedOrigins(): string[] {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origins: string[] = [];

    if (appUrl) {
        origins.push(appUrl);
    }

    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:3000');
        origins.push('http://127.0.0.1:3000');
    }

    return origins;
}

// =============================================================================
// CSRF Verification
// =============================================================================

/**
 * Verify CSRF protection for mutation requests
 * Checks Origin header against allowed origins
 * 
 * SameSite=Lax cookies (Supabase default) provide primary CSRF protection
 * This adds defense-in-depth by verifying Origin header
 * 
 * @param request - The incoming request
 * @returns Error response if CSRF check fails, null if passed
 * 
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const csrfError = verifyCsrf(request);
 *   if (csrfError) return csrfError;
 *   // ... handle request
 * }
 * ```
 */
export function verifyCsrf(request: Request): NextResponse<ApiError> | null {
    const origin = request.headers.get('origin');
    const allowedOrigins = getAllowedOrigins();

    // Origin header is sent by browsers for cross-origin requests
    // If present, verify it's in our allowed list
    if (origin && !allowedOrigins.includes(origin)) {
        console.warn('[CSRF] Invalid origin:', origin);
        return NextResponse.json<ApiError>(
            {
                error: 'Invalid origin',
                code: 'FORBIDDEN',
                details: { origin }
            },
            { status: 403 }
        );
    }

    return null; // Passed CSRF check
}

/**
 * Get client IP address from request headers
 * Works with Vercel, Cloudflare, and other proxies
 * 
 * @returns Client IP address or 'unknown'
 */
export async function getClientIP(): Promise<string> {
    const headersList = await headers();

    return (
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headersList.get('x-real-ip') ||
        headersList.get('cf-connecting-ip') || // Cloudflare
        'unknown'
    );
}
