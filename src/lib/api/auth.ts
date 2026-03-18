import { NextResponse } from 'next/server';
import { auth as clerkAuth, currentUser } from '@clerk/nextjs/server';
import type { ApiError } from '@/types/chat';
import { prisma } from '@/lib/prisma';

// Result of authentication check
export type AuthResult =
    | { success: true; userId: string }
    | { success: false; error: NextResponse<ApiError> };

/**
 * Ensure the Clerk user exists in our database.
 * Creates the user row on first authentication.
 */
async function ensureUserExists(clerkUserId: string): Promise<void> {
    try {
        const existing = await prisma.user.findUnique({ where: { id: clerkUserId } });
        if (existing) return;

        // Fetch user details from Clerk
        const user = await currentUser();
        await prisma.user.create({
            data: {
                id: clerkUserId,
                email: user?.emailAddresses?.[0]?.emailAddress || `${clerkUserId}@clerk.user`,
                full_name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
                avatar_url: user?.imageUrl || null,
            },
        });
    } catch (error) {
        // Do not block authenticated requests if local user provisioning fails.
        // This protects chat/learning endpoints from unrelated schema drift issues.
        console.warn('[Auth] User provisioning skipped due to DB error:', error);
    }
}

/**
 * Require authentication for an API route
 * Returns userId if authenticated, error response otherwise
 */
export async function requireAuth(): Promise<AuthResult> {
    try {
        const authParams = await clerkAuth();
        const userId = authParams.userId;

        if (!userId) {
            return {
                success: false,
                error: NextResponse.json<ApiError>(
                    { error: 'Not authenticated', code: 'UNAUTHORIZED' },
                    { status: 401 }
                ),
            };
        }

        // Auto-provision user in database on first auth (best-effort).
        await ensureUserExists(userId);

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
