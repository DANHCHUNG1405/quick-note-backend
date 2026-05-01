import type { RedisOptions } from 'ioredis';

export function getRedisConnectionOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    return {
      ...parseRedisUrl(redisUrl),
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    port: parseNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    db: parseNumber(process.env.REDIS_DB, 0),
    maxRetriesPerRequest: null,
  };
}

function parseRedisUrl(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const secure = parsed.protocol === 'rediss:';
  const db = parsed.pathname.replace('/', '').trim();

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 6380 : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: db ? Number(db) : 0,
    tls: secure ? {} : undefined,
  };
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
