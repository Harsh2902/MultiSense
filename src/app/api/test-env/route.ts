import { NextResponse } from 'next/server';
import fs from 'fs';

export const GET = async () => {
    // Dump all AI-related env vars
    const envs = {
        Google: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'EXISTS' : 'MISSING',
        GoogleRaw: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        Gemini: process.env.GEMINI_API_KEY ? 'EXISTS' : 'MISSING',
        GeminiRaw: process.env.GEMINI_API_KEY,
        OpenAI: process.env.OPENAI_API_KEY ? 'EXISTS' : 'MISSING',
        Groq: process.env.GROQ_API_KEY ? 'EXISTS' : 'MISSING'
    };

    fs.writeFileSync('env-dump.json', JSON.stringify(envs, null, 2));

    return NextResponse.json(envs);
};
