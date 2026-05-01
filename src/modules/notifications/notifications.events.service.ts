import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTE_SHARED_QUEUE,
  NOTE_SHARED_ROUTING_KEY,
  NOTIFICATIONS_EXCHANGE,
} from './notifications.constants';
import {
  type NoteSharedEvent,
  type NotificationSocketPayload,
} from './notifications.types';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsEmailService } from './notifications.email.service';

@Injectable()
export class NotificationsEventsService {
  private readonly logger = new Logger(NotificationsEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly amqpConnection: AmqpConnection,
    private readonly emailService: NotificationsEmailService,
  ) {}

  async publishNoteShared(payload: NoteSharedEvent) {
    try {
      await this.amqpConnection.publish(
        NOTIFICATIONS_EXCHANGE,
        NOTE_SHARED_ROUTING_KEY,
        payload,
      );
    } catch (error) {
      this.logger.warn(
        'Failed to publish note shared event',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  @RabbitSubscribe({
    exchange: NOTIFICATIONS_EXCHANGE,
    routingKey: NOTE_SHARED_ROUTING_KEY,
    queue: NOTE_SHARED_QUEUE,
  })
  async handleNoteSharedEvent(event: NoteSharedEvent) {
    if (
      !event?.recipientUserId ||
      !event.noteId ||
      !event.noteTitle ||
      !event.sharedByUserId
    ) {
      this.logger.warn('Invalid note shared event payload');
      return;
    }

    const notification = await this.prisma.notifications.create({
      data: {
        user_id: event.recipientUserId,
        type: 'note_shared',
        message: `A note "${event.noteTitle}" was shared with you.`,
      },
      select: {
        id: true,
        type: true,
        message: true,
        is_read: true,
        created_at: true,
      },
    });

    const payload: NotificationSocketPayload = {
      ...notification,
      note_id: event.noteId,
      shared_by_user_id: event.sharedByUserId,
    };

    try {
      this.gateway.emitNotification(event.recipientUserId, payload);
    } catch (error) {
      this.logger.warn(
        'Failed to emit socket notification',
        error instanceof Error ? error.message : String(error),
      );
    }

    const users = await this.prisma.users.findMany({
      where: { id: { in: [event.recipientUserId, event.sharedByUserId] } },
      select: { id: true, email: true, fullname: true },
    });

    const recipient = users.find((user) => user.id === event.recipientUserId);
    const sharedBy = users.find((user) => user.id === event.sharedByUserId);

    if (recipient?.email) {
      await this.emailService.sendNoteSharedEmail({
        to: recipient.email,
        noteTitle: event.noteTitle,
        sharedByName:
          sharedBy?.fullname?.trim() || sharedBy?.email?.trim() || 'Someone',
        recipientName: recipient.fullname ?? null,
      });
    }
  }
}
