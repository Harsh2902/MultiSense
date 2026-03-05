
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET() {
    const cwd = process.cwd();
    const cookiePath = path.resolve(cwd, 'youtube_cookies.txt');
    const exists = fs.existsSync(cookiePath);

    let contentSnippet = '';
    if (exists) {
        try {
            const content = fs.readFileSync(cookiePath, 'utf-8');
            contentSnippet = content.substring(0, 100) + '...';
        } catch (e: any) {
            contentSnippet = `Error reading: ${e.message}`;
        }
    }

    return NextResponse.json({
        cwd,
        cookiePath,
        exists,
        contentSnippet,
        envCookies: !!process.env.YOUTUBE_COOKIES,
        envCookiesLen: process.env.YOUTUBE_COOKIES?.length
    });
}
