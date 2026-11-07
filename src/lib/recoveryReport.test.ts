import { describe, expect, it } from "vitest";
import type { RecoveredImage } from "../api/client";
import {
  describeReason,
  foundAttempts,
  groupAttempts,
  reportText,
  shortPath,
  toRecoverFailure,
  type RecoveryAttempt,
} from "./recoveryReport";

const at = (stage: RecoveryAttempt["stage"], reason: string, label = "site", url: string | null = null): RecoveryAttempt => ({
  stage,
  label,
  url,
  reason,
});

describe("describeReason", () => {
  it("turns the backend's raw reasons into a few plain words", () => {
    // Every raw reason here is one the backend really produced while testing post 1447459 & co.
    expect(describeReason(at("skipped", "an artist's profile page, not a link to the post"))).toEqual({
      text: "An artist's profile page",
      tone: "skip",
    });
    expect(describeReason(at("source", 'deleted from Fur Affinity ("not in our database")')).text).toBe("Deleted from Fur Affinity");
    expect(describeReason(at("mirror", "HTTP 503 Service Unavailable"))).toEqual({ text: "Site down (503)", tone: "error" });
    expect(describeReason(at("archive", "no Wayback snapshot")).text).toBe("Never archived");
    expect(describeReason(at("source", "HTTP 404 Not Found")).text).toBe("Gone (404)");
    expect(describeReason(at("mirror", "no copy")).text).toBe("No identical file");
    expect(describeReason(at("archive", "3 captures, none usable: no og:image on the page")).text).toBe("Archived 3×, nothing usable");
    expect(describeReason(at("archive", "1 capture, none usable: HTTP 404 Not Found")).text).toBe("Archived once, nothing usable");
    expect(describeReason(at("limit", "stopped after 120s")).text).toBe("Ran out of time (stopped after 120s)");
    expect(describeReason(at("source", "timed out")).text).toBe("Timed out");
  });

  it("points at the fix for login and key problems", () => {
    const login = describeReason(at("source", "login required: Fur Affinity only shows this Mature/Adult submission to signed-in users"));
    expect(login.tone).toBe("blocked");
    expect(login.hint).toMatch(/Source logins/);
    expect(describeReason(at("source", "login required: your saved Fur Affinity sign-in has expired")).text).toBe("Saved sign-in expired");
    expect(describeReason(at("mirror", "Missing authentication. - check the key under Settings > Source logins")).text).toBe("API key refused");
  });

  it("keeps unknown reasons short and readable", () => {
    const r = describeReason(at("source", "some brand new failure nobody anticipated; with more detail after it"));
    expect(r.text).toBe("Some brand new failure nobody anticipated");
    expect(describeReason(at("source", "x".repeat(200))).text.length).toBeLessThanOrEqual(58);
  });
});

describe("found rows", () => {
  const item = (source_url: string, grade: RecoveredImage["grade"], via_archive = false) =>
    ({ source_url, grade, via_archive, image_url: "https://cdn/x.png" }) as RecoveredImage;

  it("files land in the section they came from, ahead of that section's misses", () => {
    const rows = foundAttempts([
      item("https://x.com/a/status/1", "exact"),
      item("https://danbooru.donmai.us/posts/5", "exact"),
      item("https://www.furaffinity.net/view/1/", "rescaled", true),
    ]);
    expect(rows.map((r) => [r.stage, r.label])).toEqual([
      ["source", "x.com"],
      ["mirror", "Danbooru"],
      ["archive", "furaffinity.net"],
    ]);
    expect(describeReason(rows[0])).toEqual({ text: "Exact match", tone: "found" });
    const sections = groupAttempts([at("source", "HTTP 404 Not Found"), ...rows]);
    expect(sections[0].rows[0].grade).toBe("exact");
  });
});

describe("report layout", () => {
  it("groups by stage in search order, skipped sources last", () => {
    const sections = groupAttempts([
      at("archive", "no Wayback snapshot"),
      at("skipped", "only the site's front page"),
      at("mirror", "no copy"),
      at("source", "HTTP 404 Not Found"),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["Post's sources", "Identical-file search", "Wayback Machine"]);
    expect(sections[0].rows.map((r) => r.stage)).toEqual(["source", "skipped"]);
  });

  it("shows short paths", () => {
    expect(shortPath("https://www.furaffinity.net/view/23368042/")).toBe("/view/23368042/");
    expect(shortPath("https://forge.sofurry.com/")).toBe("");
    expect(shortPath("https://static1.e621.net/data/3a/b8/3ab8.jpg")).toBe("e621's own copy of the file");
    expect(shortPath(null)).toBe("");
  });

  it("reads both structured and plain-string errors", () => {
    expect(toRecoverFailure("Cancelled.").cancelled).toBe(true);
    const f = toRecoverFailure({ message: "No copy found.", cancelled: false, no_sources: false, attempts: [at("mirror", "no copy", "Danbooru")] });
    expect(f.attempts).toHaveLength(1);
    expect(reportText(f.message, f.attempts)).toBe("No copy found.\n[mirror] Danbooru - no copy");
  });
});
