// =============================================================================
// Supabase Browser Client - For client-side components
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Create a Supabase client for browser-side operations
 * Uses cookies for session management
 * 
 * @returns Typed Supabase browser client
 */
export function createClient() {
    return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

/**
 * Singleton instance for browser client
 * Prevents creating multiple clients in the browser
 */
let browserClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create browser client singleton
 * Use this in components to avoid recreating clients
 * 
 * @returns Typed Supabase browser client singleton
 */
export function getClient() {
    if (typeof window === 'undefined') {
        throw new Error('getClient() should only be called in browser context');
    }

    if (!browserClient) {
        browserClient = createClient();
    }

    return browserClient;
}
