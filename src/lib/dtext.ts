// A TypeScript port of the reference Android app's DText parser
// (data/dtext/DText.kt) - e621's lightweight BBCode-like comment/profile/description markup.
// Deliberately matches that file's own documented scope, not full DText: no tables, no
// [color], no post/comment (`>>123`) reference syntax. [section] is a deliberate addition on
// top of the reference app's scope - it shows up routinely in real content the reference app
// never has to render (moderator feedback-record dmails quoting the Code of Conduct being the
// motivating case), so skipping it left common real messages rendering with literal, unparsed
// brackets.
//
// Supported syntax:
//   h1. .. h6.                    heading lines (whole trimmed line)
//   [quote]...[/quote]            nestable, scanned anywhere in the text
//   [code]...[/code]              not nestable, monospace, trimmed of leading/trailing newlines
//   [section]...[/section]        nestable, collapsible; optional =Title and/or ,expanded
//   [list] [*]item [/list]        bullet list ([*] or a bare * prefix per line)
//   [spoiler]...[/spoiler]        tap-to-reveal, applied per paragraph/heading/list-item segment
//   [b] [i] [u] [s] [sup] [sub] [tn]   inline styling, nestable, closed by [/tag]
//   "label":url                   named link (relative urls resolved against the site's web host)
//   [[page]] / [[page|label]]     wiki link
//   https://...                   bare url
//   @name                         mention (styled only, not a link)

export type DInline =
  | { type: "text"; text: string }
  | { type: "styled"; tag: string; children: DInline[] }
  | { type: "link"; label: string; url: string }
  | { type: "wiki"; label: string; page: string; url: string }
  | { type: "mention"; name: string };

export interface DSegment {
  spoiler: boolean;
  nodes: DInline[];
}

export type DBlock =
  | { type: "paragraph"; segments: DSegment[] }
  | { type: "heading"; level: number; segments: DSegment[] }
  | { type: "code"; text: string }
  | { type: "quote"; children: DBlock[] }
  | { type: "section"; title: string | null; expanded: boolean; children: DBlock[] }
  | { type: "list"; items: DSegment[][] };

const STYLE_TAGS = new Set(["b", "i", "u", "s", "sup", "sub", "tn"]);
const HEADING_RE = /^h([1-6])\.\s*(.*)$/;
const STYLE_OPEN_RE = /\[(b|i|u|s|sup|sub|tn)\]/i;
const NAMED_LINK_RE = /"([^"\n]+)":(\S+)/;
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;
const BARE_URL_RE = /https?:\/\/\S+/;
const MENTION_RE = /(?<![\w@])@([A-Za-z0-9_-]+)/;
/** `[section]`, `[section=Title]`, `[section,expanded]`, `[section=Title,expanded]`. */
const SECTION_OPEN_RE = /\[section(?:=([^,\]]*))?(,expanded)?\]/i;

export function parseDText(text: string, webBaseUrl = ""): DBlock[] {
  const blocks: DBlock[] = [];
  for (const chunk of splitBlockTags(text)) {
    if (chunk.kind === "code") {
      blocks.push({ type: "code", text: chunk.content.replace(/^\n+|\n+$/g, "") });
    } else if (chunk.kind === "quote") {
      blocks.push({ type: "quote", children: parseDText(chunk.content, webBaseUrl) });
    } else if (chunk.kind === "section") {
      blocks.push({
        type: "section",
        title: chunk.title,
        expanded: chunk.expanded,
        children: parseDText(chunk.content, webBaseUrl),
      });
    } else {
      blocks.push(...parseTextBlocks(chunk.content, webBaseUrl));
    }
  }
  return blocks;
}

type Chunk =
  | { kind: "text"; content: string }
  | { kind: "quote"; content: string }
  | { kind: "code"; content: string }
  | { kind: "section"; title: string | null; expanded: boolean; content: string };

/** Top-level scan for [quote]/[code]/[section] regions anywhere in the text - not line-anchored.
 *  Quote and section both nest (depth-tracked, matched by tag prefix since [section]'s opening
 *  form varies with its optional =Title/,expanded); code does not. An unclosed region consumes
 *  the rest of the text. */
function splitBlockTags(text: string): Chunk[] {
  const result: Chunk[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const quoteIdx = text.indexOf("[quote]", i);
    const codeIdx = text.indexOf("[code]", i);
    const sectionMatch = matchFrom(SECTION_OPEN_RE, text, i);
    const sectionIdx = sectionMatch ? sectionMatch.index : -1;

    const indices = [quoteIdx, codeIdx, sectionIdx].filter((n) => n !== -1);
    if (indices.length === 0) {
      result.push({ kind: "text", content: text.slice(i) });
      break;
    }
    const startIdx = Math.min(...indices);

    if (startIdx > i) result.push({ kind: "text", content: text.slice(i, startIdx) });

    if (startIdx === codeIdx) {
      const closeIdx = text.indexOf("[/code]", startIdx + 6);
      if (closeIdx === -1) {
        result.push({ kind: "code", content: text.slice(startIdx + 6) });
        i = text.length;
      } else {
        result.push({ kind: "code", content: text.slice(startIdx + 6, closeIdx) });
        i = closeIdx + 7;
      }
    } else if (startIdx === sectionIdx) {
      const openLen = sectionMatch![0].length;
      const title = sectionMatch![1]?.trim() || null;
      const expanded = !!sectionMatch![2];
      let depth = 1;
      let j = startIdx + openLen;
      let closeIdx = -1;
      while (j < text.length) {
        const nextOpen = lower.indexOf("[section", j);
        const nextClose = lower.indexOf("[/section]", j);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          j = nextOpen + 8;
        } else {
          depth--;
          if (depth === 0) {
            closeIdx = nextClose;
            break;
          }
          j = nextClose + 10;
        }
      }
      if (closeIdx === -1) {
        result.push({ kind: "section", title, expanded, content: text.slice(startIdx + openLen) });
        i = text.length;
      } else {
        result.push({ kind: "section", title, expanded, content: text.slice(startIdx + openLen, closeIdx) });
        i = closeIdx + 10;
      }
    } else {
      let depth = 1;
      let j = startIdx + 7;
      let closeIdx = -1;
      while (j < text.length) {
        const nextOpen = text.indexOf("[quote]", j);
        const nextClose = text.indexOf("[/quote]", j);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          j = nextOpen + 7;
        } else {
          depth--;
          if (depth === 0) {
            closeIdx = nextClose;
            break;
          }
          j = nextClose + 8;
        }
      }
      if (closeIdx === -1) {
        result.push({ kind: "quote", content: text.slice(startIdx + 7) });
        i = text.length;
      } else {
        result.push({ kind: "quote", content: text.slice(startIdx + 7, closeIdx) });
        i = closeIdx + 8;
      }
    }
  }
  return result;
}

/** RegExp.prototype.exec anchored to search from a given index, without needing the caller to
 *  manage a stateful global regex's `lastIndex` across calls. */
function matchFrom(re: RegExp, text: string, from: number): RegExpExecArray | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  g.lastIndex = from;
  return g.exec(text);
}

/** Line-oriented pass over a quote/code-free chunk: blank-line-separated paragraphs, `hN.`
 *  heading lines, and `[list]`/`[/list]` regions. */
function parseTextBlocks(text: string, webBaseUrl: string): DBlock[] {
  const lines = text.split("\n");
  const blocks: DBlock[] = [];
  let paraLines: string[] = [];
  let i = 0;

  function flushParagraph() {
    const joined = paraLines.join("\n").trim();
    paraLines = [];
    if (joined) blocks.push({ type: "paragraph", segments: splitSpoilerSegments(joined, webBaseUrl) });
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const heading = HEADING_RE.exec(trimmed);

    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: Number(heading[1]),
        segments: splitSpoilerSegments(heading[2], webBaseUrl),
      });
      i++;
    } else if (trimmed === "[list]") {
      flushParagraph();
      i++;
      const items: DSegment[][] = [];
      while (i < lines.length && lines[i].trim() !== "[/list]") {
        const itemLine = lines[i].trim();
        if (itemLine !== "") {
          const stripped = itemLine.startsWith("[*]")
            ? itemLine.slice(3).trim()
            : itemLine.startsWith("*")
              ? itemLine.slice(1).trim()
              : itemLine;
          items.push(splitSpoilerSegments(stripped, webBaseUrl));
        }
        i++;
      }
      if (i < lines.length) i++; // skip [/list]
      blocks.push({ type: "list", items });
    } else if (trimmed === "") {
      flushParagraph();
      i++;
    } else {
      paraLines.push(lines[i]);
      i++;
    }
  }
  flushParagraph();
  return blocks;
}

/** Splits a paragraph/heading/list-item's text on [spoiler]...[/spoiler] boundaries so each
 *  spoiler run can be independently revealed. An unclosed spoiler swallows the rest. */
function splitSpoilerSegments(text: string, webBaseUrl: string): DSegment[] {
  const segments: DSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const openIdx = text.indexOf("[spoiler]", i);
    if (openIdx === -1) {
      const rest = text.slice(i);
      if (rest) segments.push({ spoiler: false, nodes: parseInline(rest, webBaseUrl) });
      break;
    }
    if (openIdx > i) {
      segments.push({ spoiler: false, nodes: parseInline(text.slice(i, openIdx), webBaseUrl) });
    }
    const closeIdx = text.indexOf("[/spoiler]", openIdx + 9);
    if (closeIdx === -1) {
      segments.push({ spoiler: true, nodes: parseInline(text.slice(openIdx + 9), webBaseUrl) });
      i = text.length;
    } else {
      segments.push({ spoiler: true, nodes: parseInline(text.slice(openIdx + 9, closeIdx), webBaseUrl) });
      i = closeIdx + 10;
    }
  }
  if (segments.length === 0) segments.push({ spoiler: false, nodes: [] });
  return segments;
}

interface Candidate {
  index: number;
  make: () => DInline;
  rest: string;
}

/** Regex-priority inline scan: whichever pattern matches earliest in the remaining text wins,
 *  consumes its match, and the loop resumes on what's left. */
function parseInline(text: string, webBaseUrl: string): DInline[] {
  const nodes: DInline[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const candidates: Candidate[] = [];

    const styleMatch = STYLE_OPEN_RE.exec(remaining);
    if (styleMatch) {
      const tag = styleMatch[1].toLowerCase();
      const openEnd = styleMatch.index + styleMatch[0].length;
      const closeMatch = new RegExp(`\\[/${tag}\\]`, "i").exec(remaining.slice(openEnd));
      if (closeMatch && STYLE_TAGS.has(tag)) {
        const innerStart = openEnd;
        const innerEnd = openEnd + closeMatch.index;
        const afterEnd = innerEnd + closeMatch[0].length;
        candidates.push({
          index: styleMatch.index,
          make: () => ({ type: "styled", tag, children: parseInline(remaining.slice(innerStart, innerEnd), webBaseUrl) }),
          rest: remaining.slice(afterEnd),
        });
      }
    }

    const linkMatch = NAMED_LINK_RE.exec(remaining);
    if (linkMatch) {
      const label = linkMatch[1];
      const target = linkMatch[2];
      candidates.push({
        index: linkMatch.index,
        make: () => ({ type: "link", label, url: resolveUrl(target, webBaseUrl) }),
        rest: remaining.slice(linkMatch.index + linkMatch[0].length),
      });
    }

    const wikiMatch = WIKI_LINK_RE.exec(remaining);
    if (wikiMatch) {
      const page = wikiMatch[1];
      const display = wikiMatch[2] ?? wikiMatch[1];
      candidates.push({
        index: wikiMatch.index,
        make: () => ({
          type: "wiki",
          label: display,
          page: page.trim(),
          url: wikiPageUrl(page, webBaseUrl),
        }),
        rest: remaining.slice(wikiMatch.index + wikiMatch[0].length),
      });
    }

    const urlMatch = BARE_URL_RE.exec(remaining);
    if (urlMatch) {
      const url = urlMatch[0];
      candidates.push({
        index: urlMatch.index,
        make: () => ({ type: "link", label: url, url }),
        rest: remaining.slice(urlMatch.index + urlMatch[0].length),
      });
    }

    const mentionMatch = MENTION_RE.exec(remaining);
    if (mentionMatch) {
      const name = mentionMatch[1];
      candidates.push({
        index: mentionMatch.index,
        make: () => ({ type: "mention", name }),
        rest: remaining.slice(mentionMatch.index + mentionMatch[0].length),
      });
    }

    if (candidates.length === 0) {
      nodes.push({ type: "text", text: remaining });
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const winner = candidates[0];
    if (winner.index > 0) nodes.push({ type: "text", text: remaining.slice(0, winner.index) });
    nodes.push(winner.make());
    remaining = winner.rest;
  }

  return nodes;
}

function resolveUrl(url: string, webBaseUrl: string): string {
  return url.startsWith("/") ? `${webBaseUrl}${url}` : url;
}

function wikiPageUrl(page: string, webBaseUrl: string): string {
  const title = encodeURIComponent(page.trim().replace(/\s+/g, "_"));
  return `${webBaseUrl}/wiki_pages/show_or_new?title=${title}`;
}
