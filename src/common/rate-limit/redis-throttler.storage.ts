import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';

type RedisThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const INCREMENT_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local throttlerName = ARGV[4]
local now = tonumber(ARGV[5])

local countField = throttlerName .. ':count'
local expiresAtField = throttlerName .. ':expiresAt'
local blockedField = throttlerName .. ':blocked'
local blockExpiresAtField = throttlerName .. ':blockExpiresAt'

local count = tonumber(redis.call('HGET', key, countField) or '0')
local expiresAt = tonumber(redis.call('HGET', key, expiresAtField) or '0')
local blocked = tonumber(redis.call('HGET', key, blockedField) or '0')
local blockExpiresAt = tonumber(redis.call('HGET', key, blockExpiresAtField) or '0')

if expiresAt <= now then
  count = 0
  blocked = 0
  blockExpiresAt = 0
  expiresAt = now + ttl
end

if blocked == 1 and blockExpiresAt <= now then
  count = 0
  blocked = 0
  blockExpiresAt = 0
  expiresAt = now + ttl
end

if blocked == 0 then
  count = count + 1
end

if count > limit and blocked == 0 then
  blocked = 1
  blockExpiresAt = now + blockDuration
end

redis.call('HSET', key, countField, count)
redis.call('HSET', key, expiresAtField, expiresAt)
redis.call('HSET', key, blockedField, blocked)
redis.call('HSET', key, blockExpiresAtField, blockExpiresAt)

local keyTtl = math.max(ttl, blockDuration)
if blocked == 1 then
  keyTtl = math.max(keyTtl, blockExpiresAt - now)
end
redis.call('PEXPIRE', key, keyTtl)

local timeToExpire = math.max(math.ceil((expiresAt - now) / 1000), 0)
local timeToBlockExpire = 0
if blocked == 1 then
  timeToBlockExpire = math.max(math.ceil((blockExpiresAt - now) / 1000), 0)
end

return { count, timeToExpire, blocked, timeToBlockExpire }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RedisThrottlerStorageRecord> {
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] =
      (await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
        Date.now(),
      )) as [number, number, number, number];

    return {
      totalHits: Number(totalHits),
      timeToExpire: Number(timeToExpire),
      isBlocked: Number(isBlocked) === 1,
      timeToBlockExpire: Number(timeToBlockExpire),
    };
  }
}
