import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: ['http://localhost:3000', 'https://quick-note-pi.vercel.app'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 8080);
}

void bootstrap();
