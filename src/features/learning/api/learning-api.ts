// =============================================================================
// Learning API Adapter - Sources, uploads, processing
// =============================================================================

import { api } from '@/features/shared/utils/api-client';
import type { LearningSourceRow } from '@/types/learning';

// =============================================================================
// Sources
// =============================================================================

export async function fetchSources(
    conversationId: string | null
): Promise<{ sources: LearningSourceRow[] }> {
    const query = conversationId
        ? `?conversation_id=${encodeURIComponent(conversationId)}`
        : '';
    return api.get<{ sources: LearningSourceRow[] }>(`/api/learning/sources${query}`);
}

export async function fetchSource(
    sourceId: string
): Promise<{ source: LearningSourceRow }> {
    return api.get<{ source: LearningSourceRow }>(
        `/api/learning/sources/${sourceId}`
    );
}

export async function deleteSource(sourceId: string): Promise<void> {
    return api.delete<void>(`/api/learning/sources/${sourceId}`);
}

export async function retrySource(sourceId: string): Promise<{ source: LearningSourceRow }> {
    return api.post<{ source: LearningSourceRow }>(
        `/api/learning/sources/${sourceId}`,
        { action: 'retry' }
    );
}

export async function linkSourceToConversation(
    sourceId: string,
    conversationId: string
): Promise<{ source: LearningSourceRow }> {
    return api.patch<{ source: LearningSourceRow }>(
        `/api/learning/sources/${sourceId}`,
        { conversation_id: conversationId }
    );
}

// =============================================================================
// File Upload
// =============================================================================

export async function uploadFile(
    conversationId: string | null,
    file: File
): Promise<{ source: LearningSourceRow }> {
    const formData = new FormData();
    formData.append('file', file);
    if (conversationId) {
        formData.append('conversation_id', conversationId);
    }

    return api.post<{ source: LearningSourceRow }>(
        '/api/learning/sources',
        formData,
        { timeout: 120000 } // 2 min for large files
    );
}

// =============================================================================
// YouTube
// =============================================================================

export async function submitYouTube(
    conversationId: string,
    url: string
): Promise<{ source: LearningSourceRow }> {
    return api.post<{ source: LearningSourceRow }>(
        '/api/learning/youtube',
        { conversation_id: conversationId, url }
    );
}

// =============================================================================
// Process Trigger
// =============================================================================

export async function triggerProcessing(
    sourceId: string
): Promise<{ results: unknown[] }> {
    return api.post<{ results: unknown[] }>('/api/learning/process', {
        source_ids: [sourceId],
    });
}
