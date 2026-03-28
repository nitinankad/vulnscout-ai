import 'dotenv/config';

// Prevent ioredis "Connection is closed" and similar non-fatal errors from crashing the process
process.on('uncaughtException', (err: Error) => {
  console.error('[process] uncaught exception (non-fatal):', err.message);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[process] unhandled rejection:', reason instanceof Error ? reason.message : reason);
});
import http from 'http';
import express from 'express';
import cors from 'cors';

import { pool } from './db';
import { startWorker } from './queues/worker';
import { attachSocketIO } from './lib/socket';
import authRouter from './routes/auth';
import servicesRouter from './routes/services';
import scansRouter from './routes/scans';
import findingsRouter from './routes/findings';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/services', servicesRouter);
app.use('/scans', scansRouter);
app.use('/findings', findingsRouter);

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const cause = (err as Error & { cause?: unknown }).cause;
  console.error('[error]', err.message, cause ?? '');
  res.status(500).json({ error: err.message, cause: cause instanceof Error ? cause.message : cause });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);
attachSocketIO(httpServer);

httpServer.listen(PORT, async () => {
  console.log(`[api] server running on port ${PORT}`);
  startWorker();
});

export default app;
