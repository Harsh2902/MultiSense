
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { YtDlp } from '../src/lib/youtube/ytdlp';

async function run() {
    console.log('Testing yt-dlp wrapper...');
    const videoId = '94UHCEmprCY';

    try {
        console.log(`Getting audio URL for ${videoId}...`);
        const url = await YtDlp.getInstance().getAudioUrl(videoId);
        console.log('Success! URL length:', url.length);
        console.log('URL start:', url.substring(0, 50));
    } catch (e: any) {
        console.error('Test failed:', e);
    }
}

run();
