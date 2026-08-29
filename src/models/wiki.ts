// Mirrors src-tauri/src/models.rs's WikiPage / TagInfo / TagRelations.

export interface WikiPage {
  id: number;
  title: string;
  body: string;
  updated_at: string | null;
}

export interface TagInfo {
  id: number;
  name: string;
  post_count: number;
  category: number;
  /** Space-separated `name count name count …`. */
  related_tags: string;
}

export interface TagRelations {
  implies: string[];
  implied_by: string[];
  aliases: string[];
}

/** Parse `related_tags` into ordered `{ name }[]` (drops the interleaved counts). */
export function parseRelatedTags(related: string): string[] {
  const parts = related.trim().split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) out.push(parts[i]);
  }
  return out;
}
