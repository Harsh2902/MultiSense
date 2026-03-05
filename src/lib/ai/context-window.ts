// =============================================================================
// Context Window Manager - Handles token counting and context truncation
// =============================================================================

import type { MessageRow, ContextMessage, ContextWindow } from '@/types/chat';
import { appConfig } from '@/config/env';
import { estimateTokens } from '@/lib/ai/tokens';

// =============================================================================
// Token Estimation (re-exported from tokens.ts for convenience)
// =============================================================================

/**
 * Estimate tokens for a message including role overhead
 * Each message has overhead for role prefix, separators, etc.
 * 
 * @param message - Message to count
 * @returns Estimated token count
 */
export function estimateMessageTokens(message: ContextMessage): number {
    // Base overhead for message formatting (role, separators)
    const MESSAGE_OVERHEAD = 4;
    return estimateTokens(message.content) + MESSAGE_OVERHEAD;
}

// =============================================================================
// Context Window Management
// =============================================================================

/**
 * Build a context window from messages
 * Handles truncation when messages exceed the token limit
 * 
 * Strategy:
 * 1. Always include the system prompt (if any)
 * 2. Always include the most recent message (user's current input)
 * 3. Include as many previous messages as fit, oldest first
 * 
 * @param messages - All messages in the conversation
 * @param systemPrompt - Optional system prompt
 * @param maxTokens - Maximum tokens for context (default from config)
 * @returns Context window with messages and metadata
 */
export function buildContextWindow(
    messages: MessageRow[],
    systemPrompt?: string,
    maxTokens: number = appConfig.contextWindowTokens
): ContextWindow {
    const contextMessages: ContextMessage[] = [];
    let totalTokens = 0;
    let truncated = false;

    // Reserve tokens for response (1/4 of context)
    const reserveForResponse = Math.floor(maxTokens / 4);
    const availableTokens = maxTokens - reserveForResponse;

    // 1. Add system prompt if provided
    if (systemPrompt) {
        const systemMessage: ContextMessage = { role: 'system', content: systemPrompt };
        const systemTokens = estimateMessageTokens(systemMessage);

        if (systemTokens <= availableTokens) {
            contextMessages.push(systemMessage);
            totalTokens += systemTokens;
        }
    }

    // 2. Get the most recent user message (must include)
    const recentMessages = [...messages].reverse(); // Most recent first
    const lastUserMessage = recentMessages.find(m => m.role === 'user');

    let lastUserTokens = 0;
    if (lastUserMessage) {
        lastUserTokens = estimateMessageTokens({
            role: lastUserMessage.role,
            content: lastUserMessage.content,
        });
    }

    // 3. Build context from remaining messages
    const remainingTokens = availableTokens - totalTokens - lastUserTokens;
    const historicalMessages: ContextMessage[] = [];
    let historicalTokens = 0;

    // Process messages from oldest to newest, but we built from newest
    // So we need to reverse and then slice
    for (const message of messages) {
        // Skip the last user message (we'll add it at the end)
        if (lastUserMessage && message.id === lastUserMessage.id) {
            continue;
        }

        const contextMessage: ContextMessage = {
            role: message.role,
            content: message.content,
        };
        const messageTokens = estimateMessageTokens(contextMessage);

        if (historicalTokens + messageTokens <= remainingTokens) {
            historicalMessages.push(contextMessage);
            historicalTokens += messageTokens;
        } else {
            truncated = true;
            break;
        }
    }

    // Add historical messages (they're already in chronological order)
    contextMessages.push(...historicalMessages);
    totalTokens += historicalTokens;

    // 4. Add the most recent user message
    if (lastUserMessage) {
        contextMessages.push({
            role: lastUserMessage.role,
            content: lastUserMessage.content,
        });
        totalTokens += lastUserTokens;
    }

    return {
        messages: contextMessages,
        total_tokens: totalTokens,
        max_tokens: maxTokens,
        truncated,
    };
}

/**
 * Truncate a single message if it exceeds max tokens
 * Preserves the beginning and end of the message
 * 
 * @param message - Message to truncate
 * @param maxTokens - Maximum tokens for the message
 * @returns Truncated message
 */
export function truncateMessage(
    message: ContextMessage,
    maxTokens: number
): ContextMessage {
    const currentTokens = estimateMessageTokens(message);

    if (currentTokens <= maxTokens) {
        return message;
    }

    // Calculate how much content to keep
    const targetChars = (maxTokens - 10) * 4; // Leave room for truncation indicator
    const halfChars = Math.floor(targetChars / 2);

    const content = message.content;
    const truncatedContent =
        content.substring(0, halfChars) +
        '\n\n[... content truncated ...]\n\n' +
        content.substring(content.length - halfChars);

    return {
        role: message.role,
        content: truncatedContent,
    };
}

/**
 * Summarize conversation context
 * Used for debugging and logging
 * 
 * @param contextWindow - The context window
 * @returns Summary object
 */
export function summarizeContext(contextWindow: ContextWindow): {
    messageCount: number;
    tokenCount: number;
    truncated: boolean;
    roles: Record<string, number>;
} {
    const roles: Record<string, number> = {};

    for (const message of contextWindow.messages) {
        roles[message.role] = (roles[message.role] || 0) + 1;
    }

    return {
        messageCount: contextWindow.messages.length,
        tokenCount: contextWindow.total_tokens,
        truncated: contextWindow.truncated,
        roles,
    };
}
