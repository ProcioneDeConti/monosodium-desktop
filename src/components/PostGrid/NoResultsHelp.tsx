import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, SearchX, X } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Post } from "../../models/post";
import type { Site } from "../../models/site";
import type { BlacklistEntries } from "../../lib/blacklist";
import {
  blacklistCulprits,
  dropSuggestions,
  lookupNames,
  withoutTerm,
  type DropSuggestion,
} from "../../lib/emptyState";
import { formatCount } from "../../lib/formatCount";
import { EmptyState } from "../ui/EmptyState";
import { mascotReact } from "../../state/mascotStore";
import { Button } from "../ui/Button";

/** At most this many "drop a term" buttons - past that it's a wall, not a suggestion. */
const MAX_DROP_BUTTONS = 4;
const MAX_CULPRITS = 3;

function reasonText(s: DropSuggestion): string | null {
  if (s.reason === "unknown") return "no such tag";
  if (s.reason === "rare") return `only ${formatCount(s.count ?? 0)} post${s.count === 1 ? "" : "s"}`;
  return null;
}

/** "No posts matched": one tags.json lookup (all names in a single request, so a single
 *  rate-limiter token) flags typo'd and rare tags, then offers one-click searches without each
 *  term, likeliest culprit first. Degrades to plain drop buttons if the lookup fails. */
export function NoResultsHelp({
  site,
  query,
  onSearch,
}: {
  site: Site;
  query: string;
  onSearch: (query: string) => void;
}) {
  const names = useMemo(() => lookupNames(query), [query]);
  const { data: tags, isFetched } = useQuery({
    queryKey: ["tagsByNames", site, names],
    queryFn: () => e621Api.getTagsByNames(site, names),
    enabled: names.length > 0,
    staleTime: 5 * 60_000,
  });
  const suggestions = useMemo(() => dropSuggestions(query, tags), [query, tags]);
  const unknown = suggestions.filter((s) => s.reason === "unknown");
  const canDrop = suggestions.length > 1;

  // One reaction per empty search, once we know whether a typo is the reason.
  const reacted = useRef(false);
  useEffect(() => {
    if (reacted.current || (names.length > 0 && !isFetched)) return;
    reacted.current = true;
    mascotReact(unknown.length > 0 ? "unknownTag" : "emptySearch");
  }, [names.length, isFetched, unknown.length]);

  const hint =
    unknown.length > 0
      ? `${unknown.map((s) => `“${s.term}”`).join(", ")} ${unknown.length === 1 ? "isn't a tag" : "aren't tags"} on this site - check the spelling.`
      : canDrop
        ? "Every tag has to match at once. Try without one of these:"
        : query.trim()
          ? "Try a more general tag, or check your spelling."
          : "Your rating filters may be excluding everything - check Settings.";

  return (
    <EmptyState
      mascot="sad"
      icon={<SearchX />}
      title="No posts matched"
      hint={hint}
      action={
        canDrop && (
          <div className="flex max-w-md flex-wrap justify-center gap-1.5">
            {suggestions.slice(0, MAX_DROP_BUTTONS).map((s) => {
              const why = reasonText(s);
              return (
                <Button
                  key={s.term}
                  icon={<X size={12} />}
                  onClick={() => onSearch(withoutTerm(query, s.term))}
                  title={`Search for “${withoutTerm(query, s.term)}”`}
                >
                  <span className="font-mono">{s.term}</span>
                  {why && <span className="font-normal opacity-60">· {why}</span>}
                </Button>
              );
            })}
          </div>
        )
      }
    />
  );
}

/** "Every result is blacklisted": names the blacklist lines doing the hiding (with how many
 *  each), plus a one-click "show them anyway" that flips the View-menu toggle. */
export function BlacklistedResultsHelp({
  posts,
  entries,
  onShowBlacklisted,
}: {
  posts: Post[];
  entries: BlacklistEntries;
  onShowBlacklisted?: () => void;
}) {
  const culprits = useMemo(() => blacklistCulprits(entries, posts), [entries, posts]);
  const shown = culprits.slice(0, MAX_CULPRITS);
  const more = culprits.length - shown.length;
  return (
    <EmptyState
      mascot="sad"
      icon={<EyeOff />}
      title={`All ${posts.length} result${posts.length === 1 ? "" : "s"} are hidden by your blacklist`}
      hint={
        shown.length > 0 ? (
          <>
            Hidden by{" "}
            {shown.map((c, i) => (
              <span key={c.line}>
                {i > 0 && (i === shown.length - 1 && more === 0 ? " and " : ", ")}
                <span className="font-mono font-semibold opacity-100">{c.line}</span> ({c.count})
              </span>
            ))}
            {more > 0 && ` and ${more} more line${more === 1 ? "" : "s"}`}. Loosen these in Settings, or:
          </>
        ) : (
          "Loosen the blacklist in Settings, or:"
        )
      }
      action={
        onShowBlacklisted && (
          <Button icon={<Eye size={12} />} onClick={onShowBlacklisted}>
            Show them anyway
          </Button>
        )
      }
    />
  );
}
