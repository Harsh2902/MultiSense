import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, checkRateLimit } from '@/lib/api';
import { getAIGateway } from '@/lib/ai/gateway';
import { debitTokenBudget } from '@/lib/token-governance';
import { BudgetExceededError } from '@/lib/errors';
import type { ApiError } from '@/types/chat';

export async function POST(request: NextRequest): Promise<Response> {
    // 1. CSRF check
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    // 2. Authenticate
    const auth = await requireAuth();
    if (!auth.success) return auth.error;

    // 3. Parallelize Checks (Rate Limit & Token Estimate)
    const checksPromise = Promise.all([
        checkRateLimit(auth.userId, 'chat'),
        debitTokenBudget({
            userId: auth.userId,
            feature: 'chat',
            provider: 'google',
            inputTokens: 50,
            outputTokens: 100,
        })
    ]);

    try {
        const [rateLimitError, debit] = await checksPromise;

        if (rateLimitError) return rateLimitError;
        if (!debit.allowed) {
            throw new BudgetExceededError(debit);
        }

        // 5. Create Stream
        const gateway = getAIGateway();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send start event
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`)
                    );

                    const currentHour = new Date().getHours();
                    let timeGreeting = "Hello";
                    if (currentHour < 12) timeGreeting = "Good morning";
                    else if (currentHour < 18) timeGreeting = "Good afternoon";
                    else timeGreeting = "Good evening";

                    const systemPrompt = `You are MultiSense, an intelligent AI learning assistant.
${timeGreeting}. Introduce yourself warmly and briefly in 1-2 sentences. 
Offer to help with studies, research, or questions. 
Do not ask for the user's name. Do not say "User". 
Make it sound professional but approachable.`;

                    for await (const chunk of gateway.stream({
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Introduce yourself.' } // Explicit trigger
                        ],
                        temperature: 0.7,
                        maxTokens: 150,
                    })) {
                        // console.log('[Greeting API] Chunk:', chunk); // Debug
                        if (chunk.content) {
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({
                                    type: 'token',
                                    content: chunk.content
                                })}\n\n`)
                            );
                        }
                    }

                    // Send done event
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
                    );
                } catch (error) {
                    console.error('[Greeting] Stream error:', error);
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                            type: 'error',
                            error: error instanceof Error ? error.message : 'Greeting failed'
                        })}\n\n`)
                    );
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        if (error instanceof BudgetExceededError) {
            return NextResponse.json<ApiError>(
                {
                    error: error.message,
                    code: 'BUDGET_EXCEEDED',
                    details: (error as BudgetExceededError).details as Record<string, unknown>,
                },
                { status: 429 }
            );
        }

        console.error('[API] POST /api/chat/greeting error:', error);
        return NextResponse.json<ApiError>(
            { error: 'Failed to generate greeting', code: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
