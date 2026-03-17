export type Note = {
  id: string;
  topic_id: string;
  title: string;
  content: string | null;
  is_pinned: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at: Date | null;
  last_viewed_at?: Date | null;
};
