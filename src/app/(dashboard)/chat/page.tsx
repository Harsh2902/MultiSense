'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ChatInput } from '@/components/chat/chat-input';
import { MessageList } from '@/components/chat/message-list';
import { Message } from '@/components/chat/message-bubble';
import { Bot, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversations, useConversation, useChatStream } from '@/features/chat';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';

export default function ChatPage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useUser();

    // Derived state from URL
    const conversationId = searchParams.get('id');

    // Track latest conversationId in a ref so callbacks always have current value
    const conversationIdRef = useRef(conversationId);
    useEffect(() => {
        conversationIdRef.current = conversationId;
    }, [conversationId]);

    // Hooks
    const { create } = useConversations();
    const { messages: historyMessages, appendMessage } = useConversation(conversationId);
    const queryClient = useQueryClient();
    const stream = useChatStream({
        onComplete: (message: any) => {
            const currentId = conversationIdRef.current;
            if (currentId) {
                // Write directly to RQ cache to ensure the message persists
                queryClient.setQueryData(
                    queryKeys.conversations.messages(currentId),
                    (old: { data: any[] } | undefined) => {
                        if (!old) return { data: [message], count: 1, has_more: false };
                        // Avoid duplicates
                        if (old.data.some((m: any) => m.id === message.id)) return old;
                        return { ...old, data: [...old.data, message] };
                    }
                );
            }
        },
    });

    useEffect(() => {
        const hasDemoCookie = document.cookie
            .split(';')
            .some((cookie) => cookie.trim().startsWith('demo_session=true'));
        setIsGuest(hasDemoCookie && !user?.id);
    }, [user?.id]);

    const messageList = conversationId ? historyMessages : [];
    const displayMessages = [...messageList] as Message[];
    const firstName = isGuest
        ? 'Guest'
        : (user?.firstName || user?.fullName?.split(' ')[0] || 'Student');

    // Show streaming/completed AI content if it hasn't been merged into history yet
    const streamMsgId = stream.messageId;
    const alreadyInHistory = streamMsgId ? messageList.some(m => m.id === streamMsgId) : false;

    if (stream.content && !alreadyInHistory) {
        const streamingMsg: Message = {
            id: streamMsgId || 'streaming-response',
            role: 'assistant',
            content: stream.content,
        };
        displayMessages.push(streamingMsg);
    }

    const [fileUploading, setFileUploading] = useState(false);

    const handleSend = async (content: string) => {
        if (!content.trim() && !selectedFile) return;

        let currentId = conversationId;

        // Create conversation if new
        if (!currentId) {
            try {
                const titleText = content || selectedFile?.name || 'New Chat';
                const title = titleText.length > 30 ? titleText.slice(0, 30) + '...' : titleText;
                const { conversation } = await create({ title, mode: 'chat' });
                currentId = conversation.id;
                router.replace(`/chat?id=${currentId}`);
            } catch (error) {
                console.error('Failed to create conversation', error);
                return;
            }
        }

        let fullContent = content;

        // If a file is attached, upload it through the learning pipeline for RAG processing
        if (selectedFile) {
            setFileUploading(true);
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('conversation_id', currentId);

                // Upload file to learning sources API
                const uploadRes = await fetch('/api/learning/sources', {
                    method: 'POST',
                    body: formData,
                });

                if (uploadRes.ok) {
                    // Trigger processing (chunk + embed)
                    await fetch('/api/learning/process', { method: 'POST' });

                    // Wait briefly for processing to complete
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    fullContent = `[Attached File: ${selectedFile.name}]\n\n${content}`;
                } else {
                    console.error('File upload failed:', await uploadRes.text());
                    fullContent = `[Attached File: ${selectedFile.name} (upload failed)]\n\n${content}`;
                }
            } catch (err) {
                console.error('File upload error:', err);
                fullContent = `[Attached File: ${selectedFile.name} (upload failed)]\n\n${content}`;
            } finally {
                setFileUploading(false);
                setSelectedFile(null);
            }
        }

        // Send message
        await stream.send(currentId, fullContent, (optimisticMsg: any) => {
            if (!conversationId && currentId) {
                queryClient.setQueryData(
                    queryKeys.conversations.messages(currentId),
                    (old: { data: any[] } | undefined) => {
                        if (!old) return { data: [optimisticMsg], count: 1, has_more: false };
                        return { ...old, data: [...old.data, optimisticMsg] };
                    }
                );
            } else {
                appendMessage(optimisticMsg);
            }
        });
    };

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
    };

    return (
        <div className="flex h-full relative">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full bg-zinc-900">
                {/* Header / Mode Selector */}
                <div className="p-4 flex justify-center bg-zinc-900/80 backdrop-blur-sm border-b border-white/5">
                    <div className="relative inline-flex bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                        <button
                            type="button"
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                "bg-zinc-700 text-white shadow-sm"
                            )}
                        >
                            <Bot className="h-4 w-4" />
                            Chat
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push('/learning')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                "text-zinc-400 hover:text-zinc-200"
                            )}
                        >
                            <GraduationCap className="h-4 w-4" />
                            Learning
                        </button>
                    </div>
                </div>

                {/* Stream Error */}
                {stream.error && (
                    <div className="p-4 bg-red-500/10 border-l-4 border-red-500 text-red-500 text-sm mb-4 mx-4">
                        {stream.error}
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto">
                    {displayMessages.length === 0 ? (
                        <div className="h-full flex items-center justify-center p-8 text-center">
                            <span className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-500/30 select-none">
                                {`Hi, ${firstName}`}
                            </span>
                        </div>
                    ) : (
                        <MessageList messages={displayMessages} isLoading={stream.isStreaming && !stream.content} />
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-zinc-900 border-t border-white/5 relative z-[100] pointer-events-auto">
                    <ChatInput
                        onSend={handleSend}
                        onFileSelect={handleFileSelect}
                        disabled={stream.isStreaming || fileUploading}
                        selectedFile={selectedFile}
                        onClearFile={() => setSelectedFile(null)}
                        uploadingFile={fileUploading}
                    />
                </div>
            </div>
        </div>
    );
}

