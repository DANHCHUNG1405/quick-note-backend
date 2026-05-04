export type DashboardStats = {
  generatedAt: string;
  overview: {
    topics: number;
    notes: number;
    pinnedNotes: number;
    sharedWithMe: number;
    sharedByMe: number;
    todoGroups: number;
    todos: number;
    pendingTodos: number;
    completedTodos: number;
    overdueTodos: number;
    unreadNotifications: number;
  };
  notes: {
    total: number;
    pinned: number;
    recentlyViewed: number;
    updatedLast7Days: number;
    sharedWithMe: number;
    sharedByMe: number;
  };
  todos: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
    withoutDueDate: number;
    completionRate: number;
    byPriority: {
      LOW: number;
      NORMAL: number;
      HIGH: number;
      URGENT: number;
    };
  };
  todoGroups: {
    total: number;
    custom: number;
    note: number;
    daily: number;
  };
  notifications: {
    total: number;
    unread: number;
  };
  activity: {
    recentNotes: DashboardRecentNote[];
    upcomingTodos: DashboardTodoItem[];
    overdueTodos: DashboardTodoItem[];
  };
};

export type DashboardRecentNote = {
  id: string;
  title: string;
  topicId: string;
  topicName: string;
  isPinned: boolean;
  lastViewedAt: string | null;
  updatedAt: string | null;
};

export type DashboardTodoItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  topicId: string | null;
  topicName: string | null;
  noteId: string | null;
  noteTitle: string | null;
  groupId: string | null;
  groupName: string | null;
};
