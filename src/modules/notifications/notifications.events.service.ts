import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import {
  type NoteSharedEvent,
  type NotificationSocketPayload,
} from './notifications.types';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsEventsService {
  private readonly logger = new Logger(NotificationsEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async publishNoteShared(_payload: NoteSharedEvent) {
    // RabbitMQ temporarily disabled.
    // This method is kept to avoid breaking callers.
    this.logger.warn('RabbitMQ disabled: publishNoteShared skipped');
  }

  // RabbitMQ temporarily disabled.
  // @RabbitSubscribe({
  //   exchange: NOTIFICATIONS_EXCHANGE,
  //   routingKey: NOTE_SHARED_ROUTING_KEY,
  //   queue: NOTE_SHARED_QUEUE,
  // })
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
  }
}



