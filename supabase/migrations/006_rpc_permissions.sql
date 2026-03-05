-- =============================================================================
-- Migration 006: RPC Permission Hardening
-- =============================================================================
-- Restricts worker RPC functions to service_role only.
-- These functions are only called from server-side services (worker, API routes)
-- and should never be callable directly from authenticated browser clients.
-- =============================================================================

-- 1. Worker job functions (only called by background worker)
REVOKE EXECUTE ON FUNCTION claim_pending_sources(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION claim_pending_sources(integer) FROM anon;
GRANT EXECUTE ON FUNCTION claim_pending_sources(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION reset_stale_sources(interval) FROM authenticated;
REVOKE EXECUTE ON FUNCTION reset_stale_sources(interval) FROM anon;
GRANT EXECUTE ON FUNCTION reset_stale_sources(interval) TO service_role;

-- 2. Token budget debit (only called from API route handlers via service client)
REVOKE EXECUTE ON FUNCTION debit_token_budget(uuid, text, text, text, integer, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION debit_token_budget(uuid, text, text, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION debit_token_budget(uuid, text, text, text, integer, integer, integer) TO service_role;
