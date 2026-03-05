// =============================================================================
// Chat Validation Schemas - Zod schemas for request validation
// =============================================================================

import { z } from 'zod';

// =============================================================================
// Common Validators
// =============================================================================

/**
 * UUID v4 validator
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Pagination cursor validator
 */
export const cursorSchema = z.string().optional();

/**
 * Pagination limit validator (1-100, default 20)
 */
export const limitSchema = z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20);

// =============================================================================
// Conversation Schemas
// =============================================================================

/**
 * Conversation mode enum
 */
export const conversationModeSchema = z.enum(['chat', 'learning']);

/**
 * Conversation settings schema
 */
export const conversationSettingsSchema = z.object({
    system_prompt: z.string().max(2000, 'System prompt too long').optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(8192).optional(),
}).passthrough(); // Allow additional fields for extensibility

/**
 * Create conversation request schema
 */
export const createConversationSchema = z.object({
    title: z
        .string()
        .min(1, 'Title cannot be empty')
        .max(100, 'Title too long')
        .optional()
        .default('New Conversation'),
    mode: conversationModeSchema.optional().default('chat'),
    settings: conversationSettingsSchema.optional().default({}),
});

/**
 * Update conversation request schema
 */
export const updateConversationSchema = z.object({
    title: z
        .string()
        .min(1, 'Title cannot be empty')
        .max(100, 'Title too long')
        .optional(),
    settings: conversationSettingsSchema.optional(),
});

/**
 * Get conversation params schema
 */
export const getConversationParamsSchema = z.object({
    conversationId: uuidSchema,
});

/**
 * List conversations query schema
 */
export const listConversationsQuerySchema = z.object({
    limit: limitSchema,
    cursor: cursorSchema,
    mode: conversationModeSchema.optional(),
});

// =============================================================================
// Message Schemas
// =============================================================================

/**
 * Message role enum
 */
export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

/**
 * Send message request schema
 */
export const sendMessageSchema = z.object({
    conversation_id: uuidSchema,
    content: z
        .string()
        .min(1, 'Message cannot be empty')
        .max(10000, 'Message too long (max 10000 characters)'),
});

/**
 * List messages query schema
 */
export const listMessagesQuerySchema = z.object({
    limit: limitSchema.default(50),
    cursor: cursorSchema,
    before: z.string().datetime().optional(), // Get messages before this timestamp
});

/**
 * Regenerate message request schema
 */
export const regenerateMessageSchema = z.object({
    conversation_id: uuidSchema,
    message_id: uuidSchema,
});

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type RegenerateMessageInput = z.infer<typeof regenerateMessageSchema>;
