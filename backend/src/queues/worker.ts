import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { scans } from '../db/schema';
import { bullMQConnection } from './redis';
import type { ScanJobData } from './index';

export function startWorker() {
  const worker = new Worker<ScanJobData>(
    'scans',
    async (job: Job<ScanJobData>) => {
      const { scanId, attackProfile } = job.data;
      console.log(`[worker] scan ${scanId} picked up · profile: ${attackProfile}`);

      // Mark as running
      await db.update(scans).set({ status: 'running' }).where(eq(scans.id, scanId));
      console.log(`[worker] scan ${scanId} status → running`);

      // Phases 2–5 will be added here (ingest, sandbox, AI agent, report)
      // For now, simulate completion after a short delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await db
        .update(scans)
        .set({ status: 'completed', completedAt: new Date(), durationMs: 2000 })
        .where(eq(scans.id, scanId));

      console.log(`[worker] scan ${scanId} status → completed`);
    },
    { connection: bullMQConnection, concurrency: 3 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[worker] scan ${job.data.scanId} failed:`, err.message);
    await db
      .update(scans)
      .set({ status: 'failed', errorMessage: err.message })
      .where(eq(scans.id, job.data.scanId));
  });

  console.log('[worker] scan worker started · concurrency: 3');
  return worker;
}
