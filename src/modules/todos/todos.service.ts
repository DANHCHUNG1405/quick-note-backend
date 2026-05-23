import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, todo_groups, todos as TodoModel } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { TodoQueryDto } from './dto/todo-query.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

type TodoStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

type TodoGroupBasic = {
  id: string;
  name: string;
  group_type: string;
  group_date: Date | null;
};

export type TodoWithGroup = TodoModel & {
  group: TodoGroupBasic | null;
};

type TodoListResponse = {
  items: TodoWithGroup[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TodoGroupOwner = Pick<todo_groups, 'id' | 'user_id' | 'deleted_at'>;

const TODO_GROUP_SELECT = {
  id: true,
  name: true,
  group_type: true,
  group_date: true,
  deleted_at: true,
} satisfies Prisma.todo_groupsSelect;

type TodoWithGroupRow = Prisma.todosGetPayload<{
  include: { todo_groups: { select: typeof TODO_GROUP_SELECT } };
}>;

@Injectable()
export class TodosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async list(userId: string, query: TodoQueryDto): Promise<TodoListResponse> {
    return this.cache.rememberJson(
      `todos:user:${userId}:list:${this.serializeQuery(query)}`,
      45,
      () => this.listInternal(userId, query),
    );
  }

  async create(userId: string, dto: CreateTodoDto): Promise<TodoWithGroup> {
    if (!dto.group_id) {
      throw new BadRequestException('group_id is required');
    }
    const todo = await this.createInternal(userId, dto.group_id, dto);
    await this.invalidateTodoCaches(userId);
    return todo;
  }

  async getById(userId: string, todoId: string): Promise<TodoWithGroup> {
    return this.cache.rememberJson(`todos:user:${userId}:item:${todoId}`, 45, async () => {
      const todo = await this.findOwnedTodoOrThrow(userId, todoId);
      return this.toTodoWithGroup(todo);
    });
  }

  async update(userId: string, todoId: string, dto: UpdateTodoDto): Promise<TodoWithGroup> {
    const existing = await this.findOwnedTodoOrThrow(userId, todoId);
    const oldGroupId = existing.group_id;

    const newGroupId = dto.group_id !== undefined ? dto.group_id : oldGroupId;
    if (dto.group_id !== undefined) {
      await this.findOwnedGroupOrThrow(userId, dto.group_id);
    }

    const data: Prisma.todosUncheckedUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.order_index !== undefined) data.order_index = dto.order_index;
    if (dto.group_id !== undefined) data.group_id = dto.group_id;

    if (dto.status !== undefined) {
      Object.assign(data, this.buildStatusData(dto.status, existing.completed_at ?? null));
    }

    const todo = await this.prisma.todos.update({
      where: { id: todoId },
      data,
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    const groupsToRecalculate = new Set<string>();
    if (oldGroupId) groupsToRecalculate.add(oldGroupId);
    if (newGroupId) groupsToRecalculate.add(newGroupId);
    await Promise.all([...groupsToRecalculate].map((gid) => this.recalculateGroupStatus(gid)));

    await this.invalidateTodoCaches(userId);
    return this.toTodoWithGroup(todo);
  }

  async softDelete(userId: string, todoId: string) {
    const existing = await this.findOwnedTodoOrThrow(userId, todoId);

    await this.prisma.todos.update({
      where: { id: todoId },
      data: { deleted_at: new Date() },
    });

    if (existing.group_id) {
      await this.recalculateGroupStatus(existing.group_id);
    }

    await this.invalidateTodoCaches(userId);
    return { message: 'Todo deleted successfully' };
  }

  async complete(userId: string, todoId: string): Promise<TodoWithGroup> {
    const existing = await this.findOwnedTodoOrThrow(userId, todoId);

    const todo = await this.prisma.todos.update({
      where: { id: todoId },
      data: { status: 'COMPLETED', completed_at: new Date() },
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    if (existing.group_id) {
      await this.recalculateGroupStatus(existing.group_id);
    }

    await this.invalidateTodoCaches(userId);
    return this.toTodoWithGroup(todo);
  }

  async uncomplete(userId: string, todoId: string): Promise<TodoWithGroup> {
    const existing = await this.findOwnedTodoOrThrow(userId, todoId);

    const todo = await this.prisma.todos.update({
      where: { id: todoId },
      data: { status: 'PENDING', completed_at: null },
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    if (existing.group_id) {
      await this.recalculateGroupStatus(existing.group_id);
    }

    await this.invalidateTodoCaches(userId);
    return this.toTodoWithGroup(todo);
  }

  async listByGroup(userId: string, groupId: string, query: TodoQueryDto = {}): Promise<TodoListResponse> {
    return this.list(userId, { ...query, groupId });
  }

  async createInGroup(userId: string, group: TodoGroupOwner, dto: CreateTodoDto): Promise<TodoWithGroup> {
    const todo = await this.createInternal(userId, group.id, dto);
    await this.invalidateTodoCaches(userId);
    return todo;
  }

  async findOwnedGroupOrThrow(userId: string, groupId: string): Promise<TodoGroupOwner> {
    const group = await this.prisma.todo_groups.findFirst({
      where: { id: groupId, user_id: userId, deleted_at: null },
      select: { id: true, user_id: true, deleted_at: true },
    });

    if (!group) throw new NotFoundException('Todo group not found');
    return group;
  }

  sortTodoItems<T extends { status: string; order_index: number | null; created_at: Date | null }>(
    todos: T[],
  ): T[] {
    return [...todos].sort((a, b) => this.compareTodoOrder(a, b));
  }

  private async listInternal(userId: string, query: TodoQueryDto): Promise<TodoListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.groupId) {
      await this.findOwnedGroupOrThrow(userId, query.groupId);
    }

    const todos = await this.prisma.todos.findMany({
      where: this.buildListWhere(userId, query),
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    const sorted = this.sortTodoItems(todos).map((t) => this.toTodoWithGroup(t));
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      items: sorted.slice(start, start + limit),
      meta: { page, limit, total, totalPages },
    };
  }

  private async createInternal(
    userId: string,
    groupId: string,
    dto: CreateTodoDto,
  ): Promise<TodoWithGroup> {
    await this.findOwnedGroupOrThrow(userId, groupId);
    const status = dto.status ?? 'PENDING';

    const todo = await this.prisma.todos.create({
      data: {
        user_id: userId,
        group_id: groupId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        priority: dto.priority ?? 'NORMAL',
        order_index: dto.order_index ?? 0,
        ...this.buildStatusData(status, null, true),
      },
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    await this.recalculateGroupStatus(groupId);
    return this.toTodoWithGroup(todo);
  }

  private buildListWhere(userId: string, query: TodoQueryDto): Prisma.todosWhereInput {
    const conditions: Prisma.todosWhereInput[] = [{ user_id: userId, deleted_at: null }];

    if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.groupId) conditions.push({ group_id: query.groupId });

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

  private compareTodoOrder(
    left: { status: string; order_index: number | null; created_at: Date | null },
    right: { status: string; order_index: number | null; created_at: Date | null },
  ) {
    const statusDiff = this.getStatusRank(left.status) - this.getStatusRank(right.status);
    if (statusDiff !== 0) return statusDiff;

    const orderDiff = (left.order_index ?? 0) - (right.order_index ?? 0);
    if (orderDiff !== 0) return orderDiff;

    const l = left.created_at?.getTime() ?? 0;
    const r = right.created_at?.getTime() ?? 0;
    return r - l;
  }

  private getStatusRank(status: string) {
    const ranks: Record<TodoStatus, number> = { PENDING: 0, COMPLETED: 1, CANCELLED: 2 };
    return ranks[status as TodoStatus] ?? 99;
  }

  private async findOwnedTodoOrThrow(userId: string, todoId: string): Promise<TodoWithGroupRow> {
    const todo = await this.prisma.todos.findFirst({
      where: { id: todoId, user_id: userId, deleted_at: null },
      include: { todo_groups: { select: TODO_GROUP_SELECT } },
    });

    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  private buildStatusData(status: string, currentCompletedAt: Date | null, alwaysSet = false) {
    if (status === 'COMPLETED') {
      return {
        status,
        completed_at: alwaysSet || !currentCompletedAt ? new Date() : currentCompletedAt,
      };
    }
    return { status, completed_at: null };
  }

  private async recalculateGroupStatus(groupId: string): Promise<void> {
    const todos = await this.prisma.todos.findMany({
      where: { group_id: groupId, deleted_at: null },
      select: { status: true },
    });

    const allDone =
      todos.length > 0 &&
      todos.every((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED');

    await this.prisma.todo_groups.update({
      where: { id: groupId },
      data: { status: allDone ? 'COMPLETED' : 'PENDING' },
    });
  }

  toTodoWithGroup(todo: TodoWithGroupRow): TodoWithGroup {
    const { todo_groups, ...rest } = todo;
    return {
      ...rest,
      group:
        todo_groups && !todo_groups.deleted_at
          ? {
              id: todo_groups.id,
              name: todo_groups.name,
              group_type: todo_groups.group_type,
              group_date: todo_groups.group_date ?? null,
            }
          : null,
    };
  }

  private serializeQuery(query: TodoQueryDto) {
    return JSON.stringify({
      groupId: query.groupId ?? null,
      limit: query.limit ?? 20,
      page: query.page ?? 1,
      priority: query.priority ?? null,
      search: query.search?.trim() || null,
      status: query.status ?? null,
    });
  }

  private async invalidateTodoCaches(userId: string) {
    await Promise.all([
      this.cache.invalidateByPrefix(`todos:user:${userId}:`),
      this.cache.invalidateByPrefix(`todo-groups:user:${userId}:`),
      this.cache.invalidateByPrefix(`roadmaps:user:${userId}:`),
    ]);
  }
}
