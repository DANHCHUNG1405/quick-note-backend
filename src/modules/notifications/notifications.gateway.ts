import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type {
  NotificationSocketPayload,
  NotePresenceErrorSocketPayload,
} from './notifications.types';
import { NotePresenceService } from './note-presence.service';
import type { JwtPayload } from '../auth/jwt-payload.interface';

const allowedOrigins = [
  'http://localhost:3000',
  'https://quick-note-pi.vercel.app',
];

type NotePresencePayload = {
  noteId?: unknown;
};

type SocketData = {
  userId?: string;
};

type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly notePresence: NotePresenceService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET as string,
      });

      const userId = payload.sub;

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

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = this.getClientUserId(client);
    if (!userId) {
      return;
    }

    const affectedNoteIds = this.notePresence.leaveAll(client.id, userId);
    for (const noteId of affectedNoteIds) {
      this.broadcastNoteViewers(noteId);
    }
  }

  @SubscribeMessage('note:join')
  async handleNoteJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: NotePresencePayload,
  ) {
    const userId = this.getClientUserId(client);
    const noteId = this.getPayloadNoteId(payload);

    if (!userId || !noteId) {
      this.emitNoteError(client, {
        event: 'note:join',
        noteId,
        message: 'Invalid note presence payload',
      });
      return;
    }

    const canViewNote = await this.notePresence.canViewNote(userId, noteId);

    if (!canViewNote) {
      this.emitNoteError(client, {
        event: 'note:join',
        noteId,
        message: 'Permission denied',
      });
      return;
    }

    const result = await this.notePresence.joinNote(client.id, userId, noteId);

    if (!result.joined) {
      this.emitNoteError(client, {
        event: 'note:join',
        noteId,
        message: 'User not found',
      });
      return;
    }

    client.join(this.noteRoom(noteId));

    for (const affectedNoteId of result.affectedNoteIds) {
      if (affectedNoteId !== noteId) {
        client.leave(this.noteRoom(affectedNoteId));
      }

      this.broadcastNoteViewers(affectedNoteId);
    }
  }

  @SubscribeMessage('note:leave')
  handleNoteLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: NotePresencePayload,
  ) {
    const userId = this.getClientUserId(client);
    const noteId = this.getPayloadNoteId(payload);

    if (!userId || !noteId) {
      this.emitNoteError(client, {
        event: 'note:leave',
        noteId,
        message: 'Invalid note presence payload',
      });
      return;
    }

    const removed = this.notePresence.leaveNote(client.id, userId, noteId);
    client.leave(this.noteRoom(noteId));

    if (removed) {
      this.broadcastNoteViewers(noteId);
    }
  }

  emitNotification(userId: string, payload: NotificationSocketPayload) {
    this.server.to(this.userRoom(userId)).emit('notification', payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private noteRoom(noteId: string) {
    return `note:${noteId}`;
  }

  private broadcastNoteViewers(noteId: string) {
    this.server.to(this.noteRoom(noteId)).emit('note:viewers:update', {
      noteId,
      viewers: this.notePresence.getViewers(noteId),
    });
  }

  private emitNoteError(
    client: AuthenticatedSocket,
    payload: NotePresenceErrorSocketPayload,
  ) {
    client.emit('note:error', payload);
  }

  private getClientUserId(client: AuthenticatedSocket): string | null {
    return typeof client.data.userId === 'string' ? client.data.userId : null;
  }

  private getPayloadNoteId(payload: NotePresencePayload): string | undefined {
    return typeof payload?.noteId === 'string' &&
      payload.noteId.trim().length > 0
      ? payload.noteId.trim()
      : undefined;
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    const authToken = (client.handshake.auth as { token?: unknown } | undefined)
      ?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authorization = client.handshake.headers?.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice(7).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }

    return null;
  }
}
