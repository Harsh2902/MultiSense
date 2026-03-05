// =============================================================================
// Chat Service - Business logic for conversations and messages
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient, TableInsert, TableUpdate } from '@/types/database';
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

/**
 * Options for listing conversations
 */
export interface ListConversationsOptions {
    limit?: number;
    cursor?: string;  // ISO timestamp for cursor-based pagination
    mode?: 'chat' | 'learning';
}

/**
 * Options for listing messages
 */
export interface ListMessagesOptions {
    limit?: number;
    cursor?: string;  // ISO timestamp for cursor-based pagination
    before?: string;  // Get messages before this timestamp
}

/**
 * Options for creating a conversation
 */
export interface CreateConversationOptions {
    title?: string;
    mode?: 'chat' | 'learning';
    settings?: Partial<ConversationSettings>;
}

// =============================================================================
// Chat Service Class
// =============================================================================

/**
 * Service for managing conversations and messages
 * Encapsulates all database operations for the chat system
 */
export class ChatService {
    constructor(
        private supabase: SupabaseClient<any>,
        private userId: string
    ) { }

    // ===========================================================================
    // Conversation Operations
    // ===========================================================================

    /**
     * Create a new conversation
     * 
     * @param options - Conversation creation options
     * @returns Created conversation
     * @throws Error if creation fails
     */
    async createConversation(
        options: CreateConversationOptions = {}
    ): Promise<ConversationRow> {
        const { title = 'New Conversation', mode = 'chat', settings = {} } = options;

        const insertData: TableInsert<'conversations'> = {
            user_id: this.userId,
            title,
            mode,
            settings: settings as any,
        };

        const { data, error } = await this.supabase
            .from('conversations')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[ChatService] Failed to create conversation:', error);
            throw new Error(`Failed to create conversation: ${error.message}`);
        }

        return data as ConversationRow;
    }

    /**
     * Get a conversation by ID
     * Returns null if not found (RLS handles authorization)
     * 
     * @param conversationId - The conversation UUID
     * @returns Conversation or null
     */
    async getConversation(conversationId: string): Promise<ConversationRow | null> {
        const { data, error } = await this.supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned - not found or not authorized
                return null;
            }
            console.error('[ChatService] Failed to get conversation:', error);
            throw new Error(`Failed to get conversation: ${error.message}`);
        }

        return data as ConversationRow;
    }

    /**
     * List conversations with pagination and preview
     * Orders by most recently updated
     * 
     * @param options - Pagination and filter options
     * @returns Paginated list of conversations with message preview
     */
    async listConversations(
        options: ListConversationsOptions = {}
    ): Promise<PaginatedResponse<ConversationWithPreview>> {
        const { limit = 20, cursor, mode } = options;

        // Build query
        let query = this.supabase
            .from('conversations')
            .select('*, messages(content, role, created_at)', { count: 'exact' })
            .order('updated_at', { ascending: false })
            .limit(limit + 1); // Fetch one extra to check if there's more

        // Apply mode filter if provided
        if (mode) {
            query = query.eq('mode', mode);
        }

        // Apply cursor (pagination)
        if (cursor) {
            query = query.lt('updated_at', cursor);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('[ChatService] Failed to list conversations:', error);
            throw new Error(`Failed to list conversations: ${error.message}`);
        }

        // Process results
        const hasMore = data.length > limit;
        const conversations = data.slice(0, limit);

        // Transform to include last message preview
        const result: ConversationWithPreview[] = conversations.map((conv: any) => {
            const messages = conv.messages || [];
            const lastMessage = messages[0]; // Most recent message

            return {
                id: conv.id,
                user_id: conv.user_id,
                title: conv.title,
                mode: conv.mode as 'chat' | 'learning',
                settings: conv.settings as ConversationSettings,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                last_message: lastMessage ? {
                    content: lastMessage.content.substring(0, 100), // Truncate preview
                    role: lastMessage.role,
                    created_at: lastMessage.created_at,
                } : undefined,
                message_count: messages.length,
            };
        });

        return {
            data: result,
            count: count ?? 0,
            has_more: hasMore,
            next_cursor: hasMore ? conversations[conversations.length - 1]?.updated_at : undefined,
        };
    }

    /**
     * Update a conversation
     * 
     * @param conversationId - The conversation UUID
     * @param updates - Fields to update
     * @returns Updated conversation
     * @throws Error if update fails or conversation not found
     */
    async updateConversation(
        conversationId: string,
        updates: TableUpdate<'conversations'>
    ): Promise<ConversationRow> {
        const { data, error } = await this.supabase
            .from('conversations')
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId)
            .select()
            .single();

        if (error) {
            console.error('[ChatService] Failed to update conversation:', error);
            throw new Error(`Failed to update conversation: ${error.message}`);
        }

        return data as ConversationRow;
    }

    /**
     * Delete a conversation and all its messages
     * Messages are deleted via CASCADE
     * 
     * @param conversationId - The conversation UUID
     * @returns True if deleted
     * @throws Error if deletion fails
     */
    async deleteConversation(conversationId: string): Promise<boolean> {
        const { error } = await this.supabase
            .from('conversations')
            .delete()
            .eq('id', conversationId);

        if (error) {
            console.error('[ChatService] Failed to delete conversation:', error);
            throw new Error(`Failed to delete conversation: ${error.message}`);
        }

        return true;
    }

    // ===========================================================================
    // Message Operations
    // ===========================================================================

    /**
     * Add a message to a conversation
     * 
     * @param conversationId - The conversation UUID
     * @param role - Message role (user, assistant, system)
     * @param content - Message content
     * @param metadata - Optional metadata
     * @returns Created message
     * @throws Error if creation fails
     */
    async addMessage(
        conversationId: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata: MessageMetadata = {}
    ): Promise<MessageRow> {
        const insertData: TableInsert<'messages'> = {
            conversation_id: conversationId,
            role,
            content,
            metadata: metadata as any,
        };

        const { data, error } = await this.supabase
            .from('messages')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[ChatService] Failed to add message:', error);
            throw new Error(`Failed to add message: ${error.message}`);
        }

        return data as MessageRow;
    }

    /**
     * Get messages for a conversation with pagination
     * Orders by created_at ascending (oldest first)
     * 
     * @param conversationId - The conversation UUID
     * @param options - Pagination options
     * @returns Paginated list of messages
     */
    async getMessages(
        conversationId: string,
        options: ListMessagesOptions = {}
    ): Promise<PaginatedResponse<MessageRow>> {
        const { limit = 50, cursor, before } = options;

        let query = this.supabase
            .from('messages')
            .select('*', { count: 'exact' })
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(limit + 1);

        // Apply cursor for pagination
        if (cursor) {
            query = query.gt('created_at', cursor);
        }

        // Filter messages before a specific timestamp
        if (before) {
            query = query.lt('created_at', before);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error('[ChatService] Failed to get messages:', error);
            throw new Error(`Failed to get messages: ${error.message}`);
        }

        const hasMore = data.length > limit;
        const messages = data.slice(0, limit) as MessageRow[];

        return {
            data: messages,
            count: count ?? 0,
            has_more: hasMore,
            next_cursor: hasMore ? messages[messages.length - 1]?.created_at : undefined,
        };
    }

    /**
     * Update a message (for regeneration or edits)
     * 
     * @param messageId - The message UUID
     * @param updates - Fields to update
     * @returns Updated message
     * @throws Error if update fails
     */
    async updateMessage(
        messageId: string,
        updates: TableUpdate<'messages'>
    ): Promise<MessageRow> {
        const { data, error } = await this.supabase
            .from('messages')
            .update(updates)
            .eq('id', messageId)
            .select()
            .single();

        if (error) {
            console.error('[ChatService] Failed to update message:', error);
            throw new Error(`Failed to update message: ${error.message}`);
        }

        return data as MessageRow;
    }

    /**
     * Delete a message
     * 
     * @param messageId - The message UUID
     * @returns True if deleted
     */
    async deleteMessage(messageId: string): Promise<boolean> {
        const { error } = await this.supabase
            .from('messages')
            .delete()
            .eq('id', messageId);

        if (error) {
            console.error('[ChatService] Failed to delete message:', error);
            throw new Error(`Failed to delete message: ${error.message}`);
        }

        return true;
    }

    /**
     * Get the last N messages for context
     * Used for building AI context window
     * 
     * @param conversationId - The conversation UUID
     * @param limit - Number of messages to retrieve
     * @returns Array of messages (oldest first)
     */
    async getContextMessages(
        conversationId: string,
        limit: number = 20
    ): Promise<MessageRow[]> {
        const { data, error } = await this.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ChatService] Failed to get context messages:', error);
            throw new Error(`Failed to get context messages: ${error.message}`);
        }

        // Reverse to get oldest first
        return (data as MessageRow[]).reverse();
    }

    // ===========================================================================
    // Title Generation
    // ===========================================================================

    /**
     * Generate a title from the first message
     * Truncates to 50 characters
     * 
     * @param content - The first message content
     * @returns Generated title
     */
    static generateTitle(content: string): string {
        // Remove newlines and extra spaces
        const cleaned = content.replace(/\s+/g, ' ').trim();

        // Truncate to 50 chars
        if (cleaned.length <= 50) {
            return cleaned;
        }

        // Find a good break point
        const truncated = cleaned.substring(0, 47);
        const lastSpace = truncated.lastIndexOf(' ');

        if (lastSpace > 30) {
            return truncated.substring(0, lastSpace) + '...';
        }

        return truncated + '...';
    }
}
