'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatInput } from '@/components/chat/chat-input';
import { MessageList } from '@/components/chat/message-list';
import { Message } from '@/components/chat/message-bubble';
import { Button } from '@/components/ui/button';
import { Bot, GraduationCap, ChevronDown, Plus, FileText, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversations, useConversation, useChatStream } from '@/features/chat';
import { useGreeting } from '@/features/chat/hooks/useGreeting';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';

type Mode = 'chat' | 'learning';

export default function ChatPage() {
    const [mode, setMode] = useState<Mode>('chat');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    // Derived state from URL
    const conversationId = searchParams.get('id');

    // Hooks
    const { create } = useConversations();
    const { messages: historyMessages, appendMessage } = useConversation(conversationId);
    const queryClient = useQueryClient();
    const stream = useChatStream({
        onComplete: (message: any) => {
            // For new chats, we must ensure we write to the correct ID
            // If the message belongs to a conversation ID that isn't the one bound to useConversation,
            // we'll need to handle it. However, onComplete fires after stream is done.
            // By then, the URL might have updated.
            appendMessage(message);
        },
    });

    // Dynamic Greeting Hook
    // Only greet if no conversation ID is present
    const { content: greetingContent, isStreaming: isGreetingStreaming } = useGreeting(!conversationId);

    // Combine history with streaming state
    // If conversationId exists, show history.
    // If not, we might be showing the greeting.
    const messageList = conversationId ? historyMessages : [];
    const displayMessages = [...messageList] as Message[];

    // Insert Greeting if active and no conversation yet (or just started)
    // We show greeting if:
    // 1. We have greeting content or are streaming it
    // 2. AND (No conversation ID OR conversation is empty/just has one user message)
    const isNewOrEmpty = !conversationId || historyMessages.length === 0 || (historyMessages.length === 1 && historyMessages[0]?.role === 'user');

    if (isNewOrEmpty && (greetingContent || isGreetingStreaming)) {
        const greetingMsg: Message = {
            id: 'greeting',
            role: 'assistant',
            content: greetingContent,
        };
        // Ensure greeting is first
        if (displayMessages.length > 0 && displayMessages[0]?.role === 'user') {
            displayMessages.unshift(greetingMsg);
        } else {
            displayMessages.push(greetingMsg);
        }
    }



    if (stream.isStreaming && stream.content) {
        // ... existing code ...
        const streamingMsg: Message = {
            id: 'streaming-response', // Stable ID to prevent re-mounting
            role: 'assistant',
            content: stream.content,
        };
        displayMessages.push(streamingMsg);
    }

    const handleSend = async (content: string) => {
        if (!content.trim() && !selectedFile) return;

        let fullContent = content;
        if (selectedFile) {
            fullContent = `[Attached File: ${selectedFile.name}]\n\n${content}`;
            // Clear file after sending
            setSelectedFile(null);
        }

        let currentId = conversationId;

        // Create conversation if new
        if (!currentId) {
            try {
                // Determine title from content
                const titleText = content || selectedFile?.name || 'New Chat';
                const title = titleText.length > 30 ? titleText.slice(0, 30) + '...' : titleText;
                const { conversation } = await create({ title, mode });
                currentId = conversation.id;

                // Update URL without reloading to stay on same page but establish identity
                // We use router.replace to avoid clogging history with "new -> created" transition
                router.replace(`/chat?id=${currentId}`);
            } catch (error) {
                console.error('Failed to create conversation', error);
                return;
            }
        }

        // Send message
        await stream.send(currentId, fullContent, (optimisticMsg: any) => {
            // If we just created the conversation, currentId is NEW, but appendMessage is bound to OLD (null)
            // So we must manually update the cache for the NEW ID
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
                            onClick={() => setMode('chat')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                mode === 'chat' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                            )}
                        >
                            <Bot className="h-4 w-4" />
                            Chat
                        </button>
                        <button
                            onClick={() => setMode('learning')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                mode === 'learning' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
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
                    {/* Simplified: Always show message list. If empty, it's just empty space until greeting/chat starts. */
                        // The dynamic greeting takes care of the 'empty state' experience.
                        displayMessages.length === 0 && !isGreetingStreaming && !greetingContent ? (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500">
                                {/* Silent empty state or a spinner if needed, but greeting usually fills this. 
                               Keeping it minimal to avoid clashes. */ }
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
                        disabled={stream.isStreaming}
                        selectedFile={selectedFile}
                        onClearFile={() => setSelectedFile(null)}
                    />
                </div>
            </div>
        </div>
    );
}

function UploadCard({ icon, label, description }: { icon: React.ReactNode, label: string, description: string }) {
    return (
        <button className="w-full flex items-center gap-4 p-4 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800 rounded-xl transition-all text-left group">
            <div className="p-2 bg-zinc-950 rounded-lg group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <div>
                <div className="font-medium text-zinc-200">{label}</div>
                <div className="text-xs text-zinc-500">{description}</div>
            </div>
        </button>
    )
}
