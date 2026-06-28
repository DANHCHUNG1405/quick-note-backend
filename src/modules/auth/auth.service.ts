import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsEmailService } from '../notifications/notifications.email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import type { JwtPayload } from './jwt-payload.interface';
import { TokenBlacklistService } from './token-blacklist.service';
import type { StringValue } from 'ms';

const VERIFICATION_CODE_TTL_MINUTES = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly emailService: NotificationsEmailService,
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
        email_verified: false,
      },
      select: {
        id: true,
        email: true,
        fullname: true,
      },
    });

    await this.issueVerificationCode(user.id, user.email, user.fullname);

    return {
      message:
        'Register successful. Please check your email for the verification code.',
      user,
    };
  }

  private generateVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async issueVerificationCode(
    userId: string,
    email: string,
    fullname: string | null,
  ) {
    const code = this.generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expires = new Date(
      Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.users.update({
      where: { id: userId },
      data: {
        verification_code: codeHash,
        verification_expires: expires,
      },
    });

    await this.emailService.sendVerificationEmail({
      to: email,
      code,
      recipientName: fullname,
      expiresInMinutes: VERIFICATION_CODE_TTL_MINUTES,
    });
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const { email, code } = dto;

    const user = await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullname: true,
        email_verified: true,
        verification_code: true,
        verification_expires: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email already verified');
    }

    if (
      !user.verification_code ||
      !user.verification_expires ||
      user.verification_expires.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Verification code expired. Please request a new one.',
      );
    }

    const isMatch = await bcrypt.compare(code, user.verification_code);
    if (!isMatch) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        verification_code: null,
        verification_expires: null,
      },
    });

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

  async resendVerification(dto: ResendVerificationDto) {
    const { email } = dto;

    const user = await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullname: true,
        email_verified: true,
      },
    });

    // Always return the same response to avoid leaking which emails exist.
    if (user && !user.email_verified) {
      await this.issueVerificationCode(user.id, user.email, user.fullname);
    }

    return {
      message:
        'If your account needs verification, a new code has been sent to your email.',
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
      expiresIn: (process.env.JWT_ACCESS_EXPIRES || '15m') as StringValue,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES || '7d') as StringValue,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.users.update({
      where: { id: userId },
      data: { refresh_token_hash: refreshTokenHash },
    });

    return { accessToken, refreshToken };
  }

  async googleLogin(profile: any) {
    let user = await this.prisma.users.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      user = await this.prisma.users.create({
        data: {
          email: profile.email,
          fullname: profile.fullname,
          avatar: profile.avatar,
          google_id: profile.googleId,
          provider: 'GOOGLE',
          email_verified: true,
        },
      });
    } else {
      // If user exists but logs in with google for the first time
      if (!user.google_id) {
        user = await this.prisma.users.update({
          where: { id: user.id },
          data: {
            google_id: profile.googleId,
            avatar: user.avatar || profile.avatar,
            provider: user.provider === 'LOCAL' ? 'GOOGLE' : user.provider,
            email_verified: true,
          },
        });
      }
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
        avatar: user.avatar,
      },
    };
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
        email_verified: true,
      },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.email_verified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
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

      const user = await this.prisma.users.findUnique({
        where: { id: payload.sub },
        select: { refresh_token_hash: true },
      });

      if (!user || !user.refresh_token_hash) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isMatch = await bcrypt.compare(refreshToken, user.refresh_token_hash);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(
        payload.sub,
        payload.email,
        payload.fullname ?? null,
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(accessToken: string | null, refreshToken: string | null, userId?: string) {
    await Promise.all([
      accessToken
        ? this.tokenBlacklist.blacklistAccessToken(accessToken)
        : Promise.resolve(),
      refreshToken
        ? this.tokenBlacklist.blacklistRefreshToken(refreshToken)
        : Promise.resolve(),
      userId 
        ? this.prisma.users.update({ where: { id: userId }, data: { refresh_token_hash: null } }).catch(() => null)
        : Promise.resolve(),
    ]);
  }
}
