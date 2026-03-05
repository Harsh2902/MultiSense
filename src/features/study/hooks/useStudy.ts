// =============================================================================
// Study Hooks - React Query hooks for quiz, flashcards, summary
// =============================================================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { queryKeys } from '@/lib/react-query';
import {
    generateQuiz,
    fetchQuiz,
    submitQuiz,
    generateFlashcards,
    fetchFlashcardSet,
    markFlashcard,
    generateSummary,
    fetchSummary,
} from '@/features/study/api';
import type {
    GenerateQuizRequest,
    SubmitQuizRequest,
    GenerateFlashcardsRequest,
    MarkFlashcardRequest,
    GenerateSummaryRequest,
    QuizQuestionRow,
} from '@/types/study';

// =============================================================================
// useQuiz - Step-based quiz with submit prevention
// =============================================================================

export function useQuiz(quizId: string | null) {
    const queryClient = useQueryClient();
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);

    const query = useQuery({
        queryKey: queryKeys.study.quiz(quizId ?? ''),
        queryFn: () => fetchQuiz(quizId!),
        enabled: !!quizId,
    });

    const generateMutation = useMutation({
        mutationFn: (data: GenerateQuizRequest) => generateQuiz(data),
        onSuccess: (result) => {
            queryClient.setQueryData(queryKeys.study.quiz(result.quiz.id), result);
            setCurrentStep(0);
            setSelectedAnswers({});
            setIsSubmitted(false);
        },
    });

    const submitMutation = useMutation({
        mutationFn: (data: SubmitQuizRequest) => submitQuiz(data),
        onSuccess: () => {
            setIsSubmitted(true);
        },
    });

    const selectAnswer = useCallback((questionId: string, optionIndex: number) => {
        if (isSubmitted) return; // Prevent modification after submit
        setSelectedAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
    }, [isSubmitted]);

    const questions = (query.data?.questions ?? []) as QuizQuestionRow[];
    const currentQuestion = questions[currentStep] ?? null;
    const totalQuestions = questions.length;
    const answeredCount = Object.keys(selectedAnswers).length;
    const canSubmit = answeredCount === totalQuestions && !isSubmitted;

    return {
        quiz: query.data?.quiz ?? null,
        questions,
        currentQuestion,
        currentStep,
        totalQuestions,
        selectedAnswers,
        isSubmitted,
        isLoading: query.isLoading,
        error: query.error,
        // Navigation
        nextStep: () => setCurrentStep(s => Math.min(s + 1, totalQuestions - 1)),
        prevStep: () => setCurrentStep(s => Math.max(s - 1, 0)),
        goToStep: setCurrentStep,
        // Actions
        selectAnswer,
        canSubmit,
        submit: () => {
            if (!quizId || !canSubmit) return;
            submitMutation.mutate({
                quiz_id: quizId,
                answers: Object.entries(selectedAnswers).map(([qid, idx]) => ({
                    question_id: qid,
                    selected_option_index: idx,
                })),
            });
        },
        isSubmitting: submitMutation.isPending,
        attemptResult: submitMutation.data ?? null,
        // Generation
        generate: generateMutation.mutateAsync,
        isGenerating: generateMutation.isPending,
    };
}

// =============================================================================
// useFlashcards - Card flip, mark learned, progress tracking
// =============================================================================

export function useFlashcards(setId: string | null) {
    const queryClient = useQueryClient();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const query = useQuery({
        queryKey: queryKeys.study.flashcards(setId ?? ''),
        queryFn: () => fetchFlashcardSet(setId!),
        enabled: !!setId,
    });

    const markMutation = useMutation({
        mutationFn: ({ cardId, data }: { cardId: string; data: MarkFlashcardRequest }) =>
            markFlashcard(cardId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.study.flashcards(setId ?? ''),
            });
        },
    });

    const generateMutation = useMutation({
        mutationFn: (data: GenerateFlashcardsRequest) => generateFlashcards(data),
        onSuccess: (result) => {
            queryClient.setQueryData(queryKeys.study.flashcards(result.set.id), result);
            setCurrentIndex(0);
            setIsFlipped(false);
        },
    });

    const cards = query.data?.cards ?? [];
    const currentCard = cards[currentIndex] ?? null;
    const learnedCount = cards.filter(c => c.is_learned).length;
    const totalCards = cards.length;

    return {
        set: query.data?.set ?? null,
        cards,
        currentCard,
        currentIndex,
        totalCards,
        learnedCount,
        isFlipped,
        isLoading: query.isLoading,
        error: query.error,
        // Navigation
        flip: () => setIsFlipped(f => !f),
        next: () => { setCurrentIndex(i => Math.min(i + 1, totalCards - 1)); setIsFlipped(false); },
        prev: () => { setCurrentIndex(i => Math.max(i - 1, 0)); setIsFlipped(false); },
        goTo: (i: number) => { setCurrentIndex(i); setIsFlipped(false); },
        // Actions
        toggleLearned: (cardId: string, learned: boolean) =>
            markMutation.mutate({ cardId, data: { is_learned: learned } }),
        // Generation
        generate: generateMutation.mutateAsync,
        isGenerating: generateMutation.isPending,
    };
}

// =============================================================================
// useSummary - Generate, view, copy, regenerate
// =============================================================================

export function useSummary(conversationId: string | null) {
    const queryClient = useQueryClient();
    const [copied, setCopied] = useState(false);

    const query = useQuery({
        queryKey: queryKeys.study.summary(conversationId ?? ''),
        queryFn: () => fetchSummary(conversationId!),
        enabled: !!conversationId,
    });

    const generateMutation = useMutation({
        mutationFn: (data: GenerateSummaryRequest) => generateSummary(data),
        onSuccess: (result) => {
            queryClient.setQueryData(
                queryKeys.study.summary(conversationId ?? ''),
                result
            );
        },
    });

    const copyToClipboard = useCallback(async () => {
        const content = query.data?.summary?.content;
        if (!content) return;

        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [query.data?.summary?.content]);

    return {
        summary: query.data?.summary ?? null,
        isLoading: query.isLoading,
        error: query.error,
        // Actions
        generate: generateMutation.mutateAsync,
        isGenerating: generateMutation.isPending,
        copyToClipboard,
        copied,
        refetch: query.refetch,
    };
}
