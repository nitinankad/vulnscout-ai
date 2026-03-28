import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { services } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  source_type: z.enum(['github', 'openapi']),
  source: z.string().min(1),
  branch: z.string().optional(),
  env_vars: z.record(z.string(), z.string()).optional(),
});

// GET /services
router.get('/', async (req, res) => {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.userId, req.user!.userId))
    .orderBy(services.createdAt);

  res.json(rows);
});

// POST /services — find-or-create: returns existing service if same source+branch already exists for this user
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, source_type, source, branch, env_vars } = parsed.data;

  // Check for an existing service with the same source URL and branch
  const conditions = [
    eq(services.userId, req.user!.userId),
    eq(services.source, source),
  ];
  if (branch) conditions.push(eq(services.branch, branch));

  const [existing] = await db
    .select()
    .from(services)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    // If caller is providing new env vars, merge them in
    if (env_vars && Object.keys(env_vars).length > 0) {
      const merged = { ...(existing.envVars ?? {}), ...env_vars } as Record<string, string>;
      const [updated] = await db
        .update(services)
        .set({ envVars: merged })
        .where(eq(services.id, existing.id))
        .returning();
      res.status(200).json(updated);
    } else {
      res.status(200).json(existing);
    }
    return;
  }

  const [service] = await db
    .insert(services)
    .values({ userId: req.user!.userId, name, sourceType: source_type, source, branch, envVars: (env_vars ?? {}) as Record<string, string> })
    .returning();

  res.status(201).json(service);
});

// DELETE /services/:id
router.delete('/:id', async (req, res) => {
  const deleted = await db
    .delete(services)
    .where(and(eq(services.id, req.params.id), eq(services.userId, req.user!.userId)))
    .returning({ id: services.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }

  res.status(204).send();
});

export default router;
