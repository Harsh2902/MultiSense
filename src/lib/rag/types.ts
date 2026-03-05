export type DocumentType = 'pdf' | 'text' | 'image' | 'audio' | 'video';

export interface RagDocument {
    id?: string;
    userId: string;
    title: string;
    originalFilename: string;
    filePath: string;
    fileType: DocumentType;
    mimeType: string;
    metadata: Record<string, any>;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface DocumentChunk {
    id?: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    embedding?: number[];
    metadata: Record<string, any>; // { page: number, start: number, end: number }
}

export interface ProcessingResult {
    text: string;
    metadata: Record<string, any>;
}

export interface LoaderInterface {
    load(filePath: string, mimeType: string): Promise<ProcessingResult>;
}

export interface EmbedderInterface {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    readonly dimension: number;
}

export interface LLMInterface {
    generate(prompt: string, systemPrompt?: string): Promise<string>;
    stream(prompt: string, systemPrompt?: string): AsyncIterable<string>;
}

export interface VectorStoreInterface {
    saveDocument(doc: RagDocument): Promise<string>; // returns ID
    updateDocumentStatus(id: string, status: RagDocument['status'], error?: string): Promise<void>;
    saveChunks(chunks: DocumentChunk[]): Promise<void>;
    similaritySearch(queryEmbedding: number[], limit: number, filterUserId?: string): Promise<SearchResult[]>;
}

export interface SearchResult {
    id: string;
    documentId: string;
    content: string;
    similarity: number;
    metadata: Record<string, any>;
}
