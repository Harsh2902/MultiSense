
import { LoaderInterface, ProcessingResult } from '../types';

export class TextLoader implements LoaderInterface {
    async load(filePath: string, mimeType: string): Promise<ProcessingResult> {
        // In a real app, we'd read from storage or local FS.
        // Assuming we receive a string content or path we can read.
        // For Supabase storage, we might need to download it first.
        // Implementation depends on how we pass the file.
        // If filePath is a local path (after download):
        const fs = await import('fs/promises');
        const text = await fs.readFile(filePath, 'utf-8');

        return {
            text,
            metadata: { source: 'text-loader' }
        };
    }
}
