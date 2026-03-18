// =============================================================================
// Chat System Types - Core type definitions for conversations and messages
// =============================================================================

/**
 * Message role in a conversation
 * - user: Messages from the user
 * - assistant: AI-generated responses
 * - system: System prompts (not shown to user)
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Conversation mode
 * - chat: Regular ChatGPT-style conversation
 * - learning: Learning mode with attached sources
 */
export type ConversationMode = 'chat' | 'learning';

/**
 * Processing status for async operations
 */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

// =============================================================================
// Database Row Types (matches Supabase schema exactly)
// =============================================================================

/**
 * User profile from public.users table
 */
export interface UserRow {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    preferences: UserPreferences;
    created_at: string;
    updated_at: string;
}

/**
 * User preferences stored as JSONB
 */
export interface UserPreferences {
    theme?: 'light' | 'dark' | 'system';
    default_model?: string;
    // Extensible for future preferences
    [key: string]: unknown;
}

/**
 * Conversation row from public.conversations table
 */
export interface ConversationRow {
    id: string;
    user_id: string;
    title: string;
    mode: ConversationMode;
    settings: ConversationSettings;
    created_at: string;
    updated_at: string;
}

/**
 * Conversation-specific settings stored as JSONB
 */
export interface ConversationSettings {
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    // Extensible for future settings
    [key: string]: unknown;
}

/**
 * Message row from public.messages table
 */
export interface MessageRow {
    id: string;
    conversation_id: string;
    role: MessageRole;
    content: string;
    metadata: MessageMetadata;
    token_count: number | null;
    created_at: string;
}

/**
 * Message metadata stored as JSONB
 */
export interface MessageMetadata {
    model?: string;
    finish_reason?: string;
    sources_used?: string[];  // IDs of learning sources referenced
    error?: string;           // Error message if generation failed
    regenerated?: boolean;    // True if this message was regenerated
    // Extensible for future metadata
    [key: string]: unknown;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to create a new conversation
 */
export interface CreateConversationRequest {
    title?: string;
    mode?: ConversationMode;
    settings?: Partial<ConversationSettings>;
}

/**
 * Response after creating a conversation
 */
export interface CreateConversationResponse {
    conversation: ConversationRow;
}

/**
 * Request to update a conversation
 */
export interface UpdateConversationRequest {
    title?: string;
    settings?: Partial<ConversationSettings>;
}

/**
 * Request to send a message
 */
export interface SendMessageRequest {
    conversation_id: string;
    source_id?: string;
    content: string;
}

/**
 * Response after sending a message (before streaming)
 */
export interface SendMessageResponse {
    user_message: MessageRow;
    stream_id: string;  // ID to track the streaming response
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
    data: T[];
    count: number;
    has_more: boolean;
    next_cursor?: string;
}

/**
 * Conversation with message preview
 */
export interface ConversationWithPreview extends ConversationRow {
    last_message?: Pick<MessageRow, 'content' | 'role' | 'created_at'>;
    message_count: number;
}

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * Server-Sent Event types for streaming responses
 */
export type StreamEventType =
    | 'start'       // Stream started
    | 'token'       // Token received
    | 'done'        // Stream completed
    | 'error';      // Error occurred

/**
 * SSE event payload
 */
export interface StreamEvent {
    type: StreamEventType;
    data: StreamEventData;
}

/**
 * Data payload for different stream event types
 */
export type StreamEventData =
    | { type: 'start'; message_id: string }
    | { type: 'token'; content: string }
    | { type: 'done'; message_id: string; token_count: number }
    | { type: 'error'; error: string; code: string };

// =============================================================================
// Context Window Types
// =============================================================================

/**
 * Message formatted for AI context
 */
export interface ContextMessage {
    role: MessageRole;
    content: string;
}

/**
 * Context window state
 */
export interface ContextWindow {
    messages: ContextMessage[];
    total_tokens: number;
    max_tokens: number;
    truncated: boolean;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standardized API error response
 */
export interface ApiError {
    error: string;
    code: ApiErrorCode;
    details?: Record<string, unknown>;
}

/**
 * Error codes for API responses
 */
export type ApiErrorCode =
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'RATE_LIMITED'
    | 'BUDGET_EXCEEDED'
    | 'INTERNAL_ERROR'
    | 'AI_ERROR'
    | 'CONFLICT';
