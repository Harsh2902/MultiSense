import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConversationWithPreview } from '@/types/chat';
import { fetchConversations, deleteConversation } from '@/features/chat/api/chat-api';

export function useConversations(options?: { enabled?: boolean }) {
    return useQuery({
        enabled: options?.enabled,
        queryKey: ['conversations'],
        queryFn: async () => fetchConversations(),
        select: (data) => data.data, // Transform PaginatedResponse to Array
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteConversation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
}
