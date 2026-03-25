import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { scans, services, users } from '../db/schema';
import { bullMQConnection } from './redis';
import { emitEvent } from '../lib/events';
import { decrypt } from '../lib/crypto';
import { ingestRepo } from '../services/ingest';
import { startSandbox, teardownSandbox, type SandboxContext } from '../services/sandbox';
import type { ScanJobData } from './index';

export function startWorker() {
  const worker = new Worker<ScanJobData>(
    'scans',
    async (job: Job<ScanJobData>) => {
      const { scanId, serviceId, userId, attackProfile } = job.data;
      const startedAt = Date.now();
      let sandbox: SandboxContext | null = null;

      console.log(`[worker] scan ${scanId} started · profile: ${attackProfile}`);
      await emitEvent(scanId, 'info', `Scan started · profile: ${attackProfile}`);

      try {
        // Mark as running
        await db.update(scans).set({ status: 'running' }).where(eq(scans.id, scanId));

        // Load service + user records
        const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
        if (!service) throw new Error(`Service ${serviceId} not found`);

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) throw new Error(`User ${userId} not found`);

        const githubToken = user.githubTokenEncrypted
          ? decrypt(user.githubTokenEncrypted)
          : null;

        // ── Phase 1: Ingest & Build ────────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 1: Ingest & Build');
        const ingestResult = await ingestRepo({
          repoUrl: service.source,
          branch: service.branch,
          githubToken,
          scanId,
        });
        await emitEvent(scanId, 'success', `Image ready: ${ingestResult.imageTag}`);

        // ── Phase 2: Sandbox ───────────────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 2: Sandbox');
        sandbox = await startSandbox({
          scanId,
          imageTag: ingestResult.imageTag,
          port: ingestResult.port,
          repoDir: ingestResult.repoDir,
        });
        await emitEvent(scanId, 'success', `Sandbox ready · ${sandbox.targetBaseUrl}`);

        // ── Phases 3–4 will go here (static analysis, AI agent) ───────────────

        const durationMs = Date.now() - startedAt;
        await db
          .update(scans)
          .set({ status: 'completed', completedAt: new Date(), durationMs })
          .where(eq(scans.id, scanId));

        await emitEvent(scanId, 'success', `Scan complete · ${Math.round(durationMs / 1000)}s`);
        console.log(`[worker] scan ${scanId} completed in ${durationMs}ms`);
      } finally {
        // Always tear down the sandbox, whether we succeeded or failed
        if (sandbox) {
          await teardownSandbox(sandbox, scanId);
        }
      }
    },
    { connection: bullMQConnection, concurrency: 3 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[worker] scan ${job.data.scanId} failed:`, err.message);
    await emitEvent(job.data.scanId, 'error', `Scan failed: ${err.message}`);
    await db
      .update(scans)
      .set({ status: 'failed', errorMessage: err.message })
      .where(eq(scans.id, job.data.scanId));
  });

  console.log('[worker] scan worker started · concurrency: 3');
  return worker;
}
