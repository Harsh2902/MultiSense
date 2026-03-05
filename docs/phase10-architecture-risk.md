# Phase 10 — Architecture Risk Assessment

## Scope

Assessment of scaling bottlenecks and architectural risks at 100–1000 concurrent users.

---

## 1. Current Architecture

```
Client → Vercel Edge (Middleware) → Next.js API Routes → Supabase (Postgres + Storage)
                                                        ↗ Groq API (LLM)
                                                        ↗ OpenAI API (Embeddings)
                                                        ↗ Upstash Redis (Rate Limiting)
```

## 2. Scaling Bottlenecks

### 2.1 Database Connections

| Factor | Current | At 1000 Users |
|--------|---------|---------------|
| Supabase free tier | 60 connections | ⚠️ Exhaustion risk |
| Per-request connection | 1+ per route | Scales linearly |

**Mitigation:** Supabase connection pooling (PgBouncer) on Pro plan. Consider connection-per-invocation with `supabaseUrl` + `anonKey`.

### 2.2 LLM API Latency

| Operation | Avg Latency | Concurrency Risk |
|-----------|-------------|------------------|
| Chat (streaming) | 2-8s | High — holds connection open |
| Quiz generation | 3-10s | Medium — semaphore limited to 4 |
| Embedding batch | 1-3s | Medium — semaphore limited to 5 |

**Mitigation:** `llmSemaphore` (4 concurrent), `embeddingSemaphore` (5 concurrent). Provider rate limits are the true bottleneck.

### 2.3 File Processing

| Factor | Current | Risk |
|--------|---------|------|
| OCR (Tesseract.js) | CPU-intensive, in-process | ⚠️ Blocks event loop |
| PDF parsing | Memory-intensive | Medium |
| Embedding generation | Network-bound | Low |

**Mitigation:** `ocrSemaphore` (3 concurrent), `PROCESSING_TIMEOUT_MS` (120s). At scale, move OCR to dedicated workers or cloud functions.

### 2.4 Serverless Cold Starts

| Runtime | Cold Start | Impact |
|---------|-----------|--------|
| Vercel Node.js | 200-800ms | Acceptable for API routes |
| Edge Runtime | 50-100ms | Good for middleware |
| Tesseract.js init | 2-5s | ⚠️ Significant first-request penalty |

### 2.5 Background Job Processing

| Factor | Current | At Scale |
|--------|---------|----------|
| Job claiming | `claim_jobs` RPC with `FOR UPDATE SKIP LOCKED` | ✅ Scales well |
| Job processing | Triggered by API route | ⚠️ No dedicated workers |
| Stale lock recovery | `reset_stale_jobs` RPC | ✅ Automatic |
| Dead-letter queue | Status = 'dead' after max attempts | ✅ No data loss |

**Mitigation:** At 500+ users, consider dedicated background worker process (Inngest, Trigger.dev, or Vercel Cron).

## 3. Scaling Paths

### Phase 1: 100 Users (Current Architecture)
- ✅ Supabase Pro plan for connection pooling
- ✅ Upstash Redis for rate limiting
- ✅ Vercel Pro for higher limits
- ✅ Current semaphores and timeouts sufficient

### Phase 2: 500 Users
- Move OCR to Vercel Edge Functions or cloud workers
- Add Redis caching for frequently accessed conversations
- Consider CDN for static learning materials
- Implement Vercel Cron for periodic job processing

### Phase 3: 1000+ Users
- Dedicated background worker service
- Read replicas for Supabase queries
- Implement conversation/content caching layer
- Consider moving to dedicated embedding service
- Evaluate Groq Enterprise or multi-provider load balancing

## 4. Caching Opportunities

| Data | TTL | Cache Layer |
|------|-----|-------------|
| Conversation list | 30s | In-memory / Redis |
| Message history | 60s | Redis |
| Embedding search results | 5min | Redis |
| Quiz/flashcard data | 10min | Redis |
| Token usage aggregates | 1min | In-memory |

## 5. Cost Projections

| Component | Per-User/Month (est.) | At 1000 Users |
|-----------|----------------------|---------------|
| Supabase Pro | — | $25/mo (base) |
| Groq API | $0.01-0.05 | $10-50/mo |
| OpenAI Embeddings | $0.005-0.02 | $5-20/mo |
| Upstash Redis | — | $10/mo |
| Vercel Pro | — | $20/mo |
| **Total** | | **$70-125/mo** |

> [!NOTE]
> Token governance (`lib/token-governance.ts`) provides per-user budgets to control cost. The `DAILY_TOKEN_BUDGET` env var defaults to 500K tokens/user/day.

## 6. Recommended Immediate Actions

1. **Install `@types/node`** — Resolves all IDE lint errors about `process`
2. **Set up Vercel Cron** — Periodic `reset_stale_jobs()` and `processPendingSources()` calls
3. **Configure monitoring** — Use `getMetricsSnapshot()` with external monitoring (e.g., Vercel Analytics)
4. **Enable Supabase connection pooling** — Prevent connection exhaustion
