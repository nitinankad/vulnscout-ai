import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { scans, findings, services } from '../db/schema';
import { scanQueue } from '../queues';
import { requireAuth } from '../middleware/requireAuth';
import { redisClient } from '../queues/redis';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  service_id: z.string().uuid(),
  attack_profile: z.enum(['Quick', 'Standard', 'Aggressive']),
});

// POST /scans
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { service_id, attack_profile } = parsed.data;

  // Verify the service belongs to this user
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, service_id), eq(services.userId, req.user!.userId)))
    .limit(1);

  if (!service) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }

  // Create scan record
  const [scan] = await db
    .insert(scans)
    .values({ serviceId: service_id, userId: req.user!.userId, attackProfile: attack_profile })
    .returning();

  // Enqueue job
  await scanQueue.add(
    'run-scan',
    { scanId: scan.id, serviceId: service_id, userId: req.user!.userId, attackProfile: attack_profile },
    { jobId: scan.id },
  );

  console.log(`[api] scan ${scan.id} enqueued for service ${service.name}`);
  res.status(201).json(scan);
});

// POST /scans/:id/cancel
router.post('/:id/cancel', async (req, res) => {
  const [scan] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, req.params.id), eq(scans.userId, req.user!.userId)))
    .limit(1);

  if (!scan) {
    res.status(404).json({ error: 'Scan not found' });
    return;
  }

  if (scan.status !== 'running' && scan.status !== 'queued') {
    res.status(400).json({ error: 'Scan is not running or queued' });
    return;
  }

  await redisClient.set(`scan:${scan.id}:cancel`, '1', 'EX', 3600);

  res.json({ ok: true });
});

// GET /scans/:id
router.get('/:id', async (req, res) => {
  const rows = await db
    .select()
    .from(scans)
    .leftJoin(services, eq(services.id, scans.serviceId))
    .where(and(eq(scans.id, req.params.id), eq(scans.userId, req.user!.userId)))
    .limit(1);

  if (!rows[0]) {
    res.status(404).json({ error: 'Scan not found' });
    return;
  }

  const { scans: scan, services: service } = rows[0];

  const scanFindings = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scan.id))
    .orderBy(findings.createdAt);

  res.json({
    ...scan,
    serviceName: service?.name ?? null,
    serviceSource: service?.source ?? null,
    branch: service?.branch ?? null,
    findings: scanFindings,
  });
});

// GET /scans
router.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(scans)
    .where(eq(scans.userId, req.user!.userId))
    .orderBy(scans.startedAt);

  res.json(rows);
});

export default router;
