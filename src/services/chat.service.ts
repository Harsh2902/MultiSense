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
            return {
                id: conv.id,
                user_id: conv.user_id,
                title: conv.title,
                mode: conv.mode as 'chat' | 'learning',
                settings: conv.settings as unknown as ConversationSettings,
                created_at: conv.created_at.toISOString(),
                updated_at: conv.updated_at.toISOString(),
                last_message: lastMessage ? {
                    content: lastMessage.content.substring(0, 100),
                    role: lastMessage.role as 'user' | 'assistant' | 'system',
                    created_at: lastMessage.created_at.toISOString(),
                } : undefined,
                message_count: conv._count.messages,
            };
        });

        return {
            data: result,
            count: total,
            has_more: hasMore,
            next_cursor: hasMore ? conversations[conversations.length - 1]?.updated_at.toISOString() : undefined,
        };
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
