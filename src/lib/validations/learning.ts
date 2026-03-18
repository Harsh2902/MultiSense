// =============================================================================
// Learning Validation Schemas - Zod schemas for file upload requests
// =============================================================================

import { z } from 'zod';
import { ALLOWED_MIME_TYPES, FILE_SIZE_LIMITS } from '@/types/learning';

// =============================================================================
// File Upload Schemas
// =============================================================================

/**
 * Allowed MIME types as array for validation
 */
const allowedMimeTypes = Object.values(ALLOWED_MIME_TYPES);

/**
 * File metadata validation schema
 */
export const fileMetadataSchema = z.object({
    filename: z
        .string()
        .min(1, 'Filename required')
        .max(255, 'Filename too long')
        .refine(
            (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
            'Invalid filename characters'
        ),
    mime_type: z
        .string()
        .refine(
            (type) => allowedMimeTypes.includes(type as typeof allowedMimeTypes[number]),
            'Unsupported file type'
        ),
    size: z
        .number()
        .int()
        .positive()
        .max(FILE_SIZE_LIMITS.max, `File too large (max ${FILE_SIZE_LIMITS.max / 1024 / 1024}MB)`),
});

/**
 * Upload request schema
 */
export const uploadFileSchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID').optional().nullable(),
});

/**
 * Get source params schema
 */
export const getSourceParamsSchema = z.object({
    sourceId: z.string().uuid('Invalid source ID'),
});

/**
 * List sources query schema
 */
export const listSourcesQuerySchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID').optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Delete source params schema
 */
export const deleteSourceParamsSchema = z.object({
    sourceId: z.string().uuid('Invalid source ID'),
});

/**
 * Link source to conversation request schema
 */
export const linkSourceConversationSchema = z.object({
    conversation_id: z.string().uuid('Invalid conversation ID'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type FileMetadataInput = z.infer<typeof fileMetadataSchema>;
export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type ListSourcesQuery = z.infer<typeof listSourcesQuerySchema>;
