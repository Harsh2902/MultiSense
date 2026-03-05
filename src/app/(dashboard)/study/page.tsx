'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, BookOpen, GraduationCap, ArrowLeft, Lock, Youtube, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useConversations } from '@/features/chat/hooks/useConversations'; // Use feature hook
import { submitYouTube } from '@/features/learning/api';

export default function StudyPage() {
    const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const { create } = useConversations();
    const router = useRouter();
    // We pass null initially, but we'll override it in the submit call or use a different flow
    // Actually, useYouTubeSubmit expects conversationId to be constant for the hook life.
    // Instead of using the hook's submit which is bound to null, we should use the API directly OR 
    // simply create the conversation first, then redirect to chat where the user can paste it?
    // Better UX: Create conversation -> Submit Video -> Redirect to Chat.

    // We need a direct submitting function that takes conversationId

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleYoutubeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!youtubeUrl) return;

        setIsSubmitting(true);
        setError(null);
        try {
            // 1. Create a learning conversation
            const { conversation } = await create({
                title: 'YouTube Study Session',
                mode: 'learning'
            });

            // 2. Submit the video to this new conversation
            const { source } = await submitYouTube(conversation.id, youtubeUrl);

            // 3. Trigger processing immediately
            const { triggerProcessing } = await import('@/features/learning/api');
            await triggerProcessing(source.id);

            // 4. Add an initial message to the conversation via API
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversation.id,
                    content: `I've started processing a YouTube video! Please give me a summary once it's ready.`,
                }),
            });

            // 5. Auto-request summary
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: conversation.id,
                    content: "Please summarize this video."
                })
            });

            // 6. Redirect to the new chat
            router.push(`/chat?id=${conversation.id}`);

            setYoutubeUrl('');
            setIsYoutubeOpen(false);
        } catch (err) {
            console.error('Failed to process YouTube link:', err);
            setError(err instanceof Error ? err.message : 'Failed to process video');
        } finally {
            setIsSubmitting(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1
        }
    };

    return (
        <div className="w-full min-h-full bg-zinc-950 text-zinc-100 p-6 md:p-12 relative">
            <motion.div
                className="max-w-5xl mx-auto space-y-12"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Header Section */}
                <motion.div variants={itemVariants} className="space-y-4">
                    <Link href="/" className="inline-flex items-center text-zinc-400 hover:text-white transition-colors mb-4 text-sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/20">
                            <GraduationCap className="h-6 w-6 text-purple-400" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Study Center
                        </h1>
                    </div>
                    <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
                        Supercharge your learning with AI-powered study tools.
                    </p>
                </motion.div>

                {/* Tools Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ToolCard
                        title="Quiz Generator"
                        description="Generate personalized quizzes from your learning sources to test your knowledge."
                        icon={<BrainCircuit className="h-8 w-8 text-indigo-400" />}
                        status="available" // Unlocked
                        variants={itemVariants}
                        onClick={() => console.log('Quiz clicked')}
                    />
                    <ToolCard
                        title="Flashcards"
                        description="Review key concepts with AI-generated flashcards based on your curriculum."
                        icon={<BookOpen className="h-8 w-8 text-emerald-400" />}
                        status="available" // Unlocked
                        variants={itemVariants}
                        onClick={() => console.log('Flashcards clicked')}
                    />
                    <ToolCard
                        title="YouTube Summarizer"
                        description="Get quick, concise summaries of your uploaded documents and videos."
                        icon={<Youtube className="h-8 w-8 text-red-400" />}
                        status="available"
                        variants={itemVariants}
                        onClick={() => setIsYoutubeOpen(true)}
                    />
                </div>
            </motion.div>

            {/* Simple Modal for YouTube */}
            <AnimatePresence>
                {isYoutubeOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl relative"
                        >
                            <button
                                onClick={() => setIsYoutubeOpen(false)}
                                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <Youtube className="h-5 w-5 text-red-500" />
                                Add YouTube Video
                            </h2>

                            <form onSubmit={handleYoutubeSubmit} className="space-y-4">
                                <Input
                                    placeholder="Paste YouTube URL..."
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                    className="bg-zinc-950/50 border-zinc-800"
                                    disabled={isSubmitting}
                                />
                                {error && <p className="text-sm text-red-400">{error}</p>}
                                <div className="flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setIsYoutubeOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting || !youtubeUrl}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Summarize
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ToolCard({ title, description, icon, status, variants, onClick }: any) {
    return (
        <motion.div
            variants={variants}
            onClick={status === 'available' ? onClick : undefined}
            className={cn(
                "group relative overflow-hidden rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6 transition-all",
                status === 'available' ? "hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer" : "opacity-75 cursor-not-allowed"
            )}
        >
            <div className="mb-4 inline-block rounded-xl bg-zinc-950 p-3 shadow-lg group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="mb-2 text-xl font-semibold text-zinc-100 group-hover:text-white">
                {title}
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                {description}
            </p>

            {status === 'coming_soon' && (
                <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 shadow-xl">
                        <Lock className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-300">Coming Soon</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// Add cn utility imports if needed, assumed available from previous context or I'll add import
import { cn } from '@/lib/utils';
