import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { getRedisConnectionOptions } from '../../infrastructure/redis/redis.config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsEventsService } from './notifications.events.service';
import { NotificationsEmailService } from './notifications.email.service';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsProcessor } from './notifications.processor';
import { NotePresenceService } from './note-presence.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisConnectionOptions(),
    }),
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
    }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET as string,
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsEventsService,
    NotificationsProcessor,
    NotificationsEmailService,
    NotePresenceService,
  ],
  exports: [NotificationsEventsService],
})
export class NotificationsModule {}
