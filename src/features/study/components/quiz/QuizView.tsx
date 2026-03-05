// =============================================================================
// QuizView - Step-based quiz UI with results
// =============================================================================

'use client';

import { memo, useCallback } from 'react';
import { QuizSkeleton, ErrorDisplay } from '@/features/shared/components';
import clsx from 'clsx';
import type { QuizQuestionRow, QuizAttemptResponse } from '@/types/study';

// =============================================================================
// QuizQuestion Component
// =============================================================================

interface QuizQuestionProps {
    question: QuizQuestionRow;
    questionNumber: number;
    totalQuestions: number;
    selectedAnswer: number | undefined;
    isSubmitted: boolean;
    onSelect: (questionId: string, optionIndex: number) => void;
}

const QuizQuestion = memo(function QuizQuestion({
    question,
    questionNumber,
    totalQuestions,
    selectedAnswer,
    isSubmitted,
    onSelect,
}: QuizQuestionProps) {
    return (
        <div className="quiz-question" role="group" aria-label={`Question ${questionNumber} of ${totalQuestions}`}>
            <div className="quiz-question__header">
                <span className="quiz-question__step">
                    Question {questionNumber} / {totalQuestions}
                </span>
            </div>

            <p className="quiz-question__text">{question.question_text}</p>

            <div className="quiz-question__options" role="radiogroup">
                {question.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrect = isSubmitted && index === question.correct_option_index;
                    const isWrong = isSubmitted && isSelected && !isCorrect;

                    return (
                        <button
                            key={index}
                            type="button"
                            className={clsx(
                                'quiz-option',
                                isSelected && 'quiz-option--selected',
                                isCorrect && 'quiz-option--correct',
                                isWrong && 'quiz-option--wrong',
                            )}
                            onClick={() => onSelect(question.id, index)}
                            disabled={isSubmitted}
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={`Option ${index + 1}: ${option}`}
                        >
                            <span className="quiz-option__marker">
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="quiz-option__text">{option}</span>
                            {isCorrect && <span className="quiz-option__icon">✓</span>}
                            {isWrong && <span className="quiz-option__icon">✗</span>}
                        </button>
                    );
                })}
            </div>

            {/* Explanation (shown after submit) */}
            {isSubmitted && question.explanation && (
                <div className="quiz-question__explanation" role="note">
                    <strong>Explanation:</strong> {question.explanation}
                </div>
            )}
        </div>
    );
});

// =============================================================================
// QuizResults Component
// =============================================================================

interface QuizResultsProps {
    result: QuizAttemptResponse;
}

const QuizResults = memo(function QuizResults({ result }: QuizResultsProps) {
    const { attempt, results } = result;
    const percentage = Math.round(attempt.percentage);

    return (
        <div className="quiz-results" role="region" aria-label="Quiz results">
            <div className="quiz-results__score">
                <div
                    className={clsx(
                        'quiz-results__percentage',
                        percentage >= 80 && 'quiz-results__percentage--excellent',
                        percentage >= 60 && percentage < 80 && 'quiz-results__percentage--good',
                        percentage < 60 && 'quiz-results__percentage--needs-work',
                    )}
                >
                    {percentage}%
                </div>
                <p className="quiz-results__label">
                    {attempt.score} / {results.length} correct
                </p>
            </div>

            <div className="quiz-results__breakdown">
                {results.map((item, i) => (
                    <div
                        key={item.question.id}
                        className={clsx(
                            'quiz-results__item',
                            item.is_correct ? 'quiz-results__item--correct' : 'quiz-results__item--wrong'
                        )}
                    >
                        <span className="quiz-results__item-num">Q{i + 1}</span>
                        <span className="quiz-results__item-status">
                            {item.is_correct ? '✓' : '✗'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
});

// =============================================================================
// Main QuizView
// =============================================================================

interface QuizViewProps {
    questions: QuizQuestionRow[];
    currentStep: number;
    currentQuestion: QuizQuestionRow | null;
    totalQuestions: number;
    selectedAnswers: Record<string, number>;
    isSubmitted: boolean;
    isLoading: boolean;
    error: unknown;
    attemptResult: QuizAttemptResponse | null;
    canSubmit: boolean;
    isSubmitting: boolean;
    onSelectAnswer: (questionId: string, optionIndex: number) => void;
    onNextStep: () => void;
    onPrevStep: () => void;
    onSubmit: () => void;
    onRetry: () => void;
}

export function QuizView({
    currentQuestion,
    currentStep,
    totalQuestions,
    selectedAnswers,
    isSubmitted,
    isLoading,
    error,
    attemptResult,
    canSubmit,
    isSubmitting,
    onSelectAnswer,
    onNextStep,
    onPrevStep,
    onSubmit,
    onRetry,
}: QuizViewProps) {
    if (isLoading) return <QuizSkeleton />;
    if (error) return <ErrorDisplay error={error} onRetry={onRetry} />;

    // Show results if submitted
    if (isSubmitted && attemptResult) {
        return <QuizResults result={attemptResult} />;
    }

    if (!currentQuestion) {
        return <p className="quiz-view__empty">No quiz loaded.</p>;
    }

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Number keys 1-4 for option selection
        const num = parseInt(e.key);
        if (num >= 1 && num <= currentQuestion.options.length) {
            onSelectAnswer(currentQuestion.id, num - 1);
        }
        // Enter to go to next or submit
        if (e.key === 'Enter') {
            if (currentStep < totalQuestions - 1) onNextStep();
            else if (canSubmit) onSubmit();
        }
    }, [currentQuestion, currentStep, totalQuestions, canSubmit, onSelectAnswer, onNextStep, onSubmit]);

    return (
        <div className="quiz-view" onKeyDown={handleKeyDown} tabIndex={0}>
            <QuizQuestion
                question={currentQuestion}
                questionNumber={currentStep + 1}
                totalQuestions={totalQuestions}
                selectedAnswer={selectedAnswers[currentQuestion.id]}
                isSubmitted={isSubmitted}
                onSelect={onSelectAnswer}
            />

            {/* Navigation */}
            <div className="quiz-view__nav">
                <button
                    type="button"
                    className="quiz-view__nav-btn"
                    onClick={onPrevStep}
                    disabled={currentStep === 0}
                >
                    ← Previous
                </button>

                {currentStep < totalQuestions - 1 ? (
                    <button
                        type="button"
                        className="quiz-view__nav-btn quiz-view__nav-btn--next"
                        onClick={onNextStep}
                    >
                        Next →
                    </button>
                ) : (
                    <button
                        type="button"
                        className="quiz-view__nav-btn quiz-view__nav-btn--submit"
                        onClick={onSubmit}
                        disabled={!canSubmit || isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                    </button>
                )}
            </div>

            {/* Step dots */}
            <div className="quiz-view__dots" aria-hidden="true">
                {Array.from({ length: totalQuestions }, (_, i) => (
                    <span
                        key={i}
                        className={clsx(
                            'quiz-view__dot',
                            i === currentStep && 'quiz-view__dot--active',
                            selectedAnswers[`q-${i}`] !== undefined && 'quiz-view__dot--answered',
                        )}
                    />
                ))}
            </div>
        </div>
    );
}
