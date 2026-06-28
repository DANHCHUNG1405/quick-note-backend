export type DashboardStats = {
  generatedAt: string;
  overview: {
    topics: number;
    notes: number;
    pinnedNotes: number;
    sharedWithMe: number;
    sharedByMe: number;
    taskLists: number;
    roadmaps: number;
    tasks: number;
    pendingTasks: number;
    completedTasks: number;
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
  tasks: {
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
  taskLists: {
    total: number;
  };
  roadmaps: {
    total: number;
    active: number;
    completed: number;
    archived: number;
  };
  notifications: {
    total: number;
    unread: number;
  };
  activity: {
    recentNotes: DashboardRecentNote[];
    recentTasks: DashboardTaskItem[];
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

export type DashboardTaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  listId: string | null;
  roadmapId: string | null;
  dueDate: string | null;
};
