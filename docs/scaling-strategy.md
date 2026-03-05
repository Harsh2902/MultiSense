# Scaling Strategy

## Current Architecture

```
Browser → Next.js Web (stateless) → Supabase PostgreSQL
                                   → Upstash Redis (rate limiting)
                                   → Groq/OpenAI (AI)
         Worker Process (stateless) → Supabase PostgreSQL
                                    → OpenAI (embeddings)
```

Both web and worker are **stateless** — they can scale horizontally by adding instances.

## Scaling Tiers

### Tier 1: 1–100 Users

| Component | Configuration | Notes |
|---|---|---|
| Web | 1 instance | Single container handles traffic |
| Worker | 1 instance | Processes all uploads sequentially |
| Database | Supabase Free/Pro | Default connection pool sufficient |
| Redis | Upstash Free | Rate limiting works at low volume |

**Bottleneck:** None at this scale.

### Tier 2: 100–1,000 Users

| Component | Configuration | Notes |
|---|---|---|
| Web | 2 instances | Load-balanced for availability |
| Worker | 2 instances | Parallel processing via `FOR UPDATE SKIP LOCKED` |
| Database | Supabase Pro | May need connection pooler (PgBouncer) |
| Redis | Upstash Pay-as-you-go | Increased rate limit keys |

**Bottleneck:** AI API rate limits. Mitigate with:
- Provider-level rate limit handling (retry with backoff)
- Queue backlog management (increase worker instances)
- Consider caching frequently requested summaries

### Tier 3: 1,000–10,000 Users

| Component | Configuration | Notes |
|---|---|---|
| Web | 3–5 instances | Auto-scaling based on CPU/memory |
| Worker | 3–5 instances | Dedicated worker pool |
| Database | Supabase Pro + Read Replica | Separate read/write traffic |
| Redis | Upstash Pro | Dedicated instance for rate limiting |

**Bottleneck:** Database connections, embedding throughput. Mitigate with:
- **Read replica** for `SELECT` queries (chat history, source listing)
- **Redis caching** for hot data (recent conversations, user preferences)
- **Separate embedding service** to isolate CPU-heavy work
- **Connection pooling** via PgBouncer (Supabase provides this)

### Tier 4: 10,000+ Users

At this scale, consider:
- **Dedicated embedding worker cluster** with GPU instances
- **CDN** for static assets (Next.js built-in with hosting platforms)
- **Database sharding** or multi-tenant isolation
- **Message queue** (e.g., Redis Streams, SQS) replacing polling
- **Rate limiting per feature** instead of global limits

## Scaling Levers

| Lever | Effect | Complexity |
|---|---|---|
| Add web instances | Handles more concurrent requests | Low |
| Add worker instances | Faster queue drain | Low |
| Enable read replica | Reduces primary DB load | Medium |
| Add Redis caching | Reduces DB queries for hot data | Medium |
| Separate embedding service | Isolates CPU/GPU work | High |
| Database sharding | Horizontal data partitioning | Very High |

## Cost Estimates

| Scale | Monthly Cost (est.) |
|---|---|
| 100 users | $5–15 (Railway hobby + Supabase free) |
| 1,000 users | $50–100 (Railway pro + Supabase Pro) |
| 10,000 users | $200–500 (dedicated infra + read replicas) |
