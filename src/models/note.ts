// Mirrors src-tauri/src/models.rs's PostNote - see that struct's doc comment for the coordinate
// space (pixels against the post's original full-size image) and the view-only scope.

export interface PostNote {
  id: number;
  post_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  body: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}
