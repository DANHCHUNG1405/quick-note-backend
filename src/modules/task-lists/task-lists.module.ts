import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { TaskListsController } from './task-lists.controller';
import { TaskListsService } from './task-lists.service';

@Module({
  imports: [TasksModule],
  controllers: [TaskListsController],
  providers: [TaskListsService],
})
export class TaskListsModule {}
