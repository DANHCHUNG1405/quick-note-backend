import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, todo_groups as TodoGroupModel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTodoDto } from '../todos/dto/create-todo.dto';
import { TodoQueryDto } from '../todos/dto/todo-query.dto';
import { TodoWithGroup, TodosService } from '../todos/todos.service';
import { CreateTodoGroupDto, TODO_GROUP_TYPES } from './dto/create-todo-group.dto';
import { TodoGroupQueryDto } from './dto/todo-group-query.dto';
import { UpdateTodoGroupDto } from './dto/update-todo-group.dto';

type TodoGroupWithCount = TodoGroupModel & {
  _count: {
    todos: number;
  };
};

type TodoGroupListResponse = {
  items: TodoGroupWithCount[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TodoGroupDetailResponse = TodoGroupModel & {
  todos: TodoWithGroup[];
};

@Injectable()
export class TodoGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly todosService: TodosService,
  ) {}

  async list(userId: string, query: TodoGroupQueryDto): Promise<TodoGroupListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const groups = await this.prisma.todo_groups.findMany({
      where: this.buildListWhere(userId, query),
      orderBy: [{ order_index: 'asc' }, { created_at: 'desc' }],
    });

    const counts = groups.length
      ? await this.prisma.todos.groupBy({
          by: ['group_id'],
          where: {
            user_id: userId,
            deleted_at: null,
            group_id: {
              in: groups.map((group) => group.id),
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const countMap = new Map(
      counts.map((item) => [item.group_id, item._count._all]),
    );

    const total = groups.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (page - 1) * limit;

    return {
      items: groups.slice(start, start + limit).map((group) => ({
        ...group,
        _count: {
          todos: countMap.get(group.id) ?? 0,
        },
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async create(userId: string, dto: CreateTodoGroupDto): Promise<TodoGroupModel> {
    const resolved = await this.resolveGroupRelations(
      userId,
      dto.topic_id ?? null,
      dto.note_id ?? null,
      dto.group_type ?? 'CUSTOM',
      dto.group_date ?? null,
    );

    return this.prisma.todo_groups.create({
      data: {
        user_id: userId,
        topic_id: resolved.topicId,
        note_id: resolved.noteId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        group_type: resolved.groupType,
        group_date: resolved.groupDate,
        order_index: dto.order_index ?? 0,
      },
    });
  }

  async getById(userId: string, groupId: string): Promise<TodoGroupDetailResponse> {
    const group = await this.findOwnedGroupOrThrow(userId, groupId);
    const todos = await this.prisma.todos.findMany({
      where: {
        user_id: userId,
        group_id: groupId,
        deleted_at: null,
      },
      include: {
        todo_groups: {
          select: {
            id: true,
            name: true,
            group_type: true,
            group_date: true,
            deleted_at: true,
          },
        },
      },
    });

    return {
      ...group,
      todos: this.todosService
        .sortTodoItems(todos)
        .map((todo) => this.todosService.toTodoWithGroup(todo)),
    };
  }

  async update(
    userId: string,
    groupId: string,
    dto: UpdateTodoGroupDto,
  ): Promise<TodoGroupModel> {
    const existing = await this.findOwnedGroupOrThrow(userId, groupId);
    const resolved = await this.resolveGroupRelations(
      userId,
      dto.topic_id === undefined ? existing.topic_id : (dto.topic_id ?? null),
      dto.note_id === undefined ? existing.note_id : (dto.note_id ?? null),
      dto.group_type ?? existing.group_type,
      dto.group_date === undefined
        ? this.formatDateOnly(existing.group_date)
        : (dto.group_date ?? null),
    );

    const data: Prisma.todo_groupsUncheckedUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.order_index !== undefined) {
      data.order_index = dto.order_index;
    }

    if (
      dto.topic_id !== undefined ||
      dto.note_id !== undefined ||
      dto.group_type !== undefined ||
      dto.group_date !== undefined ||
      existing.topic_id !== resolved.topicId ||
      existing.note_id !== resolved.noteId ||
      existing.group_type !== resolved.groupType ||
      this.formatDateOnly(existing.group_date) !==
        this.formatDateOnly(resolved.groupDate)
    ) {
      data.topic_id = resolved.topicId;
      data.note_id = resolved.noteId;
      data.group_type = resolved.groupType;
      data.group_date = resolved.groupDate;
    }

    return this.prisma.todo_groups.update({
      where: { id: groupId },
      data,
    });
  }

  async softDelete(userId: string, groupId: string) {
    await this.findOwnedGroupOrThrow(userId, groupId);

    await this.prisma.$transaction([
      this.prisma.todos.updateMany({
        where: {
          user_id: userId,
          group_id: groupId,
          deleted_at: null,
        },
        data: {
          group_id: null,
        },
      }),
      this.prisma.todo_groups.update({
        where: { id: groupId },
        data: {
          deleted_at: new Date(),
        },
      }),
    ]);

    return { message: 'Todo group deleted successfully' };
  }

  async getTodos(userId: string, groupId: string, query: TodoQueryDto) {
    await this.findOwnedGroupOrThrow(userId, groupId);
    return this.todosService.listByGroup(userId, groupId, query);
  }

  async createTodo(userId: string, groupId: string, dto: CreateTodoDto) {
    const group = await this.findOwnedGroupOrThrow(userId, groupId);
    return this.todosService.createInGroup(userId, group, dto);
  }

  private buildListWhere(
    userId: string,
    query: TodoGroupQueryDto,
  ): Prisma.todo_groupsWhereInput {
    const conditions: Prisma.todo_groupsWhereInput[] = [
      {
        user_id: userId,
        deleted_at: null,
      },
    ];

    if (query.groupType) {
      conditions.push({ group_type: query.groupType });
    }

    if (query.topicId) {
      conditions.push({ topic_id: query.topicId });
    }

    if (query.noteId) {
      conditions.push({ note_id: query.noteId });
    }

    if (query.groupDate) {
      conditions.push({ group_date: this.parseDateOnly(query.groupDate) });
    }

    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      conditions.push({
        OR: [
          {
            name: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    return {
      AND: conditions,
    };
  }

  private async findOwnedGroupOrThrow(
    userId: string,
    groupId: string,
  ): Promise<TodoGroupModel> {
    const group = await this.prisma.todo_groups.findFirst({
      where: {
        id: groupId,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!group) {
      throw new NotFoundException('Todo group not found');
    }

    return group;
  }

  private async resolveGroupRelations(
    userId: string,
    topicId: string | null,
    noteId: string | null,
    groupType: string,
    groupDate: string | null,
  ) {
    if (!TODO_GROUP_TYPES.includes(groupType as (typeof TODO_GROUP_TYPES)[number])) {
      throw new BadRequestException('Invalid group_type');
    }

    let resolvedTopicId = topicId;
    let resolvedNoteId = noteId;

    if (resolvedTopicId) {
      const topic = await this.prisma.topics.findFirst({
        where: {
          id: resolvedTopicId,
          user_id: userId,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (!topic) {
        throw new BadRequestException('Topic not found');
      }
    }

    if (resolvedNoteId) {
      const note = await this.prisma.notes.findFirst({
        where: {
          id: resolvedNoteId,
          deleted_at: null,
          topics: {
            user_id: userId,
            deleted_at: null,
          },
        },
        select: {
          id: true,
          topic_id: true,
        },
      });

      if (!note) {
        throw new BadRequestException('Note not found');
      }

      if (resolvedTopicId && resolvedTopicId !== note.topic_id) {
        throw new BadRequestException('note_id does not belong to topic_id');
      }

      resolvedTopicId = note.topic_id;
      resolvedNoteId = note.id;
    }

    if (groupType === 'NOTE' && !resolvedNoteId) {
      throw new BadRequestException('note_id is required for NOTE group');
    }

    if (groupType === 'TOPIC' && !resolvedTopicId) {
      throw new BadRequestException('topic_id is required for TOPIC group');
    }

    if (groupType === 'DAILY' && !groupDate) {
      throw new BadRequestException('group_date is required for DAILY group');
    }

    const parsedGroupDate = groupDate ? this.parseDateOnly(groupDate) : null;

    return {
      topicId: resolvedTopicId,
      noteId: resolvedNoteId,
      groupType,
      groupDate: parsedGroupDate,
    };
  }

  private parseDateOnly(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('group_date must be a valid date');
    }

    const normalized = parsed.toISOString().slice(0, 10);
    if (normalized !== value) {
      throw new BadRequestException('group_date must be a valid date');
    }

    return parsed;
  }

  private formatDateOnly(value: Date | null) {
    if (!value) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }
}
