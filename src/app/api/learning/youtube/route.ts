// =============================================================================
// YouTube API Route - Submit YouTube videos for processing
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, withApiHandler } from '@/lib/api';
import { YouTubeService } from '@/services/youtube.service';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import type { SubmitYouTubeResponse } from '@/types/youtube';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { processPendingSources } from '@/lib/queue';

// =============================================================================
// Validation Schema
// =============================================================================

const submitYouTubeSchema = z.object({
    url: z.string().min(1, 'URL is required').max(500, 'URL too long'),
    conversation_id: z.string().uuid('Invalid conversation ID'),
});

// =============================================================================
// POST /api/learning/youtube - Submit YouTube URL
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const body = await request.json();
    const validation = submitYouTubeSchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const { url, conversation_id } = validation.data;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
        where: { id: conversation_id, user_id: auth.userId },
        select: { id: true }
    });

    if (!conversation) {
        throw new NotFoundError('Conversation', conversation_id);
    }

    try {
        // Submit video (YouTubeError will be caught by normalizeError)
        const youtubeService = new YouTubeService(auth.userId);
        const { source, metadata } = await youtubeService.submitVideo(url, conversation_id);

        // Fire best-effort processing trigger so the video enters chunking/embedding quickly.
        void processPendingSources(auth.userId, { batchSize: 1 }).catch((queueError) => {
            console.error('[YouTube API Error] Failed to trigger processing queue:', queueError);
        });

        return NextResponse.json<SubmitYouTubeResponse>({
            source: {
                id: source.id,
                title: metadata.title,
                status: source.status as any,
                videoId: metadata.videoId,
                duration: metadata.durationSeconds,
            },
            metadata,
        });
    } catch (error: any) {
        console.error('[YouTube API Error] Submit failed:', error);
        try {
            const fs = await import('fs');
            const path = await import('path');
            const logPath = path.join(process.cwd(), 'youtube-debug.log');
            const errorMessage = error instanceof Error ?
                `${error.message}\n${error.stack}` :
                JSON.stringify(error, null, 2);
            fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] ${errorMessage}\n`);
        } catch (logError) {
            console.error('Failed to write request log:', logError);
        }
        throw error; // Re-throw to be handled by withApiHandler
    }
});
