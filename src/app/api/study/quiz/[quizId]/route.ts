// =============================================================================
// Quiz API Routes - GET single quiz
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api'; // Check: used via withContext or similar? Not using withApiHandler due to generic mismatch previously? 
// Note: We relaxed withApiHandler, so we can use it. But for dynamic routes, we need context.

import { withApiHandler } from '@/lib/api';
import { QuizService } from '@/services/quiz.service';
import type { QuizResponse } from '@/types/study';
import { ValidationError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';
import { z } from 'zod';

// =============================================================================
// GET /api/study/quiz/[quizId]
// =============================================================================

export const GET = withApiHandler(async (
    request: NextRequest,
    context?: { params?: Promise<{ quizId: string }> | { quizId: string } } // Support both sync and async params for robustness
): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.user.id);

    // Resolve params (Next.js 15)
    // context?.params might be a Promise or object depending on version/mocking
    // Safely handle it:
    let params: { quizId: string } | undefined;
    if (context?.params) {
        if ('then' in context.params) {
            params = await context.params;
        } else {
            params = context.params;
        }
    }

    const quizId = params?.quizId;

    if (!quizId || !/^[0-9a-f-]{36}$/i.test(quizId)) {
        throw new ValidationError('Invalid quiz ID');
    }

    const quizService = new QuizService(auth.supabase, auth.user.id);
    const result = await quizService.getQuiz(quizId);

    return NextResponse.json<QuizResponse>(result);
});
