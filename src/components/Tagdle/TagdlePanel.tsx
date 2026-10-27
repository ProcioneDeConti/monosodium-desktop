import { useEffect, useMemo, useRef, useState } from "react";
import { MascotCue } from "../Mascot/MascotLayer";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Flame, ImageOff, Settings2, Trophy, X } from "lucide-react";
import { e621Api } from "../../api/client";
import { visiblePosts } from "../../lib/blacklist";
import { formatCount } from "../../lib/formatCount";
import { TAG_CATEGORY_STYLE } from "../../lib/tagCategoryStyle";
import {
  ALL_TAGDLE_CATEGORIES,
  correctSide,
  dailyPairs,
  displayTagName,
  filterPool,
  pickPair,
  shareText,
  utcDayKey,
  type PoolTag,
  type Side,
  type TagdleCategory,
  type TagdlePair,
} from "../../lib/tagdle";
import { allTags, RATING_TAG, type Post, type Rating, type TagCategory } from "../../models/post";
import { SITE_DISPLAY_NAME, type Site } from "../../models/site";
import { useEffectiveBlacklist, useSettingsStore } from "../../state/settingsStore";
import { loadPool, loadTagdle, useTagdleStore } from "../../state/tagdleStore";
import { Button } from "../ui/Button";
import { NextButton, ViewPostButton } from "../Games/common";
import raccoonUrl from "../../assets/tagdle-raccoon.png";
import { ConfettiBurst } from "./Confetti";
import { Graffiti } from "./Graffiti";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

const CATEGORY_BY_ID: Record<number, TagCategory> = {
  0: "general",
  1: "artist",
  3: "copyright",
  4: "character",
  5: "species",
};

const RATING_LABEL: Record<Rating, string> = { s: "Safe", q: "Questionable", e: "Explicit" };

type Mode = "daily" | "endless";

/** "Which tag has more posts?" - see lib/tagdle.ts. Daily: fixed seeded rounds, once per UTC day,
 *  always the full category mix. Endless: the selected categories, until the first wrong pick.
 *  Rendered inside the Games launcher, which owns the overlay and header. */
export function TagdleGame({ site }: { site: Site }) {
  const isLoaded = useTagdleStore((s) => s.isLoaded);
  const prefs = useTagdleStore((s) => s.prefs);
  const [mode, setMode] = useState<Mode>("daily");
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    void loadTagdle();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-2">
        <div className="flex rounded-full bg-black/[0.06] dark:bg-white/[0.08] p-0.5">
          {(["daily", "endless"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                mode === m ? "bg-[rgb(var(--accent))] text-white shadow" : "opacity-60 hover:opacity-100"
              }`}
            >
              {m === "daily" ? "Daily" : "Endless"}
            </button>
          ))}
        </div>
        <IconButton
          onClick={() => setShowOptions((v) => !v)}
          title="Options"
          className={`ml-auto ${showOptions ? "bg-[rgb(var(--accent))]/20" : ""}`}
        >
          <Settings2 size={17} />
        </IconButton>
      </div>

      {/* The alley: brick wall behind (always dark, so text is forced light in both themes), and
          the resident raccoon parked bottom-right outside the scroll area so it stays put. */}
      <div className="tagdle-alley relative min-h-0 flex-1 text-white">
        <Graffiti />
        <div className="relative h-full overflow-y-auto px-4 pb-48 pt-4">
          {showOptions && <OptionsSection />}
          {!isLoaded ? (
            <CenteredSpinner label="Loading…" />
          ) : mode === "daily" ? (
            <DailyGame key={`daily:${site}`} site={site} />
          ) : (
            <EndlessGame key={`endless:${site}:${prefs.categories.join(",")}`} site={site} categories={prefs.categories} />
          )}
        </div>
        {/* Painted on the wall, not stuck on it: no shadow, and hard-light blending lets the
            brick texture and mortar lines show through the paint while the dark outlines hold. */}
        <img
          src={raccoonUrl}
          alt=""
          draggable={false}
          className="tagdle-eroded pointer-events-none absolute bottom-1 right-1 h-56 select-none"
          style={{ mixBlendMode: "hard-light", opacity: 0.9 }}
        />
      </div>
    </div>
  );
}

function OptionsSection() {
  const prefs = useTagdleStore((s) => s.prefs);
  const setPrefs = useTagdleStore((s) => s.setPrefs);
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const allSelected = prefs.categories.length === ALL_TAGDLE_CATEGORIES.length;

  function toggleCategory(c: TagdleCategory) {
    const next = prefs.categories.includes(c)
      ? prefs.categories.filter((x) => x !== c)
      : ALL_TAGDLE_CATEGORIES.filter((x) => x === c || prefs.categories.includes(x));
    if (next.length > 0) setPrefs({ categories: next });
  }

  function toggleRating(r: Rating) {
    const next = prefs.imageRatings.includes(r)
      ? prefs.imageRatings.filter((x) => x !== r)
      : (["s", "q", "e"] as Rating[]).filter((x) => x === r || prefs.imageRatings.includes(x));
    if (next.length > 0) setPrefs({ imageRatings: next });
  }

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/20"
        : "border-white/15 opacity-60 hover:opacity-100"
    }`;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-sm)] border border-white/10 bg-neutral-900/85 p-3 text-sm backdrop-blur-sm">
      <div>
        <p className="mb-1.5 text-xs opacity-60">Endless categories (Daily always uses all)</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chip(allSelected)}
            onClick={() => setPrefs({ categories: ALL_TAGDLE_CATEGORIES })}
          >
            All
          </button>
          {ALL_TAGDLE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={chip(!allSelected && prefs.categories.includes(c))}
              onClick={() => (allSelected ? setPrefs({ categories: [c] }) : toggleCategory(c))}
            >
              {TAG_CATEGORY_STYLE[c].label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.showImages}
            onChange={(e) => setPrefs({ showImages: e.target.checked })}
          />
          Show a sample image for each tag
        </label>
        {prefs.showImages && (
          <p className="mt-1 text-xs opacity-50">
            Images use each tag's top-scored post. Many tags have no safe-rated posts at all, so safe-only shows
            fewer images.
          </p>
        )}
        {prefs.showImages && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs opacity-60">Image ratings:</span>
            {(["s", "q", "e"] as Rating[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={!adultModeEnabled && r !== "s"}
                className={`${chip(prefs.imageRatings.includes(r))} disabled:opacity-30`}
                onClick={() => toggleRating(r)}
              >
                {RATING_LABEL[r]}
              </button>
            ))}
            {!adultModeEnabled && <span className="text-xs opacity-50">(adult mode off - safe only)</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Loads (and blacklist-filters) the pool for `categories`, reporting fetch progress. */
function usePool(site: Site, categories: TagdleCategory[]) {
  const blacklistEntries = useEffectiveBlacklist();
  const [progress, setProgress] = useState<[number, number]>([0, categories.length]);
  const query = useQuery({
    queryKey: ["tagdle-pool", site, [...categories].sort().join(",")],
    queryFn: () => loadPool(site, categories, (done, total) => setProgress([done, total])),
    staleTime: Infinity,
  });
  const pool = useMemo(
    () => (query.data ? filterPool(query.data, blacklistEntries) : null),
    [query.data, blacklistEntries],
  );
  return { pool, error: query.error, progress };
}

function DailyGame({ site }: { site: Site }) {
  const dayKey = useMemo(() => utcDayKey(), []);
  const saved = useTagdleStore((s) => s.daily[`${site}:${dayKey}`]);
  const recordDaily = useTagdleStore((s) => s.recordDaily);
  const { pool, error, progress } = usePool(site, ALL_TAGDLE_CATEGORIES);
  const pairs = useMemo(() => (pool ? dailyPairs(pool, site, dayKey) : []), [pool, site, dayKey]);
  const [results, setResults] = useState<boolean[]>([]);
  // Set when this session finishes the daily, so the rainbow fires then - not on every reopen.
  const [justFinished, setJustFinished] = useState(false);
  const [picked, setPicked] = useState<Side | null>(null);
  const [raceDone, setRaceDone] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (!pool) return <CenteredSpinner label={`Fetching tag counts… (${progress[0]}/${progress[1]})`} />;
  if (pairs.length === 0) return <p className="text-sm opacity-60">Not enough tags to build a puzzle.</p>;

  if (saved) return <DailySummary site={site} dayKey={dayKey} results={saved} celebrate={justFinished} />;

  const round = results.length;
  const pair = pairs[round];

  function pick(side: Side) {
    if (picked) return;
    setPicked(side);
  }

  function next() {
    const ok = picked === correctSide(pair);
    const nextResults = [...results, ok];
    setPicked(null);
    setRaceDone(false);
    setResults(nextResults);
    if (nextResults.length >= pairs.length) {
      setJustFinished(true);
      recordDaily(site, dayKey, nextResults);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-3 text-sm">
          <span className="font-bold">
            Round {round + 1}
            <span className="font-normal opacity-50">/{pairs.length}</span>
          </span>
          <span className="text-xs opacity-50">{dayKey} (UTC)</span>
          <ResultDots results={results} total={pairs.length} />
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-500"
            style={{ width: `${(results.length / pairs.length) * 100}%` }}
          />
        </div>
      </div>
      <RoundView site={site} pair={pair} picked={picked} onPick={pick} onRaceEnd={() => setRaceDone(true)} />
      {picked && raceDone && (
        <div className="mt-4 flex justify-center">
          <NextButton onClick={next}>{round + 1 >= pairs.length ? "See results" : "Next round"}</NextButton>
        </div>
      )}
    </div>
  );
}

function DailySummary({
  site,
  dayKey,
  results,
  celebrate,
}: {
  site: Site;
  dayKey: string;
  results: boolean[];
  celebrate: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const text = shareText(SITE_DISPLAY_NAME[site], dayKey, results);
  const score = results.filter(Boolean).length;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="relative text-3xl font-bold">
        {celebrate && <ConfettiBurst variant="rainbow" />}
        {celebrate && <MascotCue kind="gameWin" />}
        {score}/{results.length}
      </p>
      <p className="text-2xl tracking-wide">{results.map((ok) => (ok ? "🟩" : "🟥")).join("")}</p>
      <p className="text-sm opacity-60">Today's puzzle is done - a new one unlocks at 00:00 UTC. Endless is always open.</p>
      <Button onClick={() => void copy()} icon={copied ? <Check size={14} /> : <Copy size={14} />}>
        {copied ? "Copied" : "Copy result"}
      </Button>
    </div>
  );
}

function EndlessGame({ site, categories }: { site: Site; categories: TagdleCategory[] }) {
  const best = useTagdleStore((s) => s.bestStreak[site] ?? 0);
  const recordStreak = useTagdleStore((s) => s.recordStreak);
  const { pool, error, progress } = usePool(site, categories);
  const recent = useRef<string[]>([]);
  const [pair, setPair] = useState<TagdlePair | null>(null);
  const [picked, setPicked] = useState<Side | null>(null);
  const [raceDone, setRaceDone] = useState(false);
  const [streak, setStreak] = useState(0);

  function deal() {
    if (!pool) return;
    const next = pickPair(pool, Math.random, new Set(recent.current));
    if (next) recent.current = [...recent.current, next.left.name, next.right.name].slice(-60);
    setPair(next);
    setPicked(null);
    setRaceDone(false);
  }

  useEffect(() => {
    if (pool && !pair) deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  if (error) return <ErrorNote error={error} />;
  if (!pool) return <CenteredSpinner label={`Fetching tag counts… (${progress[0]}/${progress[1]})`} />;
  if (!pair) return <p className="text-sm opacity-60">Not enough tags in these categories.</p>;

  const wrong = picked !== null && picked !== correctSide(pair);
  const shownStreak = picked !== null && !raceDone && !wrong ? streak - 1 : streak;

  function pick(side: Side) {
    if (picked || !pair) return;
    setPicked(side);
    if (side === correctSide(pair)) {
      setStreak(streak + 1);
    }
  }

  function restart() {
    setStreak(0);
    deal();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-2 text-sm">
        {/* Shown as of the last finished race, so a pick's +1 doesn't land before its reveal. */}
        <span
          key={shownStreak}
          className="tagdle-anim flex animate-[tagdle-pop_0.4s_ease-out] items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1 font-bold text-orange-500"
        >
          <Flame size={15} /> {shownStreak}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 font-semibold text-yellow-600 dark:text-yellow-400">
          <Trophy size={14} /> Best {Math.max(best, shownStreak)}
        </span>
      </div>
      <RoundView site={site} pair={pair} picked={picked} onPick={pick} onRaceEnd={() => {
          setRaceDone(true);
          recordStreak(site, streak);
        }}
      />
      {picked && raceDone && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {wrong && <p className="text-sm font-semibold">Game over - final streak {streak}</p>}
          {wrong && <MascotCue kind="gameLose" />}
          <NextButton onClick={wrong ? restart : deal}>{wrong ? "Play again" : "Next"}</NextButton>
        </div>
      )}
    </div>
  );
}

/** How long the reveal "race" runs. Both counters climb along one shared curve toward the larger
 *  count, so a bigger pair counts faster and the smaller tag drops out first. */
const RACE_MS = 1800;

/** Shared race progress, 0..1, starting when `active` flips on (instant under reduced motion). */
function useRaceProgress(active: boolean): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / RACE_MS);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return progress;
}

function RoundView({
  site,
  pair,
  picked,
  onPick,
  onRaceEnd,
}: {
  site: Site;
  pair: TagdlePair;
  picked: Side | null;
  onPick: (side: Side) => void;
  /** Fires once the reveal race has finished (the round's result is now visible). */
  onRaceEnd: () => void;
}) {
  const correct = correctSide(pair);
  const progress = useRaceProgress(picked !== null);
  // Ease-in-out so the race starts and ends slowly - the photo finish is the interesting bit.
  const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
  const raceValue = Math.max(pair.left.post_count, pair.right.post_count) * eased;
  const finished = progress >= 1;
  useEffect(() => {
    if (finished) onRaceEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  const card = (tag: PoolTag, side: Side) => (
    <TagCard
      site={site}
      tag={tag}
      opponent={(side === "left" ? pair.right : pair.left).name}
      side={side}
      picked={picked}
      correct={correct}
      shownCount={picked ? Math.min(tag.post_count, Math.round(raceValue)) : null}
      finished={finished}
      onPick={onPick}
    />
  );
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm font-semibold opacity-70">
        {picked === null ? "Which tag has more posts?" : !finished ? "And the counts are…" : null}
        {finished && (
          <span className={picked === correct ? "text-green-500" : "text-red-500"}>
            <MascotCue kind={picked === correct ? "gameRight" : "gameWrong"} />
            {picked === correct ? "Correct!" : "Not quite!"}
          </span>
        )}
      </p>
      <div className="flex w-full items-center justify-center gap-4">
        {card(pair.left, "left")}
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]
                     text-sm font-black italic text-white shadow-lg shadow-[rgb(var(--accent))]/40"
        >
          VS
        </div>
        {card(pair.right, "right")}
      </div>
    </div>
  );
}

function TagCard({
  site,
  tag,
  opponent,
  side,
  picked,
  correct,
  shownCount,
  finished,
  onPick,
}: {
  site: Site;
  tag: PoolTag;
  /** The other card's tag name, so the two sample images never show the same post. */
  opponent: string;
  side: Side;
  picked: Side | null;
  correct: Side;
  /** The racing counter's current value, or null before a pick. */
  shownCount: number | null;
  finished: boolean;
  onPick: (side: Side) => void;
}) {
  const showImages = useTagdleStore((s) => s.prefs.showImages);
  // The post the sample image shows (TagImage picks it), linked under the card after the round.
  const [imagePost, setImagePost] = useState<Post | undefined>(undefined);
  const style = TAG_CATEGORY_STYLE[CATEGORY_BY_ID[tag.category] ?? "general"];
  const revealed = picked !== null;
  // Hold the right/wrong colouring until the race ends so it doesn't give the result away.
  const ring = !finished
    ? `border-transparent ${revealed ? "" : "hover:border-[rgb(var(--accent))] hover:-translate-y-1"}`
    : side === correct
      ? "border-green-500"
      : side === picked
        ? "border-red-500"
        : "border-transparent opacity-70";

  const celebrate = finished && side === correct && picked === correct;
  const anim = !finished
    ? ""
    : side === picked && side !== correct
      ? "tagdle-anim animate-[tagdle-shake_0.45s_ease-in-out]"
      : side === correct
        ? "tagdle-anim animate-[tagdle-pop_0.4s_ease-out]"
        : "";

  return (
    <div className="relative w-full max-w-[17rem]">
      {celebrate && <ConfettiBurst />}
      <button
        type="button"
        disabled={revealed}
        onClick={() => onPick(side)}
        style={{ boxShadow: finished ? undefined : `0 10px 30px -12px ${style.chipBg}` }}
        className={`group relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-2xl border-2
                    bg-gradient-to-b from-neutral-800/95 to-neutral-900/95 backdrop-blur-sm
                    text-center shadow-lg shadow-black/25 dark:shadow-black/60 transition-all duration-200 ${ring} ${anim}`}
      >
        {/* Category colour stripe */}
        <div className="h-1.5 w-full shrink-0" style={{ background: style.chipBg }} />
        {showImages ? (
          <TagImage site={site} tag={tag.name} opponent={opponent} side={side} onPost={setImagePost} />
        ) : (
          <div
            className="flex flex-1 items-center justify-center text-6xl font-black opacity-15 select-none"
            style={{ color: style.chipBg }}
          >
            ?
          </div>
        )}
        <div className="flex shrink-0 flex-col items-center gap-1.5 px-3 pb-3 pt-2.5">
          <span
            className="max-w-full break-words rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: style.chipBg, color: style.chipFg }}
          >
            {displayTagName(tag.name)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-50">{style.label}</span>
          <span
            className={`text-2xl font-black tabular-nums transition-colors ${
              finished ? (side === correct ? "text-green-500" : "text-red-500") : ""
            }`}
          >
            {shownCount === null ? "???" : finished ? formatCount(tag.post_count) : shownCount.toLocaleString()}
          </span>
          <span className={`text-xs opacity-50 ${finished ? "" : "invisible"}`}>
            {tag.post_count.toLocaleString()} posts
          </span>
        </div>
        {finished && (side === correct || side === picked) && (
          <span
            className={`absolute right-2 top-3.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-md ${
              side === correct ? "bg-green-500" : "bg-red-500"
            }`}
          >
            {side === correct ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
          </span>
        )}
      </button>
      {finished && showImages && imagePost && (
        <div className="mt-2 flex justify-center">
          <ViewPostButton site={site} post={imagePost} />
        </div>
      )}
    </div>
  );
}

/** A tag's top-scored posts within the chosen image ratings, blacklisted and URL-less ones dropped.
 *  One rate-limited get_posts per tag, cached for the session (so asking for the opponent's list
 *  too costs nothing extra - its own card fetches it anyway). */
function useImageCandidates(site: Site, tag: string) {
  const imageRatings = useTagdleStore((s) => s.prefs.imageRatings);
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const blacklistEntries = useEffectiveBlacklist();
  const ratings: Rating[] = adultModeEnabled ? imageRatings : ["s"];
  const ratingFilter =
    ratings.length === 3 ? "" : ratings.length === 1 ? RATING_TAG[ratings[0]] : ratings.map((r) => `~${RATING_TAG[r]}`).join(" ");

  const query = useQuery({
    queryKey: ["tagdle-image", site, tag, ratingFilter],
    // 20 rather than 10 so a few blacklisted / URL-less (deleted, login-gated) top posts don't
    // leave nothing to show.
    queryFn: () => e621Api.getPosts(site, `${tag} ${ratingFilter} order:score`.trim(), 20),
    staleTime: Infinity,
  });
  const candidates = useMemo(
    () => (query.data ? visiblePosts(query.data.posts, blacklistEntries, false).filter((p) => p.sample.url ?? p.preview.url) : []),
    [query.data, blacklistEntries],
  );
  return { query, candidates, ratings, adultModeEnabled };
}

/** Prefers a post that isn't also tagged with the opponent (top posts often carry both tags of a
 *  close pair, e.g. male/male and brown_body), then anything but `excludeId`. */
function pickImagePost(candidates: Post[], opponent: string, excludeId?: number): Post | undefined {
  const usable = candidates.filter((p) => p.id !== excludeId);
  return usable.find((p) => !allTags(p).includes(opponent)) ?? usable[0];
}

/** The card's sample image. Both cards pick deterministically, and the right one also excludes
 *  whatever the left one picked, so a round never shows the same post twice. */
function TagImage({
  site,
  tag,
  opponent,
  side,
  onPost,
}: {
  site: Site;
  tag: string;
  opponent: string;
  side: Side;
  onPost: (post: Post | undefined) => void;
}) {
  const { query, candidates, ratings, adultModeEnabled } = useImageCandidates(site, tag);
  const opponentImages = useImageCandidates(site, opponent);
  const post = useMemo(() => {
    if (side === "left") return pickImagePost(candidates, opponent);
    // Wait for the left card's list so the exclusion is real, not a race.
    if (opponentImages.query.isLoading) return undefined;
    const leftPick = pickImagePost(opponentImages.candidates, tag);
    return pickImagePost(candidates, opponent, leftPick?.id);
  }, [side, candidates, opponent, tag, opponentImages.candidates, opponentImages.query.isLoading]);
  useEffect(() => onPost(post), [post, onPost]);
  const url = post ? (post.sample.url ?? post.preview.url) : null;
  // Most "no image" rounds are a ratings mismatch, not a fetch failure: a big share of the pool
  // (anatomy/act tags, many artists) has no safe posts at all, and safe-only is the default.
  const emptyLabel = query.isError
    ? "Couldn't load image"
    : ratings.length === 1 && ratings[0] === "s"
      ? "No safe-rated posts"
      : "No posts in chosen ratings";
  const hint =
    !query.isError && adultModeEnabled && ratings.length < 3 ? "Allow more ratings in Options" : null;

  return (
    <div className="relative mx-2 mt-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/10 dark:bg-black/30">
      {query.isLoading || (side === "right" && opponentImages.query.isLoading) ? (
        <Spinner />
      ) : url ? (
        <>
          {/* Blurred copy behind fills the letterbox around the contained image. */}
          <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl" draggable={false} />
          <img src={url} alt="" className="relative h-full w-full object-contain" draggable={false} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          <ImageOff size={22} className="opacity-40" />
          <span className="text-xs opacity-60">{emptyLabel}</span>
          {hint && <span className="text-[10px] opacity-40">{hint}</span>}
        </div>
      )}
    </div>
  );
}

function ResultDots({ results, total }: { results: boolean[]; total: number }) {
  return (
    <div className="ml-auto flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i >= results.length ? "bg-white/20" : results[i] ? "bg-green-500" : "bg-red-500"
          }`}
        />
      ))}
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm opacity-70">
      <Spinner />
      {label}
    </div>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  return <p className="text-sm text-red-500">Couldn't load tags: {String(error)}</p>;
}
