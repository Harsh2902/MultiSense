-- =============================================================================
-- Migration 005: Worker Hardening & Token Governance
-- Crash recovery for learning_sources + atomic token budget enforcement
-- =============================================================================

-- =============================================================================
-- 1. Add crash recovery columns to learning_sources
-- =============================================================================

ALTER TABLE learning_sources
    ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Index for stale lock detection
CREATE INDEX IF NOT EXISTS idx_learning_sources_stale
    ON learning_sources (locked_until)
    WHERE status = 'processing';

-- =============================================================================
-- 2. Update claim_pending_sources to use locked_until and increment attempts
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_pending_sources(
    p_user_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 5
)
RETURNS SETOF public.learning_sources
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT id
        FROM public.learning_sources
        WHERE status = 'pending'
          AND attempts < max_attempts
          AND (p_user_id IS NULL OR user_id = p_user_id)
        ORDER BY created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.learning_sources ls
    SET
        status = 'processing',
        attempts = ls.attempts + 1,
        locked_until = now() + interval '5 minutes',
        updated_at = now()
    FROM claimed c
    WHERE ls.id = c.id
    RETURNING ls.*;
END;
$$;

-- =============================================================================
-- 3. Reset stale sources using DB server time (replaces JS Date.now())
-- =============================================================================

CREATE OR REPLACE FUNCTION reset_stale_sources()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    reset_count INT;
BEGIN
    WITH stale AS (
        UPDATE public.learning_sources
        SET
            status = CASE
                WHEN attempts >= max_attempts THEN 'failed'
                ELSE 'pending'
            END,
            locked_until = NULL,
            error_message = COALESCE(error_message, '') || ' [stale lock reset at ' || now()::text || ']'
        WHERE status = 'processing'
          AND locked_until IS NOT NULL
          AND locked_until < now()
        RETURNING id
    )
    SELECT count(*) INTO reset_count FROM stale;

    RETURN reset_count;
END;
$$;

-- =============================================================================
-- 4. Atomic token budget debit (prevents TOCTOU race condition)
-- =============================================================================

CREATE OR REPLACE FUNCTION debit_token_budget(
    p_user_id UUID,
    p_feature TEXT,
    p_provider TEXT,
    p_model TEXT DEFAULT NULL,
    p_input_tokens INT DEFAULT 0,
    p_output_tokens INT DEFAULT 0,
    p_daily_budget INT DEFAULT 500000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_used INT;
    v_total INT;
    v_cost NUMERIC(10, 6);
    v_cost_per_input NUMERIC;
    v_cost_per_output NUMERIC;
BEGIN
    -- Determine cost rates by provider
    CASE p_provider
        WHEN 'groq' THEN
            v_cost_per_input := 0.00005;
            v_cost_per_output := 0.00008;
        WHEN 'openai' THEN
            v_cost_per_input := 0.0001;
            v_cost_per_output := 0.0003;
        WHEN 'anthropic' THEN
            v_cost_per_input := 0.00025;
            v_cost_per_output := 0.00125;
        ELSE
            v_cost_per_input := 0;
            v_cost_per_output := 0;
    END CASE;

    v_total := p_input_tokens + p_output_tokens;
    v_cost := (p_input_tokens::NUMERIC / 1000) * v_cost_per_input
            + (p_output_tokens::NUMERIC / 1000) * v_cost_per_output;

    -- Lock and sum today's usage atomically
    SELECT COALESCE(SUM(total_tokens), 0) INTO v_used
    FROM token_usage
    WHERE user_id = p_user_id
      AND date = CURRENT_DATE
    FOR UPDATE;

    -- Check budget
    IF v_used + v_total > p_daily_budget THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'used', v_used,
            'budget', p_daily_budget,
            'requested', v_total,
            'remaining', GREATEST(0, p_daily_budget - v_used)
        );
    END IF;

    -- Debit within the same transaction
    INSERT INTO token_usage (
        user_id, date, feature, provider, model,
        input_tokens, output_tokens, total_tokens, estimated_cost_usd
    ) VALUES (
        p_user_id, CURRENT_DATE, p_feature, p_provider, p_model,
        p_input_tokens, p_output_tokens, v_total, v_cost
    );

    RETURN jsonb_build_object(
        'allowed', true,
        'used', v_used + v_total,
        'budget', p_daily_budget,
        'remaining', p_daily_budget - (v_used + v_total),
        'cost_usd', v_cost
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION reset_stale_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION debit_token_budget(UUID, TEXT, TEXT, TEXT, INT, INT, INT) TO authenticated;
