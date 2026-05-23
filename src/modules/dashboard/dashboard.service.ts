import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardRecentNote,
  DashboardStats,
  DashboardTodoItem,
} from './dashboard.types';

const TODO_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
const TODO_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const TODO_GROUP_TYPES = ['CUSTOM', 'DAILY'] as const;
const TODO_GROUP_STATUSES = ['PENDING', 'COMPLETED'] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  getStats(userId: string): Promise<DashboardStats> {
    return this.cache.rememberJson(`dashboard:user:${userId}:stats`, 30, () =>
      this.buildStats(userId),
    );
  }

  private async buildStats(userId: string): Promise<DashboardStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const ownedNotesWhere: Prisma.notesWhereInput = {
      deleted_at: null,
      topics: { user_id: userId, deleted_at: null },
    };

    const ownedTodosWhere: Prisma.todosWhereInput = {
      user_id: userId,
      deleted_at: null,
    };

    const ownedTodoGroupsWhere: Prisma.todo_groupsWhereInput = {
      user_id: userId,
      deleted_at: null,
    };

    const [
      topics,
      notes,
      pinnedNotes,
      recentlyViewedNotes,
      updatedLast7DaysNotes,
      sharedWithMe,
      sharedByMe,
      todoGroups,
      todos,
      todosByStatus,
      todosByPriority,
      todoGroupsByType,
      todoGroupsByStatus,
      notifications,
      unreadNotifications,
      recentNotes,
      recentTodos,
    ] = await Promise.all([
      this.prisma.topics.count({ where: { user_id: userId, deleted_at: null } }),
      this.prisma.notes.count({ where: ownedNotesWhere }),
      this.prisma.notes.count({ where: { ...ownedNotesWhere, is_pinned: true } }),
      this.prisma.notes.count({ where: { ...ownedNotesWhere, last_viewed_at: { not: null } } }),
      this.prisma.notes.count({ where: { ...ownedNotesWhere, updated_at: { gte: sevenDaysAgo } } }),
      this.prisma.note_shares.count({
        where: { user_id: userId, notes: { deleted_at: null } },
      }),
      this.prisma.note_shares.count({
        where: { notes: { deleted_at: null, topics: { user_id: userId, deleted_at: null } } },
      }),
      this.prisma.todo_groups.count({ where: ownedTodoGroupsWhere }),
      this.prisma.todos.count({ where: ownedTodosWhere }),
      this.prisma.todos.groupBy({
        by: ['status'],
        where: ownedTodosWhere,
        _count: { _all: true },
      }),
      this.prisma.todos.groupBy({
        by: ['priority'],
        where: ownedTodosWhere,
        _count: { _all: true },
      }),
      this.prisma.todo_groups.groupBy({
        by: ['group_type'],
        where: ownedTodoGroupsWhere,
        _count: { _all: true },
      }),
      this.prisma.todo_groups.groupBy({
        by: ['status'],
        where: ownedTodoGroupsWhere,
        _count: { _all: true },
      }),
      this.prisma.notifications.count({ where: { user_id: userId } }),
      this.prisma.notifications.count({ where: { user_id: userId, is_read: false } }),
      this.prisma.notes.findMany({
        where: ownedNotesWhere,
        select: {
          id: true,
          title: true,
          topic_id: true,
          is_pinned: true,
          last_viewed_at: true,
          updated_at: true,
          topics: { select: { name: true } },
        },
        orderBy: [{ last_viewed_at: { sort: 'desc', nulls: 'last' } }, { updated_at: 'desc' }],
        take: 5,
      }),
      this.prisma.todos.findMany({
        where: { ...ownedTodosWhere, status: 'PENDING' },
        select: this.todoItemSelect(),
        orderBy: [{ created_at: 'desc' }],
        take: 5,
      }),
    ]);

    const statusCounts = this.mapCounts(todosByStatus, TODO_STATUSES, 'status');
    const priorityCounts = this.mapCounts(todosByPriority, TODO_PRIORITIES, 'priority');
    const groupTypeCounts = this.mapCounts(todoGroupsByType, TODO_GROUP_TYPES, 'group_type');
    const groupStatusCounts = this.mapCounts(todoGroupsByStatus, TODO_GROUP_STATUSES, 'status');
    const completedTodos = statusCounts.COMPLETED;

    return {
      generatedAt: now.toISOString(),
      overview: {
        topics,
        notes,
        pinnedNotes,
        sharedWithMe,
        sharedByMe,
        todoGroups,
        todos,
        pendingTodos: statusCounts.PENDING,
        completedTodos,
        unreadNotifications,
      },
      notes: {
        total: notes,
        pinned: pinnedNotes,
        recentlyViewed: recentlyViewedNotes,
        updatedLast7Days: updatedLast7DaysNotes,
        sharedWithMe,
        sharedByMe,
      },
      todos: {
        total: todos,
        pending: statusCounts.PENDING,
        completed: completedTodos,
        cancelled: statusCounts.CANCELLED,
        completionRate: todos === 0 ? 0 : Math.round((completedTodos / todos) * 100),
        byPriority: {
          LOW: priorityCounts.LOW,
          NORMAL: priorityCounts.NORMAL,
          HIGH: priorityCounts.HIGH,
          URGENT: priorityCounts.URGENT,
        },
      },
      todoGroups: {
        total: todoGroups,
        pending: groupStatusCounts.PENDING,
        completed: groupStatusCounts.COMPLETED,
        custom: groupTypeCounts.CUSTOM,
        daily: groupTypeCounts.DAILY,
      },
      notifications: {
        total: notifications,
        unread: unreadNotifications,
      },
      activity: {
        recentNotes: recentNotes.map((note): DashboardRecentNote => ({
          id: note.id,
          title: note.title,
          topicId: note.topic_id,
          topicName: note.topics.name,
          isPinned: note.is_pinned ?? false,
          lastViewedAt: note.last_viewed_at?.toISOString() ?? null,
          updatedAt: note.updated_at?.toISOString() ?? null,
        })),
        recentTodos: recentTodos.map((todo) => this.toTodoItem(todo)),
      },
    };
  }

  private todoItemSelect() {
    return {
      id: true,
      title: true,
      status: true,
      priority: true,
      group_id: true,
      todo_groups: {
        select: {
          name: true,
          group_date: true,
        },
      },
    } satisfies Prisma.todosSelect;
  }

  private toTodoItem(todo: {
    id: string;
    title: string;
    status: string;
    priority: string;
    group_id: string | null;
    todo_groups: { name: string; group_date: Date | null } | null;
  }): DashboardTodoItem {
    return {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      priority: todo.priority,
      groupId: todo.group_id,
      groupName: todo.todo_groups?.name ?? null,
      groupDate: todo.todo_groups?.group_date?.toISOString() ?? null,
    };
  }

  private mapCounts<T extends string, K extends string>(
    rows: Array<Record<K, string | null> & { _count: { _all: number } }>,
    keys: readonly T[],
    field: K,
  ): Record<T, number> {
    const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

    for (const row of rows) {
      const key = row[field];
      if (this.isKnownCountKey(key, keys)) {
        counts[key] = row._count._all;
      }
    }

    return counts;
  }

  private isKnownCountKey<T extends string>(value: string | null, keys: readonly T[]): value is T {
    return value !== null && keys.includes(value as T);
  }
}
