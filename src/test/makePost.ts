// Minimal `Post` fixture for unit tests - only the fields under test need overriding.

import type { Post, PostTags } from "../models/post";

export function makePost(
  id: number,
  overrides: { tags?: Partial<PostTags>; rating?: string } = {},
): Post {
  return {
    id,
    created_at: null,
    updated_at: null,
    file: { width: 100, height: 100, ext: "png", size: 0, md5: "", url: null },
    preview: { width: 100, height: 100, url: null },
    sample: { has: false, width: 100, height: 100, url: null },
    score: { up: 0, down: 0, total: 0 },
    tags: {
      general: [],
      species: [],
      character: [],
      copyright: [],
      artist: [],
      invalid: [],
      lore: [],
      meta: [],
      ...overrides.tags,
    },
    locked_tags: [],
    rating: overrides.rating ?? "s",
    fav_count: 0,
    sources: [],
    pools: [],
    description: "",
    comment_count: 0,
    is_favorited: false,
    has_notes: false,
    duration: null,
    flags: {} as Post["flags"],
    relationships: {} as Post["relationships"],
    vote_by: 0,
    uploader_id: null,
    approver_id: null,
  } as Post;
}
