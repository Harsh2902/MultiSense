'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatInput, type ChatToolAction } from '@/components/chat/chat-input';
import { MessageList } from '@/components/chat/message-list';
import type { Message } from '@/components/chat/message-bubble';
import { fetchSource, linkSourceToConversation } from '@/features/learning/api';
import type { LearningSourceRow } from '@/types/learning';
import { createConversation } from '@/features/chat/api';
import { useConversation, useChatStream } from '@/features/chat';
import { api, getErrorMessage } from '@/features/shared/utils/api-client';
import { queryKeys } from '@/lib/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageRow } from '@/types/chat';
import type {
    FlashcardSetResponse,
    QuizResponse,
    SummaryResponse,
} from '@/types/study';

type SourceTool = 'quiz' | 'flashcards' | 'summary';

const SOURCE_TOOL_ACTIONS: ChatToolAction[] = [
    { id: 'quiz', label: 'Generate Quiz' },
    { id: 'flashcards', label: 'Generate Flashcards' },
    { id: 'summary', label: 'Generate Detailed Summary' },
];

interface InjectMessageResponse {
    success: boolean;
    message: MessageRow;
}

export default function LearningSourceChatPage() {
    const params = useParams<{ sourceId: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const sourceId = Array.isArray(params?.sourceId) ? params?.sourceId[0] : params?.sourceId;
    const { user } = useUser();

    const [source, setSource] = useState<LearningSourceRow | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [bootError, setBootError] = useState<string | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [toolError, setToolError] = useState<string | null>(null);
    const [toolBusy, setToolBusy] = useState<SourceTool | null>(null);

    const conversationIdRef = useRef<string | null>(null);
    useEffect(() => {
        conversationIdRef.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
        const hasDemoCookie = document.cookie
            .split(';')
            .some((cookie) => cookie.trim().startsWith('demo_session=true'));
        setIsGuest(hasDemoCookie && !user?.id);
    }, [user?.id]);

    const bootstrap = useCallback(async () => {
        if (!sourceId) {
            setBootError('Invalid learning source');
            setIsBootstrapping(false);
            return;
        }
        setBootError(null);
        setIsBootstrapping(true);

        try {
            const sourceResponse = await fetchSource(sourceId);
            const loadedSource = sourceResponse.source;
            setSource(loadedSource);

            const scopedSourceId = loadedSource.metadata?.chat_scope_source_id as string | undefined;
            const hasScopedConversation = !!loadedSource.conversation_id && scopedSourceId === loadedSource.id;

            let activeConversationId = loadedSource.conversation_id;

            if (!hasScopedConversation) {
                const titleHint = loadedSource.title || loadedSource.original_filename || 'Learning Source';
                const title = titleHint.length > 60 ? `${titleHint.slice(0, 57)}...` : titleHint;
                const { conversation } = await createConversation({
                    mode: 'learning',
                    title: `Source: ${title}`,
                });
                activeConversationId = conversation.id;

                const linkResponse = await linkSourceToConversation(loadedSource.id, activeConversationId);
                setSource(linkResponse.source);
            }

            setConversationId(activeConversationId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load learning source chat';
            setBootError(message);
        } finally {
            setIsBootstrapping(false);
        }
    }, [sourceId]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    const { messages: historyMessages, appendMessage } = useConversation(conversationId);

    const stream = useChatStream({
        onComplete: (message: MessageRow) => {
            const currentConversationId = conversationIdRef.current;
            if (!currentConversationId) return;

            queryClient.setQueryData(
                queryKeys.conversations.messages(currentConversationId),
                (old: { data: MessageRow[] } | undefined) => {
                    if (!old) return { data: [message], count: 1, has_more: false };
                    if (old.data.some((m) => m.id === message.id)) return old;
                    return { ...old, data: [...old.data, message] };
                }
            );
        },
    });

    const displayMessages = useMemo(() => {
        const base = [...(conversationId ? historyMessages : [])] as Message[];
        const streamMsgId = stream.messageId;
        const exists = streamMsgId ? base.some((m) => m.id === streamMsgId) : false;

        if (stream.content && !exists) {
            base.push({
                id: streamMsgId || 'learning-streaming-response',
                role: 'assistant',
                content: stream.content,
                metadata: {
                    scoped_learning_chat: true,
                    source_id: sourceId,
                },
            });
        }

        return base;
    }, [conversationId, historyMessages, sourceId, stream.content, stream.messageId]);

    const firstName = useMemo(() => {
        if (isGuest) return 'Guest';
        return user?.firstName || user?.fullName?.split(' ')[0] || 'Student';
    }, [isGuest, user?.firstName, user?.fullName]);

    const handleSend = useCallback(async (content: string) => {
        if (!content.trim() || !conversationId || !sourceId) return;

        await stream.send(conversationId, content, (optimisticMsg: Partial<MessageRow>) => {
            appendMessage(optimisticMsg as MessageRow);
        }, sourceId);
    }, [appendMessage, conversationId, sourceId, stream]);

    const appendPersistedMessage = useCallback((message: MessageRow) => {
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;

        queryClient.setQueryData(
            queryKeys.conversations.messages(currentConversationId),
            (old: { data: MessageRow[] } | undefined) => {
                if (!old) return { data: [message], count: 1, has_more: false };
                if (old.data.some((m) => m.id === message.id)) return old;
                return { ...old, data: [...old.data, message] };
            }
        );
    }, [queryClient]);

    const injectAssistantMessage = useCallback(async (
        content: string,
        metadata: Record<string, unknown>
    ) => {
        if (!conversationId) return;

        const injected = await api.post<InjectMessageResponse>('/api/chat/inject', {
            conversation_id: conversationId,
            role: 'assistant',
            content,
            metadata,
        });
        if (injected?.message) {
            appendPersistedMessage(injected.message);
        }
    }, [appendPersistedMessage, conversationId]);

    const generateQuiz = useCallback(async () => {
        if (!conversationId) return;
        setToolBusy('quiz');
        setToolError(null);
        try {
            const response = await api.post<QuizResponse>('/api/study/quiz/generate', {
                conversation_id: conversationId,
                topic: source?.title || source?.original_filename || 'Selected learning source',
            });

            await injectAssistantMessage('Quiz generated from this learning source.', {
                study_tool: 'quiz',
                study_payload: response,
                source_id: sourceId,
                scoped_learning_chat: true,
            });
        } catch (error) {
            setToolError(getErrorMessage(error));
        } finally {
            setToolBusy(null);
        }
    }, [conversationId, injectAssistantMessage, source?.original_filename, source?.title, sourceId]);

    const generateFlashcards = useCallback(async () => {
        if (!conversationId) return;
        setToolBusy('flashcards');
        setToolError(null);
        try {
            const response = await api.post<FlashcardSetResponse>('/api/study/flashcards/generate', {
                conversation_id: conversationId,
                topic: source?.title || source?.original_filename || 'Selected learning source',
            });

            await injectAssistantMessage('Flashcards generated from this learning source.', {
                study_tool: 'flashcards',
                study_payload: response,
                source_id: sourceId,
                scoped_learning_chat: true,
            });
        } catch (error) {
            setToolError(getErrorMessage(error));
        } finally {
            setToolBusy(null);
        }
    }, [conversationId, injectAssistantMessage, source?.original_filename, source?.title, sourceId]);

    const generateSummary = useCallback(async () => {
        if (!conversationId) return;
        setToolBusy('summary');
        setToolError(null);
        try {
            const response = await api.post<SummaryResponse>('/api/study/summary/generate', {
                conversation_id: conversationId,
                summary_type: 'paragraph',
                topic: source?.title || source?.original_filename || 'Selected learning source',
            });

            await injectAssistantMessage(response.summary.content, {
                study_tool: 'summary',
                summary_id: response.summary.id,
                source_id: sourceId,
                scoped_learning_chat: true,
            });
        } catch (error) {
            setToolError(getErrorMessage(error));
        } finally {
            setToolBusy(null);
        }
    }, [conversationId, injectAssistantMessage, source?.original_filename, source?.title, sourceId]);

    const handleToolSelect = useCallback(async (toolId: string) => {
        if (!conversationId || isBootstrapping || stream.isStreaming || !!toolBusy) return;
        if (toolId !== 'quiz' && toolId !== 'flashcards' && toolId !== 'summary') return;

        setToolError(null);

        if (toolId === 'quiz') {
            await generateQuiz();
            return;
        }
        if (toolId === 'flashcards') {
            await generateFlashcards();
            return;
        }
        await generateSummary();
    }, [conversationId, generateFlashcards, generateQuiz, generateSummary, isBootstrapping, stream.isStreaming, toolBusy]);

    return (
        <div className="flex h-full">
            <div className="flex-1 flex flex-col h-full bg-zinc-900">
                <div className="p-4 border-b border-white/5 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-zinc-400 hover:text-white"
                            onClick={() => router.push('/learning')}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-zinc-200 font-medium truncate">
                                <BookOpen className="h-4 w-4 text-emerald-400" />
                                <span className="truncate">{source?.title || 'Learning Source Chat'}</span>
                            </div>
                            <p className="text-xs text-zinc-500 truncate">
                                Scoped to this learning source only
                            </p>
                        </div>
                    </div>
                </div>

                {bootError && (
                    <div className="p-4 m-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg">
                        {bootError}
                    </div>
                )}

                {stream.error && (
                    <div className="p-4 m-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg">
                        {stream.error}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto">
                    {isBootstrapping ? (
                        <div className="h-full flex items-center justify-center text-zinc-500">
                            Loading source chat...
                        </div>
                    ) : displayMessages.length === 0 ? (
                        <div className="h-full flex items-center justify-center p-8 text-center">
                            <span className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-500/30 select-none">
                                {`Hi, ${firstName}`}
                            </span>
                        </div>
                    ) : (
                        <MessageList messages={displayMessages} isLoading={stream.isStreaming && !stream.content} />
                    )}
                </div>

                <div className="p-4 bg-zinc-900 border-t border-white/5">
                    {toolError && (
                        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                            {toolError}
                        </div>
                    )}
                    {toolBusy && (
                        <div className="mb-3 rounded-lg border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-xs text-zinc-300">
                            {toolBusy === 'quiz' && 'Generating quiz from this source...'}
                            {toolBusy === 'flashcards' && 'Generating flashcards from this source...'}
                            {toolBusy === 'summary' && 'Generating summary from this source...'}
                        </div>
                    )}
                    <ChatInput
                        onSend={(message) => {
                            void handleSend(message);
                        }}
                        disabled={isBootstrapping || !conversationId || stream.isStreaming}
                        enableAttachments={false}
                        toolActions={SOURCE_TOOL_ACTIONS}
                        toolMenuLabel="Source Tools"
                        onToolSelect={(toolId) => {
                            void handleToolSelect(toolId);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
