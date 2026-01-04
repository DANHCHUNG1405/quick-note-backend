import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import * as passportJwt from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

const { Strategy, ExtractJwt } = passportJwt;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
