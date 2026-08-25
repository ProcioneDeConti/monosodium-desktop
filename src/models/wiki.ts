// Mirrors src-tauri/src/models.rs's WikiPage.

export interface WikiPage {
  id: number;
  title: string;
  body: string;
  updated_at: string | null;
}
