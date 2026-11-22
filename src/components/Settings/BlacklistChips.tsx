import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { e621Api } from "../../api/client";
import type { TagCategory } from "../../models/post";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { numericTagCategory } from "../../models/user";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { cacheTagCategory } from "../../lib/tagCategoryCache";

/** Names per tags.json lookup - keeps the comma-joined `search[name]` URL a sane length. */
const CHUNK = 100;

/** The blacklist draft as rows of category-colored chips (one row per line - tags on a row are
 *  ANDed, rows are ORed). Categories come from the site's tags.json in a few batched lookups
 *  (through the Rust rate limiter like every call), cached for the session. Editing here rewrites
 *  the same draft text the textarea edits, so Save/dirty/sync work identically in both views. */
export function BlacklistChips({
  site,
  draft,
  onChange,
}: {
  site: Site;
  draft: string;
  onChange: (text: string) => void;
}) {
  const rawLines = draft.split("\n");
  const rows = rawLines
    .map((line, index) => ({ index, tokens: line.trim().split(/\s+/).filter(Boolean) }))
    .filter((r) => r.tokens.length > 0);

  // Every plain tag name (negation stripped; metatags and wildcards can't be looked up).
  const names = useMemo(() => {
    const set = new Set<string>();
    for (const line of draft.split("\n")) {
      for (const t of line.trim().toLowerCase().split(/\s+/)) {
        const name = t.replace(/^[-~]/, "");
        if (name && !isMetatag(name) && !name.includes("*")) set.add(name);
      }
    }
    return [...set].sort();
  }, [draft]);

  const chunks = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < names.length; i += CHUNK) out.push(names.slice(i, i + CHUNK));
    return out;
  }, [names]);

  const results = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ["blacklistTagCategories", site, chunk],
      queryFn: async () => {
        const tags = await e621Api.getTagsByNames(site, chunk);
        const map: Record<string, TagCategory> = {};
        for (const t of tags) {
          const category = numericTagCategory(t.category);
          map[t.name] = category;
          cacheTagCategory(t.name, category);
        }
        return map;
      },
      staleTime: 30 * 60_000,
      // Adding one line re-chunks the list, so keep earlier answers on screen meanwhile.
      placeholderData: (prev: Record<string, TagCategory> | undefined) => prev,
    })),
  });

  const categories: Record<string, TagCategory> = {};
  for (const r of results) Object.assign(categories, r.data);
  const loaded = results.every((r) => r.isSuccess && !r.isPlaceholderData);

  function removeLine(index: number) {
    onChange(rawLines.filter((_, i) => i !== index).join("\n"));
  }

  function removeToken(index: number, token: number) {
    const tokens = rawLines[index].trim().split(/\s+/);
    tokens.splice(token, 1);
    if (tokens.length === 0) return removeLine(index);
    onChange(rawLines.map((l, i) => (i === index ? tokens.join(" ") : l)).join("\n"));
  }

  const [adding, setAdding] = useState("");
  function addLine() {
    const line = adding.trim().replace(/\s+/g, " ");
    if (!line) return;
    onChange(draft.trim() === "" ? line : `${draft.replace(/\s+$/, "")}\n${line}`);
    setAdding("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Legend />
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto rounded-[var(--radius-sm)] border border-black/10 bg-white/60 p-2 dark:border-white/10 dark:bg-black/30">
        {rows.length === 0 && <div className="px-1 py-2 text-xs opacity-50">No lines yet - add one below.</div>}
        {rows.map((row) => (
          <div key={row.index} className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {row.tokens.map((token, ti) => (
                <Chip
                  key={ti}
                  token={token}
                  category={categories[token.replace(/^[-~]/, "").toLowerCase()]}
                  unknownOn={loaded ? SITE_DISPLAY_NAME[site] : null}
                  onRemove={row.tokens.length > 1 ? () => removeToken(row.index, ti) : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => removeLine(row.index)}
              title="Remove this line"
              aria-label="Remove this line"
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-60 hover:!opacity-100 focus-visible:opacity-100 dark:hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLine();
            }
          }}
          spellCheck={false}
          placeholder="Add a line, e.g. young -age_difference"
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-black/10 bg-white/60 px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] dark:border-white/10 dark:bg-black/30"
        />
        <button
          type="button"
          onClick={addLine}
          disabled={!adding.trim()}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-black/[0.06] px-2.5 py-1.5 text-xs font-medium hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/15"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

/** e621ng metatags a blacklist line can use (`rating:e`, `score:<0`, `user:name`, ...). */
const METATAGS = /^(rating|score|favcount|id|user|fav|type|status|width|height|filesize|tagcount|gentags|arttags|chartags|copytags|spectags|invtags|lortags|metatags|parent|pool|source|md5|date|order|ratio|duration|upvote|downvote|approver|commenter|noter|description|inpool|ischild|isparent|pending_replacements|artverified|limit)[:<>=]/;

function isMetatag(name: string): boolean {
  return METATAGS.test(name);
}

const LEGEND: TagCategory[] = ["artist", "copyright", "character", "species", "general"];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] opacity-70">
      {LEGEND.map((c) => (
        <span key={c} className="flex items-center gap-1">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isNeutral(c) ? "bg-black/20 dark:bg-white/30" : ""}`}
            style={isNeutral(c) ? undefined : { background: TAG_CATEGORY_STYLE[c].chipBg }}
          />
          {c === "general" ? "General / other" : TAG_CATEGORY_STYLE[c].label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-current" />
        Metatag / wildcard
      </span>
    </div>
  );
}

/** general/lore/meta/contributor share the neutral chip; theirs is translucent white, made for
 *  the dark viewer - here it uses theme-aware classes so it reads in light mode too. */
function isNeutral(category: TagCategory): boolean {
  return TAG_CATEGORY_STYLE[category].headerColor === null;
}

function Chip({
  token,
  category,
  unknownOn,
  onRemove,
}: {
  token: string;
  category: TagCategory | undefined;
  /** Site name once lookups finished - a plain tag with no category then isn't a tag there. */
  unknownOn: string | null;
  onRemove?: () => void;
}) {
  const negated = token.startsWith("-");
  const name = token.replace(/^[-~]/, "");
  const special = isMetatag(name.toLowerCase()) || name.includes("*");
  const unknown = !special && !category && unknownOn !== null;
  const colored = category && !isNeutral(category);

  const title = special
    ? "Metatag / wildcard"
    : category
      ? TAG_CATEGORY_STYLE[category].label.replace(/s$/, "")
      : unknown
        ? `Not a tag on ${unknownOn} - check the spelling`
        : "Looking up…";

  return (
    <span
      title={negated ? `${title} - excluded (posts with this tag are NOT hidden by this line)` : title}
      className={`inline-flex max-w-full items-center gap-0.5 rounded-full py-0.5 pl-2 text-xs font-medium ${onRemove ? "pr-1" : "pr-2"} ${
        special || unknown
          ? `border border-dashed ${unknown ? "border-red-500/70 text-red-600 dark:text-red-400" : "border-current opacity-80"}`
          : colored
            ? ""
            : "bg-black/[0.07] dark:bg-white/15"
      } ${negated ? "line-through decoration-2" : ""}`}
      style={colored ? { background: TAG_CATEGORY_STYLE[category].chipBg, color: TAG_CATEGORY_STYLE[category].chipFg } : undefined}
    >
      <span className="truncate">{negated ? `-${name}` : token}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove this tag from the line"
          aria-label={`Remove ${token}`}
          className="ml-0.5 rounded-full p-0.5 opacity-60 hover:bg-black/15 hover:opacity-100"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}
