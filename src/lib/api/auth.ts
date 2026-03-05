// =============================================================================
// API Auth Utilities - Authentication helpers for API routes
// =============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { ApiError } from '@/types/chat';
import type { TypedSupabaseClient } from '@/types/database';

// =============================================================================
// Types
// =============================================================================

// Result of authentication check
export type AuthResult =
    | { success: true; user: User; supabase: Awaited<ReturnType<typeof createClient>> }
    | { success: false; error: NextResponse<ApiError> };

// =============================================================================
// Authentication
// =============================================================================

/**
 * Require authentication for an API route
 * Returns user and supabase client if authenticated, error response otherwise
 * 
 * @returns AuthResult with user and client or error response
 * 
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const auth = await requireAuth();
 *   if (!auth.success) return auth.error;
 *   
 *   const { user, supabase } = auth;
 *   // ... use authenticated user
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthResult> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
            console.error('[Auth] Error getting user:', error.message);
            return {
                success: false,
                error: NextResponse.json<ApiError>(
                    {
                        error: 'Authentication failed',
                        code: 'UNAUTHORIZED',
                        details: { message: error.message }
                    },
                    { status: 401 }
                ),
            };
        }

        if (!user) {
            return {
                success: false,
                error: NextResponse.json<ApiError>(
                    { error: 'Not authenticated', code: 'UNAUTHORIZED' },
                    { status: 401 }
                ),
            };
        }

        return { success: true, user, supabase };
    } catch (err) {
        console.error('[Auth] Unexpected error:', err);
        return {
            success: false,
            error: NextResponse.json<ApiError>(
                { error: 'Internal server error', code: 'INTERNAL_ERROR' },
                { status: 500 }
            ),
        };
    }
}

/**
 * Get current user without requiring authentication
 * Returns null if not authenticated (no error)
 * 
 * @returns User or null
 */
export async function getOptionalUser(): Promise<User | null> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch {
        return null;
    }
}
