import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * A simple ephemeral storage layer to replace Supabase Storage.
 * In a production Vercel environment, this uses `/tmp` which is ephemeral.
 * For permanent storage in production, consider `@vercel/blob` or AWS S3.
 */
export class EphemeralStorage {
    private readonly baseDir: string;

    constructor() {
        // Use OS temp directory (works locally and on Vercel)
        this.baseDir = path.join(os.tmpdir(), 'learning-files');
    }

    private async ensureDirectory(dir: string): Promise<void> {
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * Upload a file buffer to storage
     */
    async upload(storagePath: string, buffer: ArrayBuffer, options?: any): Promise<{ error: Error | null }> {
        try {
            const fullPath = path.join(this.baseDir, storagePath);
            await this.ensureDirectory(path.dirname(fullPath));
            await fs.writeFile(fullPath, Buffer.from(buffer));
            return { error: null };
        } catch (error) {
            console.error('[EphemeralStorage] Upload error:', error);
            return { error: error as Error };
        }
    }

    /**
     * Download a file from storage
     */
    async download(storagePath: string): Promise<{ data: Blob | null; error: Error | null }> {
        try {
            const fullPath = path.join(this.baseDir, storagePath);
            const buffer = await fs.readFile(fullPath);
            // Convert Buffer to Blob for compatibility with existing code expectation
            const blob = new Blob([buffer]);
            return { data: blob, error: null };
        } catch (error) {
            console.error('[EphemeralStorage] Download error:', error);
            return { data: null, error: error as Error };
        }
    }

    /**
     * Remove files from storage
     */
    async remove(paths: string[]): Promise<{ error: Error | null }> {
        try {
            for (const p of paths) {
                const fullPath = path.join(this.baseDir, p);
                try {
                    await fs.unlink(fullPath);
                } catch (e: any) {
                    if (e.code !== 'ENOENT') throw e; // Ignore if already missing
                }
            }
            return { error: null };
        } catch (error) {
            console.error('[EphemeralStorage] Remove error:', error);
            return { error: error as Error };
        }
    }
}

export const storage = new EphemeralStorage();
