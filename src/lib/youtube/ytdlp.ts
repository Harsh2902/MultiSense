
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
            const { stdout, stderr } = await execAsync(command);
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

        let command = `${executable} -f ${format} ${extraArgs} "${videoUrl}"`;

        // Check if cookie file exists
        try {
            await fs.access(this.cookieFile);
            command = `${executable} -f ${format} ${extraArgs} --cookies "${this.cookieFile}" "${videoUrl}"`;
        } catch {
            // No cookie file, try headers if env var exists (legacy/fallback)
            if (process.env.YOUTUBE_COOKIES) {
                command = `${executable} -f ${format} ${extraArgs} --add-header "Cookie:${process.env.YOUTUBE_COOKIES}" "${videoUrl}"`;
            }
        }
        return command;
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
