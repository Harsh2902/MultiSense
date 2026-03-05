// =============================================================================
// Quiz Generate API - POST /api/study/quiz/generate
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { QuizService } from '@/services/quiz.service';
import type { QuizResponse } from '@/types/study';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// =============================================================================
// Validation
// =============================================================================

const generateQuizSchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID'),
    topic: z.string().max(200).optional(),
});

// =============================================================================
// POST /api/study/quiz/generate
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const body = await request.json();
    const validation = generateQuizSchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const { conversation_id, topic } = validation.data;

    // Verify conversation ownership
    const conv = await prisma.conversation.findUnique({
        where: { id: conversation_id },
        select: { user_id: true }
    });

    if (!conv || conv.user_id !== auth.userId) {
        throw new NotFoundError('Conversation', conversation_id);
    }

    const quizService = new QuizService(auth.userId);
    const result = await quizService.generateQuiz(conversation_id, topic);

    return NextResponse.json<QuizResponse>(result, { status: 201 });
});
