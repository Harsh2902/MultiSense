// =============================================================================
// Health Check API - GET /api/health
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getMetricsSnapshot } from '@/lib/metrics';

// =============================================================================
// Types
// =============================================================================

interface HealthCheck {
    status: 'ok' | 'degraded' | 'error';
    message?: string;
    durationMs?: number;
}

interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    checks?: Record<string, HealthCheck>;
    metrics?: Record<string, unknown>;
}

const startTime = Date.now();

// =============================================================================
// GET /api/health
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
    const detail = request.nextUrl.searchParams.get('detail') === 'true';

    // Basic liveness — always returns 200
    const response: HealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.round((Date.now() - startTime) / 1000),
        version: process.env.npm_package_version || '0.0.0',
    };

    if (detail) {
        // Guard detailed health checks behind a secret token in production.
        // This prevents attackers from enumerating internal dependencies,
        // DB response times, and environment variable status.
        const token = request.headers.get('x-health-token');
        const expected = process.env.HEALTH_CHECK_SECRET;

        if (!expected || token !== expected) {
            return NextResponse.json(
                { error: 'Unauthorized — provide X-Health-Token header' },
                { status: 401 }
            );
        }

        const checks: Record<string, HealthCheck> = {};

        // Database check
        checks.database = await checkDatabase();

        // Environment check
        checks.environment = checkEnvironment();

        // Determine overall status
        const statuses = Object.values(checks).map(c => c.status);
        if (statuses.includes('error')) {
            response.status = 'unhealthy';
        } else if (statuses.includes('degraded')) {
            response.status = 'degraded';
        }

        response.checks = checks;
        response.metrics = getMetricsSnapshot();
    }

    const statusCode = response.status === 'unhealthy' ? 503 : 200;

    return NextResponse.json<HealthResponse>(response, {
        status: statusCode,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}

// =============================================================================
// Health Check Functions
// =============================================================================

async function checkDatabase(): Promise<HealthCheck> {
    try {
        const start = performance.now();
        const { prisma } = await import('@/lib/prisma');

        await prisma.conversation.findFirst({ select: { id: true } });

        const durationMs = Math.round(performance.now() - start);

        return {
            status: durationMs > 2000 ? 'degraded' : 'ok',
            durationMs,
            message: durationMs > 2000 ? 'Slow response' : undefined,
        };
    } catch (error) {
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

function checkEnvironment(): HealthCheck {
    const required = [
        'DATABASE_URL',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
        'CLERK_SECRET_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        return {
            status: 'error',
            message: `Missing env vars: ${missing.join(', ')}`,
        };
    }

    return { status: 'ok' };
}
