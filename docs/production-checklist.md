# Production Hardening Checklist

## Security

- [ ] **HTTPS enforced** — hosting platform terminates TLS
- [ ] **HSTS enabled** — `Strict-Transport-Security` header set in `next.config.js`
- [ ] **CSP configured** — `Content-Security-Policy` restricts script/connect sources
- [ ] **X-Frame-Options: DENY** — prevents clickjacking
- [ ] **No powered-by header** — `poweredByHeader: false` in `next.config.js`
- [ ] **Service role key isolated** — never sent to client, only used server-side
- [ ] **CSRF protection** — tokens validated on mutating API routes
- [ ] **Rate limiting active** — Upstash Redis configured for all API routes
- [ ] **Health endpoint secured** — `?detail=true` requires `X-Health-Token` header

## Environment

- [ ] **All required env vars set** — boot validation via `validateAllEnvVars()`
- [ ] **No secrets in build args** — only `NEXT_PUBLIC_*` vars passed as build args
- [ ] **`.env.local` not committed** — verified in `.gitignore`
- [ ] **`HEALTH_CHECK_SECRET` set** — random string for health endpoint auth
- [ ] **`NODE_ENV=production`** — ensures JSON logging, no dev shortcuts

## Database

- [ ] **RLS enabled** — all tables have row-level security policies
- [ ] **Service role used for worker** — bypasses RLS intentionally
- [ ] **Migrations applied** — all 5 migration files run successfully
- [ ] **Indexes verified** — poll, stale, and usage indexes exist
- [ ] **Backups configured** — Supabase daily backups enabled

## Worker

- [ ] **Graceful shutdown** — SIGTERM handler finishes current batch
- [ ] **Exponential backoff** — idle worker backs off to 30s max
- [ ] **Crash recovery** — `reset_stale_sources()` reclaims stuck jobs using DB time
- [ ] **Dead letter** — jobs exceeding `max_attempts` marked `'failed'`
- [ ] **Heartbeat logging** — worker logs status every 60s

## Token Governance

- [ ] **Atomic debit** — `debit_token_budget()` RPC prevents TOCTOU race
- [ ] **Daily budget enforced** — configurable via `DAILY_TOKEN_BUDGET`
- [ ] **Fail-open policy** — RPC errors allow requests (logged as warnings)

## CI/CD

- [ ] **Secrets masked** — `::add-mask::` for derived secrets in GitHub Actions
- [ ] **Type check passes** — `npm run type-check` in CI
- [ ] **Lint passes** — `npm run lint` in CI
- [ ] **Build succeeds** — `npm run build` with standalone output
- [ ] **Docker images build** — both web and worker Dockerfiles compile
- [ ] **Auto-migrate on merge** — `supabase db push` runs on main branch push

## Monitoring

- [ ] **Structured JSON logs** — `logger.ts` outputs JSON in production
- [ ] **Error logging** — all errors include stack traces
- [ ] **Metrics collection** — LLM, embedding, RAG, and queue metrics tracked
- [ ] **Health endpoint** — `/api/health` returns liveness status
