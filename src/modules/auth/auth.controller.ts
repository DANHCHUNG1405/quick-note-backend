import {
  Body,
  Controller,
  Post,
  Get,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { GoogleOauthGuard } from './google-oauth.guard';
import { CurrentUser } from './current-user.decorator';
import type { CurrentUserData } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() body: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.verifyEmail(body);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    return { message: 'Email verified', access_token: accessToken, user };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    auth: {
      limit: 3,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body);
  }

  @Public()
  @Post('login')
  @Throttle({
    auth: {
      limit: 5,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(body);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    return { message: 'Login successful', access_token: accessToken, user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request) {
    const refreshToken = req.cookies['refresh_token'] as string;

    const { accessToken } = await this.authService.refresh(refreshToken);

    return { message: 'Refreshed', access_token: accessToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refresh_token'] as string | undefined;
    const accessToken = this.extractBearerToken(req);

    await this.authService.logout(
      accessToken ?? null,
      refreshToken ?? null,
      user.userId,
    );

    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

    return { message: 'Logged out' };
  }

  private extractBearerToken(req: Request) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    return authorization.slice(7).trim() || null;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleOauthGuard)
  async googleAuth() {
    // initiates the Google OAuth2 login flow
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  async googleAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.googleLogin(req['user']);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?access_token=${accessToken}`);
  }

  @Get('me')
  getProfile(@Req() req: Request) {
    return { user: req['user'] };
  }
}
