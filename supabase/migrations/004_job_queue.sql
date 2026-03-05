-- =============================================================================
-- Migration 004: Background Jobs & Token Usage
-- Durable background processing queue and token governance
-- =============================================================================

-- =============================================================================
-- 1. Job Status Enum
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. Background Jobs Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS background_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL,                        -- e.g. 'process_source', 'generate_quiz'
    payload         JSONB NOT NULL DEFAULT '{}',          -- job-specific data
    status          job_status NOT NULL DEFAULT 'pending',
    idempotency_key TEXT UNIQUE,                          -- prevents duplicate jobs
    priority        INT NOT NULL DEFAULT 0,               -- higher = sooner
    attempts        INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 3,
    last_error      TEXT,
    locked_by       TEXT,                                 -- worker identifier
    locked_until    TIMESTAMPTZ,                          -- lock expiry for crash recovery
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT now()    -- delayed job support
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_background_jobs_poll
    ON background_jobs (status, scheduled_for, priority DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_stale
    ON background_jobs (locked_until)
    WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_background_jobs_idempotency
    ON background_jobs (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 3. Claim Jobs RPC (Atomic claim with FOR UPDATE SKIP LOCKED)
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_jobs(
    p_batch_size INT DEFAULT 1,
    p_lock_duration INTERVAL DEFAULT '5 minutes'::INTERVAL,
    p_worker_id TEXT DEFAULT 'default'
)
RETURNS SETOF background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH claimable AS (
        SELECT id
        FROM background_jobs
        WHERE status = 'pending'
          AND scheduled_for <= now()
        ORDER BY priority DESC, created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE background_jobs j
    SET
        status = 'processing',
        locked_by = p_worker_id,
        locked_until = now() + p_lock_duration,
        started_at = COALESCE(started_at, now()),
        attempts = attempts + 1
    FROM claimable c
    WHERE j.id = c.id
    RETURNING j.*;
END;
$$;

-- =============================================================================
-- 4. Reset Stale Jobs (Crash Recovery)
-- =============================================================================

CREATE OR REPLACE FUNCTION reset_stale_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    reset_count INT;
BEGIN
    WITH stale AS (
        UPDATE background_jobs
        SET
            status = CASE
                WHEN attempts >= max_attempts THEN 'dead'::job_status
                ELSE 'pending'::job_status
            END,
            locked_by = NULL,
            locked_until = NULL,
            last_error = COALESCE(last_error, '') || ' [stale lock reset]'
        WHERE status = 'processing'
          AND locked_until < now()
        RETURNING id
    )
    SELECT count(*) INTO reset_count FROM stale;

    RETURN reset_count;
END;
$$;

-- =============================================================================
-- 5. Token Usage Table (Token Governance)
-- =============================================================================

CREATE TABLE IF NOT EXISTS token_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    feature         TEXT NOT NULL,           -- e.g. 'quiz', 'flashcard', 'chat', 'summary'
    provider        TEXT NOT NULL,           -- e.g. 'groq', 'openai'
    model           TEXT,
    input_tokens    INT NOT NULL DEFAULT 0,
    output_tokens   INT NOT NULL DEFAULT 0,
    total_tokens    INT NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying usage
CREATE INDEX IF NOT EXISTS idx_token_usage_user_date
    ON token_usage (user_id, date);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_feature
    ON token_usage (user_id, feature, date);

-- =============================================================================
-- 6. RLS Policies
-- =============================================================================

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Background jobs: server-side only (service role)
-- No RLS policies → only service role can access

-- Token usage: users can read their own
CREATE POLICY "Users can view own token usage"
    ON token_usage FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert/update token usage (no user-facing insert)
