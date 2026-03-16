import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TopicsService } from './topics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateTopicDto } from './dto/create-topic.dto';
import { RenameTopicDto } from './dto/rename-topic.dto';
import type { CurrentUserData } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateTopicDto) {
    return this.topicsService.create(user.userId, dto);
  }

  @Get()
  getTree(@CurrentUser() user: CurrentUserData) {
    return this.topicsService.getTree(user.userId);
  }

  @Get(':id')
  getById(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.topicsService.getById(user.userId, id);
  }

  @Patch(':id/rename')
  rename(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: RenameTopicDto,
  ) {
    return this.topicsService.rename(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.topicsService.softDelete(user.userId, id);
  }
}
