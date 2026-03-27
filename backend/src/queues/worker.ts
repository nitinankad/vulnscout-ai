import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { scans, services, users } from '../db/schema';
import { bullMQConnection } from './redis';
import { emitEvent } from '../lib/events';
import { decrypt } from '../lib/crypto';
import { ingestRepo } from '../services/ingest';
import { startSandbox, teardownSandbox, type SandboxContext } from '../services/sandbox';
import { runAttacker } from '../services/attacker';
import { analyseRepo, formatEndpointsForAgent } from '../services/static-analysis';
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
        await db.update(scans).set({ status: 'running' }).where(eq(scans.id, scanId));

        // Load records
        const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
        if (!service) throw new Error(`Service ${serviceId} not found`);

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) throw new Error(`User ${userId} not found`);

        const githubToken = user.githubTokenEncrypted
          ? decrypt(user.githubTokenEncrypted)
          : null;

        // ── Phase 1: Ingest & Build ──────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 1: Ingest & Build');
        const ingestResult = await ingestRepo({
          repoUrl: service.source,
          branch: service.branch,
          githubToken,
          scanId,
        });

        // ── Phase 2: Static Analysis ─────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 2: Static Analysis');
        const analysisResult = await analyseRepo(ingestResult.repoDir, scanId);
        const knownEndpoints = formatEndpointsForAgent(analysisResult);

        await db
          .update(scans)
          .set({ endpointsScanned: analysisResult.endpoints.length })
          .where(eq(scans.id, scanId));

        // ── Phase 3: Sandbox ─────────────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 3: Sandbox');
        sandbox = await startSandbox({
          scanId,
          imageTag: ingestResult.imageTag,
          port: ingestResult.port,
          repoDir: ingestResult.repoDir,
          envVars: service.envVars ?? {},
        });
        await emitEvent(scanId, 'success', `Sandbox ready · ${sandbox.targetBaseUrl}`);

        // ── Phase 4: AI Attacker ─────────────────────────────────────────────
        await emitEvent(scanId, 'info', '── Phase 4: AI Attacker');
        const agentResult = await runAttacker({
          scanId,
          targetBaseUrl: sandbox.targetBaseUrl,
          attackProfile: attackProfile as 'Quick' | 'Standard' | 'Aggressive',
          knownEndpoints,
        });

        await emitEvent(
          scanId,
          'success',
          `Attacker done · ${agentResult.findingsCount} findings · ${agentResult.requestsFired} requests`,
        );

        const durationMs = Date.now() - startedAt;
        await db
          .update(scans)
          .set({
            status: 'completed',
            completedAt: new Date(),
            durationMs,
            endpointsScanned: analysisResult.endpoints.length,
          })
          .where(eq(scans.id, scanId));

        await emitEvent(scanId, 'success', `Scan complete · ${Math.round(durationMs / 1000)}s`, true);
        console.log(`[worker] scan ${scanId} completed · ${agentResult.findingsCount} findings`);
      } finally {
        if (sandbox) await teardownSandbox(sandbox, scanId);
      }
    },
    { connection: bullMQConnection, concurrency: 3 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    console.error(`[worker] scan ${job.data.scanId} failed:`, err.message);
    await emitEvent(job.data.scanId, 'error', `Scan failed: ${err.message}`, true);
    await db
      .update(scans)
      .set({ status: 'failed', errorMessage: err.message })
      .where(eq(scans.id, job.data.scanId));
  });

  console.log('[worker] scan worker started · concurrency: 3');
  return worker;
}
