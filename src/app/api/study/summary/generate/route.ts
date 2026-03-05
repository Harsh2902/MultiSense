// =============================================================================
// Summary Generate API - POST /api/study/summary/generate
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { SummaryService } from '@/services/summary.service';
import type { SummaryResponse, SummaryType } from '@/types/study';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';

// =============================================================================
// Validation
// =============================================================================

const generateSummarySchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID'),
    summary_type: z.enum(['bullet', 'paragraph', 'exam']),
    topic: z.string().max(200).optional(),
});

// =============================================================================
// POST /api/study/summary/generate
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.user.id);

    const body = await request.json();
    const validation = generateSummarySchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const { conversation_id, summary_type, topic } = validation.data;

    // Verify conversation ownership
    const { data: conv, error: convError } = await auth.supabase
        .from('conversations')
        .select('id')
        .eq('id', conversation_id)
        .eq('user_id', auth.user.id)
        .single();

    if (convError || !conv) {
        throw new NotFoundError('Conversation', conversation_id);
    }

    const summaryService = new SummaryService(auth.supabase, auth.user.id);
    const result = await summaryService.generateSummary(
        conversation_id,
        summary_type as SummaryType,
        topic
    );

    return NextResponse.json<SummaryResponse>(result, { status: 201 });
});
