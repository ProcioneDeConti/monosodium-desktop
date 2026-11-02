import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  canSubmit,
  countGeneralNonImplied,
  edgesFromPreview,
  resolveTags,
  TAG_CAT,
  type ChecklistInput,
} from "./uploadChecks";
import type { TagPreview } from "../models/upload";

const g = (name: string, extra: Partial<TagPreview> = {}): TagPreview => ({ name, category: 0, id: 1, ...extra });

describe("countGeneralNonImplied", () => {
  const preview = [
    g("forest", { implies: ["tree"] }),
    g("tree", { implies: ["plant"] }),
    g("plant"),
    g("fox", { category: TAG_CAT.species }),
    g("someartist", { category: TAG_CAT.artist }),
  ];
  const edges = edgesFromPreview(preview);

  it("counts only the most specific tag of an implication chain", () => {
    const tags = resolveTags(["forest", "tree", "plant"], preview);
    const c = countGeneralNonImplied(tags, edges);
    expect(c.counted).toEqual(["forest"]);
    expect(c.impliedDropped.sort()).toEqual(["plant", "tree"]);
  });

  it("follows chains deeper than the preview's own two levels via extra edges", () => {
    const deep = new Map(edges);
    deep.set("plant", ["organism"]);
    const tags = resolveTags(["forest", "organism"], [...preview, g("organism")]);
    expect(countGeneralNonImplied(tags, deep).counted).toEqual(["forest"]);
  });

  it("excludes non-General categories", () => {
    const tags = resolveTags(["forest", "fox", "someartist"], preview);
    const c = countGeneralNonImplied(tags, edges);
    expect(c.counted).toEqual(["forest"]);
    expect(c.otherCategory).toEqual(["fox", "someartist"]);
  });

  it("resolves aliases before counting, collapsing duplicates", () => {
    const p = [g("woods", { alias: "forest" }), ...preview];
    const tags = resolveTags(["woods", "forest"], p);
    expect(tags.map((t) => t.canonical)).toEqual(["forest"]);
    expect(tags[0].aliasedFrom).toBe("woods");
  });
});

function input(over: Partial<ChecklistInput> = {}): ChecklistInput {
  const generals = Array.from({ length: 10 }, (_, i) => g(`tag${i}`));
  const preview = [g("artist_x", { category: TAG_CAT.artist }), ...generals];
  return {
    file: { state: "done", value: { path: "a.png", md5: "x", size: 1000, ext: "png", width: 10, height: 10 } },
    md5Match: { state: "done", value: null },
    iqdb: { state: "done", value: [] },
    tags: resolveTags(preview.map((p) => p.name), preview),
    previewState: { state: "done", value: null },
    edges: new Map(),
    dnp: { state: "done", value: [] },
    rating: "s",
    sources: ["https://example.com"],
    uploadSlots: null,
    ...over,
  };
}

describe("buildChecklist", () => {
  it("passes a complete upload", () => {
    expect(canSubmit(buildChecklist(input()))).toBe(true);
  });

  it("blocks without a rating", () => {
    expect(canSubmit(buildChecklist(input({ rating: null })))).toBe(false);
  });

  it("blocks on a DNP hit", () => {
    const items = buildChecklist(input({ dnp: { state: "done", value: [{ artist: "artist_x", details: "" }] } }));
    expect(items.find((i) => i.id === "dnp")!.status).toBe("fail");
    expect(canSubmit(items)).toBe(false);
  });

  it("blocks on an exact MD5 duplicate but only warns on IQDB matches", () => {
    expect(canSubmit(buildChecklist(input({ md5Match: { state: "done", value: { id: 5 } } })))).toBe(false);
    const iqdb = buildChecklist(input({ iqdb: { state: "done", value: [{ post_id: 1, score: 90, preview_url: null, rating: "s" }] } }));
    expect(iqdb.find((i) => i.id === "iqdb")!.status).toBe("warn");
    expect(canSubmit(iqdb)).toBe(true);
  });

  it("blocks with fewer than 10 general tags, and without an artist", () => {
    const few = input();
    expect(canSubmit(buildChecklist({ ...few, tags: few.tags.slice(0, 5) }))).toBe(false);
    expect(canSubmit(buildChecklist({ ...few, tags: few.tags.slice(1) }))).toBe(false);
  });

  it("accepts unknown_artist as the artist tag", () => {
    const base = input();
    const p = [g("unknown_artist", { category: TAG_CAT.artist })];
    const tags = [...resolveTags(["unknown_artist"], p), ...base.tags.slice(1)];
    expect(canSubmit(buildChecklist({ ...base, tags }))).toBe(true);
  });

  it("only warns when the source is missing", () => {
    expect(canSubmit(buildChecklist(input({ sources: [] })))).toBe(true);
  });
});
