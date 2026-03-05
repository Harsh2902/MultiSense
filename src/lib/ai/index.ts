// =============================================================================
// AI Utilities Index - Central export point
// =============================================================================

// --- Phase 4: Chat Gateway & Context ---
export {
    estimateMessageTokens,
    buildContextWindow,
    truncateMessage,
    summarizeContext,
} from './context-window';

export {
    AIGateway,
    getAIGateway,
    type AIProvider,
    type CompletionOptions,
    type CompletionResponse,
    type CompletionChunk,
} from './gateway';

// --- Phase 9: Provider Abstraction Layer ---

// Provider interfaces & error types
export type {
    LLMProvider,
    LLMInput,
    LLMOutput,
    LLMChunk,
    EmbeddingProvider,
    TokenUsage,
    LLMProviderType,
    EmbeddingProviderType,
    ProviderConfig,
} from '@/types/ai.types';

export {
    AIProviderError,
    RateLimitError,
    TokenLimitError,
    ProviderUnavailableError,
    ProviderResponseError,
} from '@/types/ai.types';

// Registry (factory)
export {
    createLLMProvider,
    createEmbeddingProvider as createEmbeddingProviderV2,
    clearProviderCache,
} from './registry';

// Token utilities
export {
    estimateTokens,
    estimateMessagesTokens,
    checkTokenBudget,
    getMaxOutputTokens,
    getMaxInputTokens,
    trimToTokenLimit,
    parseLlmJson,
    TokenTracker,
} from './tokens';
