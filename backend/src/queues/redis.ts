import IORedis from 'ioredis';

// Used for pub/sub event emission
export const redisClient = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
redisClient.on('error', (err: Error) => {
  console.warn('[redis:pub]', err.message);
});

// Plain connection options for BullMQ — BullMQ bundles its own ioredis internally
// and cannot accept an external IORedis instance due to version conflicts.
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
export const bullMQConnection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password || undefined,
};
