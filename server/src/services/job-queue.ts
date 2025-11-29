import { getDatabase } from '../lib/db';
import { jobQueue, type NewJobQueue, type JobQueue as JobQueueType } from '../schema/audits';
import { eq } from 'drizzle-orm';
import { sql as rawSql } from 'drizzle-orm';

export type { JobQueueType as JobQueue };
export type JobType = 'crawl_page' | 'analyze_page';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface JobPayload {
  [key: string]: any;
}

/**
 * Add a job to the queue
 */
export async function enqueueJob(
  jobType: JobType,
  payload: JobPayload
): Promise<string> {
  const db = await getDatabase();

  const newJob: NewJobQueue = {
    job_type: jobType,
    payload: payload as any,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
  };

  const result = await db.insert(jobQueue).values(newJob).returning();
  return result[0].id;
}

/**
 * Get the next pending job from the queue
 * Uses atomic UPDATE with subquery to prevent race conditions
 */
export async function getNextJob(): Promise<JobQueueType | null> {
  try {
    const db = await getDatabase();
    const now = new Date();
    const lockDuration = 5 * 60 * 1000; // 5 minutes lock
    const lockedUntil = new Date(now.getTime() + lockDuration);

    // Convert dates to ISO strings for postgres raw query
    const nowIso = now.toISOString();
    const lockedUntilIso = lockedUntil.toISOString();

    // Use atomic UPDATE with RETURNING to claim a job
    // This prevents race conditions where multiple workers grab the same job
    const result = await db.execute(rawSql`
      UPDATE app.job_queue
      SET 
        status = 'processing',
        locked_until = ${lockedUntilIso}::timestamp,
        attempts = attempts + 1
      WHERE id = (
        SELECT id FROM app.job_queue
        WHERE status = 'pending'
        AND (locked_until IS NULL OR locked_until <= ${nowIso}::timestamp)
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);

    // Handle different return types from drizzle (neon vs postgres)
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as any;
    
    // Parse payload if it's a string (can happen with raw SQL queries)
    let parsedPayload = row.payload;
    if (typeof parsedPayload === 'string') {
      try {
        parsedPayload = JSON.parse(parsedPayload);
      } catch (e) {
        console.error('[DEBUG] Failed to parse payload JSON:', {
          payload: parsedPayload,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
        throw new Error('Invalid payload format');
      }
    }
    
    console.log('[DEBUG] getNextJob returning:', {
      jobId: row.id,
      jobType: row.job_type,
      payloadType: typeof row.payload,
      payloadIsString: typeof row.payload === 'string',
      parsedPayloadType: typeof parsedPayload,
      parsedPayloadKeys: typeof parsedPayload === 'object' && parsedPayload !== null ? Object.keys(parsedPayload) : 'N/A',
    });
    
    return {
      id: row.id,
      job_type: row.job_type,
      payload: parsedPayload,
      status: row.status,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      locked_until: row.locked_until ? new Date(row.locked_until) : null,
      created_at: new Date(row.created_at),
      processed_at: row.processed_at ? new Date(row.processed_at) : null,
    };
  } catch (error: any) {
    // Don't spam logs for connection errors - database might still be starting
    if (error?.code === 'ECONNREFUSED' || error?.code === '57P03') {
      // Database not ready yet - silent return, will retry
      return null;
    }
    console.error('[DEBUG] getNextJob error:', {
      code: error?.code,
      message: error?.message,
      errno: error?.errno,
    });
    return null;
  }
}

/**
 * Mark a job as completed
 */
export async function completeJob(jobId: string): Promise<void> {
  const db = await getDatabase();
  await db
    .update(jobQueue)
    .set({
      status: 'completed',
      processed_at: new Date(),
      locked_until: null,
    })
    .where(eq(jobQueue.id, jobId));
}

/**
 * Mark a job as failed
 * If max attempts reached, mark as failed permanently
 */
export async function failJob(jobId: string, error?: string): Promise<void> {
  const db = await getDatabase();
  const job = await db.select().from(jobQueue).where(eq(jobQueue.id, jobId)).limit(1);

  if (job.length === 0) {
    return;
  }

  const currentJob = job[0];
  const hasReachedMaxAttempts = currentJob.attempts >= currentJob.max_attempts;

  // Parse payload if it's a string
  let parsedPayload = currentJob.payload;
  if (typeof parsedPayload === 'string') {
    try {
      parsedPayload = JSON.parse(parsedPayload);
    } catch (e) {
      console.error('[DEBUG] Failed to parse payload in failJob:', {
        payload: parsedPayload,
        error: e instanceof Error ? e.message : 'Unknown error',
      });
      // If parsing fails, keep original payload
      parsedPayload = currentJob.payload;
    }
  }

  await db
    .update(jobQueue)
    .set({
      status: hasReachedMaxAttempts ? 'failed' : 'pending',
      processed_at: hasReachedMaxAttempts ? new Date() : null,
      locked_until: null,
      // Store error in payload if needed
      payload: error
        ? { ...(parsedPayload as object), error }
        : parsedPayload,
    })
    .where(eq(jobQueue.id, jobId));
}

/**
 * Process jobs continuously (worker loop)
 * Should be called when the server starts
 * Starts multiple workers for parallel processing
 */
export async function startJobProcessor(
  processJob: (job: JobQueueType) => Promise<void>,
  workerCount: number = 3
): Promise<void> {
  console.log(`🚀 Starting job processor with ${workerCount} workers...`);

  // Track active crawl jobs per audit (for rate limiting)
  const activeCrawlsByAudit = new Map<string, boolean>();

  const startWorker = (workerId: number) => {
    let consecutiveErrors = 0;
    const processNext = async () => {
      try {
        const job = await getNextJob();
        if (!job) {
          // Reset error counter on successful query (even if no job found)
          consecutiveErrors = 0;
          // No jobs available, wait before checking again
          setTimeout(processNext, 2000); // Check every 2 seconds
          return;
        }

        // Reset error counter on successful job retrieval
        consecutiveErrors = 0;
        console.log('[DEBUG] Worker processing job:', {
          workerId,
          jobId: job.id,
          jobType: job.job_type,
          payload: job.payload,
        });
        
        // Rate limiting: Only one crawl per audit at a time
        if (job.job_type === 'crawl_page') {
          const payload = job.payload as { audit_id: string };
          const auditId = payload.audit_id;
          
          // Wait if there's already a crawl job running for this audit
          while (activeCrawlsByAudit.get(auditId)) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Mark this audit as having an active crawl
          activeCrawlsByAudit.set(auditId, true);
          
          try {
            await processJob(job);
            await completeJob(job.id);
            console.log(`✅ [Worker ${workerId}] Completed job ${job.id}`);
          } catch (error) {
            console.error(`❌ [Worker ${workerId}] Job ${job.id} failed:`, error);
            await failJob(
              job.id,
              error instanceof Error ? error.message : 'Unknown error'
            );
          } finally {
            // Release the crawl lock for this audit
            activeCrawlsByAudit.delete(auditId);
          }
        } else {
          // Analyze jobs can run in parallel without restrictions
          try {
            await processJob(job);
            await completeJob(job.id);
            console.log(`✅ [Worker ${workerId}] Completed job ${job.id}`);
          } catch (error) {
            console.error(`❌ [Worker ${workerId}] Job ${job.id} failed:`, error);
            await failJob(
              job.id,
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
        }

        // Process next job immediately
        processNext();
      } catch (error: any) {
        consecutiveErrors++;
        // Only log after multiple consecutive errors to avoid spam
        if (consecutiveErrors >= 3) {
          console.error(`[DEBUG] [Worker ${workerId}] Consecutive errors (${consecutiveErrors}):`, {
            code: error?.code,
            message: error?.message,
            errno: error?.errno,
          });
        }
        // Wait longer on errors (especially connection errors)
        const delay = error?.code === 'ECONNREFUSED' || error?.code === '57P03' ? 10000 : 5000;
        setTimeout(processNext, delay);
      }
    };

    // Start this worker
    processNext();
  };

  // Start multiple workers
  for (let i = 1; i <= workerCount; i++) {
    startWorker(i);
  }
}

