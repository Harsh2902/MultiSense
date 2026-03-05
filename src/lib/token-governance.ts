// =============================================================================
// Token Governance - Per-user budgets and cost tracking
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

// =============================================================================
// Configuration
// =============================================================================

/** Daily token budget per user (configurable via env) */
const DAILY_TOKEN_BUDGET = parseInt(process.env.DAILY_TOKEN_BUDGET || '500000', 10);

/** Cost per 1K tokens by provider (approximate) */
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
    groq: { input: 0.00005, output: 0.00008 },      // Llama 3 on Groq
    openai: { input: 0.0001, output: 0.0003 },       // GPT-4o-mini
    anthropic: { input: 0.00025, output: 0.00125 },   // Claude 3 Haiku
};

// =============================================================================
// Atomic Token Debit (Race-Condition Safe)
// =============================================================================

interface DebitResult {
    allowed: boolean;
    used: number;
    budget: number;
    remaining: number;
    costUsd?: number;
}

/**
 * Atomically check budget and record token usage in a single DB transaction.
 * This prevents the TOCTOU race condition where concurrent requests both
 * bypass the budget check.
 *
 * Uses the `debit_token_budget` PostgreSQL RPC which:
 * 1. Locks today's usage rows with SELECT ... FOR UPDATE
 * 2. Checks if budget allows the request
 * 3. Inserts the usage record within the same transaction
 *
 * @returns DebitResult with allowed status and remaining budget
 * @throws Error only on RPC failure (not on budget exceeded)
 */
export async function debitTokenBudget(
    supabase: SupabaseClient,
    params: {
        userId: string;
        feature: string;
        provider: string;
        model?: string;
        inputTokens: number;
        outputTokens: number;
    }
): Promise<DebitResult> {
    const { data, error } = await supabase.rpc('debit_token_budget', {
        p_user_id: params.userId,
        p_feature: params.feature,
        p_provider: params.provider,
        p_model: params.model ?? null,
        p_input_tokens: params.inputTokens,
        p_output_tokens: params.outputTokens,
        p_daily_budget: DAILY_TOKEN_BUDGET,
    });

    if (error) {
        logger.error('Token debit RPC failed', error, {
            userId: params.userId,
            feature: params.feature,
        });
        // Fail open: allow the request but warn
        logger.warn('Failing open on token debit — allowing request');
        return {
            allowed: true,
            used: 0,
            budget: DAILY_TOKEN_BUDGET,
            remaining: DAILY_TOKEN_BUDGET,
        };
    }

    const result = data as {
        allowed: boolean;
        used: number;
        budget: number;
        remaining: number;
        cost_usd?: number;
    };

    if (!result.allowed) {
        logger.warn('Token budget exceeded (atomic check)', {
            userId: params.userId,
            used: result.used,
            budget: result.budget,
            requested: params.inputTokens + params.outputTokens,
            remaining: result.remaining,
        });
    } else {
        logger.debug('Token debit successful', {
            userId: params.userId,
            feature: params.feature,
            used: result.used,
            remaining: result.remaining,
        });
    }

    return {
        allowed: result.allowed,
        used: result.used,
        budget: result.budget,
        remaining: result.remaining,
        costUsd: result.cost_usd,
    };
}

// =============================================================================
// Analytics
// =============================================================================

/**
 * Get usage summary for a user.
 */
export async function getUserUsageSummary(
    supabase: SupabaseClient,
    userId: string,
    days: number = 7
): Promise<{
    dailyUsage: Array<{ date: string; totalTokens: number; estimatedCost: number }>;
    byFeature: Record<string, number>;
    totalCost: number;
}> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
        .from('token_usage')
        .select('date, feature, total_tokens, estimated_cost_usd')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

    if (error || !data) {
        return { dailyUsage: [], byFeature: {}, totalCost: 0 };
    }

    // Aggregate by date
    const byDate = new Map<string, { totalTokens: number; estimatedCost: number }>();
    const byFeature: Record<string, number> = {};
    let totalCost = 0;

    for (const row of data) {
        // By date
        const existing = byDate.get(row.date) || { totalTokens: 0, estimatedCost: 0 };
        existing.totalTokens += row.total_tokens;
        existing.estimatedCost += Number(row.estimated_cost_usd || 0);
        byDate.set(row.date, existing);

        // By feature
        byFeature[row.feature] = (byFeature[row.feature] || 0) + row.total_tokens;

        // Total cost
        totalCost += Number(row.estimated_cost_usd || 0);
    }

    const dailyUsage = Array.from(byDate.entries()).map(([date, data]) => ({
        date,
        totalTokens: data.totalTokens,
        estimatedCost: data.estimatedCost,
    }));

    return { dailyUsage, byFeature, totalCost };
}
