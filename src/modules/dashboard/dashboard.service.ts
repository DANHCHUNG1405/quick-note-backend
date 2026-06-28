import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisCacheService } from '../../infrastructure/redis/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardRecentNote,
  DashboardStats,
  DashboardTaskItem,
} from './dashboard.types';

const TASK_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const ROADMAP_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

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

    const ownedTasksWhere: Prisma.tasksWhereInput = {
      user_id: userId,
      deleted_at: null,
    };

    const ownedRoadmapsWhere: Prisma.roadmapsWhereInput = {
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
      taskLists,
      roadmaps,
      tasks,
      tasksByStatus,
      tasksByPriority,
      roadmapsByStatus,
      notifications,
      unreadNotifications,
      recentNotes,
      recentTasks,
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
      this.prisma.task_lists.count({ where: { user_id: userId, deleted_at: null } }),
      this.prisma.roadmaps.count({ where: ownedRoadmapsWhere }),
      this.prisma.tasks.count({ where: ownedTasksWhere }),
      this.prisma.tasks.groupBy({
        by: ['status'],
        where: ownedTasksWhere,
        _count: { _all: true },
      }),
      this.prisma.tasks.groupBy({
        by: ['priority'],
        where: ownedTasksWhere,
        _count: { _all: true },
      }),
      this.prisma.roadmaps.groupBy({
        by: ['status'],
        where: ownedRoadmapsWhere,
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
      this.prisma.tasks.findMany({
        where: { ...ownedTasksWhere, status: 'PENDING' },
        select: this.taskItemSelect(),
        orderBy: [{ created_at: 'desc' }],
        take: 5,
      }),
    ]);

    const statusCounts = this.mapCounts(tasksByStatus, TASK_STATUSES, 'status');
    const priorityCounts = this.mapCounts(tasksByPriority, TASK_PRIORITIES, 'priority');
    const roadmapStatusCounts = this.mapCounts(roadmapsByStatus, ROADMAP_STATUSES, 'status');
    const completedTasks = statusCounts.COMPLETED;

    return {
      generatedAt: now.toISOString(),
      overview: {
        topics,
        notes,
        pinnedNotes,
        sharedWithMe,
        sharedByMe,
        taskLists,
        roadmaps,
        tasks,
        pendingTasks: statusCounts.PENDING,
        completedTasks,
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
      tasks: {
        total: tasks,
        pending: statusCounts.PENDING,
        completed: completedTasks,
        cancelled: statusCounts.CANCELLED,
        completionRate: tasks === 0 ? 0 : Math.round((completedTasks / tasks) * 100),
        byPriority: {
          LOW: priorityCounts.LOW,
          NORMAL: priorityCounts.NORMAL,
          HIGH: priorityCounts.HIGH,
          URGENT: priorityCounts.URGENT,
        },
      },
      taskLists: {
        total: taskLists,
      },
      roadmaps: {
        total: roadmaps,
        active: roadmapStatusCounts.ACTIVE,
        completed: roadmapStatusCounts.COMPLETED,
        archived: roadmapStatusCounts.ARCHIVED,
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
        recentTasks: recentTasks.map((task) => this.toTaskItem(task)),
      },
    };
  }

  private taskItemSelect() {
    return {
      id: true,
      title: true,
      status: true,
      priority: true,
      list_id: true,
      roadmap_id: true,
      due_date: true,
    } satisfies Prisma.tasksSelect;
  }

  private toTaskItem(task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    list_id: string | null;
    roadmap_id: string | null;
    due_date: Date | null;
  }): DashboardTaskItem {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      listId: task.list_id,
      roadmapId: task.roadmap_id,
      dueDate: task.due_date?.toISOString() ?? null,
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
