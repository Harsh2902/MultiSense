// =============================================================================
// FlashcardCard - Flip animation with learned toggle
// =============================================================================

'use client';

import { memo, useCallback, useEffect } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import clsx from 'clsx';
import type { FlashcardRow } from '@/types/study';

// =============================================================================
// FlashcardCard
// =============================================================================

interface FlashcardCardProps {
    card: FlashcardRow;
    isFlipped: boolean;
    onFlip: () => void;
    onToggleLearned: (cardId: string, learned: boolean) => void;
}

export const FlashcardCard = memo(function FlashcardCard({
    card,
    isFlipped,
    onFlip,
    onToggleLearned,
}: FlashcardCardProps) {
    // Keyboard shortcuts: Space to flip, L to toggle learned
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === ' ') {
            e.preventDefault();
            onFlip();
        }
        if (e.key === 'l' || e.key === 'L') {
            onToggleLearned(card.id, !card.is_learned);
        }
    }, [card.id, card.is_learned, onFlip, onToggleLearned]);

    const frontHtml = renderMarkdown(card.front);
    const backHtml = renderMarkdown(card.back);

    return (
        <div
            className={clsx(
                'flashcard',
                isFlipped && 'flashcard--flipped',
                card.is_learned && 'flashcard--learned',
            )}
            onClick={onFlip}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`Flashcard: ${isFlipped ? 'showing answer' : 'showing question'}. Press space to flip.`}
        >
            {/* Front face */}
            <div className="flashcard__face flashcard__face--front">
                <div
                    className="flashcard__content prose"
                    dangerouslySetInnerHTML={{ __html: frontHtml }}
                />
                <span className="flashcard__hint">Click or press Space to flip</span>
            </div>

            {/* Back face */}
            <div className="flashcard__face flashcard__face--back">
                <div
                    className="flashcard__content prose"
                    dangerouslySetInnerHTML={{ __html: backHtml }}
                />
            </div>

            {/* Learned toggle */}
            <button
                type="button"
                className={clsx(
                    'flashcard__learned-btn',
                    card.is_learned && 'flashcard__learned-btn--active',
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleLearned(card.id, !card.is_learned);
                }}
                aria-label={card.is_learned ? 'Mark as unlearned' : 'Mark as learned'}
                aria-pressed={card.is_learned}
            >
                {card.is_learned ? '✓ Learned' : '○ Mark learned'}
            </button>
        </div>
    );
});

// =============================================================================
// FlashcardProgress - Progress bar with count
// =============================================================================

interface FlashcardProgressProps {
    current: number;
    total: number;
    learnedCount: number;
}

export const FlashcardProgress = memo(function FlashcardProgress({
    current,
    total,
    learnedCount,
}: FlashcardProgressProps) {
    const percentage = total > 0 ? Math.round((learnedCount / total) * 100) : 0;

    return (
        <div className="flashcard-progress" role="status" aria-label={`${learnedCount} of ${total} cards learned`}>
            <div className="flashcard-progress__info">
                <span className="flashcard-progress__count">
                    Card {current + 1} / {total}
                </span>
                <span className="flashcard-progress__learned">
                    {learnedCount} / {total} learned ({percentage}%)
                </span>
            </div>
            <div className="flashcard-progress__bar">
                <div
                    className="flashcard-progress__bar-fill"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
});
