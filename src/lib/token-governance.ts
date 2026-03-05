// =============================================================================
// Token Governance - Per-user budgets and cost tracking (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
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
    google: { input: 0.000075, output: 0.0003 },     // Gemini 2.5 Flash
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
 * Uses a Prisma transaction which increments usage and then validates budget overages.
 *
 * @returns DebitResult with allowed status and remaining budget
 * @throws Error only on RPC failure (not on budget exceeded)
 */
export async function debitTokenBudget(
    params: {
        userId: string;
        feature: string;
        provider: string;
        model?: string;
        inputTokens: number;
        outputTokens: number;
    }
): Promise<DebitResult> {
    const costMap = TOKEN_COSTS[params.provider] ?? { input: 0.000075, output: 0.0003 };
    const cost = (params.inputTokens * costMap.input) + (params.outputTokens * costMap.output);
    const dateStr = new Date().toISOString().substring(0, 10);

    try {
        const result = await prisma.$transaction(async (tx) => {
            // Upsert the usage record for today
            const usage = await tx.tokenUsage.upsert({
                where: {
                    user_id_date_feature: {
                        user_id: params.userId,
                        date: dateStr,
                        feature: params.feature
                    }
                },
                update: {
                    total_tokens: { increment: params.inputTokens + params.outputTokens },
                    estimated_cost_usd: { increment: cost }
                },
                create: {
                    user_id: params.userId,
                    date: dateStr,
                    feature: params.feature,
                    total_tokens: params.inputTokens + params.outputTokens,
                    estimated_cost_usd: cost
                }
            });

            // Calculate total used today across all features
            const allUsage = await tx.tokenUsage.aggregate({
                where: {
                    user_id: params.userId,
                    date: dateStr
                },
                _sum: {
                    total_tokens: true
                }
            });

            const totalUsed = allUsage._sum.total_tokens || 0;
            const allowed = totalUsed <= DAILY_TOKEN_BUDGET;

            return {
                allowed,
                used: totalUsed,
                budget: DAILY_TOKEN_BUDGET,
                remaining: Math.max(0, DAILY_TOKEN_BUDGET - totalUsed),
                costUsd: usage.estimated_cost_usd
            };
        });

        if (!result.allowed) {
            logger.warn('Token budget exceeded (atomic check)', {
                userId: params.userId,
                used: result.used,
                budget: result.budget,
                requested: params.inputTokens + params.outputTokens,
                remaining: result.remaining,
            });
        }

        return result;
    } catch (error) {
        logger.error('Token debit transaction failed', error, {
            userId: params.userId,
            feature: params.feature,
        });
        return {
            allowed: true,
            used: 0,
            budget: DAILY_TOKEN_BUDGET,
            remaining: DAILY_TOKEN_BUDGET,
        };
    }
}

// =============================================================================
// Analytics
// =============================================================================

/**
 * Get usage summary for a user.
 */
export async function getUserUsageSummary(
    userId: string,
    days: number = 7
): Promise<{
    dailyUsage: Array<{ date: string; totalTokens: number; estimatedCost: number }>;
    byFeature: Record<string, number>;
    totalCost: number;
}> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await prisma.tokenUsage.findMany({
        where: {
            user_id: userId,
            date: { gte: startDate.toISOString().split('T')[0] }
        },
        select: {
            date: true,
            feature: true,
            total_tokens: true,
            estimated_cost_usd: true
        },
        orderBy: { date: 'asc' }
    });

    if (!data || data.length === 0) {
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

    const dailyUsage = Array.from(byDate.entries()).map(([date, usageData]) => ({
        date,
        totalTokens: usageData.totalTokens,
        estimatedCost: usageData.estimatedCost,
    }));

    return { dailyUsage, byFeature, totalCost };
}
