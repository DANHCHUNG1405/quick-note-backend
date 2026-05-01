import { Module } from '@nestjs/common';
import { TodosModule } from '../todos/todos.module';
import { TodoGroupsController } from './todo-groups.controller';
import { TodoGroupsService } from './todo-groups.service';

@Module({
  imports: [TodosModule],
  controllers: [TodoGroupsController],
  providers: [TodoGroupsService],
})
export class TodoGroupsModule {}
