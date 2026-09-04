import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.constants';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RateLimitGuard } from './rate-limit.guard';
import type Redis from 'ioredis';

@Module({
  imports: [
    RedisModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET as string,
    }),
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        errorMessage: 'Too many requests',
        throttlers: [
          {
            name: 'default',
            limit: 100,
            ttl: 60_000,
            blockDuration: 60_000,
          },
          {
            name: 'auth',
            limit: 5,
            ttl: 60_000,
            blockDuration: 60_000,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<Request>();
              return !(
                request.method === 'POST' && request.path === '/auth/login'
              );
            },
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    RateLimitGuard,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class RateLimitModule {}
