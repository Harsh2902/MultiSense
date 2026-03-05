'use client';

import React, { useEffect, useRef } from 'react';
import { MessageBubble, Message } from './message-bubble';

interface MessageListProps {
    messages: Message[];
    isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const bottomDiv = bottomRef.current;
        if (!bottomDiv) return;

        // different behaviors for streaming vs initial load
        if (isLoading) {
            // For initial load or page navigation, use smooth scroll
            bottomDiv.scrollIntoView({ behavior: 'smooth' });
        } else {
            // For streaming tokens, use instant scroll (auto) to prevent jitter
            // and only if user is somewhat near bottom
            const parent = bottomDiv.parentElement;
            if (parent) {
                const isNearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 200;
                if (isNearBottom) {
                    bottomDiv.scrollIntoView({ behavior: 'auto' });
                }
            } else {
                // Fallback
                bottomDiv.scrollIntoView({ behavior: 'auto' });
            }
        }
    }, [messages, isLoading]);

    return (
        <div className="flex flex-col flex-1 pb-4">
            {messages.map((message, index) => (
                <MessageBubble key={message.id || index} message={message} />
            ))}
            {isLoading && (
                <div className="flex items-center justify-center p-4">
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce mx-1"></span>
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce mx-1 delay-100"></span>
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce mx-1 delay-200"></span>
                </div>
            )}
            <div ref={bottomRef} className="h-1" />
        </div>
    );
}
