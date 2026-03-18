import Link from 'next/link';
import { Brain, MessageSquare, BookOpen, ArrowRight, Sparkles } from 'lucide-react';

export default function Home() {
    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950 opacity-50" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none opacity-20 -translate-y-1/2" />

            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-16">
                {/* Logo */}
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                    <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25">
                        <Brain className="h-10 w-10 text-white" />
                    </div>
                </div>

                {/* Hero text */}
                <h1 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                    Student Learning Platform
                </h1>
                <p className="text-lg text-zinc-400 text-center mb-12 max-w-md">
                    Your AI-powered study assistant. Chat, learn, and ace your exams.
                </p>

                {/* Feature cards */}
                <div className="grid gap-4 w-full max-w-2xl md:grid-cols-2">
                    <Link
                        href="/chat"
                        className="group bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-primary/30 hover:bg-zinc-900 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 mb-4 group-hover:bg-blue-500/20 transition-colors">
                            <MessageSquare className="h-6 w-6 text-blue-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            Chat Assistant
                            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </h2>
                        <p className="text-sm text-zinc-400">Chat with AI about your documents and questions.</p>
                    </Link>

                    <Link
                        href="/learning"
                        className="group bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-primary/30 hover:bg-zinc-900 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                    >
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 mb-4 group-hover:bg-emerald-500/20 transition-colors">
                            <BookOpen className="h-6 w-6 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                            Learning Sources
                            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                        </h2>
                        <p className="text-sm text-zinc-400">Upload and manage your study materials.</p>
                    </Link>

                </div>

                {/* CTA */}
                <div className="mt-12 flex flex-col items-center gap-3">
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/25"
                    >
                        <Sparkles className="h-4 w-4" />
                        Get Started
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <span className="text-xs text-zinc-500">Free to use • No credit card required</span>
                </div>
            </div>
        </main>
    );
}
