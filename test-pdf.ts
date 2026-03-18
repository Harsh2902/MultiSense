import { extractFromPDF } from './src/lib/files/extractors';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function testExtraction() {
    try {
        console.log('Testing PDF Extraction...');

        const storageDir = path.join(os.tmpdir(), 'learning-files');

        // Just look for any PDF to test with
        const findPdf = (dir: string): string | null => {
            if (!fs.existsSync(dir)) return null;
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    const result = findPdf(fullPath);
                    if (result) return result;
                } else if (file.endsWith('.pdf')) {
                    return fullPath;
                }
            }
            return null;
        };

        const testPdf = findPdf(storageDir);

        if (!testPdf) {
            console.log(`No PDF found in storage directory: ${storageDir}`);
            return;
        }

        console.log(`Found PDF to test: ${testPdf}`);
        const buffer = fs.readFileSync(testPdf).buffer;

        const result = await extractFromPDF(buffer);
        console.log('Extraction successful!');
        console.log(`Text length: ${result.text.length}`);
        console.log(`Word count: ${result.metadata.word_count}`);
        console.log(`Preview: ${result.text.substring(0, 100)}...`);

    } catch (err) {
        console.error('Extraction failed:', err);
    }
}

testExtraction();
