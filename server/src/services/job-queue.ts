import { getDatabase } from '../lib/db';
import { jobQueue, type NewJobQueue, type JobQueue as JobQueueType } from '../schema/audits';
import { eq, and, lte, or, isNull } from 'drizzle-orm';

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

  const result = await db.insert(jobQueue).values(newJob).returning({ id: jobQueue.id });
  return result[0].id;
}

/**
 * Get the next pending job from the queue
 * Uses pessimistic locking with locked_until timestamp
 */
export async function getNextJob(): Promise<JobQueueType | null> {
  const db = await getDatabase();
  const now = new Date();
  const lockDuration = 5 * 60 * 1000; // 5 minutes lock

  // Find a job that is pending and not locked (or lock expired)
  const jobs = await db
    .select()
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.status, 'pending'),
        or(
          isNull(jobQueue.locked_until),
          lte(jobQueue.locked_until, now)
        )
      )
    )
    .limit(1);

  if (jobs.length === 0) {
    return null;
  }

  const job = jobs[0];

  // Lock the job
  const lockedUntil = new Date(now.getTime() + lockDuration);
  await db
    .update(jobQueue)
    .set({
      status: 'processing',
      locked_until: lockedUntil,
      attempts: job.attempts + 1,
    })
    .where(eq(jobQueue.id, job.id));

  return {
    ...job,
    status: 'processing',
    locked_until: lockedUntil,
    attempts: job.attempts + 1,
  };
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

  await db
    .update(jobQueue)
    .set({
      status: hasReachedMaxAttempts ? 'failed' : 'pending',
      processed_at: hasReachedMaxAttempts ? new Date() : null,
      locked_until: null,
      // Store error in payload if needed
      payload: error
        ? { ...(currentJob.payload as object), error }
        : currentJob.payload,
    })
    .where(eq(jobQueue.id, jobId));
}

/**
 * Process jobs continuously (worker loop)
 * Should be called when the server starts
 */
export async function startJobProcessor(
  processJob: (job: JobQueueType) => Promise<void>
): Promise<void> {
  console.log('🚀 Starting job processor...');

  const processNext = async () => {
    try {
      const job = await getNextJob();
      if (!job) {
        // No jobs available, wait before checking again
        setTimeout(processNext, 2000); // Check every 2 seconds
        return;
      }

      console.log(`📦 Processing job ${job.id} (${job.job_type})`);
      try {
        await processJob(job);
        await completeJob(job.id);
        console.log(`✅ Completed job ${job.id}`);
      } catch (error) {
        console.error(`❌ Job ${job.id} failed:`, error);
        await failJob(
          job.id,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // Process next job immediately
      processNext();
    } catch (error) {
      console.error('❌ Job processor error:', error);
      // Continue processing after delay
      setTimeout(processNext, 5000); // Wait 5 seconds on error
    }
  };

  // Start processing
  processNext();
}

