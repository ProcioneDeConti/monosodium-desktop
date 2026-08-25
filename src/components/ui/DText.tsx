import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { parseDText, type DBlock, type DInline, type DSegment } from "../../lib/dtext";
import { SITE_WEB_BASE_URL, type Site } from "../../models/site";

interface DTextProps {
  text: string;
  site: Site;
  className?: string;
}

/** Renders e621's lightweight DText markup (see lib/dtext.ts for the supported tag set) - used
 *  app-wide for anything the API returns as DText: comment bodies, a profile's about/artist-info,
 *  and a post's description. */
export function DText({ text, site, className = "" }: DTextProps) {
  const blocks = useMemo(() => parseDText(text, SITE_WEB_BASE_URL[site]), [text, site]);
  if (blocks.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

const HEADING_SIZE: Record<number, string> = {
  1: "text-lg",
  2: "text-base",
  3: "text-[15px]",
  4: "text-sm",
  5: "text-sm",
  6: "text-xs",
};

function Block({ block }: { block: DBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {block.segments.map((seg, i) => (
            <Segment key={i} segment={seg} />
          ))}
        </p>
      );
    case "heading":
      return (
        <p className={`${HEADING_SIZE[block.level] ?? "text-sm"} font-bold`}>
          {block.segments.map((seg, i) => (
            <Segment key={i} segment={seg} />
          ))}
        </p>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-black/30 px-2 py-1.5 font-mono text-xs">
          {block.text}
        </pre>
      );
    case "quote":
      return (
        <div className="flex flex-col gap-2 border-l-2 border-current/20 pl-2.5 opacity-90">
          {block.children.map((child, i) => (
            <Block key={i} block={child} />
          ))}
        </div>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-0.5">
          {block.items.map((segs, i) => (
            <li key={i} className="flex gap-1.5 whitespace-pre-wrap break-words leading-relaxed">
              <span className="opacity-50">•</span>
              <span>
                {segs.map((seg, j) => (
                  <Segment key={j} segment={seg} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      );
    case "section":
      return <SectionBlock block={block} />;
  }
}

/** A [section]/[section=Title] collapsible region - defaults open only when the source used the
 *  ,expanded flag, otherwise starts collapsed (click the header to reveal), same click-to-reveal
 *  spirit as [spoiler] above. */
function SectionBlock({ block }: { block: Extract<DBlock, { type: "section" }> }) {
  const [open, setOpen] = useState(block.expanded);
  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border border-current/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 bg-current/5 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-current/10"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="truncate">{block.title ?? "Details"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-2.5 py-2">
          {block.children.map((child, i) => (
            <Block key={i} block={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function Segment({ segment }: { segment: DSegment }) {
  const [revealed, setRevealed] = useState(false);
  const content = segment.nodes.map((node, i) => <Inline key={i} node={node} />);
  if (!segment.spoiler) return <>{content}</>;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => e.key === "Enter" && setRevealed(true)}
      title={revealed ? undefined : "Click to reveal"}
      className={revealed ? "" : "cursor-pointer rounded bg-current/10 blur-[5px] select-none transition-[filter]"}
    >
      {content}
    </span>
  );
}

function Inline({ node }: { node: DInline }) {
  switch (node.type) {
    case "text":
      return <>{node.text}</>;
    case "mention":
      return <span className="font-semibold text-[rgb(var(--accent))]">@{node.name}</span>;
    case "link":
      return (
        <button
          type="button"
          onClick={() => void openUrl(node.url)}
          className="text-[rgb(var(--accent))] underline decoration-[rgb(var(--accent))]/40 hover:opacity-80"
        >
          {node.label}
        </button>
      );
    case "styled":
      return <StyledInline tag={node.tag} children={node.children} />;
  }
}

function StyledInline({ tag, children }: { tag: string; children: DInline[] }) {
  const rendered = children.map((child, i) => <Inline key={i} node={child} />);
  switch (tag) {
    case "b":
      return <strong>{rendered}</strong>;
    case "i":
      return <em>{rendered}</em>;
    case "u":
      return <span className="underline">{rendered}</span>;
    case "s":
      return <span className="line-through">{rendered}</span>;
    case "sup":
      return <sup>{rendered}</sup>;
    case "sub":
      return <sub>{rendered}</sub>;
    case "tn":
      return <span className="text-[0.75em] opacity-80">{rendered}</span>;
    default:
      return <>{rendered}</>;
  }
}
