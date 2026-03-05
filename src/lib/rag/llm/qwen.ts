
import { LLMInterface } from '../types';
import { AI_DEFAULTS } from '@/config/ai';

interface OllamaGenerateResponse {
    response: string;
    done: boolean;
    context?: number[];
}

export class QwenLLM implements LLMInterface {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl: string = 'http://localhost:11434', model: string = 'qwen2.5:3b') {
        this.baseUrl = baseUrl;
        this.model = model;
    }

    async generate(prompt: string, systemPrompt?: string): Promise<string> {
        const body: Record<string, any> = {
            model: this.model,
            prompt: prompt,
            stream: false,
        };

        if (systemPrompt) {
            body.system = systemPrompt;
        }

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`Ollama Generation Error: ${response.statusText}`);
        }

        const data = (await response.json()) as OllamaGenerateResponse;
        return data.response;
    }

    async *stream(prompt: string, systemPrompt?: string): AsyncIterable<string> {
        const body: Record<string, any> = {
            model: this.model,
            prompt: prompt,
            stream: true,
        };

        if (systemPrompt) {
            body.system = systemPrompt;
        }

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
            throw new Error(`Ollama Stream Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line) as OllamaGenerateResponse;
                        if (chunk.response) {
                            yield chunk.response;
                        }
                    } catch (e) {
                        // ignore malformed json
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
