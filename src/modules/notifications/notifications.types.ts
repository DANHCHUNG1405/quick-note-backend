export type NoteSharedEvent = {
  recipientUserId: string;
  noteId: string;
  noteTitle: string;
  sharedByUserId: string;
  sharedAt: string;
};

export type NotificationSocketPayload = {
  id: string;
  type: string;
  message: string;
  is_read: boolean | null;
  created_at: Date | null;
  note_id: string;
  shared_by_user_id: string;
};

export type NoteViewerSocketPayload = {
  id: string;
  name: string;
  avatarUrl?: string;
  color?: string;
};

export type NoteViewersUpdateSocketPayload = {
  noteId: string;
  viewers: NoteViewerSocketPayload[];
};

export type NotePresenceErrorSocketPayload = {
  event: 'note:join' | 'note:leave';
  noteId?: string;
  message: string;
};
