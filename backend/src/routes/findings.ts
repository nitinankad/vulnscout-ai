import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { scans, findings, services } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
router.use(requireAuth);

// GET /findings — all findings across all of the user's scans
router.get('/', async (req, res) => {
  const userScans = await db
    .select({ id: scans.id, startedAt: scans.startedAt })
    .from(scans)
    .where(eq(scans.userId, req.user!.userId));

  if (userScans.length === 0) {
    res.json([]);
    return;
  }

  const scanIds = userScans.map((s) => s.id);

  const rows = await db
    .select()
    .from(findings)
    .leftJoin(scans, eq(scans.id, findings.scanId))
    .leftJoin(services, eq(services.id, scans.serviceId))
    .where(inArray(findings.scanId, scanIds))
    .orderBy(findings.createdAt);

  res.json(
    rows.map((r) => ({
      ...r.findings,
      serviceName: r.services?.name ?? null,
      scanStartedAt: r.scans?.startedAt ?? null,
    })),
  );
});

export default router;
