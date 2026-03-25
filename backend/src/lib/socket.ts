import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import IORedis from 'ioredis';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { scans } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { AuthPayload } from '../middleware/requireAuth';
import type { ScanEvent } from './events';

/**
 * Attaches a Socket.IO server to the HTTP server.
 *
 * Namespace: /scans
 * Client joins a room by emitting: subscribe(scanId)
 * Server forwards Redis pub/sub events as: scan_event({ type, message, timestamp })
 *
 * Auth: JWT passed as socket.handshake.auth.token (same token as REST API).
 */
export function attachSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true },
    transports: ['websocket', 'polling'],
  });

  const scansNs = io.of('/scans');

  // ── Auth middleware ────────────────────────────────────────────────────────
  scansNs.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing auth token'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  scansNs.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    // Each subscriber gets its own Redis connection so we can call subscribe()
    const sub = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    socket.on('subscribe', async (scanId: string) => {
      // Verify this scan belongs to the requesting user
      const [scan] = await db
        .select()
        .from(scans)
        .where(eq(scans.id, scanId))
        .limit(1);

      if (!scan || scan.userId !== userId) {
        socket.emit('error', 'Scan not found or access denied');
        return;
      }

      const channel = `scan:${scanId}`;
      await sub.subscribe(channel);

      sub.on('message', (_ch: string, raw: string) => {
        try {
          const event: ScanEvent = JSON.parse(raw);
          socket.emit('scan_event', event);
        } catch {
          // malformed message — ignore
        }
      });

      // If scan is already done, send a terminal event so the client knows
      if (scan.status === 'completed' || scan.status === 'failed') {
        const terminalEvent: ScanEvent = {
          type: scan.status === 'completed' ? 'success' : 'error',
          message: scan.status === 'completed'
            ? `Scan complete · already finished`
            : `Scan failed: ${scan.errorMessage ?? 'unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        socket.emit('scan_event', terminalEvent);
        socket.emit('scan_done', { status: scan.status });
      }
    });

    socket.on('unsubscribe', async (scanId: string) => {
      await sub.unsubscribe(`scan:${scanId}`);
    });

    socket.on('disconnect', () => {
      sub.disconnect();
    });
  });

  console.log('[socket.io] /scans namespace ready');
  return io;
}
