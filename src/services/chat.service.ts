// =============================================================================
// Chat Service - Business logic for conversations and messages (Prisma Version)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
    ConversationRow,
    ConversationWithPreview,
    MessageRow,
    ConversationSettings,
    MessageMetadata,
    PaginatedResponse,
} from '@/types/chat';

// =============================================================================
// Types
// =============================================================================

export interface ListConversationsOptions {
    limit?: number;
    cursor?: string;  // ISO timestamp
    mode?: 'chat' | 'learning';
}

export interface ListMessagesOptions {
    limit?: number;
    cursor?: string;  // ISO timestamp
    before?: string;  // ISO timestamp
}

export interface CreateConversationOptions {
    title?: string;
    mode?: 'chat' | 'learning';
    settings?: Partial<ConversationSettings>;
}

// =============================================================================
// Chat Service Class
// =============================================================================

export class ChatService {
    constructor(private userId: string) { }

    private safeIso(value: Date | string | null | undefined): string {
        if (!value) {
            return new Date().toISOString();
        }

        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    // ===========================================================================
    // Conversation Operations
    // ===========================================================================

    async createConversation(options: CreateConversationOptions = {}): Promise<ConversationRow> {
        const { title = 'New Conversation', mode = 'chat', settings = {} } = options;

        const data = await prisma.conversation.create({
            data: {
                user_id: this.userId,
                title,
                mode,
                settings: settings as Prisma.JsonObject,
            }
        });

        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as ConversationRow;
    }

    async getConversation(conversationId: string): Promise<ConversationRow | null> {
        const data = await prisma.conversation.findUnique({
            where: { id: conversationId, user_id: this.userId }
        });

        if (!data) return null;

        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as ConversationRow;
    }

    async listConversations(options: ListConversationsOptions = {}): Promise<PaginatedResponse<ConversationWithPreview>> {
        const { limit = 20, cursor, mode } = options;

        const where: Prisma.ConversationWhereInput = {
            user_id: this.userId,
            ...(mode ? { mode } : {}),
            ...(cursor ? { updated_at: { lt: new Date(cursor) } } : {})
        };

        try {
            const [items, total] = await Promise.all([
                prisma.conversation.findMany({
                    where,
                    take: limit + 1,
                    orderBy: { updated_at: 'desc' },
                    include: {
                        messages: {
                            take: 1,
                            orderBy: { created_at: 'desc' },
                            select: { content: true, role: true, created_at: true }
                        },
                        _count: { select: { messages: true } }
                    }
                }),
                prisma.conversation.count({ where: { user_id: this.userId, ...(mode ? { mode } : {}) } })
            ]);

            const hasMore = items.length > limit;
            const conversations = items.slice(0, limit);

            const result: ConversationWithPreview[] = conversations.map(conv => {
                const lastMessage = conv.messages[0];
                const safeMode = conv.mode === 'learning' ? 'learning' : 'chat';
                const preview = typeof lastMessage?.content === 'string'
                    ? lastMessage.content.substring(0, 100)
                    : '';

                return {
                    id: conv.id,
                    user_id: conv.user_id,
                    title: conv.title || 'Untitled',
                    mode: safeMode,
                    settings: (conv.settings ?? {}) as unknown as ConversationSettings,
                    created_at: this.safeIso(conv.created_at),
                    updated_at: this.safeIso(conv.updated_at),
                    last_message: lastMessage ? {
                        content: preview,
                        role: (lastMessage.role as 'user' | 'assistant' | 'system') || 'assistant',
                        created_at: this.safeIso(lastMessage.created_at),
                    } : undefined,
                    message_count: conv._count.messages ?? 0,
                };
            });

            return {
                data: result,
                count: total,
                has_more: hasMore,
                next_cursor: hasMore ? this.safeIso(conversations[conversations.length - 1]?.updated_at) : undefined,
            };
        } catch (error) {
            console.error('[ChatService] listConversations primary query failed, using fallback:', error);
            try {
                const items = await prisma.conversation.findMany({
                    where,
                    take: limit + 1,
                    orderBy: { updated_at: 'desc' },
                });

                const hasMore = items.length > limit;
                const conversations = items.slice(0, limit);
                const ids = conversations.map((c) => c.id);

                const [messageCounts, lastMessages, total] = await Promise.all([
                    ids.length > 0
                        ? prisma.message.groupBy({
                            by: ['conversation_id'],
                            where: { conversation_id: { in: ids } },
                            _count: { _all: true },
                        })
                        : [],
                    Promise.all(ids.map(async (id) => {
                        const msg = await prisma.message.findFirst({
                            where: { conversation_id: id },
                            orderBy: { created_at: 'desc' },
                            select: { content: true, role: true, created_at: true },
                        });
                        return [id, msg] as const;
                    })),
                    prisma.conversation.count({ where: { user_id: this.userId, ...(mode ? { mode } : {}) } }),
                ]);

                const countMap = new Map(messageCounts.map((row) => [row.conversation_id, row._count._all]));
                const lastMessageMap = new Map(lastMessages);

                const result: ConversationWithPreview[] = conversations.map((conv) => {
                    const lastMessage = lastMessageMap.get(conv.id);
                    const safeMode = conv.mode === 'learning' ? 'learning' : 'chat';
                    const preview = typeof lastMessage?.content === 'string'
                        ? lastMessage.content.substring(0, 100)
                        : '';

                    return {
                        id: conv.id,
                        user_id: conv.user_id,
                        title: conv.title || 'Untitled',
                        mode: safeMode,
                        settings: (conv.settings ?? {}) as unknown as ConversationSettings,
                        created_at: this.safeIso(conv.created_at),
                        updated_at: this.safeIso(conv.updated_at),
                        last_message: lastMessage ? {
                            content: preview,
                            role: (lastMessage.role as 'user' | 'assistant' | 'system') || 'assistant',
                            created_at: this.safeIso(lastMessage.created_at),
                        } : undefined,
                        message_count: countMap.get(conv.id) ?? 0,
                    };
                });

                return {
                    data: result,
                    count: total,
                    has_more: hasMore,
                    next_cursor: hasMore ? this.safeIso(conversations[conversations.length - 1]?.updated_at) : undefined,
                };
            } catch (fallbackError) {
                console.error('[ChatService] listConversations fallback failed, trying source-linked recovery:', fallbackError);

                try {
                    const sourceRows = await prisma.learningSource.findMany({
                        where: {
                            user_id: this.userId,
                            conversation_id: { not: null },
                        },
                        orderBy: { created_at: 'desc' },
                        take: 200,
                        select: {
                            conversation_id: true,
                            title: true,
                            created_at: true,
                        },
                    });

                    const dedupedConversationIds = Array.from(
                        new Set(
                            sourceRows
                                .map((row) => row.conversation_id)
                                .filter((id): id is string => !!id)
                        )
                    ).slice(0, limit + 1);

                    if (dedupedConversationIds.length === 0) {
                        return {
                            data: [],
                            count: 0,
                            has_more: false,
                        };
                    }

                    const conversations = await prisma.conversation.findMany({
                        where: {
                            id: { in: dedupedConversationIds },
                        },
                        include: {
                            _count: { select: { messages: true } },
                        },
                        orderBy: { updated_at: 'desc' },
                    });

                    const hasMore = conversations.length > limit;
                    const sliced = conversations.slice(0, limit);

                    const result: ConversationWithPreview[] = sliced.map((conv) => {
                        const safeMode = conv.mode === 'learning' ? 'learning' : 'chat';
                        return {
                            id: conv.id,
                            user_id: conv.user_id,
                            title: conv.title || 'Untitled',
                            mode: safeMode,
                            settings: (conv.settings ?? {}) as unknown as ConversationSettings,
                            created_at: this.safeIso(conv.created_at),
                            updated_at: this.safeIso(conv.updated_at),
                            message_count: conv._count.messages ?? 0,
                        };
                    });

                    return {
                        data: result,
                        count: result.length,
                        has_more: hasMore,
                        next_cursor: hasMore ? this.safeIso(sliced[sliced.length - 1]?.updated_at) : undefined,
                    };
                } catch (recoveryError) {
                    console.error('[ChatService] source-linked recovery failed. Returning empty history:', recoveryError);
                    return {
                        data: [],
                        count: 0,
                        has_more: false,
                    };
                }
            }
        }
    }

    async updateConversation(conversationId: string, updates: Prisma.ConversationUpdateInput): Promise<ConversationRow> {
        const data = await prisma.conversation.update({
            where: { id: conversationId, user_id: this.userId },
            data: updates
        });
        return { ...data, created_at: data.created_at.toISOString(), updated_at: data.updated_at.toISOString() } as unknown as ConversationRow;
    }

    async deleteConversation(conversationId: string): Promise<boolean> {
        await prisma.conversation.delete({
            where: { id: conversationId, user_id: this.userId }
        });
        return true;
    }

    // ===========================================================================
    // Message Operations
    // ===========================================================================

    async addMessage(
        conversationId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata: MessageMetadata = {}
    ): Promise<MessageRow> {
        const data = await prisma.message.create({
            data: {
                conversation_id: conversationId,
                role,
                content,
                metadata: metadata as Prisma.JsonObject,
            }
        });
        return { ...data, created_at: data.created_at.toISOString() } as unknown as MessageRow;
    }

    async getMessages(conversationId: string, options: ListMessagesOptions = {}): Promise<PaginatedResponse<MessageRow>> {
        const { limit = 50, cursor, before } = options;

        const where: Prisma.MessageWhereInput = {
            conversation_id: conversationId,
            conversation: { user_id: this.userId }
        };

        if (cursor) {
            where.created_at = { gt: new Date(cursor) };
        }
        if (before) {
            where.created_at = { ...(where.created_at as any || {}), lt: new Date(before) };
        }

        const [items, total] = await Promise.all([
            prisma.message.findMany({
                where,
                take: limit + 1,
                orderBy: { created_at: 'asc' }
            }),
            prisma.message.count({ where: { conversation_id: conversationId, conversation: { user_id: this.userId } } })
        ]);

        const hasMore = items.length > limit;
        const messages = items.slice(0, limit);

        const result = messages.map(m => ({ ...m, created_at: m.created_at.toISOString() })) as unknown as MessageRow[];

        return {
            data: result,
            count: total,
            has_more: hasMore,
            next_cursor: hasMore ? result[result.length - 1]?.created_at : undefined,
        };
    }

    async updateMessage(messageId: string, updates: Prisma.MessageUpdateInput): Promise<MessageRow> {
        const data = await prisma.message.update({
            where: { id: messageId },
            data: updates
        });
        return { ...data, created_at: data.created_at.toISOString() } as unknown as MessageRow;
    }

    async deleteMessage(messageId: string): Promise<boolean> {
        await prisma.message.delete({
            where: { id: messageId }
        });
        return true;
    }

    async getContextMessages(conversationId: string, limit: number = 20): Promise<MessageRow[]> {
        const items = await prisma.message.findMany({
            where: { conversation_id: conversationId, conversation: { user_id: this.userId } },
            orderBy: { created_at: 'desc' },
            take: limit
        });

        return items.reverse().map(m => ({ ...m, created_at: m.created_at.toISOString() })) as unknown as MessageRow[];
    }

    // ===========================================================================
    // Title Generation
    // ===========================================================================

    static generateTitle(content: string): string {
        const cleaned = content.replace(/\s+/g, ' ').trim();

        if (cleaned.length <= 50) {
            return cleaned;
        }

        const truncated = cleaned.substring(0, 47);
        const lastSpace = truncated.lastIndexOf(' ');

        if (lastSpace > 30) {
            return truncated.substring(0, lastSpace) + '...';
        }

        return truncated + '...';
    }
}
