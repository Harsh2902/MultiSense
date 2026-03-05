// =============================================================================
// Supabase Index - Central export point
// =============================================================================

export { createClient as createBrowserClient, getClient } from './client';
export { createClient as createServerClient } from './server';
export { createMiddlewareClient } from './middleware';
