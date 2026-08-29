// Parse/build helpers for the Advanced Search builder (components/Search/SearchBuilder.tsx).
// All metatag syntax verified against the live e621 API.

import type { Rating } from "../models/post";
import { splitQuery } from "./searchQuery";

export interface SearchCriteria {
  /** Free-text tag portion (everything that isn't a recognised builder metatag). */
  tags: string;
  /** Selected ratings - empty means "any". */
  ratings: Rating[];
  /** `order:` value, "" for the default. */
  order: string;
  minScore: string;
  minFav: string;
  dateFrom: string;
  dateTo: string;
  fileType: string;
}

export const EMPTY_CRITERIA: SearchCriteria = {
  tags: "",
  ratings: [],
  order: "",
  minScore: "",
  minFav: "",
  dateFrom: "",
  dateTo: "",
  fileType: "",
};

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Relevance (default)" },
  { value: "id_desc", label: "Newest first" },
  { value: "id", label: "Oldest first" },
  { value: "score", label: "Highest score" },
  { value: "favcount", label: "Most favorited" },
  { value: "comment_count", label: "Most commented" },
  { value: "comment_bumped", label: "Recently commented" },
  { value: "tagcount", label: "Most tags" },
  { value: "mpixels", label: "Highest resolution" },
  { value: "filesize", label: "Largest file" },
  { value: "duration", label: "Longest (video/GIF)" },
  { value: "random", label: "Random" },
];

export const FILE_TYPES = ["jpg", "png", "gif", "webm", "mp4", "swf"];

const RATING_WORD: Record<Rating, string> = {
  s: "safe",
  q: "questionable",
  e: "explicit",
};
const RATING_FROM_TOKEN: Record<string, Rating> = {
  s: "s",
  safe: "s",
  q: "q",
  questionable: "q",
  e: "e",
  explicit: "e",
};

function numFromComparison(value: string): string {
  const m = value.match(/^>?=?\s*(\d+)/);
  return m ? m[1] : "";
}

export function parseCriteria(query: string): SearchCriteria {
  const c: SearchCriteria = { ...EMPTY_CRITERIA, ratings: [] };
  const rest: string[] = [];

  for (const tok of splitQuery(query)) {
    const lower = tok.toLowerCase();
    const bare = lower.replace(/^~/, "");
    const colon = bare.indexOf(":");
    if (colon === -1) {
      rest.push(tok);
      continue;
    }
    const key = bare.slice(0, colon);
    const val = bare.slice(colon + 1);
    switch (key) {
      case "rating": {
        const r = RATING_FROM_TOKEN[val];
        if (r && !c.ratings.includes(r)) c.ratings.push(r);
        break;
      }
      case "order":
      case "sort":
        c.order = val;
        break;
      case "score":
        c.minScore = numFromComparison(val);
        break;
      case "favcount":
        c.minFav = numFromComparison(val);
        break;
      case "type":
      case "filetype":
        if (FILE_TYPES.includes(val)) c.fileType = val;
        break;
      case "date": {
        const range = val.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
        if (range) {
          c.dateFrom = range[1];
          c.dateTo = range[2];
        } else {
          const ge = val.match(/^>?=?(\d{4}-\d{2}-\d{2})$/);
          const le = val.match(/^<=?(\d{4}-\d{2}-\d{2})$/);
          if (le) c.dateTo = le[1];
          else if (ge) c.dateFrom = ge[1];
        }
        break;
      }
      default:
        rest.push(tok);
    }
  }

  c.tags = rest.join(" ");
  return c;
}

export function buildQuery(c: SearchCriteria): string {
  const parts: string[] = [];
  if (c.tags.trim()) parts.push(c.tags.trim());

  if (c.ratings.length === 1) {
    parts.push(`rating:${RATING_WORD[c.ratings[0]]}`);
  } else if (c.ratings.length === 2) {
    parts.push(c.ratings.map((r) => `~rating:${RATING_WORD[r]}`).join(" "));
  }

  if (c.minScore.trim()) parts.push(`score:>=${c.minScore.trim()}`);
  if (c.minFav.trim()) parts.push(`favcount:>=${c.minFav.trim()}`);
  if (c.fileType) parts.push(`type:${c.fileType}`);

  const from = c.dateFrom.trim();
  const to = c.dateTo.trim();
  if (from && to) parts.push(`date:${from}..${to}`);
  else if (from) parts.push(`date:>=${from}`);
  else if (to) parts.push(`date:<=${to}`);

  if (c.order) parts.push(`order:${c.order}`);

  return parts.join(" ").trim();
}
