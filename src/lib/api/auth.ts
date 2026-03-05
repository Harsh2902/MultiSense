import { NextResponse } from 'next/server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import type { ApiError } from '@/types/chat';

// Result of authentication check
export type AuthResult =
    | { success: true; userId: string }
    | { success: false; error: NextResponse<ApiError> };

/**
 * Require authentication for an API route
 * Returns userId if authenticated, error response otherwise
 */
export async function requireAuth(): Promise<AuthResult> {
    try {
        const authParams = await clerkAuth();
        const userId = authParams.userId;

        if (!userId) {
            // Check for demo session (guest bypass)
            // Note: we'd need cookies() here if we want to support demo_session
            // For now, let's keep it simple or use clerk's active sessions.
            return {
                success: false,
                error: NextResponse.json<ApiError>(
                    { error: 'Not authenticated', code: 'UNAUTHORIZED' },
                    { status: 401 }
                ),
            };
        }

        return { success: true, userId };
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
 * Get current user ID without requiring authentication
 * Returns null if not authenticated (no error)
 */
export async function getOptionalUser(): Promise<string | null> {
    try {
        const authParams = await clerkAuth();
        return authParams.userId || null;
    } catch {
        return null;
    }
}
