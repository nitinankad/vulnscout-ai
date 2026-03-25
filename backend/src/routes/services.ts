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

// POST /services
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, source_type, source, branch } = parsed.data;

  const [service] = await db
    .insert(services)
    .values({ userId: req.user!.userId, name, sourceType: source_type, source, branch })
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
