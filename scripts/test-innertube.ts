
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getInnertube } from '../src/lib/youtube/client';

const VIDEO_ID = '94UHCEmprCY';

async function run() {
    console.log('Testing Innertube with Cookies (using getInfo)...');

    try {
        const yt = await getInnertube();
        console.log('Innertube initialized.');

        console.log(`Fetching Player Info for ${VIDEO_ID}...`);
        const info = await yt.getInfo(VIDEO_ID);

        console.log('Title:', info.basic_info.title);
        console.log('Duration:', info.basic_info.duration);

        try {
            console.log('\nFetching Transcript...');
            const transcriptData = await info.getTranscript();
            if (transcriptData?.transcript?.content?.body?.initial_segments) {
                console.log('✅ Transcript available with cookies!');
                console.log('Segment count:', transcriptData.transcript.content.body.initial_segments.length);
            } else {
                console.log('❌ Transcript NOT found (even with cookies).');
            }
        } catch (e: any) {
            console.log('❌ Transcript error:', e.message);
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

run();
