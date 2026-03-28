import { redisClient } from '../queues/redis';
import { db } from '../db';
import { scanEvents } from '../db/schema';

export type ScanEventType = 'info' | 'success' | 'error' | 'critical' | 'high' | 'medium';

export interface ScanEvent {
  type: ScanEventType;
  message: string;
  timestamp: string;
  done?: boolean;   // true on the final event — client should stop listening
}

/**
 * Publishes a scan event to the Redis pub/sub channel for that scan
 * AND persists it to the database so it can be retrieved after the scan completes.
 */
export async function emitEvent(
  scanId: string,
  type: ScanEventType,
  message: string,
  done = false,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const event: ScanEvent = { type, message, timestamp, done };

  // Persist to DB (fire-and-forget — never block the scan on a DB write failure)
  db.insert(scanEvents).values({ scanId, type, message }).catch(() => {});

  // Broadcast to live subscribers via Redis pub/sub
  await redisClient.publish(`scan:${scanId}`, JSON.stringify(event));
}
