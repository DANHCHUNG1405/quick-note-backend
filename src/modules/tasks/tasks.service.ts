import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, tasks as TaskModel } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

type TaskStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type TaskListResponse = {
  items: TaskModel[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type InternalQuery = TaskQueryDto & {
  listId?: string;
  roadmapId?: string;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  // ----- container-scoped operations -----

  async listByList(
    userId: string,
    listId: string,
    query: TaskQueryDto = {},
  ): Promise<TaskListResponse> {
    await this.assertListOwner(userId, listId);
    return this.cache.rememberJson(
      `tasks:user:${userId}:list:${listId}:${this.serializeQuery(query)}`,
      45,
      () => this.listInternal(userId, { ...query, listId }),
    );
  }

  async listByRoadmap(
    userId: string,
    roadmapId: string,
    query: TaskQueryDto = {},
  ): Promise<TaskListResponse> {
    await this.assertRoadmapOwner(userId, roadmapId);
    return this.cache.rememberJson(
      `tasks:user:${userId}:roadmap:${roadmapId}:${this.serializeQuery(query)}`,
      45,
      () => this.listInternal(userId, { ...query, roadmapId }),
    );
  }

  async createInList(
    userId: string,
    listId: string,
    dto: CreateTaskDto,
  ): Promise<TaskModel> {
    await this.assertListOwner(userId, listId);

    const task = await this.prisma.tasks.create({
      data: {
        user_id: userId,
        list_id: listId,
        roadmap_id: null,
        due_date: null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        priority: dto.priority ?? 'NORMAL',
        order_index: dto.order_index ?? 0,
        ...this.buildStatusData(dto.status ?? 'PENDING', null, true),
      },
    });

    await this.invalidateCaches(userId);
    return task;
  }

  async createInRoadmap(
    userId: string,
    roadmapId: string,
    dto: CreateTaskDto,
  ): Promise<TaskModel> {
    await this.assertRoadmapOwner(userId, roadmapId);

    const task = await this.prisma.tasks.create({
      data: {
        user_id: userId,
        list_id: null,
        roadmap_id: roadmapId,
        due_date: dto.due_date ? this.parseDateOnly(dto.due_date) : null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        priority: dto.priority ?? 'NORMAL',
        order_index: dto.order_index ?? 0,
        ...this.buildStatusData(dto.status ?? 'PENDING', null, true),
      },
    });

    await this.invalidateCaches(userId);
    return task;
  }

  // ----- single-task operations -----

  async getById(userId: string, taskId: string): Promise<TaskModel> {
    return this.cache.rememberJson(
      `tasks:user:${userId}:item:${taskId}`,
      45,
      () => this.findOwnedTaskOrThrow(userId, taskId),
    );
  }

  async update(
    userId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskModel> {
    const existing = await this.findOwnedTaskOrThrow(userId, taskId);

    const data: Prisma.tasksUncheckedUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.order_index !== undefined) data.order_index = dto.order_index;

    // due_date only applies to roadmap tasks.
    if (dto.due_date !== undefined && existing.roadmap_id) {
      data.due_date = dto.due_date ? this.parseDateOnly(dto.due_date) : null;
    }

    if (dto.status !== undefined) {
      Object.assign(
        data,
        this.buildStatusData(dto.status, existing.completed_at ?? null),
      );
    }

    const task = await this.prisma.tasks.update({
      where: { id: taskId },
      data,
    });

    await this.invalidateCaches(userId);
    return task;
  }

  async softDelete(userId: string, taskId: string) {
    await this.findOwnedTaskOrThrow(userId, taskId);

    await this.prisma.tasks.update({
      where: { id: taskId },
      data: { deleted_at: new Date() },
    });

    await this.invalidateCaches(userId);
    return { message: 'Task deleted successfully' };
  }

  async complete(userId: string, taskId: string): Promise<TaskModel> {
    await this.findOwnedTaskOrThrow(userId, taskId);

    const task = await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    await this.invalidateCaches(userId);
    return task;
  }

  async uncomplete(userId: string, taskId: string): Promise<TaskModel> {
    await this.findOwnedTaskOrThrow(userId, taskId);

    const task = await this.prisma.tasks.update({
      where: { id: taskId },
      data: { status: 'PENDING', completed_at: null },
    });

    await this.invalidateCaches(userId);
    return task;
  }

  // ----- shared helpers -----

  sortTaskItems<
    T extends {
      status: string;
      order_index: number | null;
      created_at: Date | null;
    },
  >(tasks: T[]): T[] {
    return [...tasks].sort((a, b) => this.compareTaskOrder(a, b));
  }

  private async listInternal(
    userId: string,
    query: InternalQuery,
  ): Promise<TaskListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const tasks = await this.prisma.tasks.findMany({
      where: this.buildListWhere(userId, query),
    });

    const sorted = this.sortTaskItems(tasks);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      items: sorted.slice(start, start + limit),
      meta: { page, limit, total, totalPages },
    };
  }

  private buildListWhere(
    userId: string,
    query: InternalQuery,
  ): Prisma.tasksWhereInput {
    const conditions: Prisma.tasksWhereInput[] = [
      { user_id: userId, deleted_at: null },
    ];

    if (query.listId) conditions.push({ list_id: query.listId });
    if (query.roadmapId) conditions.push({ roadmap_id: query.roadmapId });
    if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.due_date) {
      conditions.push({ due_date: this.parseDateOnly(query.due_date) });
    }

    const trimmed = query.search?.trim();
    if (trimmed) {
      conditions.push({
        OR: [
          { title: { contains: trimmed, mode: 'insensitive' } },
          { description: { contains: trimmed, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: conditions };
  }

  private compareTaskOrder(
    left: {
      status: string;
      order_index: number | null;
      created_at: Date | null;
    },
    right: {
      status: string;
      order_index: number | null;
      created_at: Date | null;
    },
  ) {
    const statusDiff =
      this.getStatusRank(left.status) - this.getStatusRank(right.status);
    if (statusDiff !== 0) return statusDiff;

    const orderDiff = (left.order_index ?? 0) - (right.order_index ?? 0);
    if (orderDiff !== 0) return orderDiff;

    const l = left.created_at?.getTime() ?? 0;
    const r = right.created_at?.getTime() ?? 0;
    return r - l;
  }

  private getStatusRank(status: string) {
    const ranks: Record<TaskStatus, number> = {
      PENDING: 0,
      COMPLETED: 1,
      CANCELLED: 2,
    };
    return ranks[status as TaskStatus] ?? 99;
  }

  private async findOwnedTaskOrThrow(
    userId: string,
    taskId: string,
  ): Promise<TaskModel> {
    const task = await this.prisma.tasks.findFirst({
      where: { id: taskId, user_id: userId, deleted_at: null },
    });

    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async assertListOwner(userId: string, listId: string) {
    const list = await this.prisma.task_lists.findFirst({
      where: { id: listId, user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!list) throw new NotFoundException('Task list not found');
  }

  private async assertRoadmapOwner(userId: string, roadmapId: string) {
    const roadmap = await this.prisma.roadmaps.findFirst({
      where: { id: roadmapId, user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!roadmap) throw new NotFoundException('Roadmap not found');
  }

  private buildStatusData(
    status: string,
    currentCompletedAt: Date | null,
    alwaysSet = false,
  ) {
    if (status === 'COMPLETED') {
      return {
        status,
        completed_at:
          alwaysSet || !currentCompletedAt ? new Date() : currentCompletedAt,
      };
    }
    return { status, completed_at: null };
  }

  private parseDateOnly(value: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const normalized = parsed.toISOString().slice(0, 10);
    if (Number.isNaN(parsed.getTime()) || normalized !== value) {
      throw new BadRequestException(`${value} is not a valid date`);
    }
    return parsed;
  }

  private serializeQuery(query: TaskQueryDto) {
    return JSON.stringify({
      due_date: query.due_date ?? null,
      limit: query.limit ?? 20,
      page: query.page ?? 1,
      priority: query.priority ?? null,
      search: query.search?.trim() || null,
      status: query.status ?? null,
    });
  }

  private async invalidateCaches(userId: string) {
    await Promise.all([
      this.cache.invalidateByPrefix(`tasks:user:${userId}:`),
      this.cache.invalidateByPrefix(`task-lists:user:${userId}:`),
      this.cache.invalidateByPrefix(`roadmaps:user:${userId}:`),
    ]);
  }
}
