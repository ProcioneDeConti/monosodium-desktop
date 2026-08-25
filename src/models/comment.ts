// Mirrors src-tauri/src/models.rs's Comment - see that struct's doc comment for the e621 JSON
// shape and the is_hidden filtering rule.

export interface Comment {
  id: number;
  post_id: number;
  creator_id: number | null;
  creator_name: string | null;
  body: string;
  score: number;
  created_at: string | null;
  updated_at: string | null;
  is_hidden: boolean;
  /** The authenticated user's own vote: 1 up, -1 down, 0 none. */
  vote_by: number;
}
