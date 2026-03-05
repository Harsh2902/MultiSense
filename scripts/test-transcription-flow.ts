
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { generateAiTranscript } from '../src/lib/youtube/ai-transcript';

const VIDEO_ID = 'TqPzwenhMj0';

async function run() {
    console.log(`[Test] Starting AI Transcript Flow for ${VIDEO_ID}...`);
    try {
        const result = await generateAiTranscript(VIDEO_ID);
        console.log('[Test] Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('[Test] Fatal Error:', error);
    }
}

run();
