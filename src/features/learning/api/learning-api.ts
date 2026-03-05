// =============================================================================
// Learning API Adapter - Sources, uploads, processing
// =============================================================================

import { api } from '@/features/shared/utils/api-client';
import type { LearningSourceRow } from '@/types/learning';

// =============================================================================
// Sources
// =============================================================================

export async function fetchSources(
    conversationId: string
): Promise<{ sources: LearningSourceRow[] }> {
    return api.get<{ sources: LearningSourceRow[] }>(
        `/api/learning/sources?conversation_id=${encodeURIComponent(conversationId)}`
    );
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

// =============================================================================
// File Upload
// =============================================================================

export async function uploadFile(
    conversationId: string,
    file: File
): Promise<{ source: LearningSourceRow }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversation_id', conversationId);

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
