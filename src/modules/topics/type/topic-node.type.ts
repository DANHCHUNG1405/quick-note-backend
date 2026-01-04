export type TopicNode = {
  id: string;
  name: string;
  parent_id: string | null;
  user_id: string;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at: Date | null;
  children: TopicNode[];
};
