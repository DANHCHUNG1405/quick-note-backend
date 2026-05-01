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
import { CreateTodoDto } from '../todos/dto/create-todo.dto';
import { TodoQueryDto } from '../todos/dto/todo-query.dto';
import { CreateTodoGroupDto } from './dto/create-todo-group.dto';
import { TodoGroupQueryDto } from './dto/todo-group-query.dto';
import { UpdateTodoGroupDto } from './dto/update-todo-group.dto';
import { TodoGroupsService } from './todo-groups.service';

@UseGuards(JwtAuthGuard)
@Controller('todo-groups')
export class TodoGroupsController {
  constructor(private readonly todoGroupsService: TodoGroupsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserData,
    @Query() query: TodoGroupQueryDto,
  ) {
    return this.todoGroupsService.list(user.userId, query);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateTodoGroupDto,
  ) {
    return this.todoGroupsService.create(user.userId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todoGroupsService.getById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoGroupDto,
  ) {
    return this.todoGroupsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todoGroupsService.softDelete(user.userId, id);
  }

  @Get(':id/todos')
  getTodos(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TodoQueryDto,
  ) {
    return this.todoGroupsService.getTodos(user.userId, id, query);
  }

  @Post(':id/todos')
  createTodo(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTodoDto,
  ) {
    return this.todoGroupsService.createTodo(user.userId, id, dto);
  }
}
