// =============================================================================
// File Scanner - Placeholder for malware scanning integration
// =============================================================================
//
// This module provides a stub for file scanning before processing uploads.
// In production, integrate with ClamAV, VirusTotal, or similar service.
//
// Integration points:
//   1. Docker: Add ClamAV container to docker-compose.yml
//   2. Replace scanFile() body with clamd socket/REST call
//   3. Add CLAM_AV_HOST env var to .env.example
// =============================================================================

import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

export interface ScanResult {
    /** Whether the file is considered safe */
    safe: boolean;
    /** Whether scanning was actually performed */
    skipped: boolean;
    /** Scanner name (e.g., 'clamav', 'stub') */
    scanner: string;
    /** Optional threat name if detected */
    threat?: string;
}

// =============================================================================
// Scanner
// =============================================================================

/**
 * Scan a file buffer for malware/threats.
 *
 * Currently a stub that logs a warning and returns safe.
 * Replace with real scanner integration for production.
 *
 * @param buffer - File content to scan
 * @param filename - Original filename (for logging)
 * @returns Scan result
 */
export async function scanFile(
    buffer: Buffer,
    filename: string
): Promise<ScanResult> {
    // Check if a real scanner is configured
    const scannerHost = process.env.CLAM_AV_HOST;

    if (!scannerHost) {
        logger.warn('File scanning not configured (CLAM_AV_HOST not set)', {
            filename,
            sizeBytes: buffer.length,
        });

        return {
            safe: true,
            skipped: true,
            scanner: 'stub',
        };
    }

    // TODO: Replace with real ClamAV integration
    // Example implementation:
    //
    // const response = await fetch(`http://${scannerHost}:3310/scan`, {
    //     method: 'POST',
    //     body: buffer,
    //     headers: { 'Content-Type': 'application/octet-stream' },
    // });
    // const result = await response.json();
    // return {
    //     safe: result.clean,
    //     skipped: false,
    //     scanner: 'clamav',
    //     threat: result.threat,
    // };

    logger.warn('ClamAV host configured but scanner not implemented', {
        scannerHost,
        filename,
    });

    return {
        safe: true,
        skipped: true,
        scanner: 'stub',
    };
}
