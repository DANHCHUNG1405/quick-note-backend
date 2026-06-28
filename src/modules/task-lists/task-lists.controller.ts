import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user.decorator';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TaskQueryDto } from '../tasks/dto/task-query.dto';
import { CreateTaskListDto } from './dto/create-task-list.dto';
import { TaskListQueryDto } from './dto/task-list-query.dto';
import { UpdateTaskListDto } from './dto/update-task-list.dto';
import { TaskListsService } from './task-lists.service';

@UseGuards(JwtAuthGuard)
@Controller('task-lists')
export class TaskListsController {
  constructor(private readonly taskListsService: TaskListsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData, @Query() query: TaskListQueryDto) {
    return this.taskListsService.list(user.userId, query);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTaskListDto,
  ) {
    return this.taskListsService.create(user.userId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskListsService.getById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskListDto,
  ) {
    return this.taskListsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskListsService.softDelete(user.userId, id);
  }

  @Get(':id/tasks')
  getTasks(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TaskQueryDto,
  ) {
    return this.taskListsService.getTasks(user.userId, id, query);
  }

  @Post(':id/tasks')
  createTask(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskListsService.createTask(user.userId, id, dto);
  }
}
