// =============================================================================
// Queue Module Index
// =============================================================================

// Legacy in-memory queue (kept for reference, not recommended for production)
export {
    getProcessingQueue,
    initializeQueue,
    type QueuedJob,
    type JobQueueConfig,
} from './job-queue';

// Supabase-based processor (recommended for serverless/Vercel)
export {
    processPendingSources,
    type ProcessorConfig,
    type ProcessingResult,
} from './processor';
