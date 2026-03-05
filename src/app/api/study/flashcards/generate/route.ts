// =============================================================================
// Flashcard Generate API - POST /api/study/flashcards/generate
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { FlashcardService } from '@/services/flashcard.service';
import type { FlashcardSetResponse } from '@/types/study';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';

// =============================================================================
// Validation
// =============================================================================

const generateFlashcardsSchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID'),
    topic: z.string().max(200).optional(),
});

// =============================================================================
// POST /api/study/flashcards/generate
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.user.id);

    const body = await request.json();
    const validation = generateFlashcardsSchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const { conversation_id, topic } = validation.data;

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

    const flashcardService = new FlashcardService(auth.supabase, auth.user.id);
    const result = await flashcardService.generateFlashcards(conversation_id, topic);

    return NextResponse.json<FlashcardSetResponse>(result, { status: 201 });
});
