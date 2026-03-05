import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { fetchVideoMetadata } from '../src/lib/youtube/validation';
import { extractTranscript } from '../src/lib/youtube/transcript';
import { generateAiTranscript } from '../src/lib/youtube/ai-transcript';

const VIDEO_ID = 'TqPzwenhMj0';

async function run() {
    console.log(`Testing video: ${VIDEO_ID}`);

    try {
        console.log('1. Fetching Metadata...');
        const metadata = await fetchVideoMetadata(VIDEO_ID);
        console.log('Metadata:', JSON.stringify(metadata, null, 2));

        console.log('\n2. Extracting Standard Transcript...');
        const transcript = await extractTranscript(VIDEO_ID);
        console.log('Standard Transcript:', {
            available: transcript.available,
            wordCount: transcript.wordCount,
            error: transcript.error
        });

        console.log('\n3. Testing AI Transcription...');
        if (process.env.GROQ_API_KEY) {
            const aiTranscript = await generateAiTranscript(VIDEO_ID);
            console.log('AI Transcript:', {
                available: aiTranscript.available,
                wordCount: aiTranscript.wordCount,
                error: aiTranscript.error,
                isAi: aiTranscript.isAiGenerated
            });
        } else {
            console.log('Skipping AI test (no API key)');
        }

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

run();
