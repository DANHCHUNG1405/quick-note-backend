import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { TopicsModule } from './modules/topics/topics.module';
@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    PrismaModule,
    UsersModule,
    TopicsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
