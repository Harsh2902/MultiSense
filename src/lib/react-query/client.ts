// =============================================================================
// React Query Client Configuration
// =============================================================================

import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

// =============================================================================
// Default Options
// =============================================================================

const defaultOptions: DefaultOptions = {
    queries: {
        staleTime: 1000 * 60,           // 1 minute
        gcTime: 1000 * 60 * 5,          // 5 minutes garbage collection
        retry: 1,                        // 1 retry on failure
        refetchOnWindowFocus: false,     // Don't refetch on tab switch
        refetchOnReconnect: true,        // Refetch when network reconnects
    },
    mutations: {
        retry: 0,                        // No mutation retries
    },
};

// =============================================================================
// Query Client Factory
// =============================================================================

let queryClient: QueryClient | null = null;

/**
 * Get or create the QueryClient singleton.
 * Uses a factory to avoid creating the client during SSR.
 */
export function getQueryClient(): QueryClient {
    if (!queryClient) {
        queryClient = new QueryClient({ defaultOptions });
    }
    return queryClient;
}
