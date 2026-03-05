
import { LoaderInterface, ProcessingResult } from '../types';
import * as fs from 'fs/promises';

export class PDFLoader implements LoaderInterface {
    async load(filePath: string, mimeType: string): Promise<ProcessingResult> {
        // Dynamically import pdf-parse at runtime to avoid Next.js build errors (DOMMatrix is not defined)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdf = require('pdf-parse');

        const dataBuffer = await fs.readFile(filePath);
        const data = await pdf(dataBuffer);

        return {
            text: data.text,
            metadata: {
                pageCount: data.numpages,
                info: data.info,
                source: 'pdf-loader'
            }
        };
    }
}
