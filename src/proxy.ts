import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
    '/',
    '/login(.*)',
    '/signup(.*)',
    '/sso-callback(.*)',
    '/api/health',
    '/api/guest-login(.*)'
]);

export const proxy = clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
        // Demo session check for guest login bypass
        const isDemoSession = request.cookies.get('demo_session')?.value === 'true';
        if (!isDemoSession) {
            await auth.protect();
        }
    }

    // Handle root route redirection
    if (request.nextUrl.pathname === '/') {
        const authObj = await auth();
        const isDemoSession = request.cookies.get('demo_session')?.value === 'true';
        if (authObj.userId || isDemoSession) {
            return NextResponse.redirect(new URL('/chat', request.url));
        }
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
