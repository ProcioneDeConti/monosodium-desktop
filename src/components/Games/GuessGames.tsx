import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Heart, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { allTags, type Post } from "../../models/post";
import type { Site } from "../../models/site";
import {
  buildChoices,
  gameImageUrl,
  QUIZ_ROUNDS,
  realArtists,
  speedLabel,
  speedPoints,
  type RoundOutcome,
} from "../../lib/games";
import { displayTagName } from "../../lib/tagdle";
import { loadArtistTier, useGamesStore, type ArtistTier } from "../../state/gamesStore";
import { useEffectiveBlacklist } from "../../state/settingsStore";
import { Button } from "../ui/Button";
import {
  CenteredSpinner,
  ChoiceGrid,
  ErrorNote,
  FavoritesExhausted,
  GameImage,
  GameToggle,
  RunHeader,
  RoundActions,
  RunSummary,
  useDeckRound,
  useFavoritesUser,
  useGameSpecies,
  useListRound,
  usePostDeck,
  useSpeciesRound,
  Stamp,
  Verdict,
  type RoundResult,
} from "./common";

// --- Whodunnit (artist guesser) ----------------------------------------------------------------

/** Posts tagged as showing the artist's name or handle - excluded so the answer isn't printed on
 *  the image. Tagging is incomplete, so GameImage's hideEdges covers the usual untagged spots.
 *  (`text` is left in: it's mostly dialogue, and excluding it would drop a huge share of posts.) */
const SIGNATURE_TAGS = [
  "signature",
  "watermark",
  "artist_name",
  "artist_logo",
  "url",
  "logo",
  "patreon_logo",
  "patreon_username",
  "copyright_symbol",
  "dated",
];
const SIGNATURE_EXCLUSIONS = SIGNATURE_TAGS.map((t) => `-${t}`).join(" ");

function hasSignatureTag(post: Post): boolean {
  const tags = allTags(post);
  return SIGNATURE_TAGS.some((t) => tags.includes(t));
}

const DIFFICULTY: Record<ArtistTier, { label: string; blurb: string; minScore: number }> = {
  easy: { label: "Belly Rubs", blurb: "The big names - the top 100 artists on the site.", minScore: 50 },
  medium: { label: "In Heat", blurb: "Popular, but you'll need to know your stuff - artists ranked ~100-640.", minScore: 20 },
  hard: { label: "Fully Knotted", blurb: "Deep cuts only connoisseurs know - artists ranked ~1,300-1,900.", minScore: 5 },
};

/** Ten posts, four artist names each - one point per right answer. Difficulty picks which band of
 *  the artist rankings the answers (and the decoys) come from; Favorites only swaps that for the
 *  artists in the user's own favorites. */
export function ArtistGuesser({ site }: { site: Site }) {
  const favUser = useFavoritesUser(site);
  const [tier, setTier] = useState<ArtistTier>("easy");
  const [run, setRun] = useState(0);
  const mode = favUser ? "favorites" : tier;

  return (
    <div>
      {favUser ? (
        <p className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full bg-neutral-900/80 px-3 py-1 text-xs">
          <Heart size={12} className="text-pink-400" /> Artists from your favorites
        </p>
      ) : (
        <div className="mb-4 flex flex-col items-center gap-1.5">
          <GameToggle
            options={(Object.keys(DIFFICULTY) as ArtistTier[]).map((t) => ({ value: t, label: DIFFICULTY[t].label }))}
            value={tier}
            onChange={setTier}
          />
          <p className="text-xs opacity-80">{DIFFICULTY[tier].blurb}</p>
        </div>
      )}
      <ArtistRun key={`${mode}:${run}`} site={site} tier={tier} favUser={favUser} onRestart={() => setRun(run + 1)} />
    </div>
  );
}

/** A difficulty's artists, minus any the user blacklists outright - their posts are hidden anyway,
 *  and this keeps their names out of the decoys too. */
function useArtistTier(site: Site, tier: ArtistTier, enabled: boolean) {
  const blacklistEntries = useEffectiveBlacklist();
  const query = useQuery({
    queryKey: ["game-artist-tier", site, tier],
    queryFn: () => loadArtistTier(site, tier),
    staleTime: Infinity,
    enabled,
  });
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const banned = new Set(blacklistEntries.filter((e) => e.length === 1).map((e) => e[0]));
    return query.data.filter((a) => !banned.has(a));
  }, [query.data, blacklistEntries]);
  return { data, isLoading: query.isLoading, error: query.error };
}

function ArtistRun({
  site,
  tier,
  favUser,
  onRestart,
}: {
  site: Site;
  tier: ArtistTier;
  favUser: string | null;
  onRestart: () => void;
}) {
  const bestKey = favUser ? `artist:fav:${site}` : `artist:${tier}:${site}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<RoundOutcome[]>([]);

  // Ranked mode: answers + decoys from the difficulty's band, one search per round.
  const tierList = useArtistTier(site, tier, !favUser);
  const ranked = useListRound(site, tierList.data ?? [], round, QUIZ_ROUNDS, {
    key: `artist-${tier}`,
    extraTags: `score:>=${DIFFICULTY[tier].minScore} ${SIGNATURE_EXCLUSIONS}`,
    accept: (p, answer) => realArtists(p).includes(answer),
    enabled: !favUser && !!tierList.data,
  });
  // Favorites mode: posts dealt from the user's favorites; decoys are the other artists seen
  // there, topped up from the easy band when the favorites don't have enough distinct artists.
  const deck = usePostDeck(site, `fav:${favUser}`, {
    enabled: !!favUser,
    accept: (p) => realArtists(p).length > 0 && !hasSignatureTag(p),
  });
  const fromFavorites = useDeckRound(deck, round, (p) => realArtists(p)[0] ?? null);
  const fallbackDecoys = useArtistTier(site, "easy", !!favUser);

  const source: RoundResult = favUser
    ? fromFavorites
    : { data: ranked.data, isLoading: tierList.isLoading || ranked.isLoading, error: tierList.error ?? ranked.error };
  const post = source.data?.post;
  const answer = source.data?.answer ?? "";
  const choices = useMemo(() => {
    if (!post) return [];
    const bank = favUser ? [...deck.seen.flatMap(realArtists), ...(fallbackDecoys.data ?? [])] : (tierList.data ?? []);
    return buildChoices(answer, bank, new Set(realArtists(post)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, answer]);

  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS} previousBest={previousBest} unit="correct" results={results} onRestart={onRestart} />;
  }

  function pick(choice: string) {
    if (picked) return;
    setPicked(choice);
    setResults([...results, choice === answer ? 1 : 0]);
    if (choice === answer) setScore(score + 1);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setPicked(null);
  }

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} unit="correct" results={results} />
      {source.error ? (
        <ErrorNote error={source.error} />
      ) : source.isLoading || (post && choices.length === 0) ? (
        <CenteredSpinner label="Finding a post…" />
      ) : !post ? (
        favUser ? (
          <FavoritesExhausted />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-sm">
            Couldn't find a usable post after several artists - try allowing more ratings.
            <Button onClick={next}>Skip</Button>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center gap-4">
          <CaseFile round={round} solved={picked === null ? null : picked === answer}>
            <GameImage
              url={gameImageUrl(post)!}
              className="h-[42vh] w-full"
              hideEdges={picked === null}
              photo
              settled={picked !== null}
            />
          </CaseFile>
          <p className="text-sm font-semibold opacity-80">{picked === null ? "Who drew this? Pick a suspect." : `Culprit: ${answer.replace(/_/g, " ")}`}</p>
          <ChoiceGrid choices={choices} answer={answer} picked={picked} onPick={pick} />
          {picked && (
            <>
              <Verdict ok={picked === answer} />
              <RoundActions
                site={site}
                posts={[{ post }]}
                onNext={next}
                nextLabel={round + 1 >= QUIZ_ROUNDS ? "See results" : "Next"}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Whodunnit's evidence folder: a manila case file with a numbered tab, the photo clipped in, and
 *  "SOLVED" / "COLD CASE" stamped across it once the round's answered. */
function CaseFile({ round, solved, children }: { round: number; solved: boolean | null; children: ReactNode }) {
  return (
    <div className="relative mt-6 w-full max-w-xl">
      <span className="game-folder absolute -top-6 left-0 flex h-6 items-center gap-1.5 rounded-t-xl border-x-[2.5px] border-t-[2.5px] border-[rgb(10_8_12)] px-3 text-[11px] font-black uppercase tracking-widest">
        <FolderOpen size={12} strokeWidth={2.5} /> Case #{String(round + 1).padStart(3, "0")}
      </span>
      <div className="game-folder game-sticker relative rounded-2xl rounded-tl-none p-3 pt-2">
        <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] opacity-60">
          <span>Exhibit A</span>
          <span>Artist unknown</span>
        </div>
        {children}
        {solved !== null && (
          <Stamp key={round} color={solved ? "rgb(220 38 38)" : "rgb(37 99 235)"} tilt={solved ? -12 : 9} delay={0.3} size="text-4xl" silent>
            {solved ? "Solved" : "Cold case"}
          </Stamp>
        )}
      </div>
    </div>
  );
}

// --- Who's That Floof?! (species guesser) ------------------------------------------------------

/** How long the blur takes to clear completely. */
const REVEAL_MS = 10_000;
const MAX_BLUR_PX = 32;

/** Ten blurred posts that slowly come into focus - name the species, faster is worth more. */
export function SpeciesGuesser({ site }: { site: Site }) {
  const [run, setRun] = useState(0);
  const favUser = useFavoritesUser(site);
  const list = useGameSpecies(site);
  if (!list) return <CenteredSpinner label="Building the species list… (first time takes ~15s)" />;
  return <SpeciesRun key={`${favUser}:${run}`} site={site} list={list} favUser={favUser} onRestart={() => setRun(run + 1)} />;
}

/** Choices for a species round: the answer plus species the post isn't also tagged with. */
export function useSpeciesChoices(post: Post | null | undefined, answer: string | undefined, list: string[]): string[] {
  return useMemo(
    () => (post && answer ? buildChoices(answer, list, new Set(post.tags.species)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post?.id, answer],
  );
}

/** Species rounds for Floof / Enhance!: one search per round normally; with Favorites only, solo
 *  posts dealt from the user's favorites, asking about their most specific listed species (the
 *  list runs most- to least-popular, so the last match is the narrowest). */
export function useSpeciesSource(site: Site, list: string[], round: number, favUser: string | null): RoundResult {
  const rank = useMemo(() => new Map(list.map((t, i) => [t, i])), [list]);
  const deck = usePostDeck(site, `fav:${favUser} solo`, {
    enabled: !!favUser,
    accept: (p) => p.tags.species.some((t) => rank.has(t)),
  });
  const fromFavorites = useDeckRound(deck, round, (p) => {
    const listed = p.tags.species.filter((t) => rank.has(t));
    return listed.length > 0 ? listed.reduce((a, b) => (rank.get(b)! > rank.get(a)! ? b : a)) : null;
  });
  const fromSearch = useSpeciesRound(site, list, round, QUIZ_ROUNDS, !favUser);
  return favUser ? fromFavorites : { data: fromSearch.data, isLoading: fromSearch.isLoading, error: fromSearch.error };
}

function SpeciesRun({
  site,
  list,
  favUser,
  onRestart,
}: {
  site: Site;
  list: string[];
  favUser: string | null;
  onRestart: () => void;
}) {
  const bestKey = favUser ? `species:fav:${site}` : `species:${site}`;
  const best = useGamesStore((s) => s.best[bestKey] ?? 0);
  const recordBest = useGamesStore((s) => s.recordBest);
  const [previousBest] = useState(best);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [gained, setGained] = useState(0);
  const [results, setResults] = useState<RoundOutcome[]>([]);
  const query = useSpeciesSource(site, list, round, favUser);
  const post = query.data?.post;
  const answer = query.data?.answer ?? "";
  const choices = useSpeciesChoices(post, answer, list);
  const { elapsed, start } = useRevealClock(picked === null && !!post, `${round}`);

  if (round >= QUIZ_ROUNDS) {
    return <RunSummary score={score} max={QUIZ_ROUNDS * 100} previousBest={previousBest} results={results} onRestart={onRestart} />;
  }

  function pick(choice: string) {
    if (picked) return;
    setPicked(choice);
    const pts = choice === answer ? speedPoints(elapsed, REVEAL_MS) : 0;
    setResults([...results, choice === answer ? 1 : 0]);
    setGained(pts);
    setScore(score + pts);
  }

  function next() {
    const nextRound = round + 1;
    if (nextRound >= QUIZ_ROUNDS) recordBest(bestKey, score);
    setRound(nextRound);
    setPicked(null);
    setGained(0);
  }

  const t = picked !== null ? 1 : Math.min(1, elapsed / REVEAL_MS);
  const potential = speedPoints(elapsed, REVEAL_MS);

  return (
    <div>
      <RunHeader round={round} total={QUIZ_ROUNDS} score={score} best={Math.max(best, score)} results={results} />
      {query.error ? (
        <ErrorNote error={query.error} />
      ) : query.isLoading ? (
        <CenteredSpinner label="Finding a post…" />
      ) : !post ? (
        favUser ? (
          <FavoritesExhausted />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-sm">
            Couldn't find a usable post after several species - try allowing more ratings.
            <Button onClick={next}>Skip</Button>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold opacity-80">
            What species is this?
            {picked === null && (
              <span className="game-sticker-sm flex items-center gap-1 rounded-full bg-[rgb(var(--game))] px-2 py-0.5 text-xs font-black tabular-nums text-white">
                <Timer size={12} /> {potential} pts
              </span>
            )}
          </p>
          <div className="relative w-full max-w-xl">
            {/* The reveal: rays burst out from behind the photo as it snaps into focus. */}
            {picked && (
              <span
                key={round}
                className="game-rays game-anim pointer-events-none absolute -inset-10 animate-[game-burst_0.9s_ease-out_both] rounded-full"
              />
            )}
            <GameImage
              url={gameImageUrl(post)!}
              className={`h-[46vh] w-full ${picked ? "game-anim animate-[game-pop-in_0.4s_ease-out]" : ""}`}
              photo
              settled={picked !== null}
              imgStyle={{ filter: `blur(${MAX_BLUR_PX * (1 - t)}px)`, transition: picked ? "filter 0.4s" : undefined }}
            >
              <img src={gameImageUrl(post)!} alt="" className="hidden" onLoad={start} />
              {picked && (
                <span className="absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="game-sticker-sm game-anim animate-[game-pop-in_0.35s_0.2s_ease-out_both] whitespace-nowrap rounded-xl bg-[rgb(var(--game))] px-4 py-1 text-lg font-black italic text-white">
                    It's {/^[aeiou]/.test(answer) ? "an" : "a"} {displayTagName(answer)}!
                  </span>
                </span>
              )}
            </GameImage>
          </div>
          <ChoiceGrid choices={choices} answer={answer} picked={picked} onPick={pick} />
          {picked && (
            <>
              <Verdict ok={picked === answer}>{gained > 0 && `+${gained} · ${speedLabel(gained)}`}</Verdict>
              <RoundActions
                site={site}
                posts={[{ post }]}
                onNext={next}
                nextLabel={round + 1 >= QUIZ_ROUNDS ? "See results" : "Next"}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Milliseconds since `start()` (called from the image's onLoad, so slow CDN loads don't eat
 *  the player's time), ticking while `running`. Resets whenever `resetKey` changes. */
function useRevealClock(running: boolean, resetKey: string) {
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    startedAt.current = null;
    setStarted(false);
    setElapsed(0);
  }, [resetKey]);

  useEffect(() => {
    if (!running || !started) return;
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(performance.now() - startedAt.current);
    }, 100);
    return () => window.clearInterval(id);
  }, [running, started]);

  return {
    elapsed,
    start: () => {
      if (startedAt.current === null) {
        startedAt.current = performance.now();
        setStarted(true);
      }
    },
  };
}
