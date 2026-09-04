import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';

type DecodedToken = {
  exp?: number;
};

@Injectable()
export class TokenBlacklistService {
  constructor(
    private readonly cache: RedisCacheService,
    private readonly jwtService: JwtService,
  ) {}

  async blacklistAccessToken(token: string): Promise<void> {
    await this.blacklistToken('access', token);
  }

  async blacklistRefreshToken(token: string): Promise<void> {
    await this.blacklistToken('refresh', token);
  }

  async isAccessTokenBlacklisted(token: string): Promise<boolean> {
    return this.isBlacklisted('access', token);
  }

  async isRefreshTokenBlacklisted(token: string): Promise<boolean> {
    return this.isBlacklisted('refresh', token);
  }

  private async blacklistToken(type: 'access' | 'refresh', token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }

    const ttlSeconds = this.getRemainingTtlSeconds(normalizedToken);
    if (ttlSeconds <= 0) {
      return;
    }

    await this.cache.setJson(
      this.getKey(type, normalizedToken),
      true,
      ttlSeconds,
    );
  }

  private async isBlacklisted(
    type: 'access' | 'refresh',
    token: string,
  ): Promise<boolean> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return false;
    }

    const value = await this.cache.getJson<boolean>(
      this.getKey(type, normalizedToken),
    );
    return value === true;
  }

  private getRemainingTtlSeconds(token: string) {
    const decoded = this.jwtService.decode<DecodedToken>(token);
    if (!decoded?.exp) {
      return 0;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return Math.max(decoded.exp - nowInSeconds, 0);
  }

  private getKey(type: 'access' | 'refresh', token: string) {
    return `auth:blacklist:${type}:${token}`;
  }
}
