# Phase 10 — Security Re-Audit Report

## Scope

Re-audit of all security-sensitive surfaces after Phase 10 hardening.

---

## 1. API Protection

| Control | Status | Notes |
|---------|--------|-------|
| CSRF verification | ✅ Active | All mutating endpoints check `X-CSRF-Token` |
| Rate limiting | ✅ Active | Upstash Redis, per-user + IP |
| Auth middleware | ✅ Active | `requireAuth()` on all protected routes |
| Request timeout | ✅ New | `withApiHandler` enforces 30s default, 120s for processing |
| Request ID tracking | ✅ New | `X-Request-Id` on all responses for incident correlation |
| Error sanitization | ✅ New | Stack traces stripped in production via `toApiResponse()` |
| Input validation | ✅ Active | Zod schemas on all endpoints |

## 2. Row Level Security (RLS)

| Table | RLS Enabled | Policies |
|-------|-------------|----------|
| conversations | ✅ | Users see own only |
| messages | ✅ | Scoped to conversation owner |
| learning_sources | ✅ | Users see own only |
| learning_chunks | ✅ | Via source ownership |
| quizzes / flashcards / summaries | ✅ | Users see own only |
| background_jobs | ✅ | **No user policies** — service role only |
| token_usage | ✅ | Users can read own usage |

> [!IMPORTANT]
> `background_jobs` has RLS enabled with no user-facing policies. Only the service role key can access it, which is correct for server-side queue operations.

## 3. RPC Functions

| Function | Security | Notes |
|----------|----------|-------|
| `match_chunks` | SECURITY DEFINER | User ID parameter validated, no override possible |
| `claim_pending_sources` | SECURITY DEFINER | Atomic claim with `FOR UPDATE SKIP LOCKED` |
| `claim_jobs` | SECURITY DEFINER | New — batch claim with lock duration and worker ID |
| `reset_stale_jobs` | SECURITY DEFINER | New — crash recovery for abandoned locks |

## 4. Secret Management

| Secret | Exposure Risk | Mitigation |
|--------|--------------|------------|
| `SUPABASE_SERVICE_ROLE_KEY` | High | Getter throws on client-side access |
| `GROQ_API_KEY` | Medium | Server-side only, lazy access |
| `OPENAI_API_KEY` | Medium | Server-side only |
| `UPSTASH_REDIS_REST_TOKEN` | Low | Server-side only |
| Stack traces | Medium | `toApiResponse()` strips in production |

## 5. Input Validation

All API routes use Zod schemas. File uploads validated via:
- Magic byte verification (`validateFileType`)
- Size limits per file type
- MIME type checking
- Content hash deduplication

## 6. SSRF Prevention

YouTube URL processing includes:
- URL scheme validation (https only)
- Domain allowlisting (youtube.com, youtu.be)
- No arbitrary URL fetching

## 7. Idempotency

| Operation | Protection | Mechanism |
|-----------|-----------|-----------|
| File upload | ✅ | Content hash (SHA-256) unique index |
| Quiz submission | ✅ | Answer hash unique constraint |
| Background jobs | ✅ New | `idempotency_key` unique constraint |
| YouTube processing | ✅ | Source URL unique per conversation |

## 8. Remaining Risks

| Risk | Severity | Mitigation Status |
|------|----------|-------------------|
| No CSP header in API responses | Low | Headers set in `next.config.js` for pages |
| In-memory rate limit fallback | Medium | Graceful degradation if Redis unavailable |
| No request body size limit | Medium | Next.js default 1MB; file uploads use `formData` with validation |
| Service role key in env only | Low | Standard for Vercel/serverless deployments |
