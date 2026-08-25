// Mirrors src-tauri/src/models.rs's Dmail - see that struct's doc comment for why `folder` isn't
// modeled (this app only ever reads the inbox).

export interface Dmail {
  id: number;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string | null;
  to_id: number | null;
  to_name: string | null;
  from_id: number | null;
  from_name: string | null;
}
