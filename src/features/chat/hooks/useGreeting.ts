'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchGreetingStream } from '@/features/chat/api/chat-api';

interface GreetingState {
    content: string;
    isStreaming: boolean;
    error: string | null;
    hasGreeted: boolean;
}

export function useGreeting(shouldGreet: boolean) {
    const [state, setState] = useState<GreetingState>({
        content: '',
        isStreaming: false,
        error: null,
        hasGreeted: false,
    });

    const abortRef = useRef<AbortController | null>(null);
    const ranOnce = useRef(false);

    const startGreeting = useCallback(async () => {
        if (state.hasGreeted || state.isStreaming || ranOnce.current) return;
        ranOnce.current = true;

        setState(prev => ({ ...prev, isStreaming: true, error: null }));

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetchGreetingStream(controller.signal);
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const buffer = decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');

                for (const part of parts) {
                    // console.log('[Greeting] Received part:', part); // Debug
                    const dataLine = part.split('\n').find(line => line.startsWith('data: '));
                    if (!dataLine) continue;

                    try {
                        const event = JSON.parse(dataLine.slice(6));
                        // console.log('[Greeting] Parsed event:', event); // Debug
                        if (event.type === 'token') {
                            accumulatedContent += event.content;
                            setState(prev => ({ ...prev, content: accumulatedContent }));
                        } else if (event.type === 'error') {
                            console.error('[Greeting] Stream error event:', event.error);
                            throw new Error(event.error);
                        }
                    } catch (e) {
                        console.error('[Greeting] Parse error:', e);
                    }
                }
            }

            setState(prev => ({
                ...prev,
                isStreaming: false,
                hasGreeted: true
            }));

        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;

            setState(prev => ({
                ...prev,
                isStreaming: false,
                error: error instanceof Error ? error.message : 'Failed to greet'
            }));
        }
    }, [state.hasGreeted, state.isStreaming]);

    // Cleanup
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    // Auto-trigger
    useEffect(() => {
        if (shouldGreet && !ranOnce.current) {
            startGreeting();
        }
    }, [shouldGreet, startGreeting]);

    return state;
}
