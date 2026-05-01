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
import { CreateTodoDto } from './dto/create-todo.dto';
import { TodoQueryDto } from './dto/todo-query.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosService } from './todos.service';

@UseGuards(JwtAuthGuard)
@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData, @Query() query: TodoQueryDto) {
    return this.todosService.list(user.userId, query);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateTodoDto) {
    return this.todosService.create(user.userId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.getById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todosService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.softDelete(user.userId, id);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.complete(user.userId, id);
  }

  @Patch(':id/uncomplete')
  uncomplete(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.uncomplete(user.userId, id);
  }
}
