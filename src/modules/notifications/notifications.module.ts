import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsEventsService } from './notifications.events.service';
import { NOTIFICATIONS_EXCHANGE } from './notifications.constants';

@Module({
  imports: [
    // RabbitMQ temporarily disabled.
    // RabbitMQModule.forRoot({
    //   exchanges: [{ name: NOTIFICATIONS_EXCHANGE, type: 'topic' }],
    //   uri: process.env.RABBITMQ_URI ?? 'amqp://localhost:5672',
    //   connectionInitOptions: { wait: false },
    // }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET as string,
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsEventsService,
  ],
  exports: [NotificationsEventsService],
})
export class NotificationsModule {}


