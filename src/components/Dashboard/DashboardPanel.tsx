import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowBigDown,
  ArrowBigUp,
  BarChart3,
  Clock,
  Database,
  Download,
  Eye,
  Gauge,
  Heart,
  Play,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME } from "../../models/site";
import { uploadKarmaProgress } from "../../models/user";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { dayKey, lastNDayKeys, useStatsStore } from "../../state/statsStore";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { formatBytes, formatDuration, formatMinutes } from "../../lib/formatBytes";
import { formatCount } from "../../lib/formatCount";
import { modalOpen } from "../../lib/modalStack";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Section } from "../ui/Section";
import { Heatmap, SplitBar, StatTile } from "./charts";
import { FavoritesAnalysisRunner } from "./FavoritesAnalysisRunner";
import { OtherUserAnalysis } from "./OtherUserAnalysis";

interface DashboardPanelProps {
  site: Site;
  onClose: () => void;
  onSearch: (query: string) => void;
}

type HeatMetric = "postsViewed" | "activeMs" | "apiCalls";

const HEAT_METRICS: { key: HeatMetric; label: string; unit: string }[] = [
  { key: "postsViewed", label: "Posts viewed", unit: "posts" },
  { key: "activeMs", label: "Active time", unit: "min" },
  { key: "apiCalls", label: "API calls", unit: "calls" },
];

function prettyDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function topEntries(map: Record<string, number>, n: number): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function DashboardPanel({ site, onClose, onSearch }: DashboardPanelProps) {
  const lifetime = useStatsStore((s) => s.lifetime);
  const perSite = useStatsStore((s) => s.perSite);
  const daily = useStatsStore((s) => s.daily);
  const firstLaunch = useStatsStore((s) => s.firstLaunch);
  const searchTermCounts = useStatsStore((s) => s.searchTermCounts);
  const viewedTags = useStatsStore((s) => s.viewedTags);
  const resetStats = useStatsStore((s) => s.reset);

  const usageStatsEnabled = useSettingsStore((s) => s.usageStatsEnabled);
  const setUsageStatsEnabled = useSettingsStore((s) => s.setUsageStatsEnabled);

  const username = useAccountStore((s) => s.accounts[site]?.username) ?? null;
  const { data: profile } = useUserProfileQuery(site, "me", !!username);

  const [heatMetric, setHeatMetric] = useState<HeatMetric>("postsViewed");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !modalOpen()) onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const daysUsing = firstLaunch
    ? Math.max(1, Math.floor((Date.now() - firstLaunch) / 86_400_000) + 1)
    : 0;
  const avgSessionMs = lifetime.sessions > 0 ? lifetime.activeMs / lifetime.sessions : 0;

  const heatDays = useMemo(
    () =>
      lastNDayKeys(119)
        .reverse()
        .map((date) => {
          const raw = daily[date]?.[heatMetric] ?? 0;
          const value = heatMetric === "activeMs" ? Math.round(raw / 60_000) : raw;
          return { date, value, label: prettyDay(date) };
        }),
    [daily, heatMetric],
  );

  const heatUnit = HEAT_METRICS.find((m) => m.key === heatMetric)!.unit;

  const topSearched = topEntries(searchTermCounts, 18);
  const topArtists = topEntries(viewedTags.artist, 14);
  const topChars = topEntries(viewedTags.character, 14);
  const hasTagData = topSearched.length > 0 || topArtists.length > 0 || topChars.length > 0;

  const dataUsedEst = lifetime.mediaBytesEst + lifetime.apiResponseBytes + lifetime.downloadBytes;

  const karma = profile?.upload_karma ?? null;
  const karmaProgress = karma != null ? uploadKarmaProgress(karma) : null;

  // Stable object so the runner's resolve effect doesn't re-fire on every dashboard re-render.
  const knownSelf = useMemo(
    () =>
      profile
        ? {
            id: profile.id,
            name: profile.name,
            favoriteCount: profile.favorite_count,
            avatarId: profile.avatar_id,
          }
        : undefined,
    [profile],
  );

  function runSearch(q: string) {
    onSearch(q);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <BarChart3 size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
          {firstLaunch && (
            <p className="mb-4 text-xs opacity-55">
              Using Monosodium Desktop for <span className="font-semibold opacity-100">{daysUsing}</span>{" "}
              {daysUsing === 1 ? "day" : "days"} · since {prettyDay(dayKey(new Date(firstLaunch)))}
            </p>
          )}

          {/* Overview */}
          <Section title="Overview">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile
                icon={<Clock size={13} />}
                label="Time in app"
                value={formatDuration(lifetime.activeMs)}
                sub={
                  lifetime.sessions > 0
                    ? `${lifetime.sessions} sessions · avg ${formatMinutes(avgSessionMs)}`
                    : "this device"
                }
              />
              <StatTile
                icon={<Eye size={13} />}
                label="Posts viewed"
                value={lifetime.postsViewed.toLocaleString()}
                sub={`${lifetime.uniquePostsViewed.toLocaleString()} unique`}
              />
              <StatTile
                icon={<Search size={13} />}
                label="Searches"
                value={lifetime.searches.toLocaleString()}
                sub={`${Object.keys(searchTermCounts).length} distinct tags`}
              />
              <StatTile
                icon={<Activity size={13} />}
                label="API calls"
                value={lifetime.apiCalls.toLocaleString()}
                sub={`${formatBytes(lifetime.apiResponseBytes)} received`}
              />
              <StatTile
                icon={<Database size={13} />}
                label="Data used"
                value={`≈ ${formatBytes(dataUsedEst)}`}
                sub="estimated"
              />
              <StatTile
                icon={<Download size={13} />}
                label="Downloads"
                value={lifetime.downloads.toLocaleString()}
                sub={formatBytes(lifetime.downloadBytes)}
              />
              <StatTile
                icon={<Heart size={13} />}
                label="Favorites"
                value={`+${lifetime.favoritesAdded.toLocaleString()}`}
                sub={`−${lifetime.favoritesRemoved.toLocaleString()} removed`}
              />
              <StatTile
                icon={<ArrowBigUp size={13} />}
                label="Votes cast"
                value={
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      <ArrowBigUp size={15} className="opacity-70" />
                      {lifetime.votesUp.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ArrowBigDown size={15} className="opacity-70" />
                      {lifetime.votesDown.toLocaleString()}
                    </span>
                  </span>
                }
              />
              <StatTile
                icon={<Play size={13} />}
                label="Slideshow"
                value={formatDuration(lifetime.slideshowMs)}
              />
            </div>
          </Section>

          {/* Activity */}
          <Section title="Activity — last 120 days">
            <div className="mb-3 flex flex-wrap gap-1">
              {HEAT_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setHeatMetric(m.key)}
                  className={`rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold transition-colors ${
                    heatMetric === m.key
                      ? "bg-[rgb(var(--accent))] text-white"
                      : "bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Heatmap days={heatDays} unit={heatUnit} />

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">
                Posts viewed by site
              </div>
              <SplitBar
                segments={[
                  { label: SITE_DISPLAY_NAME.e621, value: perSite.e621.postsViewed },
                  { label: SITE_DISPLAY_NAME.e6ai, value: perSite.e6ai.postsViewed },
                ]}
              />
            </div>
          </Section>

          {/* Your tags */}
          {hasTagData && (
            <Section title="Your tags">
              {topSearched.length > 0 && (
                <TagCloud
                  title="Most searched"
                  entries={topSearched}
                  bg="rgb(var(--accent) / 0.14)"
                  fg="rgb(var(--accent))"
                  onPick={(t) => runSearch(t)}
                />
              )}
              {topArtists.length > 0 && (
                <TagCloud
                  title="Most viewed artists"
                  entries={topArtists}
                  bg={TAG_CATEGORY_STYLE.artist.chipBg}
                  fg={TAG_CATEGORY_STYLE.artist.chipFg}
                  onPick={(t) => runSearch(t)}
                />
              )}
              {topChars.length > 0 && (
                <TagCloud
                  title="Most viewed characters"
                  entries={topChars}
                  bg={TAG_CATEGORY_STYLE.character.chipBg}
                  fg={TAG_CATEGORY_STYLE.character.chipFg}
                  onPick={(t) => runSearch(t)}
                />
              )}
            </Section>
          )}

          {/* Favorites analysis */}
          {username && (
            <Section title="Your favorites analysis">
              <FavoritesAnalysisRunner
                site={site}
                userRef={profile?.name ?? username}
                known={knownSelf}
                onSearchTag={runSearch}
              />
            </Section>
          )}

          {/* Analyze another user */}
          <Section title="Analyze another user">
            <OtherUserAnalysis site={site} onSearchTag={runSearch} />
          </Section>

          {/* Account (e621 server-side) */}
          {username && profile && (
            <Section title={`Account · ${profile.name}`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatTile icon={<Heart size={13} />} label="Favorites" value={formatCount(profile.favorite_count ?? 0)} />
                <StatTile icon={<Upload size={13} />} label="Uploads" value={formatCount(profile.post_upload_count ?? 0)} />
                <StatTile icon={<Gauge size={13} />} label="Tag edits" value={formatCount(profile.post_update_count ?? 0)} />
                <StatTile icon={<BarChart3 size={13} />} label="Comments" value={formatCount(profile.comment_count ?? 0)} />
                <StatTile icon={<BarChart3 size={13} />} label="Forum posts" value={formatCount(profile.forum_post_count ?? 0)} />
                {profile.base_upload_limit != null && (
                  <StatTile icon={<Upload size={13} />} label="Upload limit" value={formatCount(profile.base_upload_limit)} />
                )}
              </div>
              {karmaProgress && (
                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold">
                      Upload level {karmaProgress.level}
                      {karmaProgress.isMax && " · max"}
                    </span>
                    <span className="tabular-nums opacity-55">{(karma ?? 0).toLocaleString()} karma</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-[rgb(var(--accent))]"
                      style={{ width: `${karmaProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Manage */}
          <Section title="Manage">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={usageStatsEnabled}
                onChange={(e) => setUsageStatsEnabled(e.target.checked)}
                className="mt-0.5 accent-[rgb(var(--accent))]"
              />
              <span>
                Record usage statistics
                <span className="mt-0.5 block text-[11px] opacity-55">
                  Everything on this page is stored only on this device and is never sent anywhere.
                  Turning this off stops new recording; existing data is kept.
                </span>
              </span>
            </label>

            <div className="mt-3 flex items-center gap-2">
              <Button
                icon={<RotateCcw size={13} />}
                className={confirmReset ? "!bg-red-500/15 !text-red-500" : ""}
                onClick={() => {
                  if (confirmReset) {
                    resetStats();
                    setConfirmReset(false);
                  } else {
                    setConfirmReset(true);
                  }
                }}
                onBlur={() => setConfirmReset(false)}
              >
                {confirmReset ? "Click again to confirm" : "Reset statistics"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] opacity-45">
              Lifetime totals are included in Settings → Backup &amp; Restore. Per-day history, the
              seen-post list and tag tallies are not.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function TagCloud({
  title,
  entries,
  bg,
  fg,
  onPick,
}: {
  title: string;
  entries: [string, number][];
  bg: string;
  fg: string;
  onPick: (tag: string) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([tag, count]) => (
          <button
            key={tag}
            type="button"
            onClick={() => onPick(tag)}
            title={`${tag} · ${count}×`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold hover:opacity-80"
            style={{ backgroundColor: bg, color: fg }}
          >
            <span className="max-w-[12rem] truncate">{tag.replace(/_/g, " ")}</span>
            <span className="opacity-60">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

