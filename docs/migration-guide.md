# Database Migration Guide

## Overview

Migrations are versioned SQL files in `supabase/migrations/`. They run in order and are tracked by Supabase to prevent re-execution.

## Migration Files

| File | Purpose |
|---|---|
| `001_conversations.sql` | Core chat tables |
| `002_learning_sources.sql` | Learning sources, embeddings, queue claim RPC |
| `003_study_tools.sql` | Quizzes, flashcards, summaries |
| `004_job_queue.sql` | Background jobs table, token usage |
| `005_worker_hardening.sql` | Crash recovery, atomic token debit |

## Local Development

```bash
# Start local Supabase
supabase start

# Apply pending migrations
supabase db push

# Create a new migration
supabase migration new <name>

# Reset local DB (destructive)
supabase db reset
```

## Production Deployment

```bash
# Link to production project (one-time)
supabase link --project-ref <ref>

# Dry run — see what will execute
supabase db push --dry-run

# Apply to production
supabase db push
```

> **⚠️ WARNING:** Always run `--dry-run` first. Destructive migrations (DROP, ALTER TYPE) should be tested on a staging project before production.

## Rollback Strategy

Supabase migrations are **forward-only** — there is no built-in rollback. For critical changes:

1. **Before migrating:** Take a database backup via Supabase Dashboard → Settings → Backups
2. **Test on staging:** Create a branch project or separate staging project
3. **Rollback migration:** Create a new migration that reverses the change

```sql
-- Example: 006_rollback_example.sql
ALTER TABLE learning_sources DROP COLUMN IF EXISTS locked_until;
ALTER TABLE learning_sources DROP COLUMN IF EXISTS attempts;
ALTER TABLE learning_sources DROP COLUMN IF EXISTS max_attempts;
```

## CI/CD Integration

Migrations run automatically on merge to `main` via `.github/workflows/ci.yml`. The `migrate` job uses `supabase db push` with the project linked via GitHub secrets:

- `SUPABASE_PROJECT_REF` — Project reference ID
- `SUPABASE_ACCESS_TOKEN` — Personal access token from Supabase Dashboard

## Best Practices

- **One concern per migration** — don't mix table creation with data backfills
- **Idempotent DDL** — use `IF NOT EXISTS` / `IF EXISTS` guards
- **Never modify existing migrations** — always create new ones
- **Test destructive changes** on staging first
