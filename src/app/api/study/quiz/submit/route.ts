// =============================================================================
// Quiz Submit API - POST /api/study/quiz/submit
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { QuizService } from '@/services/quiz.service';
import type { QuizAttemptResponse } from '@/types/study';
import { ValidationError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';

// =============================================================================
// Validation
// =============================================================================

const submitQuizSchema = z.object({
    quiz_id: z.string().uuid('Invalid quiz ID'),
    answers: z.array(
        z.object({
            question_id: z.string().uuid('Invalid question ID'),
            selected_option_index: z.number().int().min(0).max(3),
        })
    ).min(1, 'At least one answer is required'),
});

// =============================================================================
// POST /api/study/quiz/submit
// =============================================================================

export const POST = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.userId);

    const body = await request.json();
    const validation = submitQuizSchema.safeParse(body);
    if (!validation.success) {
        const errorMessage = validation.error.errors[0]?.message ?? 'Validation failed';
        throw new ValidationError(errorMessage, validation.error.flatten());
    }

    const { quiz_id, answers } = validation.data;
    const quizService = new QuizService(auth.userId);
    const result = await quizService.submitAttempt(quiz_id, answers);

    return NextResponse.json<QuizAttemptResponse>(result, { status: 201 });
});
