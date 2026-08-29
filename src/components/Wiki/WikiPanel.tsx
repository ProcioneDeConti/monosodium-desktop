import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, BookOpen, ExternalLink, Images, Search, X } from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME, SITE_WEB_BASE_URL } from "../../models/site";
import { numericTagCategory } from "../../models/user";
import { parseRelatedTags } from "../../models/wiki";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { formatCount } from "../../lib/formatCount";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { useTagAutocomplete } from "../../queries/useTagAutocomplete";
import { useTagInfoQuery, useTagRelationsQuery, useWikiPageQuery } from "../../queries/useWiki";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";

interface WikiPanelProps {
  site: Site;
  /** Optional tag to open on immediately. */
  initialTag?: string;
  onClose: () => void;
  onSearch: (query: string) => void;
}

/** Full-screen overlay: look up a tag's wiki page, post count, category, and its implication /
 *  alias relationships. `title_matches` on `wiki_pages.json` is unreliable, so lookup is by
 *  exact tag with the normal tag autocomplete in the input. */
export function WikiPanel({ site, initialTag = "", onClose, onSearch }: WikiPanelProps) {
  const [tag, setTag] = useState(initialTag.replace(/_/g, " ").trim());
  const [draft, setDraft] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);

  const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
  const { data: page, isLoading: pageLoading } = useWikiPageQuery(site, normalizedTag);
  const { data: info } = useTagInfoQuery(site, normalizedTag);
  const { data: relations } = useTagRelationsQuery(site, normalizedTag);

  const { data: suggestions } = useTagAutocomplete(site, draft);
  const debouncedDraft = useDebouncedValue(draft.trim(), 250);
  const shownSuggestions = useMemo(
    () => (debouncedDraft.length >= 2 ? (suggestions ?? []).slice(0, 8) : []),
    [suggestions, debouncedDraft],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function go(next: string) {
    setTag(next.replace(/_/g, " ").trim());
    setDraft("");
    setSuggestOpen(false);
  }

  const related = useMemo(
    () => (info?.related_tags ? parseRelatedTags(info.related_tags).filter((t) => t !== normalizedTag).slice(0, 24) : []),
    [info?.related_tags, normalizedTag],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <BookOpen size={15} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Wiki</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="relative shrink-0 border-b border-black/10 dark:border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30 px-2 py-1">
          <Search size={14} className="shrink-0 opacity-50" />
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) go(shownSuggestions[0]?.name ?? draft);
            }}
            placeholder="Look up a tag…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {suggestOpen && shownSuggestions.length > 0 && (
          <ul className="absolute left-3 right-3 z-20 mt-1 max-h-72 overflow-auto rounded-[var(--radius-md)] border border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(38,38,38)] shadow-lg">
            {shownSuggestions.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(s.name);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="truncate">{s.name.replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-xs opacity-50">{s.post_count.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4" onClick={() => setSuggestOpen(false)}>
        {!normalizedTag ? (
          <p className="py-10 text-center text-sm opacity-50">Type a tag above to see its wiki page.</p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{tag}</h2>
              {info && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: TAG_CATEGORY_STYLE[numericTagCategory(info.category)].chipBg,
                    color: TAG_CATEGORY_STYLE[numericTagCategory(info.category)].chipFg,
                  }}
                >
                  {TAG_CATEGORY_STYLE[numericTagCategory(info.category)].label}
                </span>
              )}
              {info && <span className="text-xs opacity-55">{formatCount(info.post_count)} posts</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSearch(normalizedTag)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <Images size={13} /> View posts
              </button>
              <button
                type="button"
                onClick={() => void openUrl(`${SITE_WEB_BASE_URL[site]}/wiki_pages/${encodeURIComponent(normalizedTag)}`)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ExternalLink size={12} /> Open on {SITE_DISPLAY_NAME[site]}
              </button>
            </div>

            {pageLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm opacity-60">
                <Spinner size={13} /> Loading…
              </div>
            ) : page ? (
              <Section title="Description">
                <DText text={page.body} site={site} className="text-sm leading-relaxed" />
              </Section>
            ) : (
              <p className="text-sm opacity-55">No wiki page for this tag.</p>
            )}

            {relations && relations.aliases.length > 0 && (
              <ChipSection title="Aliases (redirect here)" tags={relations.aliases} onPick={go} />
            )}
            {relations && relations.implies.length > 0 && (
              <ChipSection
                title="Implies"
                tags={relations.implies}
                onPick={go}
                note="Searching this tag also matches these."
              />
            )}
            {relations && relations.implied_by.length > 0 && (
              <ChipSection title="Implied by" tags={relations.implied_by} onPick={go} />
            )}
            {related.length > 0 && <ChipSection title="Frequently seen with" tags={related} onPick={go} />}
          </div>
        )}
      </div>
    </div>
  );
}

function ChipSection({
  title,
  tags,
  onPick,
  note,
}: {
  title: string;
  tags: string[];
  onPick: (tag: string) => void;
  note?: string;
}) {
  return (
    <Section title={title}>
      {note && <p className="mb-1.5 text-[11px] opacity-45">{note}</p>}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-xs hover:bg-[rgb(var(--accent))]/15 dark:bg-white/[0.06]"
          >
            {t.replace(/_/g, " ")}
            <ArrowRight size={10} className="opacity-40" />
          </button>
        ))}
      </div>
    </Section>
  );
}
