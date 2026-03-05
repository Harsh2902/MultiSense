// =============================================================================
// File Validation - Magic bytes validation and security checks
// =============================================================================

import { fileTypeFromBuffer } from 'file-type';
import type { FileType, FileValidationResult } from '@/types/learning';
import { MAGIC_BYTES, MIME_TO_FILE_TYPE, FILE_SIZE_LIMITS } from '@/types/learning';

// =============================================================================
// Magic Bytes Validation
// =============================================================================

/**
 * Validate file by checking magic bytes
 * This prevents MIME type spoofing attacks
 * 
 * @param buffer - File buffer (at least first 12 bytes)
 * @param claimedMimeType - MIME type claimed by client
 * @returns Validation result with detected file type
 */
export async function validateFileType(
    buffer: ArrayBuffer | Uint8Array,
    claimedMimeType: string
): Promise<FileValidationResult> {
    const uint8Array = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer);

    // Text files have no magic bytes
    if (claimedMimeType === 'text/plain') {
        return validateTextFile(uint8Array);
    }

    // Use file-type library for accurate detection
    const detected = await fileTypeFromBuffer(uint8Array.buffer as ArrayBuffer);

    if (!detected) {
        // No file type detected - might be text or corrupted
        return {
            valid: false,
            error: 'Unable to determine file type',
        };
    }

    // Map detected MIME to our file type
    const fileType = MIME_TO_FILE_TYPE[detected.mime];

    if (!fileType) {
        return {
            valid: false,
            error: `Unsupported file type: ${detected.mime}`,
        };
    }

    // Verify claimed type matches detected type
    const claimedFileType = MIME_TO_FILE_TYPE[claimedMimeType];

    // Allow some flexibility for images (jpeg can be detected as jpg)
    const isMatchingType =
        fileType === claimedFileType ||
        (fileType === 'image' && claimedFileType === 'image');

    if (!isMatchingType) {
        return {
            valid: false,
            error: `File type mismatch: claimed ${claimedMimeType}, detected ${detected.mime}`,
        };
    }

    return {
        valid: true,
        file_type: fileType,
        mime_type: detected.mime,
    };
}

/**
 * Validate text file content
 * Ensures content is valid UTF-8 text
 */
function validateTextFile(buffer: Uint8Array): FileValidationResult {
    try {
        // Try to decode as UTF-8
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const text = decoder.decode(buffer);

        // Check for binary content (null bytes, control chars)
        const hasBinaryContent = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text);

        if (hasBinaryContent) {
            return {
                valid: false,
                error: 'File contains binary content, not valid text',
            };
        }

        return {
            valid: true,
            file_type: 'txt',
            mime_type: 'text/plain',
        };
    } catch {
        return {
            valid: false,
            error: 'File is not valid UTF-8 text',
        };
    }
}

// =============================================================================
// File Size Validation
// =============================================================================

/**
 * Validate file size against limits
 * 
 * @param size - File size in bytes
 * @param fileType - Type of file
 * @returns Error message if invalid, null if valid
 */
export function validateFileSize(
    size: number,
    fileType?: FileType
): string | null {
    // Check global max
    if (size > FILE_SIZE_LIMITS.max) {
        return `File too large. Maximum size is ${FILE_SIZE_LIMITS.max / 1024 / 1024}MB`;
    }

    // Check type-specific limit
    if (fileType) {
        const typeLimit = FILE_SIZE_LIMITS[fileType];
        if (size > typeLimit) {
            return `${fileType.toUpperCase()} files must be under ${typeLimit / 1024 / 1024}MB`;
        }
    }

    return null;
}

// =============================================================================
// Filename Sanitization
// =============================================================================

/**
 * Sanitize filename for storage
 * Removes dangerous characters and path traversal attempts
 * 
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
    // Remove path components
    let sanitized = filename.split(/[/\\]/).pop() || 'file';

    // Remove dangerous characters
    sanitized = sanitized.replace(/[<>:"|?*\x00-\x1F]/g, '');

    // Remove leading dots (hidden files)
    sanitized = sanitized.replace(/^\.+/, '');

    // Limit length
    if (sanitized.length > 200) {
        const ext = sanitized.split('.').pop() || '';
        const name = sanitized.slice(0, 200 - ext.length - 1);
        sanitized = `${name}.${ext}`;
    }

    // Ensure we have a filename
    if (!sanitized || sanitized === '.') {
        sanitized = 'file';
    }

    return sanitized;
}

// =============================================================================
// Content Hash for Deduplication
// =============================================================================

/**
 * Generate SHA-256 hash of file content
 * Used for duplicate detection
 * 
 * @param buffer - File buffer
 * @returns Hex-encoded hash
 */
export async function generateContentHash(
    buffer: ArrayBuffer | Uint8Array
): Promise<string> {
    const uint8Array = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer);

    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array as any);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
