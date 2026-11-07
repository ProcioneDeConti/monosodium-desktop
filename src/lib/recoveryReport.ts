// Turns a failed deleted-post recovery (src-tauri/src/source_fetch.rs's RecoverFailure) into the
// grouped, plain-words report DeletedPostRecovery shows: where it looked, and in a few words why
// each place came up empty. The backend sends raw reasons ("HTTP 503 Service Unavailable",
// "no Wayback snapshot", ...); the raw text stays available as a tooltip and via "Copy details".
// A successful search gets the same card: what it found (one row per recovered file, with its
// grade) next to everywhere that came up empty.

import type { RecoveredImage, RecoveryGrade } from "../api/client";

/** One place a recovery looked without result. Mirrors `Attempt` in source_fetch.rs. */
export interface RecoveryAttempt {
  stage: "source" | "skipped" | "mirror" | "archive" | "limit";
  label: string;
  url: string | null;
  reason: string;
  /** Set on rows for a recovered file (built by `foundAttempts`, never sent by the backend). */
  grade?: RecoveryGrade;
}

/** A search's report as cached with the post (RecoveredSet.report). */
export interface SearchReport {
  searched_at: number;
  attempts: RecoveryAttempt[];
}

/** The recovery command's error value. Mirrors `RecoverFailure` in source_fetch.rs. */
export interface RecoverFailure {
  message: string;
  cancelled: boolean;
  no_sources: boolean;
  attempts: RecoveryAttempt[];
}

/** skip: deliberately not tried; gone: it isn't there (any more); none: looked, no copy;
 *  blocked: needs a login/key; error: something went wrong (down, timed out, ...). */
export type ReasonTone = "found" | "skip" | "gone" | "none" | "blocked" | "error";

export interface Reason {
  text: string;
  tone: ReasonTone;
  /** What the user can do about it, when there's something. */
  hint?: string;
}

/** Whatever `invoke` rejected with, as a RecoverFailure (older/other errors are plain strings). */
export function toRecoverFailure(e: unknown): RecoverFailure {
  if (e && typeof e === "object" && "attempts" in e && "message" in e) return e as RecoverFailure;
  const message = String(e);
  return { message, cancelled: message === "Cancelled.", no_sources: false, attempts: [] };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function fromHttp(code: number): Reason {
  if (code === 404 || code === 410) return { text: `Gone (${code})`, tone: "gone" };
  if (code === 401 || code === 403) return { text: `Access refused (${code})`, tone: "blocked" };
  if (code === 429) return { text: "Rate-limited (429)", tone: "error" };
  if (code >= 500) return { text: `Site down (${code})`, tone: "error" };
  return { text: `HTTP ${code}`, tone: "error" };
}

const GRADE_TEXT: Record<RecoveryGrade, string> = {
  exact: "Exact match",
  same_dimensions: "Same size, re-encoded",
  rescaled: "Different resolution",
  mismatch: "Shape differs",
};

/** md5-lookup boorus (source_fetch.rs's `Mirror`): a file recovered through one of their post
 *  pages came from the identical-file search, not from the post's own sources. */
const MIRROR_HOSTS: Record<string, string> = {
  "danbooru.donmai.us": "Danbooru",
  "rule34.paheal.net": "rule34.paheal",
  "gelbooru.com": "Gelbooru",
  "rule34.xxx": "Rule34.xxx",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One report row per recovered file, in the section it came from. */
export function foundAttempts(items: RecoveredImage[]): RecoveryAttempt[] {
  return items.map((item) => {
    const host = hostOf(item.source_url);
    const mirror = MIRROR_HOSTS[host];
    return {
      stage: item.via_archive ? "archive" : mirror ? "mirror" : "source",
      label: mirror ?? host,
      url: item.source_url,
      reason: `found ${item.grade}: ${item.image_url}`,
      grade: item.grade,
    };
  });
}

/** A few plain words for one attempt's raw reason. */
export function describeReason(a: RecoveryAttempt): Reason {
  if (a.grade) return { text: GRADE_TEXT[a.grade], tone: a.grade === "mismatch" ? "none" : "found" };
  const raw = a.reason.trim();
  const lower = raw.toLowerCase();
  if (a.stage === "skipped") return { text: capitalize(raw.replace(/, not a link to the post$/, "")), tone: "skip" };
  if (a.stage === "limit") return { text: `Ran out of time (${raw})`, tone: "error" };
  if (lower.startsWith("login required")) {
    return lower.includes("expired")
      ? { text: "Saved sign-in expired", tone: "blocked", hint: "Sign in again under Settings → Source logins." }
      : { text: "Needs a signed-in account", tone: "blocked", hint: "Sign in under Settings → Source logins." };
  }
  if (lower === "no copy") return { text: "No identical file", tone: "none" };
  if (lower === "no api key saved") return { text: "No API key saved", tone: "blocked" };
  if (lower.includes("check the key")) return { text: "API key refused", tone: "blocked", hint: "Check the key under Settings → Source logins." };
  const deleted = raw.match(/^deleted from ([^(]+?)\s*(\(|$)/i);
  if (deleted) return { text: `Deleted from ${deleted[1]}`, tone: "gone" };
  if (lower.includes("no wayback snapshot")) return { text: "Never archived", tone: "gone" };
  if (lower.includes("asked us to slow down")) return { text: "Skipped - Wayback is rate-limiting", tone: "error" };
  const captures = raw.match(/^(\d+) captures?, none usable/);
  if (captures) {
    const n = Number(captures[1]);
    return { text: n === 1 ? "Archived once, nothing usable" : `Archived ${n}×, nothing usable`, tone: "gone" };
  }
  const http = raw.match(/HTTP (\d{3})/);
  if (http) return fromHttp(Number(http[1]));
  if (lower.includes("timed out")) return { text: "Timed out", tone: "error" };
  if (lower.includes("hides this tweet") || lower.startsWith("tweet media not found")) {
    return { text: "No media found", tone: "gone" };
  }
  if (/no (og:image|submission image|submission file|reader image)|not found \(removed\?\)|has no (files|pages|images|media)|removed/.test(lower)) {
    return { text: "No image on the page", tone: "gone" };
  }
  if (lower.includes("not a usable image") || lower.startsWith("not an image")) return { text: "Not an image", tone: "gone" };
  if (lower.includes("non-public address")) return { text: "Blocked (private address)", tone: "error" };
  const first = raw.split(/;|\n/)[0].trim();
  return { text: capitalize(first.length > 60 ? `${first.slice(0, 57)}…` : first), tone: "error" };
}

export interface ReportSection {
  title: string;
  rows: RecoveryAttempt[];
}

const SECTIONS: { title: string; stages: RecoveryAttempt["stage"][] }[] = [
  { title: "Post's sources", stages: ["source", "skipped"] },
  { title: "Identical-file search", stages: ["mirror"] },
  { title: "Wayback Machine", stages: ["archive"] },
  { title: "Time limits", stages: ["limit"] },
];

/** Attempts grouped for display, in the order the search runs; skipped sources last in theirs. */
export function groupAttempts(attempts: RecoveryAttempt[]): ReportSection[] {
  return SECTIONS.map(({ title, stages }) => ({
    title,
    // Found files first in their section, then the misses.
    rows: stages.flatMap((stage) => attempts.filter((a) => a.stage === stage)).sort((x, y) => Number(!!y.grade) - Number(!!x.grade)),
  })).filter((s) => s.rows.length > 0);
}

/** The short "where" text after the site name: the URL's path, or a name for well-known targets. */
export function shortPath(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (/^static1\.(e621|e6ai)\.net$/.test(u.hostname)) return "e621's own copy of the file";
    const path = decodeURIComponent(u.pathname + u.search);
    return path === "/" ? "" : path;
  } catch {
    return url;
  }
}

/** Plain-text version for "Copy details" (bug reports). */
export function reportText(title: string, attempts: RecoveryAttempt[]): string {
  return [title, ...attempts.map((a) => `[${a.stage}] ${a.label}${a.url ? ` ${a.url}` : ""} - ${a.reason}`)].join("\n");
}

/** The grade's plain words, for the success card's subtitle. */
export function gradeText(grade: RecoveryGrade): string {
  return GRADE_TEXT[grade];
}
