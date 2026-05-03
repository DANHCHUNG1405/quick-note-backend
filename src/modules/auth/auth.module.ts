import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { StringValue } from 'ms';
import { TokenBlacklistService } from './token-blacklist.service';
import { GoogleStrategy } from './google.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: (process.env.JWT_ACCESS_EXPIRES ?? '15m') as StringValue,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistService, GoogleStrategy],
})
export class AuthModule {}
