import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const response = NextResponse.redirect(new URL('/chat', request.url));

    // Set the demo_session cookie
    // Path / ensures it works for the whole app
    // SameSite=Lax involves sensible security that allows top-level navigations
    response.cookies.set('demo_session', 'true', {
        path: '/',
        maxAge: 3600, // 1 hour
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    });

    return response;
}
