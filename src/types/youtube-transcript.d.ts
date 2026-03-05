
declare module 'youtube-transcript' {
    export interface TranscriptSegment {
        text: string;
        start: number;
        duration: number;
    }

    export interface YoutubeTranscriptOptions {
        lang?: string;
        country?: string;
    }

    export class YoutubeTranscript {
        static fetchTranscript(
            videoId: string,
            options?: YoutubeTranscriptOptions
        ): Promise<TranscriptSegment[]>;
    }
}
