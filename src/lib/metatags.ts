// e621 search "metatags" (operators like `rating:safe`, `order:score`, `user:foo`) and their
// value completions. Static enums come from e621's own cheatsheet (https://e621.net/help/cheatsheet);
// `user`/`pool` values are fetched live (queries/useMetatagValues.ts). Comparison metatags just
// get a syntax hint. Used by SearchBar's dropdown - previously anything with a `:` suppressed
// autocomplete entirely.

export type MetatagKind = "enum" | "user" | "pool" | "hint";

export interface MetatagDef {
  /** The operator including its colon, lowercase, e.g. "rating:". */
  prefix: string;
  kind: MetatagKind;
  /** For kind "enum": the allowed values. */
  values?: string[];
  /** For kind "hint": example syntax shown as a non-selectable dropdown note. */
  hint?: string;
}

const ORDER_VALUES = [
  "id",
  "id_desc",
  "score",
  "score_asc",
  "favcount",
  "favcount_asc",
  "tagcount",
  "comment_count",
  "comment_bumped",
  "mpixels",
  "mpixels_asc",
  "filesize",
  "filesize_asc",
  "landscape",
  "portrait",
  "duration",
  "duration_asc",
  "change",
  "rank",
  "random",
];

const FILETYPE_VALUES = ["jpg", "png", "gif", "webm", "mp4", "swf"];
const RATING_VALUES = ["safe", "questionable", "explicit"];
const STATUS_VALUES = [
  "pending",
  "active",
  "deleted",
  "flagged",
  "modqueue",
  "unmoderated",
  "any",
];
const RANGE_HINT = "e.g. >100, <50, 20..40";

export const METATAGS: MetatagDef[] = [
  { prefix: "rating:", kind: "enum", values: RATING_VALUES },
  { prefix: "order:", kind: "enum", values: ORDER_VALUES },
  { prefix: "sort:", kind: "enum", values: ORDER_VALUES },
  { prefix: "type:", kind: "enum", values: FILETYPE_VALUES },
  { prefix: "filetype:", kind: "enum", values: FILETYPE_VALUES },
  { prefix: "status:", kind: "enum", values: STATUS_VALUES },
  { prefix: "locked:", kind: "enum", values: ["rating", "note", "status"] },
  { prefix: "parent:", kind: "enum", values: ["none"] },
  { prefix: "user:", kind: "user" },
  { prefix: "fav:", kind: "user" },
  { prefix: "favoritedby:", kind: "user" },
  { prefix: "approver:", kind: "user" },
  { prefix: "commenter:", kind: "user" },
  { prefix: "noter:", kind: "user" },
  { prefix: "voter:", kind: "user" },
  { prefix: "pool:", kind: "pool" },
  { prefix: "set:", kind: "hint", hint: "a set's shortname" },
  { prefix: "date:", kind: "hint", hint: "YYYY-MM-DD, or today / yesterday / week / month" },
  { prefix: "score:", kind: "hint", hint: RANGE_HINT },
  { prefix: "favcount:", kind: "hint", hint: RANGE_HINT },
  { prefix: "id:", kind: "hint", hint: "an id, list (1,2,3), or range" },
  { prefix: "width:", kind: "hint", hint: RANGE_HINT },
  { prefix: "height:", kind: "hint", hint: RANGE_HINT },
  { prefix: "mpixels:", kind: "hint", hint: RANGE_HINT },
  { prefix: "filesize:", kind: "hint", hint: "e.g. >5mb, <500kb" },
  { prefix: "tagcount:", kind: "hint", hint: RANGE_HINT },
  { prefix: "comment_count:", kind: "hint", hint: RANGE_HINT },
  { prefix: "duration:", kind: "hint", hint: "seconds, e.g. >30, 5..10" },
];

export interface MetatagMatch {
  def: MetatagDef;
  /** The part typed after the colon (may be empty), lowercased. */
  valuePart: string;
  /** True if the token started with `-` (exclusion). */
  negated: boolean;
}

/** Parses a draft token like `-rating:que` into its metatag + partial value, or null if the
 *  draft isn't a known metatag operator. */
export function matchMetatag(draft: string): MetatagMatch | null {
  const trimmed = draft.trim().toLowerCase();
  if (!trimmed.includes(":")) return null;
  const negated = trimmed.startsWith("-");
  const bare = negated ? trimmed.slice(1) : trimmed;
  const colon = bare.indexOf(":");
  const prefix = bare.slice(0, colon + 1);
  const def = METATAGS.find((m) => m.prefix === prefix);
  if (!def) return null;
  return { def, valuePart: bare.slice(colon + 1), negated };
}

/** Static-enum completions for a match, filtered by what's already typed. */
export function enumCompletions(match: MetatagMatch): string[] {
  if (match.def.kind !== "enum" || !match.def.values) return [];
  return match.def.values.filter((v) => v.startsWith(match.valuePart));
}
