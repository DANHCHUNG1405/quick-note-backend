import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from './redis.config';
import { RedisCacheService } from './redis-cache.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(getRedisConnectionOptions()),
    },
    RedisCacheService,
  ],
  exports: [REDIS_CLIENT, RedisCacheService],
})
export class RedisModule {}
