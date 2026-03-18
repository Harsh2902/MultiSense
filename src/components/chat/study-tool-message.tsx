'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileQuestion, Layers } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/features/shared/utils/api-client';
import type {
    FlashcardRow,
    FlashcardSetResponse,
    QuizAttemptResponse,
    QuizQuestionRow,
    QuizResponse,
} from '@/types/study';

interface StudyToolMessageProps {
    metadata?: Record<string, unknown>;
}

function isQuizPayload(payload: unknown): payload is QuizResponse {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as Partial<QuizResponse>;
    return !!candidate.quiz && Array.isArray(candidate.questions);
}

function isFlashcardsPayload(payload: unknown): payload is FlashcardSetResponse {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as Partial<FlashcardSetResponse>;
    return !!candidate.set && Array.isArray(candidate.cards);
}

function getStudyTool(metadata?: Record<string, unknown>): 'quiz' | 'flashcards' | null {
    const raw = metadata?.study_tool;
    return raw === 'quiz' || raw === 'flashcards' ? raw : null;
}

export function StudyToolMessage({ metadata }: StudyToolMessageProps) {
    const studyTool = useMemo(() => getStudyTool(metadata), [metadata]);
    const payload = metadata?.study_payload;

    if (!studyTool) return null;

    if (studyTool === 'quiz' && isQuizPayload(payload)) {
        return <QuizToolCard payload={payload} />;
    }

    if (studyTool === 'flashcards' && isFlashcardsPayload(payload)) {
        return <FlashcardsToolCard payload={payload} />;
    }

    return (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
            Study tool output is unavailable for this message.
        </div>
    );
}

function QuizToolCard({ payload }: { payload: QuizResponse }) {
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [result, setResult] = useState<QuizAttemptResponse | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setAnswers({});
        setResult(null);
        setError(null);
    }, [payload.quiz.id]);

    const answeredCount = payload.questions.filter((question) => answers[question.id] !== undefined).length;
    const canSubmit = answeredCount === payload.questions.length && !result && !isSubmitting;

    const submitQuiz = async () => {
        const requestAnswers = payload.questions.map((question) => ({
            question_id: question.id,
            selected_option_index: answers[question.id],
        }));

        if (requestAnswers.some((item) => item.selected_option_index === undefined)) {
            setError('Answer all quiz questions before submitting.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const response = await api.post<QuizAttemptResponse>('/api/study/quiz/submit', {
                quiz_id: payload.quiz.id,
                answers: requestAnswers as Array<{ question_id: string; selected_option_index: number }>,
            });
            setResult(response);
        } catch (submitError) {
            setError(getErrorMessage(submitError));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-3 rounded-xl border border-blue-500/30 bg-zinc-950/80 p-3">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
                <FileQuestion className="h-4 w-4 text-blue-400" />
                <span className="font-medium">Quiz Generator</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
                <span>{payload.questions.length} questions</span>
                {result ? (
                    <span className="font-medium text-emerald-300">
                        Score: {result.attempt.score}/{payload.questions.length} ({Math.round(result.attempt.percentage)}%)
                    </span>
                ) : (
                    <span>Answered: {answeredCount}/{payload.questions.length}</span>
                )}
            </div>

            {payload.questions.map((question, index) => (
                <QuizQuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    selectedOption={answers[question.id]}
                    result={result}
                    onSelect={(optionIndex) => {
                        if (result) return;
                        setAnswers((prev) => ({
                            ...prev,
                            [question.id]: optionIndex,
                        }));
                    }}
                />
            ))}

            {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                </div>
            )}

            {!result && (
                <Button
                    type="button"
                    onClick={() => void submitQuiz()}
                    disabled={!canSubmit}
                    className="bg-blue-500 text-black hover:bg-blue-400"
                >
                    {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                </Button>
            )}
        </div>
    );
}

function QuizQuestionCard({
    question,
    index,
    selectedOption,
    result,
    onSelect,
}: {
    question: QuizQuestionRow;
    index: number;
    selectedOption: number | undefined;
    result: QuizAttemptResponse | null;
    onSelect: (optionIndex: number) => void;
}) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-100">
                {index + 1}. {question.question_text}
            </p>
            <div className="space-y-2">
                {question.options.map((option, optionIndex) => {
                    const isSelected = selectedOption === optionIndex;
                    const isCorrect = !!result && question.correct_option_index === optionIndex;
                    const isWrongSelected = !!result && isSelected && !isCorrect;

                    return (
                        <button
                            key={`${question.id}-${optionIndex}`}
                            type="button"
                            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                isCorrect
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
                                    : isWrongSelected
                                        ? 'border-red-500/40 bg-red-500/10 text-red-200'
                                        : isSelected
                                            ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                                            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800/80'
                            }`}
                            disabled={!!result}
                            onClick={() => onSelect(optionIndex)}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
            {result && question.explanation && (
                <p className="mt-2 text-xs text-zinc-400">
                    Explanation: {question.explanation}
                </p>
            )}
        </div>
    );
}

function FlashcardsToolCard({ payload }: { payload: FlashcardSetResponse }) {
    const [cards, setCards] = useState<FlashcardRow[]>(payload.cards);
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setCards(payload.cards);
        setRevealed({});
        setError(null);
    }, [payload.set.id, payload.cards]);

    const markLearned = async (card: FlashcardRow) => {
        const nextLearned = !card.is_learned;
        setError(null);
        setCards((prev) => prev.map((item) => (
            item.id === card.id ? { ...item, is_learned: nextLearned } : item
        )));

        try {
            await api.patch<FlashcardRow>(`/api/study/flashcards/${card.id}/mark`, {
                is_learned: nextLearned,
            });
        } catch (markError) {
            setError(getErrorMessage(markError));
            setCards((prev) => prev.map((item) => (
                item.id === card.id ? { ...item, is_learned: card.is_learned } : item
            )));
        }
    };

    const learnedCount = cards.filter((card) => card.is_learned).length;

    return (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-3">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span className="font-medium">Flashcards</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
                <span>{cards.length} cards</span>
                <span>Learned: {learnedCount}/{cards.length}</span>
            </div>

            <div className="grid gap-3">
                {cards.map((card, index) => {
                    const isRevealed = !!revealed[card.id];
                    return (
                        <div
                            key={card.id}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
                        >
                            <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => {
                                    setRevealed((prev) => ({
                                        ...prev,
                                        [card.id]: !prev[card.id],
                                    }));
                                }}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-xs text-zinc-500">
                                        Card {index + 1} - {isRevealed ? 'Answer' : 'Question'}
                                    </span>
                                    <span className="text-[11px] text-zinc-500">
                                        Click to {isRevealed ? 'hide' : 'reveal'}
                                    </span>
                                </div>
                                <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {isRevealed ? card.back : card.front}
                                    </ReactMarkdown>
                                </div>
                            </button>
                            <div className="mt-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void markLearned(card);
                                    }}
                                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                                        card.is_learned
                                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                                            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                                    }`}
                                >
                                    {card.is_learned ? 'Learned' : 'Mark Learned'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                </div>
            )}
        </div>
    );
}
