import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, roadmaps as RoadmapModel, todo_groups as TodoGroupModel } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TodosService, TodoWithGroup } from '../todos/todos.service';
import { CreateRoadmapDayDto } from './dto/create-roadmap-day.dto';
import { CreateRoadmapDto } from './dto/create-roadmap.dto';
import { RoadmapQueryDto } from './dto/roadmap-query.dto';
import { UpdateRoadmapDto } from './dto/update-roadmap.dto';

type RoadmapDay = TodoGroupModel & {
  todos: TodoWithGroup[];
};

type RoadmapDetailResponse = RoadmapModel & {
  days: RoadmapDay[];
};

type RoadmapListResponse = {
  items: (RoadmapModel & { _count: { todo_groups: number } })[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const DAY_TODO_SELECT = {
  id: true,
  name: true,
  group_type: true,
  group_date: true,
  deleted_at: true,
} satisfies Prisma.todo_groupsSelect;

@Injectable()
export class RoadmapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly todosService: TodosService,
  ) {}

  async list(userId: string, query: RoadmapQueryDto): Promise<RoadmapListResponse> {
    return this.cache.rememberJson(
      `roadmaps:user:${userId}:list:${this.serializeQuery(query)}`,
      45,
      async () => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;

        const roadmaps = await this.prisma.roadmaps.findMany({
          where: this.buildListWhere(userId, query),
          orderBy: [{ order_index: 'asc' }, { created_at: 'desc' }],
        });

        const counts = roadmaps.length
          ? await this.prisma.todo_groups.groupBy({
              by: ['roadmap_id'],
              where: {
                user_id: userId,
                deleted_at: null,
                roadmap_id: { in: roadmaps.map((r) => r.id) },
              },
              _count: { _all: true },
            })
          : [];

        const countMap = new Map(counts.map((c) => [c.roadmap_id, c._count._all]));

        const total = roadmaps.length;
        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
        const start = (page - 1) * limit;

        return {
          items: roadmaps.slice(start, start + limit).map((r) => ({
            ...r,
            _count: { todo_groups: countMap.get(r.id) ?? 0 },
          })),
          meta: { page, limit, total, totalPages },
        };
      },
    );
  }

  async create(userId: string, dto: CreateRoadmapDto): Promise<RoadmapModel> {
    const startDate = this.parseDateOnly(dto.start_date);
    const endDate = dto.end_date ? this.parseDateOnly(dto.end_date) : null;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('end_date must be on or after start_date');
    }

    const roadmap = await this.prisma.roadmaps.create({
      data: {
        user_id: userId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        start_date: startDate,
        end_date: endDate,
        status: dto.status ?? 'ACTIVE',
        color: dto.color ?? null,
        order_index: dto.order_index ?? 0,
      },
    });

    await this.invalidateRoadmapCaches(userId);
    return roadmap;
  }

  async getById(userId: string, roadmapId: string): Promise<RoadmapDetailResponse> {
    return this.cache.rememberJson(
      `roadmaps:user:${userId}:item:${roadmapId}`,
      45,
      async () => {
        const roadmap = await this.findOwnedRoadmapOrThrow(userId, roadmapId);

        const groups = await this.prisma.todo_groups.findMany({
          where: {
            roadmap_id: roadmapId,
            user_id: userId,
            deleted_at: null,
          },
          orderBy: [{ group_date: 'asc' }, { order_index: 'asc' }],
        });

        const days: RoadmapDay[] = await Promise.all(
          groups.map(async (group) => {
            const todoRows = await this.prisma.todos.findMany({
              where: { user_id: userId, group_id: group.id, deleted_at: null },
              include: { todo_groups: { select: DAY_TODO_SELECT } },
            });

            return {
              ...group,
              todos: this.todosService
                .sortTodoItems(todoRows)
                .map((t) => this.todosService.toTodoWithGroup(t)),
            };
          }),
        );

        return { ...roadmap, days };
      },
    );
  }

  async update(
    userId: string,
    roadmapId: string,
    dto: UpdateRoadmapDto,
  ): Promise<RoadmapModel> {
    const existing = await this.findOwnedRoadmapOrThrow(userId, roadmapId);

    const startDate =
      dto.start_date !== undefined
        ? this.parseDateOnly(dto.start_date)
        : existing.start_date;

    const endDate =
      dto.end_date !== undefined
        ? dto.end_date
          ? this.parseDateOnly(dto.end_date)
          : null
        : existing.end_date;

    if (endDate && endDate < startDate) {
      throw new BadRequestException('end_date must be on or after start_date');
    }

    const data: Prisma.roadmapsUncheckedUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.order_index !== undefined) data.order_index = dto.order_index;
    if (dto.start_date !== undefined) data.start_date = startDate;
    if (dto.end_date !== undefined) data.end_date = endDate;

    const roadmap = await this.prisma.roadmaps.update({
      where: { id: roadmapId },
      data,
    });

    await this.invalidateRoadmapCaches(userId);
    return roadmap;
  }

  async softDelete(userId: string, roadmapId: string) {
    await this.findOwnedRoadmapOrThrow(userId, roadmapId);

    await this.prisma.$transaction([
      this.prisma.todos.updateMany({
        where: { user_id: userId, group_id: { in: await this.getRoadmapGroupIds(roadmapId) }, deleted_at: null },
        data: { group_id: null },
      }),
      this.prisma.todo_groups.updateMany({
        where: { roadmap_id: roadmapId, user_id: userId, deleted_at: null },
        data: { deleted_at: new Date() },
      }),
      this.prisma.roadmaps.update({
        where: { id: roadmapId },
        data: { deleted_at: new Date() },
      }),
    ]);

    await this.invalidateRoadmapCaches(userId);
    return { message: 'Roadmap deleted successfully' };
  }

  async addDay(
    userId: string,
    roadmapId: string,
    dto: CreateRoadmapDayDto,
  ): Promise<TodoGroupModel> {
    const roadmap = await this.findOwnedRoadmapOrThrow(userId, roadmapId);
    const groupDate = this.parseDateOnly(dto.date);

    if (roadmap.end_date && groupDate > roadmap.end_date) {
      throw new BadRequestException('date is outside roadmap end_date');
    }

    const existing = await this.prisma.todo_groups.findFirst({
      where: {
        roadmap_id: roadmapId,
        group_date: groupDate,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException(`A day for ${dto.date} already exists in this roadmap`);
    }

    const day = await this.prisma.todo_groups.create({
      data: {
        user_id: userId,
        roadmap_id: roadmapId,
        name: dto.name?.trim() ?? dto.date,
        description: dto.description ?? null,
        group_type: 'DAILY',
        group_date: groupDate,
        order_index: dto.order_index ?? 0,
      },
    });

    await this.invalidateRoadmapCaches(userId);
    return day;
  }

  async getDayTodos(userId: string, roadmapId: string, date: string): Promise<TodoWithGroup[]> {
    await this.findOwnedRoadmapOrThrow(userId, roadmapId);
    const groupDate = this.parseDateOnly(date);

    const group = await this.prisma.todo_groups.findFirst({
      where: { roadmap_id: roadmapId, group_date: groupDate, user_id: userId, deleted_at: null },
    });

    if (!group) {
      throw new NotFoundException(`No day found for date ${date} in this roadmap`);
    }

    return this.cache.rememberJson(
      `roadmaps:user:${userId}:item:${roadmapId}:day:${date}`,
      45,
      async () => {
        const todoRows = await this.prisma.todos.findMany({
          where: { user_id: userId, group_id: group.id, deleted_at: null },
          include: { todo_groups: { select: DAY_TODO_SELECT } },
        });

        return this.todosService
          .sortTodoItems(todoRows)
          .map((t) => this.todosService.toTodoWithGroup(t));
      },
    );
  }

  async removeDay(userId: string, roadmapId: string, date: string) {
    await this.findOwnedRoadmapOrThrow(userId, roadmapId);
    const groupDate = this.parseDateOnly(date);

    const group = await this.prisma.todo_groups.findFirst({
      where: { roadmap_id: roadmapId, group_date: groupDate, user_id: userId, deleted_at: null },
    });

    if (!group) {
      throw new NotFoundException(`No day found for date ${date} in this roadmap`);
    }

    await this.prisma.$transaction([
      this.prisma.todos.updateMany({
        where: { user_id: userId, group_id: group.id, deleted_at: null },
        data: { group_id: null },
      }),
      this.prisma.todo_groups.update({
        where: { id: group.id },
        data: { deleted_at: new Date() },
      }),
    ]);

    await this.invalidateRoadmapCaches(userId);
    return { message: `Day ${date} removed from roadmap` };
  }

  private async findOwnedRoadmapOrThrow(userId: string, roadmapId: string): Promise<RoadmapModel> {
    const roadmap = await this.prisma.roadmaps.findFirst({
      where: { id: roadmapId, user_id: userId, deleted_at: null },
    });

    if (!roadmap) {
      throw new NotFoundException('Roadmap not found');
    }

    return roadmap;
  }

  private async getRoadmapGroupIds(roadmapId: string): Promise<string[]> {
    const groups = await this.prisma.todo_groups.findMany({
      where: { roadmap_id: roadmapId, deleted_at: null },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  private buildListWhere(userId: string, query: RoadmapQueryDto): Prisma.roadmapsWhereInput {
    const conditions: Prisma.roadmapsWhereInput[] = [{ user_id: userId, deleted_at: null }];

    if (query.status) {
      conditions.push({ status: query.status });
    }

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

  private parseDateOnly(value: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${value} is not a valid date`);
    }

    const normalized = parsed.toISOString().slice(0, 10);
    if (normalized !== value) {
      throw new BadRequestException(`${value} is not a valid date`);
    }

    return parsed;
  }

  private serializeQuery(query: RoadmapQueryDto) {
    return JSON.stringify({
      limit: query.limit ?? 20,
      page: query.page ?? 1,
      search: query.search?.trim() || null,
      status: query.status ?? null,
    });
  }

  private async invalidateRoadmapCaches(userId: string) {
    await Promise.all([
      this.cache.invalidateByPrefix(`roadmaps:user:${userId}:`),
      this.cache.invalidateByPrefix(`todo-groups:user:${userId}:`),
      this.cache.invalidateByPrefix(`todos:user:${userId}:`),
    ]);
  }
}
