// =============================================================================
// MessageInput - Chat input with auto-resize and keyboard shortcuts
// =============================================================================

'use client';

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface MessageInputProps {
    /** Submit handler */
    onSubmit: (content: string) => void;
    /** Whether input should be disabled (streaming) */
    disabled?: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Chat message input with:
 * - Auto-resize textarea
 * - Enter to submit, Shift+Enter for newline
 * - Disabled during streaming
 * - Empty submit prevention
 */
export const MessageInput = memo(function MessageInput({
    onSubmit,
    disabled = false,
    placeholder = 'Type a message...',
    className = '',
}: MessageInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }, [value]);

    // Focus textarea when not disabled
    useEffect(() => {
        if (!disabled) {
            textareaRef.current?.focus();
        }
    }, [disabled]);

    const handleSubmit = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
        setValue('');
    }, [value, disabled, onSubmit]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter = submit, Shift+Enter = newline
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        // Escape = blur (useful for screen readers)
        if (e.key === 'Escape') {
            textareaRef.current?.blur();
        }
    }, [handleSubmit]);

    return (
        <div className={clsx('message-input', className)}>
            <textarea
                ref={textareaRef}
                className="message-input__textarea"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                aria-label="Message input"
                aria-describedby="message-input-hint"
            />
            <span id="message-input-hint" className="sr-only">
                Press Enter to send, Shift+Enter for new line
            </span>
            <button
                type="button"
                className="message-input__send-btn"
                onClick={handleSubmit}
                disabled={disabled || !value.trim()}
                aria-label="Send message"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
            </button>
        </div>
    );
});
