import { redisClient } from '../queues/redis';

export type ScanEventType = 'info' | 'success' | 'error' | 'critical' | 'high' | 'medium';

export interface ScanEvent {
  type: ScanEventType;
  message: string;
  timestamp: string;
  done?: boolean;   // true on the final event — client should stop listening
}

/**
 * Publishes a scan event to the Redis pub/sub channel for that scan.
 * The frontend subscribes to scan:{scanId} via Socket.IO and streams these to the browser.
 */
export async function emitEvent(
  scanId: string,
  type: ScanEventType,
  message: string,
  done = false,
): Promise<void> {
  const event: ScanEvent = { type, message, timestamp: new Date().toISOString(), done };
  await redisClient.publish(`scan:${scanId}`, JSON.stringify(event));
}
