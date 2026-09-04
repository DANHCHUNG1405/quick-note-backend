import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTE_SHARED_JOB,
  NOTIFICATIONS_QUEUE,
} from './notifications.constants';
import {
  type NoteSharedEvent,
  type NotificationSocketPayload,
} from './notifications.types';
import { NotificationsEmailService } from './notifications.email.service';
import { NotificationsGateway } from './notifications.gateway';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly emailService: NotificationsEmailService,
    private readonly cache: RedisCacheService,
  ) {
    super();
  }

  async process(job: Job<NoteSharedEvent>) {
    if (job.name !== NOTE_SHARED_JOB) {
      this.logger.warn(`Unhandled notification job: ${job.name}`);
      return;
    }

    const event = job.data;
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

    await this.cache.invalidateByPrefix(
      `notifications:user:${event.recipientUserId}:`,
    );

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
