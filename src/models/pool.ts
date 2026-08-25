// Mirrors src-tauri/src/models.rs's Pool.

export interface Pool {
  id: number;
  name: string;
  description: string;
  creator_id: number | null;
  is_active: boolean;
  category: string | null;
  post_ids: number[];
  post_count: number;
}
