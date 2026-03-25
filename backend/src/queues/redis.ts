import IORedis from 'ioredis';

// Used for pub/sub (Phase 6 — real-time streaming)
export const redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Plain connection options for BullMQ (avoids ioredis version conflicts)
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
export const bullMQConnection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password || undefined,
};
