'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bot, BookOpen, Sparkles, Upload, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUploader } from '@/features/learning/components/FileUploader';
import { SourceList } from '@/features/learning/components/SourceList';
import { useSources } from '@/features/learning/hooks/useLearning';
import { uploadFile, submitYouTube, triggerProcessing } from '@/features/learning/api';
import { createConversation } from '@/features/chat/api';
import type { LearningSourceRow } from '@/types/learning';

export default function LearningPage() {
    const router = useRouter();
    const { sources, isLoading, error, remove, retry, refetch } = useSources(null);

    const [activeLibraryConversationId, setActiveLibraryConversationId] = useState<string | null>(null);
    const [youtubeUrl, setYouTubeUrl] = useState('');
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [isSubmittingYouTube, setIsSubmittingYouTube] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const isProcessingAny = useMemo(
        () => sources.some((source) => source.status === 'pending' || source.status === 'processing'),
        [sources]
    );
    const hasPending = useMemo(
        () => sources.some((source) => source.status === 'pending'),
        [sources]
    );

    useEffect(() => {
        if (!isProcessingAny) return;

        const intervalId = setInterval(() => {
            void refetch();
            if (hasPending) {
                void triggerProcessing('pending-poll');
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [hasPending, isProcessingAny, refetch]);

    const createLibraryConversation = useCallback(async (titleHint?: string) => {
        const titleBase = (titleHint || 'Learning Library').trim();
        const title = titleBase.length > 60 ? `${titleBase.slice(0, 57)}...` : titleBase;
        const { conversation } = await createConversation({
            mode: 'learning',
            title: `Library: ${title}`,
        });
        setActiveLibraryConversationId(conversation.id);
        return conversation.id;
    }, []);

    const ensureLibraryConversation = useCallback(async (titleHint?: string) => {
        if (activeLibraryConversationId) return activeLibraryConversationId;
        return createLibraryConversation(titleHint);
    }, [activeLibraryConversationId, createLibraryConversation]);

    const handleFileUpload = useCallback(async (file: File) => {
        setActionError(null);
        setIsUploadingFile(true);

        try {
            const conversationId = await ensureLibraryConversation(file.name);
            const result = await uploadFile(conversationId, file);
            await triggerProcessing(result.source.id);
            await refetch();
            return result.source;
        } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : 'File upload failed';
            setActionError(message);
            return null;
        } finally {
            setIsUploadingFile(false);
        }
    }, [ensureLibraryConversation, refetch]);

    const handleYouTubeSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedUrl = youtubeUrl.trim();
        if (!trimmedUrl) return;

        setActionError(null);
        setIsSubmittingYouTube(true);

        try {
            const conversationId = await ensureLibraryConversation(trimmedUrl);
            const result = await submitYouTube(conversationId, trimmedUrl);
            setYouTubeUrl('');
            await triggerProcessing(result.source.id);
            await refetch();
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Failed to add YouTube video';
            setActionError(message);
        } finally {
            setIsSubmittingYouTube(false);
        }
    }, [ensureLibraryConversation, refetch, youtubeUrl]);

    const openSourceChat = useCallback(async (source: LearningSourceRow) => {
        setActionError(null);
        router.push(`/learning/${source.id}`);
    }, [router]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
        },
    };

    return (
        <div className="w-full min-h-full bg-zinc-950 text-zinc-100 p-6 md:p-12">
            <motion.div
                className="max-w-5xl mx-auto space-y-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <div className="flex justify-center">
                    <div className="relative inline-flex bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                        <button
                            type="button"
                            onClick={() => router.push('/chat')}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all text-zinc-400 hover:text-zinc-200"
                        >
                            <Bot className="h-4 w-4" />
                            Chat
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all bg-zinc-700 text-white shadow-sm"
                        >
                            <BookOpen className="h-4 w-4" />
                            Learning
                        </button>
                    </div>
                </div>

                <motion.div variants={itemVariants} className="space-y-4 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-3">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                            <Sparkles className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Learning Center
                        </h1>
                    </div>
                    <p className="text-zinc-400 text-lg max-w-3xl leading-relaxed">
                        Upload files, add YouTube links, and build library-specific chats. Each library conversation keeps its own personalized context.
                    </p>
                </motion.div>

                <motion.div variants={itemVariants} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-sm text-zinc-400">
                        {activeLibraryConversationId
                            ? `Active library chat: ${activeLibraryConversationId}`
                            : 'No active library selected. A new library chat will be created automatically on first upload.'}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                            onClick={() => void createLibraryConversation('New Library')}
                        >
                            New Library Chat
                        </Button>
                        {activeLibraryConversationId && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-zinc-400 hover:text-white"
                                onClick={() => setActiveLibraryConversationId(null)}
                            >
                                Clear Active
                            </Button>
                        )}
                    </div>
                </motion.div>

                {actionError && (
                    <motion.div variants={itemVariants} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                        {actionError}
                    </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Upload className="h-5 w-5 text-indigo-400" />
                            <h2 className="text-xl font-semibold">Add Content</h2>
                        </div>

                        <div className="p-1 rounded-2xl bg-gradient-to-b from-white/10 to-transparent">
                            <div className="bg-zinc-900/80 backdrop-blur-xl rounded-xl p-6 border border-white/5 shadow-xl space-y-6">
                                <FileUploader
                                    onUpload={handleFileUpload}
                                    isUploading={isUploadingFile}
                                    error={actionError}
                                />

                                <form onSubmit={handleYouTubeSubmit} className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                                        <Youtube className="h-4 w-4 text-red-400" />
                                        Add YouTube Link
                                    </div>
                                    <Input
                                        type="url"
                                        value={youtubeUrl}
                                        onChange={(event) => setYouTubeUrl(event.target.value)}
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        className="bg-zinc-950 border-zinc-700 text-zinc-100"
                                        disabled={isSubmittingYouTube}
                                    />
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isSubmittingYouTube || !youtubeUrl.trim()}
                                    >
                                        {isSubmittingYouTube ? 'Adding video...' : 'Add Video'}
                                    </Button>
                                </form>

                                <p className="text-xs text-zinc-500 text-center">
                                    Supported: PDF, DOCX, TXT, MD, and YouTube URLs
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-emerald-400" />
                                <h2 className="text-xl font-semibold">Your Library</h2>
                            </div>
                        </div>

                        <div className="min-h-[400px] p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <SourceList
                                sources={sources}
                                isLoading={isLoading}
                                error={error}
                                onDelete={(sourceId) => {
                                    void remove(sourceId)
                                        .then(() => {
                                            void refetch();
                                        })
                                        .catch((deleteError) => {
                                            const message = deleteError instanceof Error
                                                ? deleteError.message
                                                : 'Failed to delete source';
                                            setActionError(message);
                                        });
                                }}
                                onRetry={(sourceId) => {
                                    void retry(sourceId)
                                        .then(() => {
                                            void triggerProcessing(sourceId);
                                            void refetch();
                                        })
                                        .catch((retryError) => {
                                            const message = retryError instanceof Error
                                                ? retryError.message
                                                : 'Failed to retry source processing';
                                            setActionError(message);
                                        });
                                }}
                                onRefetch={() => {
                                    void refetch();
                                }}
                                onOpenChat={(source) => {
                                    void openSourceChat(source);
                                }}
                            />
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
