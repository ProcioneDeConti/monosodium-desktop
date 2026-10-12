import { describe, expect, it } from "vitest";
import { parseDText, type DBlock, type DInline } from "./dtext";

const BASE = "https://e621.net";

/** Inline nodes of a single-paragraph, single-segment parse. */
function inline(text: string): DInline[] {
  const blocks = parseDText(text, BASE);
  expect(blocks).toHaveLength(1);
  const block = blocks[0] as Extract<DBlock, { type: "paragraph" }>;
  expect(block.type).toBe("paragraph");
  return block.segments.flatMap((s) => s.nodes);
}

describe("parseDText blocks", () => {
  it("parses headings", () => {
    expect(parseDText("h2. Title")).toMatchObject([
      { type: "heading", level: 2, segments: [{ nodes: [{ type: "text", text: "Title" }] }] },
    ]);
  });

  it("keeps [code] contents verbatim, trimmed of surrounding newlines", () => {
    expect(parseDText("[code]\n[b]not bold[/b]\n[/code]")).toEqual([
      { type: "code", text: "[b]not bold[/b]" },
    ]);
  });

  it("nests quotes", () => {
    const [outer] = parseDText("[quote]a[quote]b[/quote][/quote]");
    expect(outer.type).toBe("quote");
    const children = (outer as Extract<DBlock, { type: "quote" }>).children;
    expect(children.some((c) => c.type === "quote")).toBe(true);
  });

  it("parses [section] title and expanded flag", () => {
    expect(parseDText("[section=Rules,expanded]body[/section]")).toMatchObject([
      { type: "section", title: "Rules", expanded: true },
    ]);
    expect(parseDText("[section]body[/section]")).toMatchObject([
      { type: "section", title: null, expanded: false },
    ]);
  });

  it("lets an unclosed region consume the rest of the text", () => {
    expect(parseDText("[code]oops")).toEqual([{ type: "code", text: "oops" }]);
  });

  it("parses [list] items", () => {
    const [list] = parseDText("[list]\n[*]one\n[*]two\n[/list]");
    expect(list.type).toBe("list");
    expect((list as Extract<DBlock, { type: "list" }>).items).toHaveLength(2);
  });

  it("marks [spoiler] segments", () => {
    const [p] = parseDText("[spoiler]secret[/spoiler]");
    expect((p as Extract<DBlock, { type: "paragraph" }>).segments).toMatchObject([
      { spoiler: true },
    ]);
  });
});

describe("parseDText inline", () => {
  it("parses nested styling", () => {
    expect(inline("[b]bold [i]both[/i][/b]")).toMatchObject([
      {
        type: "styled",
        tag: "b",
        children: [
          { type: "text", text: "bold " },
          { type: "styled", tag: "i", children: [{ type: "text", text: "both" }] },
        ],
      },
    ]);
  });

  it("resolves relative named links against the site", () => {
    expect(inline('"the wiki":/wiki_pages/help')).toMatchObject([
      { type: "link", label: "the wiki", url: `${BASE}/wiki_pages/help` },
    ]);
  });

  it("parses wiki links with and without a label", () => {
    expect(inline("[[tag_what_not]]")).toMatchObject([{ type: "wiki", page: "tag_what_not" }]);
    expect(inline("[[tag_what_not|this]]")).toMatchObject([
      { type: "wiki", page: "tag_what_not", label: "this" },
    ]);
  });

  it("parses bare urls and mentions", () => {
    const nodes = inline("see https://example.com/x by @some_user");
    expect(nodes).toContainEqual(expect.objectContaining({ type: "link", url: "https://example.com/x" }));
    expect(nodes).toContainEqual({ type: "mention", name: "some_user" });
  });

  it("does not treat an email address as a mention", () => {
    expect(inline("mail me@example.com").some((n) => n.type === "mention")).toBe(false);
  });
});
