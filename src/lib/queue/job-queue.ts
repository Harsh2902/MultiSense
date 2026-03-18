// =============================================================================
// Background Job Queue - Async processing with retry support
// =============================================================================

import type { ProcessingJob, ProcessingStatus } from '@/types/learning';

// =============================================================================
// Types
// =============================================================================

export interface QueuedJob {
    id: string;
    source_id: string;
    user_id: string;
    conversation_id: string | null;
    status: ProcessingStatus;
    attempts: number;
    max_attempts: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
    next_retry_at?: string;
}

export interface JobQueueConfig {
    maxAttempts: number;
    retryDelayMs: number;
    processingTimeoutMs: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: JobQueueConfig = {
    maxAttempts: 3,
    retryDelayMs: 5000,          // 5 seconds
    processingTimeoutMs: 300000,  // 5 minutes
};

// =============================================================================
// In-Memory Job Queue (Demo Implementation)
// =============================================================================

/**
 * PRODUCTION NOTE:
 * This is an in-memory queue for demo purposes.
 * In production, use a proper job queue like:
 * - Bull/BullMQ with Redis
 * - Inngest
 * - Trigger.dev
 * - AWS SQS + Lambda
 * 
 * Key features needed in production:
 * - Persistence across restarts
 * - Distributed processing
 * - Dead letter queue
 * - Monitoring/observability
 */
class JobQueue {
    private jobs: Map<string, QueuedJob> = new Map();
    private processing: Set<string> = new Set();
    private listeners: Map<string, (job: QueuedJob) => void> = new Map();
    private config: JobQueueConfig;

    constructor(config: Partial<JobQueueConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Add a job to the queue
     * 
     * DUPLICATE PREVENTION:
     * - Checks if job for same source already exists
     * - Returns existing job if found
     */
    async add(
        sourceId: string,
        userId: string,
        conversationId: string | null
    ): Promise<QueuedJob> {
        // Check for existing job
        const existingJob = Array.from(this.jobs.values()).find(
            job => job.source_id === sourceId &&
                (job.status === 'pending' || job.status === 'processing')
        );

        if (existingJob) {
            console.log(`[Queue] Job already exists for source ${sourceId}`);
            return existingJob;
        }

        const job: QueuedJob = {
            id: crypto.randomUUID(),
            source_id: sourceId,
            user_id: userId,
            conversation_id: conversationId,
            status: 'pending',
            attempts: 0,
            max_attempts: this.config.maxAttempts,
            created_at: new Date().toISOString(),
        };

        this.jobs.set(job.id, job);
        console.log(`[Queue] Added job ${job.id} for source ${sourceId}`);

        // Trigger processing (non-blocking)
        this.processNext().catch(console.error);

        return job;
    }

    /**
     * Get job by ID
     */
    get(jobId: string): QueuedJob | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * Get job by source ID
     */
    getBySourceId(sourceId: string): QueuedJob | undefined {
        return Array.from(this.jobs.values()).find(
            job => job.source_id === sourceId
        );
    }

    /**
     * Register a processor function
     */
    onProcess(
        handler: (job: QueuedJob) => Promise<void>
    ): void {
        this.processHandler = handler;
    }

    private processHandler: ((job: QueuedJob) => Promise<void>) | null = null;

    /**
     * Process next available job
     */
    private async processNext(): Promise<void> {
        if (!this.processHandler) return;

        // Find next pending job
        const pendingJob = Array.from(this.jobs.values()).find(
            job => job.status === 'pending' && !this.processing.has(job.id)
        );

        if (!pendingJob) return;

        // Mark as processing
        this.processing.add(pendingJob.id);
        pendingJob.status = 'processing';
        pendingJob.started_at = new Date().toISOString();
        pendingJob.attempts++;

        console.log(`[Queue] Processing job ${pendingJob.id} (attempt ${pendingJob.attempts})`);

        try {
            // Set timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeoutMs);
            });

            // Process with timeout
            await Promise.race([
                this.processHandler(pendingJob),
                timeoutPromise,
            ]);

            // Success
            pendingJob.status = 'completed';
            pendingJob.completed_at = new Date().toISOString();
            console.log(`[Queue] Job ${pendingJob.id} completed`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            pendingJob.error = errorMessage;

            // Check if should retry
            if (pendingJob.attempts < pendingJob.max_attempts) {
                pendingJob.status = 'pending';
                pendingJob.next_retry_at = new Date(
                    Date.now() + this.config.retryDelayMs * pendingJob.attempts
                ).toISOString();
                console.log(`[Queue] Job ${pendingJob.id} failed, will retry. Error: ${errorMessage}`);

                // Schedule retry
                setTimeout(() => {
                    this.processNext().catch(console.error);
                }, this.config.retryDelayMs * pendingJob.attempts);
            } else {
                pendingJob.status = 'failed';
                pendingJob.completed_at = new Date().toISOString();
                console.log(`[Queue] Job ${pendingJob.id} failed permanently. Error: ${errorMessage}`);
            }
        } finally {
            this.processing.delete(pendingJob.id);

            // Notify listeners
            const listener = this.listeners.get(pendingJob.id);
            if (listener) {
                listener(pendingJob);
                this.listeners.delete(pendingJob.id);
            }

            // Process next job
            this.processNext().catch(console.error);
        }
    }

    /**
     * Wait for a job to complete
     */
    async waitForCompletion(jobId: string, timeoutMs: number = 60000): Promise<QueuedJob> {
        const job = this.jobs.get(jobId);
        if (!job) {
            throw new Error('Job not found');
        }

        if (job.status === 'completed' || job.status === 'failed') {
            return job;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.listeners.delete(jobId);
                reject(new Error('Wait timeout'));
            }, timeoutMs);

            this.listeners.set(jobId, (completedJob) => {
                clearTimeout(timeout);
                resolve(completedJob);
            });
        });
    }

    /**
     * Get queue stats
     */
    getStats(): {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    } {
        const jobs = Array.from(this.jobs.values());
        return {
            pending: jobs.filter(j => j.status === 'pending').length,
            processing: jobs.filter(j => j.status === 'processing').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
        };
    }

    /**
     * Clean up old completed/failed jobs
     */
    cleanup(maxAgeMs: number = 3600000): void {
        const cutoff = Date.now() - maxAgeMs;

        for (const [id, job] of Array.from(this.jobs.entries())) {
            if (
                (job.status === 'completed' || job.status === 'failed') &&
                job.completed_at &&
                new Date(job.completed_at).getTime() < cutoff
            ) {
                this.jobs.delete(id);
            }
        }
    }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let processingQueue: JobQueue | null = null;

/**
 * Get the processing queue instance
 */
export function getProcessingQueue(): JobQueue {
    if (!processingQueue) {
        processingQueue = new JobQueue();
    }
    return processingQueue;
}

/**
 * Initialize queue with processor
 */
export function initializeQueue(
    processor: (job: QueuedJob) => Promise<void>
): JobQueue {
    const queue = getProcessingQueue();
    queue.onProcess(processor);
    return queue;
}
