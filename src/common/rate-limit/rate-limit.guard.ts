import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/jwt-payload.interface';

type AuthenticatedRequest = Request & {
  user?: {
    userId?: string;
  };
};

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: AuthenticatedRequest): Promise<string> {
    const userId = req.user?.userId ?? (await this.extractUserIdFromToken(req));
    if (userId) {
      return `rate_limit:user:${userId}`;
    }

    return `rate_limit:ip:${this.extractClientIp(req)}`;
  }

  protected generateKey(
    _context: ExecutionContext,
    tracker: string,
    _name: string,
  ): string {
    return tracker;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async extractUserIdFromToken(req: Request): Promise<string | null> {
    const token = this.extractBearerToken(req);
    if (!token) {
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET as string,
      });

      return payload.sub;
    } catch {
      return null;
    }
  }

  private extractBearerToken(req: Request): string | null {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    return authorization.slice(7).trim() || null;
  }

  private extractClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    const realIp = forwardedValue?.split(',')[0]?.trim();
    const fallbackIp =
      realIp ||
      req.ip ||
      req.ips?.[0] ||
      req.socket.remoteAddress ||
      'unknown';

    return fallbackIp.replace(/^::ffff:/, '');
  }
}
