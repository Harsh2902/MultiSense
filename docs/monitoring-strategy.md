# Monitoring Strategy

## Current Capabilities

The platform already has built-in observability hooks:

| Layer | Tool | Status |
|---|---|---|
| **Logging** | `lib/logger.ts` — structured JSON to stdout/stderr | ✅ Built |
| **Metrics** | `lib/metrics.ts` — in-memory counters for LLM/RAG/queue | ✅ Built |
| **Health** | `/api/health` — liveness + detailed checks | ✅ Built |
| **Worker heartbeat** | `worker.ts` — logs status every 60s | ✅ Built |

## Recommended Integrations

### Log Aggregation

Connect stdout/stderr to a log aggregation service:

- **Railway:** Built-in log viewer with search
- **Datadog / Grafana Cloud:** Ingest JSON logs via agent or stdout forwarder
- **Axiom (free tier):** Lightweight alternative for small-scale

All logs are already JSON-structured — no additional formatting needed.

### Uptime Monitoring

Monitor `/api/health` externally:

- **UptimeRobot (free):** HTTP check every 5 minutes
- **BetterStack (free tier):** HTTP + status page
- **Pingdom:** Enterprise-grade with SLA tracking

### Error Alerting

Key errors to alert on:

| Event | Log Pattern | Severity |
|---|---|---|
| Worker crash | `Worker fatal error` | 🔴 Critical |
| DB connection failure | `checkDatabase` returns `error` | 🔴 Critical |
| Stale jobs reset | `Reset N stale source(s)` | 🟡 Warning |
| Token budget exceeded | `Token budget exceeded` | 🟡 Warning |
| Token debit RPC failure | `Token debit RPC failed` | 🟡 Warning |
| Rate limit hit | `Rate limit exceeded` | ⚪ Info |

### Queue Health

Monitor via worker heartbeat logs:

- `totalProcessed` — cumulative jobs completed
- `totalFailed` — cumulative job failures
- `currentIntervalMs` — backoff state (30s = idle, 2s = active)

Alert if `totalFailed / totalProcessed > 0.1` (10% failure rate).

### Budget Threshold Alerts

Monitor daily token usage via `token_usage` table:

```sql
SELECT user_id, SUM(total_tokens), SUM(estimated_cost_usd)
FROM token_usage WHERE date = CURRENT_DATE
GROUP BY user_id
HAVING SUM(total_tokens) > 400000;  -- 80% of 500k budget
```

Alert when any user reaches 80% of their daily budget.

## Future Enhancements

- **OpenTelemetry** traces for end-to-end request tracking
- **Prometheus metrics** endpoint for Grafana dashboards
- **PagerDuty / Opsgenie** integration for on-call alerting
