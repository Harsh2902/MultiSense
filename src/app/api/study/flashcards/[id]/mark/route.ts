// =============================================================================
// Flashcard Mark API - PATCH /api/study/flashcards/[id]/mark
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { FlashcardService } from '@/services/flashcard.service';
import type { FlashcardRow } from '@/types/study';
import { ValidationError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';

// =============================================================================
// Validation
// =============================================================================

const markFlashcardSchema = z.object({
    is_learned: z.boolean(),
});

// =============================================================================
// PATCH /api/study/flashcards/[id]/mark
// =============================================================================

export const PATCH = withApiHandler(async (
    request: NextRequest,
    context?: { params?: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    let params: { id: string } | undefined;
    if (context?.params) {
        if ('then' in context.params) {
            params = await context.params;
        } else {
            params = context.params;
        }
    }

    const id = params?.id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        throw new ValidationError('Invalid flashcard ID');
    }

    const body = await request.json();
    const validation = markFlashcardSchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const flashcardService = new FlashcardService(auth.userId);
    const updated = await flashcardService.markFlashcard(id, validation.data.is_learned);

    return NextResponse.json<FlashcardRow>(updated);
});
