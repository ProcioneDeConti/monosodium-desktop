// Mirrors src-tauri/src/models.rs PostSet. e621's user-curated post collections (post_sets.json).
// No reference-app equivalent - neither app has surfaced sets before.

export interface PostSet {
  id: number;
  name: string;
  shortname: string;
  description: string;
  is_public: boolean;
  post_count: number;
  post_ids: number[];
  creator_id: number | null;
}

/** e621ng requires a shortname of 3-50 chars, lowercase a-z/0-9/underscore. This derives a valid
 *  one from a display name and reports whether it's usable. */
export function deriveShortname(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export function isValidShortname(shortname: string): boolean {
  return /^[a-z0-9_]{3,50}$/.test(shortname);
}
