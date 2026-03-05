// =============================================================================
// React Query Key Factories
// =============================================================================

/**
 * Centralized query key factories for cache management.
 * Every query key used in the app MUST be defined here.
 *
 * Pattern: Each domain has a `root` key and nested factories
 * that extend it. This enables targeted cache invalidation.
 */
export const queryKeys = {
    // =========================================================================
    // Conversations
    // =========================================================================
    conversations: {
        all: ['conversations'] as const,
        list: (cursor?: string) =>
            [...queryKeys.conversations.all, 'list', { cursor }] as const,
        detail: (id: string) =>
            [...queryKeys.conversations.all, 'detail', id] as const,
        messages: (conversationId: string) =>
            [...queryKeys.conversations.all, conversationId, 'messages'] as const,
    },

    // =========================================================================
    // Learning Sources
    // =========================================================================
    learning: {
        all: ['learning'] as const,
        sources: (conversationId: string) =>
            [...queryKeys.learning.all, 'sources', conversationId] as const,
        source: (sourceId: string) =>
            [...queryKeys.learning.all, 'source', sourceId] as const,
    },

    // =========================================================================
    // Study Tools
    // =========================================================================
    study: {
        all: ['study'] as const,
        quiz: (quizId: string) =>
            [...queryKeys.study.all, 'quiz', quizId] as const,
        flashcards: (setId: string) =>
            [...queryKeys.study.all, 'flashcards', setId] as const,
        summary: (conversationId: string) =>
            [...queryKeys.study.all, 'summary', conversationId] as const,
    },
} as const;
