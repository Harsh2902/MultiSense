// =============================================================================
// Study API Adapter - Quiz, Flashcards, Summary
// =============================================================================

import { api } from '@/features/shared/utils/api-client';
import type {
    QuizResponse,
    QuizAttemptResponse,
    GenerateQuizRequest,
    SubmitQuizRequest,
    FlashcardSetResponse,
    GenerateFlashcardsRequest,
    MarkFlashcardRequest,
    SummaryResponse,
    GenerateSummaryRequest,
} from '@/types/study';

// =============================================================================
// Quiz
// =============================================================================

export async function generateQuiz(data: GenerateQuizRequest): Promise<QuizResponse> {
    return api.post<QuizResponse>('/api/study/quiz/generate', data, { timeout: 60000 });
}

export async function fetchQuiz(quizId: string): Promise<QuizResponse> {
    return api.get<QuizResponse>(`/api/study/quiz/${quizId}`);
}

export async function submitQuiz(data: SubmitQuizRequest): Promise<QuizAttemptResponse> {
    return api.post<QuizAttemptResponse>('/api/study/quiz/submit', data);
}

// =============================================================================
// Flashcards
// =============================================================================

export async function generateFlashcards(data: GenerateFlashcardsRequest): Promise<FlashcardSetResponse> {
    return api.post<FlashcardSetResponse>('/api/study/flashcards/generate', data, { timeout: 60000 });
}

export async function fetchFlashcardSet(setId: string): Promise<FlashcardSetResponse> {
    return api.get<FlashcardSetResponse>(`/api/study/flashcards/${setId}`);
}

export async function markFlashcard(
    cardId: string,
    data: MarkFlashcardRequest
): Promise<void> {
    return api.patch<void>(`/api/study/flashcards/cards/${cardId}`, data);
}

// =============================================================================
// Summary
// =============================================================================

export async function generateSummary(data: GenerateSummaryRequest): Promise<SummaryResponse> {
    return api.post<SummaryResponse>('/api/study/summary/generate', data, { timeout: 60000 });
}

export async function fetchSummary(conversationId: string): Promise<SummaryResponse> {
    return api.get<SummaryResponse>(`/api/study/summary/${conversationId}`);
}
