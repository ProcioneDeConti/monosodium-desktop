// Mirrors src-tauri/src/upload.rs.

export interface UploadFileInfo {
  path: string;
  md5: string;
  size: number;
  /** Sniffed from the file's header: jpg/png/gif/webp/webm/mp4, or "" if none of those. */
  ext: string;
  width: number | null;
  height: number | null;
}

export interface IqdbMatch {
  post_id: number;
  score: number;
  preview_url: string | null;
  rating: string | null;
}

/** One entry of e621's `POST /tags/preview.json`. */
export interface TagPreview {
  name: string;
  resolved?: string | null;
  category?: number | null;
  alias?: string | null;
  implies?: string[] | null;
  id?: number | null;
  post_count?: number | null;
}

export interface DnpHit {
  artist: string;
  details: string;
}

export interface UploadRequest {
  file_path: string | null;
  direct_url: string | null;
  tag_string: string;
  rating: "s" | "q" | "e";
  source: string;
  description: string;
  parent_id: number | null;
  as_pending: boolean;
}

export type UploadResult =
  | { kind: "ok"; post_id: number }
  | { kind: "duplicate"; post_id: number | null }
  | { kind: "invalid"; message: string };
