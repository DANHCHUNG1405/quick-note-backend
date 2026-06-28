import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, task_lists as TaskListModel, tasks as TaskModel } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TaskQueryDto } from '../tasks/dto/task-query.dto';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskListDto } from './dto/create-task-list.dto';
import { TaskListQueryDto } from './dto/task-list-query.dto';
import { UpdateTaskListDto } from './dto/update-task-list.dto';

type TaskListWithCount = TaskListModel & {
  _count: { tasks: number };
};

type TaskListListResponse = {
  items: TaskListWithCount[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TaskListDetailResponse = TaskListModel & {
  tasks: TaskModel[];
};

@Injectable()
export class TaskListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly tasksService: TasksService,
  ) {}

  async list(
    userId: string,
    query: TaskListQueryDto,
  ): Promise<TaskListListResponse> {
    return this.cache.rememberJson(
      `task-lists:user:${userId}:list:${this.serializeQuery(query)}`,
      45,
      async () => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const where = this.buildListWhere(userId, query);

        const [lists, total] = await this.prisma.$transaction([
          this.prisma.task_lists.findMany({
            where,
            orderBy: [{ order_index: 'asc' }, { created_at: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            include: {
              _count: { select: { tasks: { where: { deleted_at: null } } } },
            },
          }),
          this.prisma.task_lists.count({ where }),
        ]);

        return {
          items: lists,
          meta: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
          },
        };
      },
    );
  }

  async create(userId: string, dto: CreateTaskListDto): Promise<TaskListModel> {
    const list = await this.prisma.task_lists.create({
      data: {
        user_id: userId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        order_index: dto.order_index ?? 0,
      },
    });

    await this.invalidateCaches(userId);
    return list;
  }

  async getById(
    userId: string,
    listId: string,
  ): Promise<TaskListDetailResponse> {
    return this.cache.rememberJson(
      `task-lists:user:${userId}:item:${listId}`,
      45,
      async () => {
        const list = await this.findOwnedListOrThrow(userId, listId);
        const tasks = await this.prisma.tasks.findMany({
          where: { list_id: listId, deleted_at: null },
        });

        return { ...list, tasks: this.tasksService.sortTaskItems(tasks) };
      },
    );
  }

  async update(
    userId: string,
    listId: string,
    dto: UpdateTaskListDto,
  ): Promise<TaskListModel> {
    await this.findOwnedListOrThrow(userId, listId);

    const data: Prisma.task_listsUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.order_index !== undefined) data.order_index = dto.order_index;

    const list = await this.prisma.task_lists.update({
      where: { id: listId },
      data,
    });

    await this.invalidateCaches(userId);
    return list;
  }

  async softDelete(userId: string, listId: string) {
    await this.findOwnedListOrThrow(userId, listId);

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tasks.updateMany({
        where: { list_id: listId, deleted_at: null },
        data: { deleted_at: now },
      }),
      this.prisma.task_lists.update({
        where: { id: listId },
        data: { deleted_at: now },
      }),
    ]);

    await this.invalidateCaches(userId);
    return { message: 'Task list deleted successfully' };
  }

  async getTasks(userId: string, listId: string, query: TaskQueryDto) {
    await this.findOwnedListOrThrow(userId, listId);
    return this.tasksService.listByList(userId, listId, query);
  }

  async createTask(userId: string, listId: string, dto: CreateTaskDto) {
    const task = await this.tasksService.createInList(userId, listId, dto);
    await this.invalidateCaches(userId);
    return task;
  }

  private buildListWhere(
    userId: string,
    query: TaskListQueryDto,
  ): Prisma.task_listsWhereInput {
    const conditions: Prisma.task_listsWhereInput[] = [
      { user_id: userId, deleted_at: null },
    ];

    const trimmed = query.search?.trim();
    if (trimmed) {
      conditions.push({
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { description: { contains: trimmed, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: conditions };
  }

  private async findOwnedListOrThrow(
    userId: string,
    listId: string,
  ): Promise<TaskListModel> {
    const list = await this.prisma.task_lists.findFirst({
      where: { id: listId, user_id: userId, deleted_at: null },
    });

    if (!list) throw new NotFoundException('Task list not found');
    return list;
  }

  private serializeQuery(query: TaskListQueryDto) {
    return JSON.stringify({
      limit: query.limit ?? 20,
      page: query.page ?? 1,
      search: query.search?.trim() || null,
    });
  }

  private async invalidateCaches(userId: string) {
    await Promise.all([
      this.cache.invalidateByPrefix(`task-lists:user:${userId}:`),
      this.cache.invalidateByPrefix(`tasks:user:${userId}:`),
    ]);
  }
}
