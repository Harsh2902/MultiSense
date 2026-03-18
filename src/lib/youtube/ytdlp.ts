
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export class YtDlp {
    private static instance: YtDlp;

    // Config
    private readonly cookieFile: string;

    private constructor() {
        // Prefer local file if exists, otherwise null
        this.cookieFile = path.resolve(process.cwd(), 'youtube_cookies.txt');
    }

    public static getInstance(): YtDlp {
        if (!YtDlp.instance) {
            YtDlp.instance = new YtDlp();
        }
        return YtDlp.instance;
    }

    private log(message: string) {
        console.log(`[YtDlp] ${message}`);
        try {
            const fsLog = require('fs');
            const pathLog = require('path');
            const logFile = pathLog.join(process.cwd(), 'youtube-debug.log');
            fsLog.appendFileSync(logFile, `[YtDlp] ${new Date().toISOString()}: ${message}\n`);
        } catch { }
    }

    /**
     * Get audio URL using yt-dlp (for debugging)
     */
    public async getAudioUrl(videoId: string): Promise<string> {
        try {
            const command = await this.buildBaseCommand(videoId, '-g');
            // Execute
            const { stdout, stderr } = await execAsync(command);

            if (!stdout.trim()) {
                throw new Error(`yt-dlp returned empty output. Stderr: ${stderr}`);
            }

            return stdout.trim();

        } catch (error: any) {
            console.error('yt-dlp error:', error);
            throw new Error(`yt-dlp failed: ${error.message}`);
        }
    }

    /**
     * Download video to file using yt-dlp
     */
    public async downloadVideo(videoId: string, filePath: string): Promise<void> {
        return this.download(videoId, filePath, 'best[ext=mp4]');
    }

    /**
     * Download audio directly to file using yt-dlp
     */
    public async downloadAudio(videoId: string, filePath: string): Promise<void> {
        return this.download(videoId, filePath, 'bestaudio');
    }

    private get retryAttempts(): number {
        return Number(process.env.YT_DLP_RETRY_ATTEMPTS || 2);
    }

    private get retryBackoffMs(): number {
        return Number(process.env.YT_DLP_RETRY_BACKOFF_MS || 1200);
    }

    private get ytDlpRetries(): number {
        return Number(process.env.YT_DLP_INTERNAL_RETRIES || 2);
    }

    /**
     * Download subtitle track (manual or auto-generated) as VTT.
     * Returns the best subtitle file path found, or null if none were produced.
     */
    public async downloadSubtitles(videoId: string, outputDir: string): Promise<string | null> {
        try {
            await fs.mkdir(outputDir, { recursive: true });
            const baseTemplate = path.join(outputDir, `${videoId}.%(ext)s`);
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            // Prefer Hindi first for multilingual uploads, then English, then any language.
            const subtitleLangAttempts = ['hi.*,hi,en.*,en', 'en.*,en', 'all'];
            for (const subtitleLangs of subtitleLangAttempts) {
                const command = await this.buildSubtitleCommand(videoUrl, baseTemplate, subtitleLangs);
                this.log(`Downloading subtitles (${subtitleLangs}) for ${videoId}`);
                try {
                    await this.execWithRetry(command, `subtitle download (${subtitleLangs})`, { attempts: 1 });
                } catch (error: any) {
                    this.log(`Subtitle attempt failed (${subtitleLangs}) for ${videoId}: ${error.message}`);
                    if (this.isRateLimitError(error)) {
                        this.log(`Rate limit detected for ${videoId}; skipping remaining subtitle language attempts.`);
                        break;
                    }
                    continue;
                }

                const subtitlePath = await this.findBestSubtitleFile(outputDir, videoId);
                if (subtitlePath) {
                    this.log(`Subtitle file found (${subtitleLangs}): ${subtitlePath}`);
                    return subtitlePath;
                }
            }

            this.log(`No subtitles available for ${videoId}`);
            return null;
        } catch (error: any) {
            this.log(`Subtitle download failed for ${videoId}: ${error.message}`);
            return null;
        }
    }

    private async download(videoId: string, filePath: string, format: string): Promise<void> {
        try {
            this.log(`Starting download for ${videoId} to ${filePath} (format: ${format})`);

            // Check cookie file existence just for logging
            try {
                await fs.access(this.cookieFile);
                this.log(`Using cookie file: ${this.cookieFile}`);
            } catch {
                this.log(`Cookie file NOT found at: ${this.cookieFile}`);
                if (process.env.YOUTUBE_COOKIES) {
                    this.log('Will fallback to ENV cookies');
                } else {
                    this.log('No cookies available!');
                }
            }

            let command = await this.buildBaseCommand(videoId, `-o "${filePath}"`, format);

            // Add --force-overwrites
            command += ' --force-overwrites';

            this.log(`Executing Command: ${command}`);
            const { stdout, stderr } = await this.execWithRetry(command, `download (${videoId})`);
            this.log(`stdout: ${stdout.substring(0, 200)}...`); // Log truncated stdout
            if (stderr) this.log(`stderr: ${stderr}`);

            // Check if file exists.
            try {
                await fs.access(filePath);
                this.log(`File verified at: ${filePath}`);
            } catch {
                this.log(`File NOT found at: ${filePath}`);

                const dir = path.dirname(filePath);
                try {
                    const files = await fs.readdir(dir);
                    this.log(`Directory contents of ${dir}: ${JSON.stringify(files)}`);
                } catch (readErr: any) {
                    this.log(`Could not read directory ${dir}: ${readErr.message}`);
                }

                throw new Error(`File download failed, file not found at ${filePath}`);
            }

        } catch (error: any) {
            this.log(`yt-dlp download error: ${error.message}`);
            throw new Error(`yt-dlp download failed: ${error.message}`);
        }
    }

    private async buildBaseCommand(videoId: string, extraArgs: string, format: string = 'bestaudio'): Promise<string> {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Determine executable path
        let executable = 'yt-dlp';
        if (process.env.YT_DLP_PATH) {
            executable = `"${process.env.YT_DLP_PATH}"`;
        } else {
            // Check formatted path for Windows
            const fallbackPath = 'C:\\Users\\HARSH\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\yt-dlp.exe';
            try {
                if (await this.fileExists(fallbackPath)) {
                    executable = `"${fallbackPath}"`;
                    // Don't log here to avoid spamming
                }
            } catch { }
        }

        let command = `${executable} -f ${format} ${extraArgs} --retries ${this.ytDlpRetries} --fragment-retries ${this.ytDlpRetries} --sleep-requests 1 --min-sleep-interval 1 --max-sleep-interval 5 "${videoUrl}"`;

        // Check if cookie file exists
        try {
            await fs.access(this.cookieFile);
            command = `${executable} -f ${format} ${extraArgs} --cookies "${this.cookieFile}" --retries ${this.ytDlpRetries} --fragment-retries ${this.ytDlpRetries} --sleep-requests 1 --min-sleep-interval 1 --max-sleep-interval 5 "${videoUrl}"`;
        } catch {
            // No cookie file, try headers if env var exists (legacy/fallback)
            if (process.env.YOUTUBE_COOKIES) {
                command = `${executable} -f ${format} ${extraArgs} --add-header "Cookie:${process.env.YOUTUBE_COOKIES}" --retries ${this.ytDlpRetries} --fragment-retries ${this.ytDlpRetries} --sleep-requests 1 --min-sleep-interval 1 --max-sleep-interval 5 "${videoUrl}"`;
            }
        }
        return command;
    }

    private async buildSubtitleCommand(videoUrl: string, outputTemplate: string, subtitleLangs: string): Promise<string> {
        let executable = 'yt-dlp';
        if (process.env.YT_DLP_PATH) {
            executable = `"${process.env.YT_DLP_PATH}"`;
        } else {
            const fallbackPath = 'C:\\Users\\HARSH\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\yt-dlp.exe';
            try {
                if (await this.fileExists(fallbackPath)) {
                    executable = `"${fallbackPath}"`;
                }
            } catch { }
        }

        let command = `${executable} --skip-download --write-subs --write-auto-subs --sub-format vtt --convert-subs vtt --sub-langs "${subtitleLangs}" -o "${outputTemplate}" --force-overwrites --retries ${this.ytDlpRetries} --sleep-requests 1 --sleep-subtitles 1 --min-sleep-interval 1 --max-sleep-interval 5 "${videoUrl}"`;

        // Reuse cookies if available.
        try {
            await fs.access(this.cookieFile);
            command = `${executable} --skip-download --write-subs --write-auto-subs --sub-format vtt --convert-subs vtt --sub-langs "${subtitleLangs}" -o "${outputTemplate}" --force-overwrites --retries ${this.ytDlpRetries} --sleep-requests 1 --sleep-subtitles 1 --min-sleep-interval 1 --max-sleep-interval 5 --cookies "${this.cookieFile}" "${videoUrl}"`;
        } catch {
            if (process.env.YOUTUBE_COOKIES) {
                command = `${executable} --skip-download --write-subs --write-auto-subs --sub-format vtt --convert-subs vtt --sub-langs "${subtitleLangs}" -o "${outputTemplate}" --force-overwrites --retries ${this.ytDlpRetries} --sleep-requests 1 --sleep-subtitles 1 --min-sleep-interval 1 --max-sleep-interval 5 --add-header "Cookie:${process.env.YOUTUBE_COOKIES}" "${videoUrl}"`;
            }
        }

        return command;
    }

    private isRetryableError(error: any): boolean {
        const message = String(error?.message || '');
        const stderr = String((error as any)?.stderr || '');
        const combined = `${message}\n${stderr}`.toLowerCase();

        return (
            combined.includes('429') ||
            combined.includes('too many requests') ||
            combined.includes('http error 429') ||
            combined.includes('timed out') ||
            combined.includes('temporarily unavailable') ||
            combined.includes('unable to download webpage')
        );
    }

    private isRateLimitError(error: any): boolean {
        const message = String(error?.message || '');
        const stderr = String((error as any)?.stderr || '');
        const combined = `${message}\n${stderr}`.toLowerCase();
        return combined.includes('429') || combined.includes('too many requests');
    }

    private async execWithRetry(
        command: string,
        context: string,
        options?: { attempts?: number; backoffMs?: number }
    ): Promise<{ stdout: string; stderr: string }> {
        const attempts = options?.attempts ?? this.retryAttempts;
        const backoffMs = options?.backoffMs ?? this.retryBackoffMs;
        let lastError: any;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                if (attempt > 1) {
                    this.log(`Retrying ${context}: attempt ${attempt}/${attempts}`);
                }
                return await execAsync(command, { maxBuffer: 20 * 1024 * 1024 });
            } catch (error: any) {
                lastError = error;
                const retryable = this.isRetryableError(error);
                if (!retryable || attempt >= attempts) {
                    throw error;
                }

                const delayMs = backoffMs * attempt;
                this.log(`Retryable yt-dlp failure for ${context}. Waiting ${delayMs}ms before retry.`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw lastError;
    }

    private async findBestSubtitleFile(outputDir: string, videoId: string): Promise<string | null> {
        const files = await fs.readdir(outputDir);
        const vttFiles = files.filter((file) => file.startsWith(videoId) && file.endsWith('.vtt'));
        if (!vttFiles.length) return null;

        // Prefer non-auto first (usually no ".orig" marker), then shortest lang suffix.
        vttFiles.sort((a, b) => a.length - b.length);
        const preferred = vttFiles.find((file) => !file.includes('.orig')) || vttFiles[0];
        return preferred ? path.join(outputDir, preferred) : null;
    }

    private async fileExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }
}
