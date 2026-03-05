// =============================================================================
// React Query Provider - Client component wrapper
// =============================================================================

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/react-query';

interface ReactQueryProviderProps {
    children: React.ReactNode;
}

/**
 * Provides React Query context to the application.
 * Wraps minimal tree — placed inside root layout.
 */
export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
    const queryClient = getQueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}
