import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { TopicsModule } from './modules/topics/topics.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TaskListsModule } from './modules/task-lists/task-lists.module';
import { RoadmapsModule } from './modules/roadmaps/roadmaps.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule,
    RateLimitModule,
    AuthModule,
    PrismaModule,
    UsersModule,
    TopicsModule,
    NotesModule,
    NotificationsModule,
    TasksModule,
    TaskListsModule,
    RoadmapsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
