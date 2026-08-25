import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { parseDText, type DBlock, type DInline, type DSegment } from "../../lib/dtext";
import { SITE_WEB_BASE_URL, type Site } from "../../models/site";
import { useWikiPageQuery } from "../../queries/useWikiPageQuery";
import { Spinner } from "./Spinner";

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
        <Block key={i} block={block} site={site} />
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

function Block({ block, site }: { block: DBlock; site: Site }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {block.segments.map((seg, i) => (
            <Segment key={i} segment={seg} site={site} />
          ))}
        </p>
      );
    case "heading":
      return (
        <p className={`${HEADING_SIZE[block.level] ?? "text-sm"} font-bold`}>
          {block.segments.map((seg, i) => (
            <Segment key={i} segment={seg} site={site} />
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
            <Block key={i} block={child} site={site} />
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
                  <Segment key={j} segment={seg} site={site} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      );
    case "section":
      return <SectionBlock block={block} site={site} />;
  }
}

/** A [section]/[section=Title] collapsible region - defaults open only when the source used the
 *  ,expanded flag, otherwise starts collapsed (click the header to reveal), same click-to-reveal
 *  spirit as [spoiler] above. */
function SectionBlock({ block, site }: { block: Extract<DBlock, { type: "section" }>; site: Site }) {
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
            <Block key={i} block={child} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}

function Segment({ segment, site }: { segment: DSegment; site: Site }) {
  const [revealed, setRevealed] = useState(false);
  const content = segment.nodes.map((node, i) => <Inline key={i} node={node} site={site} />);
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

function Inline({ node, site }: { node: DInline; site: Site }) {
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
    case "wiki":
      return <WikiLink label={node.label} page={node.page} url={node.url} site={site} />;
    case "styled":
      return <StyledInline tag={node.tag} children={node.children} site={site} />;
  }
}

/** Click-to-preview [[wiki]] link - a popover with the target page's own DText-rendered body
 *  (fetched only once opened, see useWikiPageQuery.ts), rather than always leaving the app to
 *  open a browser tab the way a plain link does. Falls back to "Open in browser" if the page
 *  doesn't exist or failed to load. */
function WikiLink({ label, page, url, site }: { label: string; page: string; url: string; site: Site }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const { data: wikiPage, isLoading, isError } = useWikiPageQuery(site, page, open);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[rgb(var(--accent))] underline decoration-dotted decoration-[rgb(var(--accent))]/50 hover:opacity-80"
      >
        {label}
      </button>
      {open && (
        <span
          className="absolute left-0 top-full z-20 mt-1 block w-72 max-w-[80vw] animate-[scale-in_100ms_ease-out]
                     origin-top-left rounded-[var(--radius-md)] border border-black/10 dark:border-white/10
                     bg-[rgb(250,250,250)] dark:bg-[rgb(28,28,28)] p-3 text-left text-xs normal-case not-italic
                     no-underline shadow-xl shadow-black/20"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 opacity-60">
              <Spinner size={13} />
              Loading…
            </span>
          ) : isError || !wikiPage ? (
            <span className="opacity-60">No wiki page found.</span>
          ) : (
            <span className="block max-h-64 overflow-y-auto">
              <DText text={wikiPage.body} site={site} />
            </span>
          )}
          <button
            type="button"
            onClick={() => void openUrl(url)}
            className="mt-2 flex items-center gap-1 text-[11px] text-[rgb(var(--accent))] hover:underline"
          >
            <ExternalLink size={11} />
            Open in browser
          </button>
        </span>
      )}
    </span>
  );
}

function StyledInline({ tag, children, site }: { tag: string; children: DInline[]; site: Site }) {
  const rendered = children.map((child, i) => <Inline key={i} node={child} site={site} />);
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
