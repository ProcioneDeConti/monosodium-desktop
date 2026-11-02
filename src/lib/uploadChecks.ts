// Pure pre-flight rules for the e621 uploader (UploadPanel's checklist). No I/O - the panel's
// queries feed in the file info, tag preview, implication graph, MD5/IQDB/DNP results.
//
// The tag rule (e621 upload guidelines): every post needs at least 10 *General*-category,
// *non-implied* tags. Artist, contributor, character, species, copyright, lore, meta and invalid
// tags don't count. A tag that any other entered tag implies (forest -> tree -> plant) doesn't
// count either - only the most specific one does.

import type { DnpHit, IqdbMatch, TagPreview, UploadFileInfo } from "../models/upload";

export const MIN_GENERAL_TAGS = 10;
/** e621's per-file cap. Mirrored in src-tauri/src/upload.rs. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const ALLOWED_EXTS = ["jpg", "png", "gif", "webp", "webm", "mp4"] as const;

/** e621's numeric tag categories. */
export const TAG_CAT = {
  general: 0,
  artist: 1,
  contributor: 2,
  copyright: 3,
  character: 4,
  species: 5,
  invalid: 6,
  meta: 7,
  lore: 8,
} as const;

/** Lowercased, underscored, de-duplicated tag tokens from free text. */
export function normalizeTags(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input : input.split(/\s+/);
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, "_");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export interface ResolvedTag {
  /** As entered. */
  input: string;
  /** After category-prefix stripping and alias resolution. */
  canonical: string;
  /** null until the preview has it. */
  category: number | null;
  aliasedFrom: string | null;
  /** Doesn't exist on e621 yet (would be created as a new general tag). */
  isNew: boolean;
}

/** Joins entered tags with their preview entries. */
export function resolveTags(entered: string[], preview: TagPreview[] | undefined): ResolvedTag[] {
  const byName = new Map<string, TagPreview>();
  for (const p of preview ?? []) {
    byName.set(p.name, p);
    if (p.resolved) byName.set(p.resolved, p);
  }
  const seen = new Set<string>();
  const out: ResolvedTag[] = [];
  for (const input of entered) {
    const p = byName.get(input);
    const resolved = p?.resolved ?? input;
    const canonical = p?.alias ?? resolved;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({
      input,
      canonical,
      category: p ? (p.category ?? TAG_CAT.general) : null,
      aliasedFrom: p?.alias && p.alias !== resolved ? input : null,
      isNew: !!p && p.id == null,
    });
  }
  return out;
}

/** Implication edges (antecedent -> consequents) from the preview's `implies` lists. */
export function edgesFromPreview(preview: TagPreview[] | undefined): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const p of preview ?? []) {
    if (!p.implies?.length) continue;
    const from = p.alias ?? p.resolved ?? p.name;
    edges.set(from, [...new Set([...(edges.get(from) ?? []), ...p.implies])]);
  }
  return edges;
}

/** Every tag reachable from `start` through implications (not including `start`). */
export function implicationClosure(start: string, edges: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(edges.get(start) ?? [])];
  while (stack.length) {
    const t = stack.pop()!;
    if (out.has(t) || t === start) continue;
    out.add(t);
    stack.push(...(edges.get(t) ?? []));
  }
  return out;
}

export interface GeneralCount {
  /** General, non-implied canonical tags. */
  counted: string[];
  /** General tags not counted because another entered tag implies them. */
  impliedDropped: string[];
  /** Entered tags in any non-General category. */
  otherCategory: string[];
  /** Entered tags whose category isn't known yet (preview pending). */
  unknown: string[];
}

export function countGeneralNonImplied(tags: ResolvedTag[], edges: Map<string, string[]>): GeneralCount {
  const result: GeneralCount = { counted: [], impliedDropped: [], otherCategory: [], unknown: [] };
  const canon = tags.map((t) => t.canonical);
  // Union of what each entered tag implies. A tag is "implied" if anything *else* entered implies it.
  const impliedBy = new Map<string, Set<string>>();
  for (const c of canon) impliedBy.set(c, implicationClosure(c, edges));
  for (const t of tags) {
    if (t.category === null) {
      result.unknown.push(t.canonical);
      continue;
    }
    if (t.category !== TAG_CAT.general) {
      result.otherCategory.push(t.canonical);
      continue;
    }
    const implied = canon.some((other) => other !== t.canonical && impliedBy.get(other)!.has(t.canonical));
    (implied ? result.impliedDropped : result.counted).push(t.canonical);
  }
  return result;
}

export type CheckStatus = "pass" | "fail" | "warn" | "pending" | "running";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  /** Failing a blocking item disables Submit. Warnings never block. */
  blocking: boolean;
  detail?: string;
}

/** Async check state as the panel's queries report it. */
export type Async<T> = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "done"; value: T };

export interface ChecklistInput {
  file: Async<UploadFileInfo>;
  md5Match: Async<{ id: number } | null>;
  iqdb: Async<IqdbMatch[]>;
  tags: ResolvedTag[];
  previewState: Async<unknown>;
  edges: Map<string, string[]>;
  dnp: Async<DnpHit[]>;
  rating: "s" | "q" | "e" | null;
  sources: string[];
  /** Remaining upload slots if the account reports them. */
  uploadSlots: number | null;
}

function fromAsync<T>(a: Async<T>): CheckStatus | null {
  if (a.state === "idle") return "pending";
  if (a.state === "loading") return "running";
  return null;
}

/** Artist tags that need a DNP lookup (placeholders like unknown_artist can't be DNP). */
export const ARTIST_PLACEHOLDERS = new Set(["unknown_artist", "anonymous_artist", "conditional_dnp", "sound_warning"]);

export function artistTags(tags: ResolvedTag[]): string[] {
  return tags.filter((t) => t.category === TAG_CAT.artist && !ARTIST_PLACEHOLDERS.has(t.canonical)).map((t) => t.canonical);
}

export function buildChecklist(i: ChecklistInput): CheckItem[] {
  const items: CheckItem[] = [];
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  // 1. File
  {
    const s = fromAsync(i.file);
    let item: CheckItem = { id: "file", label: "File type & size", status: s ?? "pass", blocking: true };
    if (i.file.state === "error") item = { ...item, status: "fail", detail: i.file.message };
    if (i.file.state === "done") {
      const f = i.file.value;
      if (!f.ext) item = { ...item, status: "fail", detail: "Not a jpg/png/gif/webp/webm/mp4 file" };
      else if (f.size > MAX_UPLOAD_BYTES) item = { ...item, status: "fail", detail: `${mb(f.size)} - over the 100 MB limit` };
      else item = { ...item, detail: `${f.ext.toUpperCase()}, ${mb(f.size)}${f.width ? `, ${f.width}×${f.height}` : ""}` };
    }
    items.push(item);
  }

  // 2. MD5 duplicate
  {
    let item: CheckItem = { id: "md5", label: "Not already on e621", status: fromAsync(i.md5Match) ?? "pass", blocking: true };
    if (i.md5Match.state === "error") item = { ...item, status: "fail", detail: `Couldn't check: ${i.md5Match.message}` };
    if (i.md5Match.state === "done" && i.md5Match.value)
      item = { ...item, status: "fail", detail: `Exact duplicate of post #${i.md5Match.value.id}` };
    items.push(item);
  }

  // 3. IQDB (warning only)
  {
    let item: CheckItem = { id: "iqdb", label: "No visually similar posts", status: fromAsync(i.iqdb) ?? "pass", blocking: false };
    if (i.md5Match.state === "done" && i.md5Match.value) item = { ...item, status: "pending", detail: "Skipped (exact duplicate)" };
    else if (i.iqdb.state === "error") item = { ...item, status: "warn", detail: `Couldn't check: ${i.iqdb.message}` };
    else if (i.iqdb.state === "done" && i.iqdb.value.length)
      item = { ...item, status: "warn", detail: `${i.iqdb.value.length} similar post(s) - check it isn't a repost, or set one as parent` };
    items.push(item);
  }

  const previewPending = i.previewState.state !== "done";
  const tagStatus = (ok: boolean): CheckStatus =>
    i.tags.length === 0 ? "pending" : previewPending ? (i.previewState.state === "error" ? "fail" : "running") : ok ? "pass" : "fail";
  const previewErr = i.previewState.state === "error" ? `Tag check failed: ${i.previewState.message}` : undefined;

  // 4. Artist
  const hasArtist = i.tags.some((t) => t.category === TAG_CAT.artist);
  items.push({
    id: "artist",
    label: "Artist tag",
    status: tagStatus(hasArtist),
    blocking: true,
    detail: previewErr ?? (hasArtist ? undefined : "Add the artist, or unknown_artist"),
  });

  // 5. DNP
  {
    const artists = artistTags(i.tags);
    let item: CheckItem = { id: "dnp", label: "Not on the DNP list", status: "pass", blocking: true };
    if (previewPending) item = { ...item, status: tagStatus(false), detail: previewErr };
    else if (!hasArtist) item = { ...item, status: "pending", detail: "Waiting for an artist tag" };
    else if (artists.length === 0) item = { ...item, detail: "No named artists to check" };
    else {
      const s = fromAsync(i.dnp);
      if (s) item = { ...item, status: s };
      else if (i.dnp.state === "error") item = { ...item, status: "fail", detail: `Couldn't check: ${i.dnp.message}` };
      else if (i.dnp.state === "done" && i.dnp.value.length)
        item = {
          ...item,
          status: "fail",
          detail: i.dnp.value.map((h) => `${h.artist}${h.details ? `: ${h.details}` : ""}`).join("\n"),
        };
    }
    items.push(item);
  }

  // 6. General non-implied count
  {
    const c = countGeneralNonImplied(i.tags, i.edges);
    const parts = [
      c.impliedDropped.length ? `${c.impliedDropped.length} implied` : "",
      c.otherCategory.length ? `${c.otherCategory.length} other-category` : "",
    ].filter(Boolean);
    items.push({
      id: "general",
      label: `General tags ${c.counted.length}/${MIN_GENERAL_TAGS}`,
      status: tagStatus(c.counted.length >= MIN_GENERAL_TAGS),
      blocking: true,
      detail: previewErr ?? (parts.length ? `Not counted: ${parts.join(", ")}` : undefined),
    });
  }

  // 7. Rating
  items.push({
    id: "rating",
    label: "Rating chosen",
    status: i.rating ? "pass" : "fail",
    blocking: true,
    detail: i.rating ? undefined : "Pick safe, questionable or explicit",
  });

  // 8. Invalid tags (new tags are fine but flagged)
  {
    const invalid = i.tags.filter((t) => t.category === TAG_CAT.invalid).map((t) => t.canonical);
    const fresh = i.tags.filter((t) => t.isNew).map((t) => t.canonical);
    let status = tagStatus(invalid.length === 0);
    if (status === "pass" && fresh.length) status = "warn";
    items.push({
      id: "invalid",
      label: "No invalid tags",
      status,
      blocking: true,
      detail: invalid.length
        ? `Invalid: ${invalid.join(", ")}`
        : fresh.length
          ? `New tags (check spelling): ${fresh.join(", ")}`
          : undefined,
    });
  }

  // 9. Source (warning only)
  const hasSource = i.sources.some((s) => s.trim());
  items.push({
    id: "source",
    label: "Source given",
    status: hasSource ? "pass" : "warn",
    blocking: false,
    detail: hasSource ? undefined : "Strongly recommended - link the original post",
  });

  // 10. Upload slots (warning; the server enforces it)
  if (i.uploadSlots !== null) {
    items.push({
      id: "slots",
      label: "Upload slots left",
      status: i.uploadSlots > 0 ? "pass" : "warn",
      blocking: false,
      detail: `${i.uploadSlots} remaining`,
    });
  }

  return items;
}

export function canSubmit(items: CheckItem[]): boolean {
  return items.every((it) => !it.blocking || it.status === "pass" || it.status === "warn");
}
