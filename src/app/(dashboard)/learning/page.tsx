'use client';

import { useState } from 'react';
import { FileUploader } from '@/features/learning/components/FileUploader';
import { SourceList } from '@/features/learning/components/SourceList';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSources, useFileUpload } from '@/features/learning/hooks/useLearning';

export default function LearningPage() {
    // Hooks for real data
    // Passing null to list all sources (assuming backend supports it)
    const { sources, isLoading, remove, retry } = useSources(null);
    const { upload, isUploading } = useFileUpload(null);

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
        <div className="w-full min-h-full bg-zinc-950 text-zinc-100 p-6 md:p-12">
            <motion.div
                className="max-w-5xl mx-auto space-y-12"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Header Section */}
                <motion.div variants={itemVariants} className="space-y-4 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-3">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                            <Sparkles className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Learning Center
                        </h1>
                    </div>
                    <p className="text-zinc-400 text-lg max-w-2xl leading-relaxed">
                        Manage your knowledge base. Upload documents and add sources to enhance MultiSense's learning capabilities.
                    </p>
                </motion.div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Upload */}
                    <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Upload className="h-5 w-5 text-indigo-400" />
                            <h2 className="text-xl font-semibold">Add Content</h2>
                        </div>

                        <div className="p-1 rounded-2xl bg-gradient-to-b from-white/10 to-transparent">
                            <div className="bg-zinc-900/80 backdrop-blur-xl rounded-xl p-6 border border-white/5 shadow-xl">
                                <FileUploader
                                    onUpload={async (file) => {
                                        await upload(file);
                                    }}
                                    isUploading={isUploading}
                                />
                                <div className="mt-4 text-center">
                                    <p className="text-xs text-zinc-500">
                                        Supported: PDF, Documents, Text files
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Sources List */}
                    <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-emerald-400" />
                                <h2 className="text-xl font-semibold">Your Library</h2>
                            </div>
                            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                                View All
                            </Button>
                        </div>

                        <div className="min-h-[400px] p-6 rounded-2xl bg-zinc-900/50 border border-white/5 backdrop-blur-sm">
                            <SourceList
                                sources={sources}
                                isLoading={isLoading}
                                error={null}
                                onDelete={remove}
                                onRetry={retry}
                                onRefetch={() => { /* implicit via react-query */ }}
                            />
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
