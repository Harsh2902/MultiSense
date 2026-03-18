'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, AlertCircle, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSignUp } from '@clerk/nextjs/legacy';

export default function SignupPage() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pendingVerification, setPendingVerification] = useState(false);
    const [code, setCode] = useState('');
    const router = useRouter();
    const { signUp, isLoaded, setActive } = useSignUp();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || !signUp) return;

        setLoading(true);
        setError('');

        try {
            await signUp.create({
                firstName: fullName.split(' ')[0],
                lastName: fullName.split(' ').slice(1).join(' ') || undefined,
                emailAddress: email,
                password,
            });

            // Send email verification code
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
            setPendingVerification(true);
        } catch (err: any) {
            const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Sign up failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded || !signUp) return;

        setLoading(true);
        setError('');

        try {
            const result = await signUp.attemptEmailAddressVerification({ code });

            if (result.status === 'complete' && setActive) {
                await setActive({ session: result.createdSessionId });
                router.push('/chat');
            } else {
                setError('Verification failed. Please try again.');
            }
        } catch (err: any) {
            const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Verification failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'oauth_github' | 'oauth_google') => {
        if (!isLoaded || !signUp) return;
        try {
            await signUp.authenticateWithRedirect({
                strategy: provider,
                redirectUrl: '/sso-callback',
                redirectUrlComplete: '/chat',
            });
        } catch (err: any) {
            setError(err?.errors?.[0]?.message || 'Social login failed');
        }
    };

    return (
        <div className="w-full max-w-md space-y-6 relative z-10">
            {/* Logo and Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center gap-4"
            >
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                    <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25">
                        <Brain className="h-8 w-8 text-white" />
                    </div>
                </div>
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white">Create Account</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Enter your email below to create your account
                    </p>
                </div>
            </motion.div>

            {/* Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl p-8 space-y-6"
            >
                {pendingVerification ? (
                    /* Verification Form */
                    <form onSubmit={handleVerify} className="flex flex-col gap-4">
                        <div className="text-center mb-2">
                            <h2 className="text-lg font-semibold text-white">Check your email</h2>
                            <p className="text-sm text-zinc-400 mt-1">We sent a verification code to {email}</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider" htmlFor="code">
                                Verification Code
                            </label>
                            <Input
                                id="code"
                                placeholder="Enter 6-digit code"
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                disabled={loading}
                                className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary/50 focus-visible:border-primary/50 h-11 transition-all text-center text-lg tracking-widest"
                            />
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20"
                                >
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Button
                            disabled={loading}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {loading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    Verify Email <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>
                ) : (
                    /* Signup Form */
                    <>
                        <form onSubmit={handleSignup} className="flex flex-col gap-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider" htmlFor="fullName">
                                        Full Name
                                    </label>
                                    <Input
                                        id="fullName"
                                        placeholder="John Doe"
                                        type="text"
                                        autoCapitalize="words"
                                        autoComplete="name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        disabled={loading}
                                        className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary/50 focus-visible:border-primary/50 h-11 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider" htmlFor="email">
                                        Email
                                    </label>
                                    <Input
                                        id="email"
                                        placeholder="name@example.com"
                                        type="email"
                                        autoCapitalize="none"
                                        autoComplete="email"
                                        autoCorrect="off"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={loading}
                                        className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary/50 focus-visible:border-primary/50 h-11 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider" htmlFor="password">
                                        Password
                                    </label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={loading}
                                        className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary/50 focus-visible:border-primary/50 h-11 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Clerk CAPTCHA widget mount point */}
                            <div id="clerk-captcha" />

                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20"
                                    >
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{error}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <Button
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        Sign Up <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>

                        {/* Divider */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-zinc-900 px-2 text-zinc-500 font-medium">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        {/* Social Login */}
                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                variant="outline"
                                type="button"
                                disabled={loading}
                                onClick={() => handleSocialLogin('oauth_github')}
                                className="bg-zinc-950/50 border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-300 h-11 transition-all hover:-translate-y-0.5"
                            >
                                <svg className="mr-2 h-4 w-4" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                </svg>
                                GitHub
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                disabled={loading}
                                onClick={() => handleSocialLogin('oauth_google')}
                                className="bg-zinc-950/50 border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-300 h-11 transition-all hover:-translate-y-0.5"
                            >
                                <svg className="mr-2 h-4 w-4" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                                </svg>
                                Google
                            </Button>
                        </div>

                        {/* Footer */}
                        <p className="px-8 text-center text-sm text-zinc-400">
                            Already have an account?{" "}
                            <Link
                                href="/login"
                                className="underline underline-offset-4 hover:text-primary transition-colors font-medium"
                            >
                                Login
                            </Link>
                        </p>
                    </>
                )}
            </motion.div>
        </div>
    );
}
