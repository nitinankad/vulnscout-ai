import { redisClient } from '../queues/redis';

export type ScanEventType = 'info' | 'success' | 'error' | 'critical' | 'high' | 'medium';

export interface ScanEvent {
  type: ScanEventType;
  message: string;
  timestamp: string;
}

/**
 * Publishes a scan event to the Redis pub/sub channel for that scan.
 * The frontend (Phase 6) will subscribe to scan:{scanId} and stream these to the browser.
 */
export async function emitEvent(
  scanId: string,
  type: ScanEventType,
  message: string,
): Promise<void> {
  const event: ScanEvent = { type, message, timestamp: new Date().toISOString() };
  await redisClient.publish(`scan:${scanId}`, JSON.stringify(event));
}
