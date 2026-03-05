// =============================================================================
// Next.js Middleware - Route protection and session refresh
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// =============================================================================
// Route Configuration
// =============================================================================

/**
 * Routes that require authentication
 * Users without a session will be redirected to /login
 */
const PROTECTED_ROUTES = [
    '/chat',
    '/learn',
    '/study',
    '/settings',
    '/api/chat',
    '/api/learning',
    '/api/rag',
    '/api/study',
];

/**
 * Auth routes that should redirect to dashboard if already authenticated
 */
const AUTH_ROUTES = ['/login', '/signup', '/auth'];

/**
 * Public routes that bypass auth check
 */
const PUBLIC_ROUTES = ['/', '/about', '/api/health'];

// =============================================================================
// Middleware Function
// =============================================================================

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Create Supabase client for middleware
    const { supabase, response } = createMiddlewareClient(request);

    // Refresh session if needed (this is the main purpose of middleware)
    // IMPORTANT: Always call getUser() to refresh the session
    const { data: { user } } = await supabase.auth.getUser();

    // Check route type
    const isProtected = PROTECTED_ROUTES.some(route =>
        pathname.startsWith(route)
    );
    const isAuthRoute = AUTH_ROUTES.some(route =>
        pathname.startsWith(route)
    );
    const isPublic = PUBLIC_ROUTES.some(route =>
        pathname === route || pathname.startsWith(route + '/')
    );

    // DEMO MODE: Check for demo session cookie
    const isDemoSession = request.cookies.get('demo_session')?.value === 'true';

    // Redirect unauthenticated users from protected routes
    if (isProtected && !user && !isDemoSession) {
        const redirectUrl = new URL('/login', request.url);

        // Preserve the intended destination for post-login redirect
        if (!pathname.startsWith('/api')) {
            redirectUrl.searchParams.set('redirectTo', pathname);
        }

        return NextResponse.redirect(redirectUrl);
    }

    // Redirect authenticated users away from auth routes
    if (isAuthRoute && user) {
        // Check for taking user to their intended destination
        const redirectTo = request.nextUrl.searchParams.get('redirectTo');
        const destination = redirectTo || '/chat';
        return NextResponse.redirect(new URL(destination, request.url));
    }

    // Root route handling:
    // - Authenticated -> /chat
    // - Unauthenticated -> /login (or landing page if we had one, but keeping it simple as per request)
    if (pathname === '/') {
        if (user || isDemoSession) {
            return NextResponse.redirect(new URL('/chat', request.url));
        } else {
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // API routes: Return 401 for unauthenticated requests to protected APIs
    // (This is defense-in-depth; API routes also check auth internally)
    if (pathname.startsWith('/api') && isProtected && !user) {
        return NextResponse.json(
            { error: 'Unauthorized', code: 'UNAUTHORIZED' },
            { status: 401 }
        );
    }

    return response;
}

// =============================================================================
// Matcher Configuration
// =============================================================================

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - Public files with extensions (images, fonts, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
    ],
};
