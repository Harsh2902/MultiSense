// =============================================================================
// Token Accounting - Centralized token estimation, limits, and safety
// =============================================================================

import { FEATURE_TOKEN_LIMITS, type FeatureName } from '@/config/models';
import { TokenLimitError } from '@/types/ai.types';
import type { TokenUsage } from '@/types/ai.types';

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count for a string.
 * Uses conservative heuristic: avg of word-based and char-based estimates.
 * This is provider-agnostic and errs on the side of overestimation.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    // Word-based: ~1.3 tokens/word; Char-based: ~4 chars/token
    return Math.ceil((words * 1.3 + chars / 4) / 2);
}

/**
 * Estimate tokens for an array of messages.
 */
export function estimateMessagesTokens(
    messages: Array<{ role: string; content: string }>
): number {
    let total = 0;
    for (const msg of messages) {
        // ~4 tokens overhead per message for role + formatting
        total += estimateTokens(msg.content) + 4;
    }
    return total;
}

// =============================================================================
// Token Budget Checking
// =============================================================================

/**
 * Check if a prompt fits within the token budget for a feature.
 * @returns The remaining tokens available for output.
 * @throws TokenLimitError if input exceeds the limit.
 */
export function checkTokenBudget(
    feature: FeatureName,
    inputTokens: number,
    provider = 'unknown'
): number {
    const limits = FEATURE_TOKEN_LIMITS[feature];
    const maxInput = limits.maxInputTokens - limits.safetyBuffer;

    if (inputTokens > maxInput) {
        throw new TokenLimitError(provider, inputTokens, maxInput);
    }

    return limits.maxOutputTokens;
}

/**
 * Get the max output tokens for a feature.
 */
export function getMaxOutputTokens(feature: FeatureName): number {
    return FEATURE_TOKEN_LIMITS[feature].maxOutputTokens;
}

/**
 * Get the max input tokens for a feature (with safety buffer applied).
 */
export function getMaxInputTokens(feature: FeatureName): number {
    const limits = FEATURE_TOKEN_LIMITS[feature];
    return limits.maxInputTokens - limits.safetyBuffer;
}

// =============================================================================
// Context Trimming
// =============================================================================

/**
 * Trim text to fit within a target token count.
 * Trims from the end, preserving complete sentences where possible.
 */
export function trimToTokenLimit(text: string, maxTokens: number): string {
    const currentTokens = estimateTokens(text);
    if (currentTokens <= maxTokens) return text;

    // Rough char estimate: ~4 chars per token
    const targetChars = maxTokens * 4;
    let trimmed = text.slice(0, targetChars);

    // Try to end at a sentence boundary
    const lastPeriod = trimmed.lastIndexOf('.');
    const lastNewline = trimmed.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);

    if (cutPoint > targetChars * 0.5) {
        trimmed = trimmed.slice(0, cutPoint + 1);
    }

    return trimmed;
}

// =============================================================================
// Usage Tracking
// =============================================================================

/**
 * In-memory token usage tracker.
 * Tracks cumulative usage per request/session.
 */
export class TokenTracker {
    private entries: Array<{
        feature: string;
        provider: string;
        usage: TokenUsage;
        timestamp: number;
    }> = [];

    /**
     * Record a token usage event.
     */
    record(feature: string, provider: string, usage: TokenUsage): void {
        this.entries.push({
            feature,
            provider,
            usage,
            timestamp: Date.now(),
        });
    }

    /**
     * Get total tokens consumed.
     */
    getTotalTokens(): number {
        return this.entries.reduce((sum, e) => sum + e.usage.totalTokens, 0);
    }

    /**
     * Get usage breakdown by feature.
     */
    getBreakdown(): Record<string, { input: number; output: number; total: number }> {
        const result: Record<string, { input: number; output: number; total: number }> = {};

        for (const entry of this.entries) {
            if (!result[entry.feature]) {
                result[entry.feature] = { input: 0, output: 0, total: 0 };
            }
            const bucket = result[entry.feature]!;
            bucket.input += entry.usage.promptTokens;
            bucket.output += entry.usage.completionTokens;
            bucket.total += entry.usage.totalTokens;
        }

        return result;
    }

    /**
     * Log current usage summary.
     */
    logSummary(): void {
        const total = this.getTotalTokens();
        const breakdown = this.getBreakdown();
        console.log('[TokenTracker] Total tokens:', total);
        for (const [feature, usage] of Object.entries(breakdown)) {
            console.log(`  ${feature}: ${usage.total} (in: ${usage.input}, out: ${usage.output})`);
        }
    }
}

// =============================================================================
// JSON Parsing Utility
// =============================================================================

/**
 * Parse JSON response from LLM, stripping any markdown fences.
 * Provider-agnostic utility.
 */
export function parseLlmJson<T>(raw: string): T {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned) as T;
}
