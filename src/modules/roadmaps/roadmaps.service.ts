import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, roadmaps as RoadmapModel, tasks as TaskModel } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TaskQueryDto } from '../tasks/dto/task-query.dto';
import { TasksService } from '../tasks/tasks.service';
import { CreateRoadmapDto } from './dto/create-roadmap.dto';
import { RoadmapQueryDto } from './dto/roadmap-query.dto';
import { UpdateRoadmapDto } from './dto/update-roadmap.dto';

type RoadmapDay = {
  date: string | null;
  tasks: TaskModel[];
};

type RoadmapDetailResponse = RoadmapModel & {
  days: RoadmapDay[];
};

type RoadmapListResponse = {
  items: (RoadmapModel & { _count: { tasks: number } })[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class RoadmapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly tasksService: TasksService,
  ) {}

  async list(
    userId: string,
    query: RoadmapQueryDto,
  ): Promise<RoadmapListResponse> {
    return this.cache.rememberJson(
      `roadmaps:user:${userId}:list:${this.serializeQuery(query)}`,
      45,
      async () => {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const where = this.buildListWhere(userId, query);

        const [roadmaps, total] = await this.prisma.$transaction([
          this.prisma.roadmaps.findMany({
            where,
            orderBy: [{ order_index: 'asc' }, { created_at: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            include: {
              _count: { select: { tasks: { where: { deleted_at: null } } } },
            },
          }),
          this.prisma.roadmaps.count({ where }),
        ]);

        return {
          items: roadmaps,
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

    await this.invalidateCaches(userId);
    return roadmap;
  }

  async getById(
    userId: string,
    roadmapId: string,
  ): Promise<RoadmapDetailResponse> {
    return this.cache.rememberJson(
      `roadmaps:user:${userId}:item:${roadmapId}`,
      45,
      async () => {
        const roadmap = await this.findOwnedRoadmapOrThrow(userId, roadmapId);
        const tasks = await this.prisma.tasks.findMany({
          where: { roadmap_id: roadmapId, deleted_at: null },
        });

        return { ...roadmap, days: this.groupTasksByDate(tasks) };
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

    await this.invalidateCaches(userId);
    return roadmap;
  }

  async softDelete(userId: string, roadmapId: string) {
    await this.findOwnedRoadmapOrThrow(userId, roadmapId);

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.tasks.updateMany({
        where: { roadmap_id: roadmapId, deleted_at: null },
        data: { deleted_at: now },
      }),
      this.prisma.roadmaps.update({
        where: { id: roadmapId },
        data: { deleted_at: now },
      }),
    ]);

    await this.invalidateCaches(userId);
    return { message: 'Roadmap deleted successfully' };
  }

  async getTasks(userId: string, roadmapId: string, query: TaskQueryDto) {
    await this.findOwnedRoadmapOrThrow(userId, roadmapId);
    return this.tasksService.listByRoadmap(userId, roadmapId, query);
  }

  async createTask(userId: string, roadmapId: string, dto: CreateTaskDto) {
    const task = await this.tasksService.createInRoadmap(userId, roadmapId, dto);
    await this.invalidateCaches(userId);
    return task;
  }

  private groupTasksByDate(tasks: TaskModel[]): RoadmapDay[] {
    const sorted = this.tasksService.sortTaskItems(tasks);
    const dayMap = new Map<string, TaskModel[]>();

    for (const task of sorted) {
      const key = task.due_date
        ? task.due_date.toISOString().slice(0, 10)
        : '';
      const bucket = dayMap.get(key);
      if (bucket) {
        bucket.push(task);
      } else {
        dayMap.set(key, [task]);
      }
    }

    return [...dayMap.entries()]
      .map(([date, dayTasks]) => ({ date: date || null, tasks: dayTasks }))
      .sort((a, b) => {
        if (a.date === null) return 1;
        if (b.date === null) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
  }

  private async findOwnedRoadmapOrThrow(
    userId: string,
    roadmapId: string,
  ): Promise<RoadmapModel> {
    const roadmap = await this.prisma.roadmaps.findFirst({
      where: { id: roadmapId, user_id: userId, deleted_at: null },
    });

    if (!roadmap) {
      throw new NotFoundException('Roadmap not found');
    }

    return roadmap;
  }

  private buildListWhere(
    userId: string,
    query: RoadmapQueryDto,
  ): Prisma.roadmapsWhereInput {
    const conditions: Prisma.roadmapsWhereInput[] = [
      { user_id: userId, deleted_at: null },
    ];

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
    const normalized = parsed.toISOString().slice(0, 10);
    if (Number.isNaN(parsed.getTime()) || normalized !== value) {
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

  private async invalidateCaches(userId: string) {
    await Promise.all([
      this.cache.invalidateByPrefix(`roadmaps:user:${userId}:`),
      this.cache.invalidateByPrefix(`tasks:user:${userId}:`),
    ]);
  }
}
