// =============================================================================
// Send Message API Route - POST with streaming response
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, verifyCsrf, checkRateLimit } from '@/lib/api';
import { ChatService } from '@/services/chat.service';
import { sendMessageSchema } from '@/lib/validations/chat';
import { buildContextWindow } from '@/lib/ai/context-window';
import { getAIGateway } from '@/lib/ai/gateway';
import { debitTokenBudget } from '@/lib/token-governance';
import { BudgetExceededError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { ApiError, MessageMetadata } from '@/types/chat';

// =============================================================================
// In-Flight Request Tracking (Double-Submit Prevention)
// =============================================================================

/**
 * Track in-flight requests per conversation to prevent double-submit
 * Key: conversationId, Value: timestamp of request start
 * 
 * NOTE: This is per-instance. In production with multiple instances,
 * use Redis or database locking for distributed lock.
 */
const inFlightRequests = new Map<string, number>();

/**
 * Request lock timeout (30 seconds)
 * Prevents stale locks from blocking future requests
 */
const LOCK_TIMEOUT_MS = 30_000;

/**
 * Acquire a lock for a conversation
 * @returns true if lock acquired, false if already locked
 */
function acquireLock(conversationId: string): boolean {
    const now = Date.now();
    const existing = inFlightRequests.get(conversationId);

    // Check if there's an active lock
    if (existing && (now - existing) < LOCK_TIMEOUT_MS) {
        return false; // Already processing
    }

    // Acquire lock
    inFlightRequests.set(conversationId, now);
    return true;
}

/**
 * Release a lock for a conversation
 */
function releaseLock(conversationId: string): void {
    inFlightRequests.delete(conversationId);
}

// =============================================================================
// POST /api/chat/send - Send a message and stream AI response
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
    // 1. CSRF check
    const csrfError = verifyCsrf(request);
    if (csrfError) return csrfError;

    // 2. Authenticate
    const auth = await requireAuth();
    if (!auth.success) return auth.error;

    // 3. Rate limit check
    const rateLimitError = await checkRateLimit(auth.user.id, 'chat');
    if (rateLimitError) return rateLimitError;

    // 4. Parse and validate body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json<ApiError>(
            { error: 'Invalid JSON', code: 'VALIDATION_ERROR' },
            { status: 400 }
        );
    }

    const validationResult = sendMessageSchema.safeParse(body);
    if (!validationResult.success) {
        return NextResponse.json<ApiError>(
            {
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: validationResult.error.flatten(),
            },
            { status: 400 }
        );
    }

    const { conversation_id, content } = validationResult.data;

    // 5. Verify conversation exists AND belongs to user (explicit ownership check)
    const chatService = new ChatService(auth.supabase, auth.user.id);
    const conversation = await chatService.getConversation(conversation_id);

    if (!conversation) {
        return NextResponse.json<ApiError>(
            { error: 'Conversation not found', code: 'NOT_FOUND' },
            { status: 404 }
        );
    }

    // EXPLICIT OWNERSHIP CHECK (defense-in-depth, RLS is primary)
    if (conversation.user_id !== auth.user.id) {
        console.warn(`[Security] User ${auth.user.id} attempted to access conversation ${conversation_id} owned by ${conversation.user_id}`);
        return NextResponse.json<ApiError>(
            { error: 'Conversation not found', code: 'NOT_FOUND' },
            { status: 404 }
        );
    }

    // 6. Double-submit prevention (backend)
    if (!acquireLock(conversation_id)) {
        return NextResponse.json<ApiError>(
            {
                error: 'A message is already being processed for this conversation',
                code: 'CONFLICT'
            },
            { status: 409 }
        );
    }

    try {
        // 7. Save user message BEFORE streaming (persistence strategy)
        // This ensures the user message is always saved even if streaming fails
        const userMessage = await chatService.addMessage(
            conversation_id,
            'user',
            content
        );

        // 8. Get conversation history for context
        const history = await chatService.getContextMessages(conversation_id, 20);

        // 9. Build context window with error handling for token limits
        let systemPrompt = conversation.settings?.system_prompt as string | undefined;

        // INJECT RAG CONTEXT (for 'learning' mode)
        if (conversation.mode === 'learning') {
            try {
                // Log RAG attempt
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    fs.appendFileSync(path.join(process.cwd(), 'youtube-debug.log'), `[Chat] ${new Date().toISOString()}: Attempting RAG for conversation ${conversation_id}\n`);
                } catch { }

                const { RagService } = await import('@/services/rag.service');
                const ragService = new RagService(auth.supabase, auth.user.id);

                // Retrieve relevant chunks for the user's query
                const ragContext = await ragService.retrieveContext(
                    conversation_id,
                    content,
                    {
                        k: 5, // Top 5 chunks
                        threshold: 0.5
                    }
                );

                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    fs.appendFileSync(path.join(process.cwd(), 'youtube-debug.log'), `[Chat] ${new Date().toISOString()}: RAG retrieved ${ragContext.chunks.length} chunks. Token count: ${ragContext.tokenCount}\n`);
                } catch { }

                if (ragContext.chunks.length > 0) {
                    const contextBlock = ragContext.chunks
                        .map(r => `[Source: ${r.sourceMetadata?.title || 'Unknown'}]\n${r.content}`)
                        .join('\n\n');

                    const ragInstruction = `\n\nRelevant context from uploaded materials:\n${contextBlock}\n\nAnswer strictly based on the provided context. If the answer is not in the context, say so.`;

                    systemPrompt = (systemPrompt || 'You are a helpful AI tutor.') + ragInstruction;
                }
            } catch (ragError) {
                console.error('[Chat] RAG retrieval failed:', ragError);
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    fs.appendFileSync(path.join(process.cwd(), 'youtube-debug.log'), `[Chat] ${new Date().toISOString()}: RAG failed: ${ragError}\n`);
                } catch { }
                // Continue without RAG context rather than failing the whole request
            }
        } else {
            try {
                const fs = await import('fs');
                const path = await import('path');
                fs.appendFileSync(path.join(process.cwd(), 'youtube-debug.log'), `[Chat] ${new Date().toISOString()}: Skipping RAG. Mode is ${conversation.mode}\n`);
            } catch { }
        }

        const contextWindow = buildContextWindow(history, systemPrompt);

        // 9b. Token budget enforcement (atomic debit)
        const debit = await debitTokenBudget(auth.supabase, {
            userId: auth.user.id,
            feature: 'chat',
            provider: 'google', // Updated to google
            inputTokens: contextWindow.total_tokens,
            outputTokens: 2048, // Conservative estimate for streaming
        });
        if (!debit.allowed) {
            releaseLock(conversation_id);
            throw new BudgetExceededError(debit);
        }

        // 10. Create placeholder for assistant message (prevents duplicates)
        // We create it BEFORE streaming starts so if multiple requests somehow 
        // get through, they'll all update the same placeholder
        const placeholderMessage = await chatService.addMessage(
            conversation_id,
            'assistant',
            '', // Empty content, will be updated during streaming
            { streaming: true } // Mark as streaming in progress
        );

        // 11. Create streaming response
        const encoder = new TextEncoder();
        let fullContent = '';
        let tokenCount = 0;
        let streamError: string | null = null;

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send start event with both message IDs
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                            type: 'start',
                            user_message_id: userMessage.id,
                            assistant_message_id: placeholderMessage.id,
                        })}\n\n`)
                    );

                    // Get AI gateway
                    const gateway = getAIGateway();

                    // Stream AI response with error handling
                    try {
                        const { LLM_MODELS } = await import('@/config/models');
                        for await (const chunk of gateway.stream({
                            messages: contextWindow.messages,
                            // Use Gemini 2.5 Flash
                            model: LLM_MODELS.google.flash25,
                            temperature: conversation.settings?.temperature as number | undefined,
                            maxTokens: conversation.settings?.max_tokens as number | undefined,
                        })) {
                            // Check if client disconnected (AbortController equivalent for SSE)
                            // ReadableStream controller.desiredSize becomes null when cancelled
                            if (controller.desiredSize === null) {
                                console.log('[Chat] Client disconnected, stopping stream');
                                streamError = 'Client disconnected';
                                break;
                            }

                            if (chunk.content) {
                                fullContent += chunk.content;
                                tokenCount++;

                                // Send token event
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify({
                                        type: 'token',
                                        content: chunk.content
                                    })}\n\n`)
                                );

                                // Periodically persist content (every 50 tokens)
                                // This provides crash recovery during long responses
                                if (tokenCount % 50 === 0) {
                                    await chatService.updateMessage(placeholderMessage.id, {
                                        content: fullContent,
                                    }).catch(err => {
                                        console.error('[Chat] Failed to persist interim content:', err);
                                    });
                                }
                            }

                            if (chunk.done) {
                                // Update the placeholder message with final content
                                const metadata: MessageMetadata = {
                                    model: gateway.getProvider(),
                                    finish_reason: chunk.finishReason,
                                    streaming: false, // Mark streaming complete
                                };

                                await chatService.updateMessage(placeholderMessage.id, {
                                    content: fullContent,
                                    metadata: metadata as any,
                                    token_count: tokenCount,
                                });

                                // Update conversation title if this is the first exchange
                                if (history.length <= 1) {
                                    const newTitle = ChatService.generateTitle(content);
                                    await chatService.updateConversation(conversation_id, {
                                        title: newTitle,
                                    });
                                }

                                // Send done event
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify({
                                        type: 'done',
                                        message_id: placeholderMessage.id,
                                        token_count: tokenCount,
                                    })}\n\n`)
                                );
                            }
                        }
                    } catch (aiError) {
                        // AI Gateway error - provider failure handling
                        console.error('[Chat] AI Gateway error:', aiError);
                        streamError = aiError instanceof Error ? aiError.message : 'AI provider error';

                        // Check if it's a token limit error
                        const errorMessage = streamError.toLowerCase();
                        const isTokenError = errorMessage.includes('token') ||
                            errorMessage.includes('context') ||
                            errorMessage.includes('too long');

                        // Update placeholder with error state
                        const errorMetadata: MessageMetadata = {
                            error: streamError,
                            streaming: false,
                            token_limit_exceeded: isTokenError,
                        };

                        // If we have partial content, save it
                        await chatService.updateMessage(placeholderMessage.id, {
                            content: fullContent || 'Error generating response. Please try again.',
                            metadata: errorMetadata as any,
                        });

                        // Send error event
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({
                                type: 'error',
                                error: streamError,
                                code: isTokenError ? 'TOKEN_LIMIT' : 'AI_ERROR',
                                recoverable: !isTokenError,
                            })}\n\n`)
                        );
                    }
                } catch (error) {
                    console.error('[Chat] Stream error:', error);

                    // Update placeholder with error
                    await chatService.updateMessage(placeholderMessage.id, {
                        content: fullContent || 'An error occurred.',
                        metadata: {
                            error: error instanceof Error ? error.message : 'Unknown error',
                            streaming: false,
                        },
                    }).catch(() => { });

                    // Send error event
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                            type: 'error',
                            error: error instanceof Error ? error.message : 'Stream failed',
                            code: 'INTERNAL_ERROR',
                        })}\n\n`)
                    );
                } finally {
                    // Always release the lock when done
                    releaseLock(conversation_id);
                    controller.close();
                }
            },

            // Handle client cancellation
            cancel() {
                console.log('[Chat] Stream cancelled by client');
                releaseLock(conversation_id);

                // Update placeholder to indicate cancellation
                chatService.updateMessage(placeholderMessage.id, {
                    content: fullContent || 'Response cancelled.',
                    metadata: {
                        cancelled: true,
                        streaming: false,
                    },
                }).catch(() => { });
            },
        });

        // Return SSE response
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable nginx buffering
            },
        });
    } catch (error) {
        // Release lock on any error
        releaseLock(conversation_id);

        // Budget exceeded — return 429 with remaining budget details
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

        console.error('[API] POST /api/chat/send error:', error);
        return NextResponse.json<ApiError>(
            {
                error: 'Failed to send message',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
