import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt-payload.interface';
import { TokenBlacklistService } from './token-blacklist.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async register(dto: RegisterDto) {
    const { email, password, fullname } = dto;

    const existingUser = await this.prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
        fullname: fullname ?? null,
      },
      select: {
        id: true,
        email: true,
        fullname: true,
      },
    });

    return {
      message: 'Register successful',
      user,
    };
  }

  private async generateTokens(
    userId: string,
    email: string,
    fullname: string | null,
  ) {
    const payload = { sub: userId, email, fullname };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;

    const user = await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullname: true,
        password_hash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.fullname,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    try {
      const isBlacklisted =
        await this.tokenBlacklist.isRefreshTokenBlacklisted(refreshToken);

      if (isBlacklisted) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: process.env.JWT_REFRESH_SECRET,
        },
      );

      return this.generateTokens(
        payload.sub,
        payload.email,
        payload.fullname ?? null,
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(accessToken: string | null, refreshToken: string | null) {
    await Promise.all([
      accessToken
        ? this.tokenBlacklist.blacklistAccessToken(accessToken)
        : Promise.resolve(),
      refreshToken
        ? this.tokenBlacklist.blacklistRefreshToken(refreshToken)
        : Promise.resolve(),
    ]);
  }
}
