import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { NotificationSocketPayload } from './notifications.types';

const allowedOrigins = [
  'http://localhost:3000',
  'https://quick-note-pi.vercel.app',
];

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET as string,
      });

      const userId = typeof payload === 'object' ? payload.sub : null;

      if (!userId || typeof userId !== 'string') {
        client.disconnect();
        return;
      }

      client.data.userId = userId;
      client.join(this.userRoom(userId));
    } catch (error) {
      this.logger.warn(
        'Socket authentication failed',
        error instanceof Error ? error.message : String(error),
      );
      client.disconnect();
    }
  }

  emitNotification(userId: string, payload: NotificationSocketPayload) {
    this.server.to(this.userRoom(userId)).emit('notification', payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authorization = client.handshake.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice(7).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    const cookieHeader = client.handshake.headers?.cookie;
    if (typeof cookieHeader === 'string') {
      const cookies = this.parseCookies(cookieHeader);
      if (cookies.access_token) {
        return cookies.access_token;
      }
    }

    return null;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    return cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.length > 0)
      .reduce((acc, cookie) => {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) {
          return acc;
        }

        const key = cookie.slice(0, separatorIndex).trim();
        const value = cookie.slice(separatorIndex + 1).trim();
        if (!key) {
          return acc;
        }

        acc[key] = decodeURIComponent(value);
        return acc;
      }, {} as Record<string, string>);
  }
}
