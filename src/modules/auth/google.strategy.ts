import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'your_google_client_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your_google_client_secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const { id, emails, displayName, photos } = profile;
    const email = emails && emails.length > 0 ? emails[0].value : null;

    if (!email) {
      throw new Error('Google account must have an email.');
    }

    return {
      googleId: id,
      email,
      fullname: displayName,
      avatar: photos && photos.length > 0 ? photos[0].value : null,
    };
  }
}
