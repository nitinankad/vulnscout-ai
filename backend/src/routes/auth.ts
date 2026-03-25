import { Router } from 'express';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { requireAuth } from '../middleware/requireAuth';
import { redisClient } from '../queues/redis';

const router = Router();

const GITHUB_OAUTH_STATE_TTL = 600; // 10 minutes

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: '7d' });
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, name } = parsed.data;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, name }).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
  });

  res.status(201).json({ token: signToken(user.id, user.email), user });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({
    token: signToken(user.id, user.email),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
  });
});

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────
//
// Flow:
//   1. Frontend (authenticated) calls GET /auth/github/connect
//   2. Backend generates a state token, stores state→userId in Redis (10min TTL)
//   3. Returns the GitHub authorization URL — frontend redirects the browser there
//   4. User authorizes on GitHub, which redirects to GET /auth/github/callback?code=&state=
//   5. Backend exchanges code for access token, encrypts and stores it, redirects to frontend

// GET /auth/github/connect  (requires Bearer token)
// Returns: { url: "https://github.com/login/oauth/authorize?..." }
router.get('/github/connect', requireAuth, async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'GitHub OAuth is not configured' });
    return;
  }

  // Generate a random state token and store userId against it in Redis
  const state = randomBytes(32).toString('hex');
  await redisClient.setex(`oauth:state:${state}`, GITHUB_OAUTH_STATE_TTL, req.user!.userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.GITHUB_CALLBACK_URL!,
    scope: 'repo read:user',
    state,
  });

  res.json({ url: `https://github.com/login/oauth/authorize?${params}` });
});

// GET /auth/github/callback?code=&state=
// GitHub redirects here after the user authorizes
router.get('/github/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  if (error) {
    res.redirect(`${frontendUrl}/app/settings?github=denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/app/settings?github=error`);
    return;
  }

  // Validate state and retrieve userId
  const userId = await redisClient.get(`oauth:state:${state}`);
  if (!userId) {
    res.redirect(`${frontendUrl}/app/settings?github=invalid_state`);
    return;
  }
  await redisClient.del(`oauth:state:${state}`);

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_CALLBACK_URL,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

  if (!tokenData.access_token) {
    console.error('[github oauth] token exchange failed:', tokenData.error);
    res.redirect(`${frontendUrl}/app/settings?github=error`);
    return;
  }

  // Store encrypted token on the user record
  const githubTokenEncrypted = encrypt(tokenData.access_token);
  await db.update(users).set({ githubTokenEncrypted }).where(eq(users.id, userId));

  res.redirect(`${frontendUrl}/app/settings?github=connected`);
});

// DELETE /auth/github  — disconnect GitHub
router.delete('/github', requireAuth, async (req, res) => {
  await db
    .update(users)
    .set({ githubTokenEncrypted: null })
    .where(eq(users.id, req.user!.userId));

  res.json({ ok: true });
});

// GET /auth/github/status  — check if GitHub is connected
router.get('/github/status', requireAuth, async (req, res) => {
  const [user] = await db
    .select({ githubTokenEncrypted: users.githubTokenEncrypted })
    .from(users)
    .where(eq(users.id, req.user!.userId))
    .limit(1);

  res.json({ connected: !!user?.githubTokenEncrypted });
});

export default router;
