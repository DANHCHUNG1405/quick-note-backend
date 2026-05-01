import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NOTE_SHARED_JOB, NOTIFICATIONS_QUEUE } from './notifications.constants';
import { type NoteSharedEvent } from './notifications.types';

@Injectable()
export class NotificationsEventsService {
  private readonly logger = new Logger(NotificationsEventsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue<NoteSharedEvent>,
  ) {}

  async publishNoteShared(payload: NoteSharedEvent) {
    try {
      await this.notificationsQueue.add(
        NOTE_SHARED_JOB,
        payload,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      this.logger.warn(
        'Failed to publish note shared event',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
