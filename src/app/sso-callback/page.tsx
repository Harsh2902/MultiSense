'use client';

import { useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';

export default function SSOCallbackPage() {
    const { handleRedirectCallback } = useClerk();

    useEffect(() => {
        void handleRedirectCallback({});
    }, [handleRedirectCallback]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-zinc-400">Completing sign in...</p>
            </div>
        </div>
    );
}
