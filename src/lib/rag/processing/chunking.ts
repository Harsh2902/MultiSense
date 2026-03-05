
import { DocumentChunk } from '../types';

interface ChunkingOptions {
    chunkSize: number;
    chunkOverlap: number;
}

export class ChunkingStrategy {
    private chunkSize: number;
    private chunkOverlap: number;

    constructor(options?: ChunkingOptions) {
        this.chunkSize = options?.chunkSize || 1000;
        this.chunkOverlap = options?.chunkOverlap || 100;
    }

    splitText(text: string): string[] {
        const chunks: string[] = [];
        let startIndex = 0;

        while (startIndex < text.length) {
            let endIndex = startIndex + this.chunkSize;

            // If we are not at the end, try to find a nice break point
            if (endIndex < text.length) {
                // Try to split at paragraph, then sentence, then space
                const separators = ['\n\n', '\n', '. ', ' '];
                let splitFound = false;

                for (const sep of separators) {
                    const lastSepIndex = text.lastIndexOf(sep, endIndex);
                    if (lastSepIndex > startIndex) {
                        endIndex = lastSepIndex + sep.length;
                        splitFound = true;
                        break;
                    }
                }
            }

            const chunk = text.slice(startIndex, endIndex).trim();
            if (chunk) {
                chunks.push(chunk);
            }

            startIndex = endIndex - this.chunkOverlap;
            // Prevent infinite loop if overlap >= size (shouldn't happen with defaults)
            if (startIndex >= endIndex) {
                startIndex = endIndex;
            }
        }

        return chunks;
    }

    createChunks(documentId: string, text: string, metadata: Record<string, any> = {}): DocumentChunk[] {
        const textChunks = this.splitText(text);
        return textChunks.map((content, index) => ({
            documentId,
            content,
            chunkIndex: index,
            metadata: {
                ...metadata,
                charStart: index * (this.chunkSize - this.chunkOverlap), // Approximate
            }
        }));
    }
}
