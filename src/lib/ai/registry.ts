// =============================================================================
// Provider Registry - Factory for creating AI providers
// =============================================================================

import type { LLMProvider, EmbeddingProvider } from '@/types/ai.types';
import { AIProviderError } from '@/types/ai.types';
import { ACTIVE_LLM_PROVIDER, ACTIVE_EMBEDDING_PROVIDER } from '@/config/ai';
import type { LLMProviderType, EmbeddingProviderType } from '@/types/ai.types';
import { GroqLLMProvider } from './providers/groq.provider';
import { OllamaLLMProvider } from './providers/ollama.provider';
import { OpenAIEmbeddingProvider, OllamaEmbeddingProvider } from '@/lib/embeddings/provider';

// =============================================================================
// Singleton Cache
// =============================================================================

let cachedLLMProvider: LLMProvider | null = null;
let cachedEmbeddingProvider: EmbeddingProvider | null = null;

// =============================================================================
// LLM Provider Factory
// =============================================================================

/**
 * Create or retrieve the active LLM provider.
 * Uses singleton pattern — one provider per process.
 *
 * @param config Override the active provider type or provide custom config.
 */
export function createLLMProvider(config?: {
  type?: LLMProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): LLMProvider {
  const type = config?.type || ACTIVE_LLM_PROVIDER;

  // Return cached if no custom config
  if (cachedLLMProvider && !config) {
    return cachedLLMProvider;
  }

  let provider: LLMProvider;

  switch (type) {
    case 'groq': {
      provider = new GroqLLMProvider({
        apiKey: config?.apiKey,
        model: config?.model,
        baseUrl: config?.baseUrl,
      });
      break;
    }

    case 'ollama': {
      provider = new OllamaLLMProvider({
        baseUrl: config?.baseUrl,
        model: config?.model,
      });
      break;
    }

    case 'openai':
      // Extension point: import and create OpenAI LLM provider
      throw new AIProviderError(
        'OpenAI LLM provider not yet implemented',
        'NOT_IMPLEMENTED',
        'openai'
      );

    case 'anthropic':
      throw new AIProviderError(
        'Anthropic LLM provider not yet implemented',
        'NOT_IMPLEMENTED',
        'anthropic'
      );

    case 'google':
      throw new AIProviderError(
        'Google LLM provider not yet implemented',
        'NOT_IMPLEMENTED',
        'google'
      );

    default:
      throw new AIProviderError(
        `Unknown LLM provider type: ${type}`,
        'UNKNOWN_PROVIDER',
        type
      );
  }

  // Cache only if using defaults
  if (!config) {
    cachedLLMProvider = provider;
  }

  return provider;
}

// =============================================================================
// Embedding Provider Factory
// =============================================================================

/**
 * Create or retrieve the active embedding provider.
 *
 * @param config Override the active provider type or provide custom config.
 */
export function createEmbeddingProvider(config?: {
  type?: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): EmbeddingProvider {
  const type = config?.type || ACTIVE_EMBEDDING_PROVIDER;

  // Return cached if no custom config
  if (cachedEmbeddingProvider && !config) {
    return cachedEmbeddingProvider;
  }

  let provider: EmbeddingProvider;

  switch (type) {
    case 'openai': {
      const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError(
          'OPENAI_API_KEY is required for embedding provider',
          'MISSING_API_KEY',
          'openai'
        );
      }
      provider = new OpenAIEmbeddingProvider({
        apiKey,
        model: config?.model,
        baseUrl: config?.baseUrl,
      });
      break;
    }

    case 'ollama': {
      provider = new OllamaEmbeddingProvider(
        config?.baseUrl,
        config?.model
      );
      break;
    }

    case 'cohere':
      throw new AIProviderError(
        'Cohere embedding provider not yet implemented',
        'NOT_IMPLEMENTED',
        'cohere'
      );

    case 'local':
      throw new AIProviderError(
        'Local embedding provider not yet implemented',
        'NOT_IMPLEMENTED',
        'local'
      );

    default:
      throw new AIProviderError(
        `Unknown embedding provider type: ${type}`,
        'UNKNOWN_PROVIDER',
        type
      );
  }

  // Cache only if using defaults
  if (!config) {
    cachedEmbeddingProvider = provider;
  }

  return provider;
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Clear cached providers (useful in tests or config changes).
 */
export function clearProviderCache(): void {
  cachedLLMProvider = null;
  cachedEmbeddingProvider = null;
}

/**
 * Get the currently cached LLM provider (or null).
 */
export function getCachedLLMProvider(): LLMProvider | null {
  return cachedLLMProvider;
}

/**
 * Get the currently cached embedding provider (or null).
 */
export function getCachedEmbeddingProvider(): EmbeddingProvider | null {
  return cachedEmbeddingProvider;
}
