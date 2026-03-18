'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import { StudyToolMessage } from '@/components/chat/study-tool-message';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
    conversation_id?: string;
}

import { motion } from 'framer-motion';

export const MessageBubble = React.memo(function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === 'user';
    const isStudyToolMessage = (
        message.role === 'assistant' &&
        typeof message.metadata?.study_tool === 'string' &&
        (message.metadata?.study_tool === 'quiz' || message.metadata?.study_tool === 'flashcards')
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
                "group w-full text-zinc-100 dark:border-gray-900/50",
                // Removed border-b to make it look more like modern chat
                "py-2"
            )}
        >
            <div className={cn(
                "text-base gap-4 md:gap-6 md:max-w-3xl lg:max-w-[40rem] xl:max-w-[48rem] p-4 flex lg:px-0 m-auto",
                // Flex direction reverse for user to align right
                isUser ? "flex-row-reverse" : "flex-row"
            )}>
                <div className="flex-shrink-0 flex flex-col relative items-end">
                    <div className={cn(
                        "relative h-8 w-8 rounded-lg flex items-center justify-center shadow-sm",
                        isUser ? "bg-zinc-100 text-zinc-900" : "bg-primary text-primary-foreground"
                    )}>
                        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                    </div>
                </div>

                <div className={cn(
                    "relative flex-1 overflow-hidden break-words rounded-2xl p-4 shadow-sm",
                    isUser ? "bg-zinc-800 text-zinc-100 rounded-tr-none" : "bg-zinc-800/50 text-zinc-100 rounded-tl-none border border-zinc-700/50"
                )}>
                    {isStudyToolMessage ? (
                        <StudyToolMessage metadata={message.metadata} />
                    ) : (
                        <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
                            {isUser ? (
                                <div className="whitespace-pre-wrap">{message.content}</div>
                            ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                </ReactMarkdown>
                            )}
                        </div>
                    )}
                </div>

                {/* Spacer to prevent message from stretching too wide if short */}
                <div className="flex-[0_1_20%]" />
            </div>
        </motion.div>
    );
});
