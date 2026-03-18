import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchConversations, deleteConversation } from '@/features/chat/api/chat-api';
import { fetchSources } from '@/features/learning/api/learning-api';
import type { LearningSourceRow } from '@/types/learning';

export function useConversations(options?: { enabled?: boolean; mode?: 'chat' | 'learning' }) {
    const mode = options?.mode ?? 'chat';

    return useQuery({
        enabled: options?.enabled,
        queryKey: ['sidebar-conversations', mode],
        queryFn: async () => fetchConversations(undefined, mode),
        select: (data) => data.data, // Transform PaginatedResponse to Array
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useLearningSources(options?: { enabled?: boolean }) {
    return useQuery({
        enabled: options?.enabled,
        queryKey: ['sidebar-learning-sources'],
        queryFn: async () => {
            const response = await fetchSources(null);
            return response.sources as LearningSourceRow[];
        },
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteConversation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sidebar-conversations'] });
        },
    });
}
