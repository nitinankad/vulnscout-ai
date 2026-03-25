import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { startWorker } from './queues/worker';
import authRouter from './routes/auth';
import servicesRouter from './routes/services';
import scansRouter from './routes/scans';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/services', servicesRouter);
app.use('/scans', scansRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api] server running on port ${PORT}`);
  startWorker();
});

export default app;
