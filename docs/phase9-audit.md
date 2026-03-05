# Phase 9 — AI Abstraction Layer Audit

## Architecture Summary

```
┌──────────────────────────────────┐
│        Study Services            │
│  (quiz, flashcard, summary)      │
│    import from registry          │
├──────────────────────────────────┤
│        LLMProvider Interface     │
│       EmbeddingProvider Interface│
├──────────────────────────────────┤
│   Registry (singleton factory)   │
├───────────┬──────────────────────┤
│ Groq LLM  │  OpenAI Embeddings   │
│ Provider   │  Provider            │
└───────────┴──────────────────────┘
```

## 1. Remaining Coupling

| Area | Status | Note |
|------|--------|------|
| Quiz service → Groq | ✅ Decoupled | Uses `LLMProvider` interface via registry |
| Flashcard service → Groq | ✅ Decoupled | Same |
| Summary service → Groq | ✅ Decoupled | Same |
| Embedding service → OpenAI | ✅ Decoupled | Uses `EmbeddingProvider` interface |
| Chat `AIGateway` → Groq | ⚠️ Partially coupled | Phase 4 gateway has its own abstraction; separate from Phase 9 `LLMProvider`. Recommend migrating to `LLMProvider` in a future phase. |
| Model names | ✅ Centralized | All in `config/models.ts` |
| Embeddings model in service.ts | ✅ Fixed | Uses `EMBEDDING_MODELS.openai.default` |
| `lib/llm/client.ts` | ⚠️ Orphaned | No services import it anymore. Safe to delete. |

## 2. Provider Downtime Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Groq API down | All study tool generation fails | Registry supports swapping to OpenAI/Anthropic as fallback; requires implementing those providers. |
| OpenAI embeddings down | No new content can be embedded; existing RAG still works | Add Cohere or local embedding fallback. |
| Rate limiting (Groq) | Generation blocked temporarily | `RateLimitError` is caught and surfaced properly; retry-after header respected. |
| API key expired | All calls fail | `AIProviderError` with `MISSING_API_KEY` code surfaces immediately. |

**Recommendation:** Implement automatic provider failover in registry (try primary, fallback to secondary).

## 3. Scaling Bottlenecks

| Bottleneck | Current Limit | Solution |
|------------|--------------|----------|
| Groq rate limits | ~30 RPM on free tier | Upgrade plan or add OpenAI fallback |
| Embedding batch size | 20 texts per batch | Already batched; increase if API allows |
| Singleton LLM provider | One instance per process | Fine for serverless (Next.js); add pool for long-running servers |
| Token estimation | Heuristic-based | Consider `tiktoken` for exact counts in production |
| No response caching | Every identical query hits API | Add semantic cache layer (hash prompt → cache response) |

## 4. Caching Optimization Opportunities

| Opportunity | Effort | Impact |
|-------------|--------|--------|
| **Prompt response cache** | Medium | High — cache quiz/flashcard generation results by RAG context hash |
| **Embedding cache** | Low | Medium — cache query embeddings to avoid re-computing for identical queries |
| **LLM response dedup** | Low | Medium — prevent re-generating if same context + prompt within N minutes |
| **Provider instance cache** | ✅ Done | Singleton pattern in registry |

## 5. Files Created/Modified

### New Files
- `src/types/ai.types.ts` — Provider interfaces + error hierarchy
- `src/config/ai.ts` — Provider endpoints + defaults
- `src/config/models.ts` — Model names + per-feature token limits
- `src/lib/ai/providers/groq.provider.ts` — Groq LLM implementation
- `src/lib/ai/tokens.ts` — Token accounting + safety + JSON parsing
- `src/lib/ai/registry.ts` — Provider factory with singleton cache
- `src/lib/ai/providers/mock.provider.ts` — Mock providers for testing
- `src/lib/ai/__tests__/ai.test.ts` — Example test cases

### Modified Files
- `src/lib/ai/index.ts` — Extended barrel export
- `src/lib/embeddings/service.ts` — Model name from config
- `src/services/quiz.service.ts` — Uses registry
- `src/services/flashcard.service.ts` — Uses registry
- `src/services/summary.service.ts` — Uses registry

### Candidate for Deletion
- `src/lib/llm/client.ts` — Fully replaced by `groq.provider.ts` + `tokens.ts`
