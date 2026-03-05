
import { LoaderInterface, ProcessingResult } from '../types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse');
import * as fs from 'fs/promises';

export class PDFLoader implements LoaderInterface {
    async load(filePath: string, mimeType: string): Promise<ProcessingResult> {
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
