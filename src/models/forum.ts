// Mirrors src-tauri/src/models.rs's ForumTopic/ForumPost.

export interface ForumTopic {
  id: number;
  title: string;
  category_id: number | null;
  response_count: number;
  is_sticky: boolean;
  is_locked: boolean;
  creator_id: number | null;
  creator_name: string | null;
  updated_at: string | null;
}

export interface ForumPost {
  id: number;
  topic_id: number;
  body: string;
  creator_id: number | null;
  creator_name: string | null;
  created_at: string | null;
}
