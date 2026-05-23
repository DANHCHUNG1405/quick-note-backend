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
    pending: number;
    completed: number;
    custom: number;
    daily: number;
  };
  notifications: {
    total: number;
    unread: number;
  };
  activity: {
    recentNotes: DashboardRecentNote[];
    recentTodos: DashboardTodoItem[];
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
  groupId: string | null;
  groupName: string | null;
  groupDate: string | null;
};
