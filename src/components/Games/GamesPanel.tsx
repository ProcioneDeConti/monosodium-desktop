import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MascotLayer } from "../Mascot/MascotLayer";
import {
  CalendarClock,
  Cat,
  ChevronLeft,
  Church,
  Dog,
  Eye,
  EyeOff,
  FingerprintPattern,
  Gamepad2,
  Grid3x3,
  Check,
  Heart,
  MessageCircleHeart,
  PawPrint,
  Rabbit,
  ScanSearch,
  SearchX,
  Siren,
  Trophy,
  SprayCan,
  X,
} from "lucide-react";
import { bingoDailyBest, launcherBest, type GameId } from "../../lib/games";
import { utcDayKey } from "../../lib/tagdle";
import { loadTagdle, useTagdleStore } from "../../state/tagdleStore";
import type { Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { loadGames, useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Graffiti } from "../Tagdle/Graffiti";
import { TagdleGame } from "../Tagdle/TagdlePanel";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { GameMusic } from "./GameMusic";
import { GusChatSettings } from "./GusChatSettings";
import { GusChat } from "./GusChat";
import { GusPet } from "./GusPet";
import { HigherLower } from "./HigherLower";
import { OddOneOut } from "./OddOneOut";
import { TagBingo } from "./TagBingo";
import { YearGuesser } from "./YearGuesser";
import { ArtistGuesser, SpeciesGuesser } from "./GuessGames";
import { RatingJudge } from "./RatingJudge";
import { SixDegrees } from "./SixDegrees";
import { ZoomReveal } from "./ZoomReveal";
import { CenteredSpinner, GameMetaContext } from "./common";

/** A game to reopen the next time the panel mounts - set when a game leaves the panel for
 *  something it means to come back from (Talk to Gus's searches), so Back lands in the game
 *  instead of the launcher. Consumed on mount. */
let resumeGame: GameId | null = null;
export function resumeGameOnReturn(id: GameId) {
  resumeGame = id;
}

/** Horny Jail or Sunday School: a police siren and a church sharing one tile, split diagonally. */
function JailOrChurch() {
  return (
    <span className="relative block h-[22px] w-[22px]">
      <Siren size={14} className="absolute left-0 top-0 text-white" />
      <Church size={14} className="absolute bottom-0 right-0 text-sky-200" />
    </span>
  );
}

interface GameInfo {
  id: GameId;
  /** A node, not a string, so a name can carry markup (the species game's strikethrough gag). */
  name: ReactNode;
  blurb: string;
  icon: ReactNode;
  /** Card gradient, tailwind from-/to- classes. */
  tint: string;
  /** Plain-text name, for share text (`name` may carry markup). */
  title: string;
  /** The game's own colour as an "r g b" triple - becomes --game for its screens. Mid-dark
   *  shades so white text on it stays readable. */
  color: string;
}

const GAMES: GameInfo[] = [
  {
    id: "gusPet",
    name: "Pocket Gus",
    blurb: "Feed him, groom him, clean up after him. He gets hungry even while the app is closed.",
    icon: <PawPrint size={22} />,
    tint: "from-amber-500/30 to-stone-500/20",
    title: "Pocket Gus",
    color: "217 119 6",
  },
  {
    id: "gusChat",
    name: "Talk to Gus",
    blurb: "Chat, flirt, ask him things. He remembers you - and can fetch posts if you ask nicely.",
    icon: <MessageCircleHeart size={22} />,
    tint: "from-pink-500/30 to-violet-500/20",
    title: "Talk to Gus",
    color: "219 39 119",
  },
  {
    id: "tagdle",
    name: "Tagdle",
    blurb: "Which tag has more posts? Daily puzzle + endless.",
    icon: <SprayCan size={22} />, // the alley it lives in
    tint: "from-orange-500/30 to-rose-500/20",
    title: "Tagdle",
    color: "234 88 12",
  },
  {
    id: "higherLower",
    name: "Score Sniffer",
    blurb: "Does the next post have a higher score or more favorites? Keep the streak alive.",
    icon: <Dog size={22} />, // sniffing out the score
    tint: "from-sky-500/30 to-indigo-500/20",
    title: "Score Sniffer",
    color: "2 132 199",
  },
  {
    id: "artist",
    name: "Whodunnit",
    blurb: "Who drew this? Four names, ten posts.",
    icon: <FingerprintPattern size={22} />, // the detective angle
    tint: "from-fuchsia-500/30 to-purple-500/20",
    title: "Whodunnit",
    color: "192 38 211",
  },
  {
    id: "species",
    name: (
      <>
        Who's That <s className="opacity-60">Pokémon</s> Floof?!
      </>
    ),
    blurb: "Name the species before the blur clears. Faster is worth more.",
    icon: <Cat size={22} />, // floof
    tint: "from-emerald-500/30 to-teal-500/20",
    title: "Who's That Floof?!",
    color: "5 150 105",
  },
  {
    id: "zoom",
    name: "Enhance!",
    blurb: "Starts zoomed way in. Every wrong guess pulls the camera back.",
    icon: <ScanSearch size={22} />, // CSI "enhance"
    tint: "from-yellow-500/30 to-lime-500/20",
    title: "Enhance!",
    color: "202 138 4", // yellow - Pocket Gus already has the amber
  },
  {
    id: "rating",
    name: "Horny Jail or Sunday School",
    blurb: "A blurred post and its tags: safe, questionable, or explicit?",
    icon: <JailOrChurch />,
    tint: "from-red-500/30 to-orange-500/20",
    title: "Horny Jail or Sunday School",
    color: "220 38 38",
  },
  {
    id: "sixDegrees",
    name: "Tag Hopper",
    blurb: "Hop from one tag to another through shared posts. Daily puzzle + endless.",
    icon: <Rabbit size={22} />, // hop
    tint: "from-cyan-500/30 to-blue-500/20",
    title: "Tag Hopper",
    color: "8 145 178",
  },
  {
    id: "oddOneOut",
    name: "Sus",
    blurb: "Three posts share a tag. Spot the impostor.",
    icon: <SearchX size={22} />,
    tint: "from-rose-500/30 to-pink-500/20",
    title: "Sus",
    color: "225 29 72",
  },
  {
    id: "yearGuess",
    name: "Time Machine",
    blurb: "When was this uploaded? The closer the year, the more points.",
    icon: <CalendarClock size={22} />,
    tint: "from-violet-500/30 to-indigo-500/20",
    title: "Time Machine",
    color: "124 58 237",
  },
  {
    id: "bingo",
    name: "Tag Bingo",
    blurb: "Claim posts for the squares on your card. First line in the fewest posts wins.",
    icon: <Grid3x3 size={22} />,
    tint: "from-lime-500/30 to-green-500/20",
    title: "Tag Bingo",
    color: "77 124 15",
  },
];

interface GamesPanelProps {
  site: Site;
  onClose: () => void;
  /** Talk to Gus's "show me…" / "what's popular" intents. */
  onSearch?: (query: string) => void;
  onOpenPopular?: () => void;
}

/** The Games launcher: a grid of game cards, then the chosen game in the same sheet. Esc (and
 *  the back arrow) return from a game to the launcher; Esc on the launcher closes the panel. */
export function GamesPanel({ site, onClose, onSearch, onOpenPopular }: GamesPanelProps) {
  const overlay = useRef<OverlayHandle>(null);
  const [selected, setSelected] = useState<GameId | null>(() => {
    const id = resumeGame;
    resumeGame = null;
    return id;
  });
  const isLoaded = useGamesStore((s) => s.isLoaded);
  const game = GAMES.find((g) => g.id === selected);
  /** Gus's own games show the big Gus - no corner double, no post-source toggles. */
  const isGus = selected === "gusPet" || selected === "gusChat";

  useEffect(() => {
    void loadGames();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <Overlay ref={overlay} onClose={onClose} variant="sheet" sheetWidth="max-w-3xl" closeOnEsc={!selected}>
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        {game ? (
          <IconButton onClick={() => setSelected(null)} title="Back to games (Esc)">
            <ChevronLeft size={18} />
          </IconButton>
        ) : (
          <Gamepad2 size={17} className="text-[rgb(var(--accent))]" />
        )}
        <h1 className="min-w-0 truncate text-base font-black tracking-tight" title={game?.title}>
          {game ? game.name : "Games"}
        </h1>
        {/* Every game but Tagdle (whose site-wide tag counts don't narrow to a favorites list). */}
        {/* The music player sits centered in whatever space is left between the title and the
            toggles, and is the part that gives way if the bar gets tight. */}
        <div className="flex min-w-0 flex-1 justify-center px-2">
          <GameMusic showSfx={!isGus} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {selected === "gusChat" && <GusChatSettings />}
          {!isGus && <BlacklistToggle />}
          {selected !== "tagdle" && !isGus && <FavoritesToggle site={site} />}
        </div>
        <IconButton onClick={() => overlay.current?.close()} title="Close">
          <X size={18} />
        </IconButton>
      </div>

      {/* Positioned wrapper so the mascot can sit in a corner of the game area - the sheet
          covers the grid's own companion. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <MascotLayer inOverlay suppressed={isGus} />
      {selected === "tagdle" ? (
        <TagdleGame site={site} />
      ) : (
        // Tagdle's alley wall + graffiti behind the launcher and every game. The wall is always
        // dark, so the subtree is pinned to the dark theme (data-theme drives the `dark:`
        // variant) whatever the app theme. Keyed so each screen gets a freshly painted wall.
        <div
          key={game?.id ?? "launcher"}
          data-theme="dark"
          // Inherited shadow keeps any text that sits straight on the bricks legible.
          className="tagdle-alley relative min-h-0 flex-1 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_10px_rgb(0_0_0/0.6)]"
          style={game ? ({ "--game": game.color } as CSSProperties) : undefined}
        >
          <Graffiti />
          <div className="relative h-full overflow-y-auto px-4 py-4">
            {!game ? (
              <Launcher site={site} onSelect={setSelected} />
            ) : !isLoaded ? (
              <CenteredSpinner label="Loading…" />
            ) : (
              <GameMetaContext.Provider value={{ name: game.title, site }}>
                <GameBody id={game.id} site={site} onSearch={onSearch} onOpenPopular={onOpenPopular} />
              </GameMetaContext.Provider>
            )}
          </div>
        </div>
      )}
      </div>
    </Overlay>
  );
}

/** "Favorites only" switch - games then draw only from the signed-in user's favorites. Disabled
 *  (with a hint) while signed out. */
function FavoritesToggle({ site }: { site: Site }) {
  const on = useGamesStore((s) => s.favoritesOnly);
  const setOn = useGamesStore((s) => s.setFavoritesOnly);
  const signedIn = useAccountStore((s) => !!s.accounts[site]?.username?.trim());
  const active = on && signedIn;
  return (
    <button
      type="button"
      disabled={!signedIn}
      onClick={() => setOn(!on)}
      title={
        !signedIn
          ? "Sign in (Settings) to play with your favorites"
          : active
            ? "Favorites only: on - games use posts from your favorites. Click to turn off"
            : "Favorites only: off - click to play with posts from your favorites"
      }
      aria-pressed={active}
      className={`${HEADER_TOGGLE} disabled:opacity-40 ${
        active ? "border-pink-400 bg-pink-500/20 text-pink-500 dark:text-pink-300" : HEADER_TOGGLE_OFF
      }`}
    >
      <Heart size={15} className={active ? "fill-current" : ""} />
    </button>
  );
}

/** The header's round icon toggles - icon-only (state in the tooltip and colour) so the bar
 *  fits the sheet alongside the title and music player. */
const HEADER_TOGGLE = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors";
const HEADER_TOGGLE_OFF = "border-black/10 dark:border-white/15 opacity-70 hover:opacity-100";

/** The same "Show blacklisted posts" switch as the shell menu (both write settingsStore's
 *  blacklistDisabled), so it can be flipped without leaving a game. Hidden with no blacklist. */
function BlacklistToggle() {
  const showing = useSettingsStore((s) => s.blacklistDisabled);
  const setShowing = useSettingsStore((s) => s.setBlacklistDisabled);
  const hasBlacklist = useSettingsStore((s) => s.blacklistEntries.length > 0);
  if (!hasBlacklist) return null;
  return (
    <button
      type="button"
      onClick={() => setShowing(!showing)}
      title={
        showing
          ? "Blacklist: off - blacklisted posts are showing. Click to hide them again"
          : "Blacklist: on - click to show blacklisted posts"
      }
      aria-pressed={showing}
      className={`${HEADER_TOGGLE} ${
        showing ? "border-amber-400 bg-amber-500/20 text-amber-600 dark:text-amber-300" : HEADER_TOGGLE_OFF
      }`}
    >
      {showing ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

function GameBody({
  id,
  site,
  onSearch,
  onOpenPopular,
}: {
  id: GameId;
  site: Site;
  onSearch?: (query: string) => void;
  onOpenPopular?: () => void;
}) {
  switch (id) {
    case "higherLower":
      return <HigherLower key={site} site={site} />;
    case "artist":
      return <ArtistGuesser key={site} site={site} />;
    case "species":
      return <SpeciesGuesser key={site} site={site} />;
    case "zoom":
      return <ZoomReveal key={site} site={site} />;
    case "rating":
      return <RatingJudge key={site} site={site} />;
    case "sixDegrees":
      return <SixDegrees key={site} site={site} />;
    case "oddOneOut":
      return <OddOneOut key={site} site={site} />;
    case "yearGuess":
      return <YearGuesser key={site} site={site} />;
    case "bingo":
      return <TagBingo key={site} site={site} />;
    case "gusPet":
      return <GusPet />;
    case "gusChat":
      return <GusChat site={site} onSearch={onSearch} onOpenPopular={onOpenPopular} />;
    case "tagdle":
      return null; // rendered full-bleed by GamesPanel itself
  }
}

/** Each tile's resting tilt, by position - subtle (under 1.5deg) and fixed, so the wall looks
 *  hand-pasted without anything wobbling between renders. */
const TILE_TILTS = [-1.2, 0.9, -0.6, 1.3, -1.4, 0.7, 1.1, -0.9, 0.5, -1.3, 1.2, -0.7];

/** The games with a daily puzzle, in the order the hero banner lists them. */
const DAILY_GAMES: GameId[] = ["tagdle", "sixDegrees", "bingo"];

/** Today's status for a daily game: undefined while its store loads, else done (with a result
 *  line) or ready. */
type DailyStatus = { done: true; result: string } | { done: false } | undefined;

function useDailyStatus(site: Site): Partial<Record<GameId, DailyStatus>> {
  const gamesLoaded = useGamesStore((s) => s.isLoaded);
  const sixDaily = useGamesStore((s) => s.sixDaily);
  const best = useGamesStore((s) => s.best);
  const tagdleLoaded = useTagdleStore((s) => s.isLoaded);
  const tagdleDaily = useTagdleStore((s) => s.daily);
  useEffect(() => {
    void loadTagdle();
  }, []);
  const dayKey = utcDayKey();
  const key = `${site}:${dayKey}`;
  const bingo = bingoDailyBest(best, site, dayKey);
  const tagdle = tagdleDaily[key];
  const hops = sixDaily[key];
  return {
    tagdle: !tagdleLoaded
      ? undefined
      : tagdle
        ? { done: true, result: `${tagdle.filter(Boolean).length}/${tagdle.length}` }
        : { done: false },
    sixDegrees: !gamesLoaded
      ? undefined
      : key in sixDaily
        ? { done: true, result: hops === null ? "gave up" : `${hops} hop${hops === 1 ? "" : "s"}` }
        : { done: false },
    // Replayable, unlike the other two - "done" once a line's been made on today's card.
    bingo: !gamesLoaded
      ? undefined
      : bingo !== undefined
        ? { done: true, result: `${bingo} post${bingo === 1 ? "" : "s"}` }
        : { done: false },
  };
}

/** The launcher: a graffiti "GAMES" hero with today's dailies, then a wall of arcade-cabinet
 *  tiles - each in its game's colour, pasted at a slight angle, straightening up on hover. */
function Launcher({ site, onSelect }: { site: Site; onSelect: (id: GameId) => void }) {
  const best = useGamesStore((s) => s.best);
  const tagdleStreak = useTagdleStore((s) => s.bestStreak[site] ?? 0);
  const dailies = useDailyStatus(site);
  const statFor = (id: GameId) =>
    id === "tagdle" ? (tagdleStreak > 0 ? `Best streak ${tagdleStreak}` : null) : launcherBest(id, best, site);

  return (
    <div className="px-1 pb-4">
      <div className="mb-7 mt-1 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="-rotate-3 select-none pl-2">
          <h2
            className="text-[68px] leading-[0.9] tracking-wide"
            style={{
              fontFamily: '"Rubik Spray Paint", sans-serif',
              color: "#ffe066",
              textShadow: "3px 3px 0 #ff5fa2, 6px 6px 0 rgb(10 8 12)",
            }}
          >
            GAMES
          </h2>
          <p className="pl-1 text-xs font-black uppercase tracking-[0.3em] text-[#7fe7ff]">Pick your poison</p>
        </div>
        <div className="ml-auto flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] opacity-75">Today's dailies</span>
          <div className="flex flex-wrap gap-2">
            {DAILY_GAMES.map((id) => {
              const g = GAMES.find((x) => x.id === id)!;
              const status = dailies[id];
              const ready = status !== undefined && !status.done;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  style={{ "--game": g.color } as CSSProperties}
                  className={`game-sticker-sm game-press flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${
                    ready ? "bg-[rgb(var(--game))]" : "bg-neutral-900/90"
                  }`}
                >
                  <span className="flex scale-75 text-white">{g.icon}</span>
                  {g.title}
                  {status && (
                    <span
                      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black uppercase ${
                        ready ? "bg-yellow-300 text-black [text-shadow:none]" : "bg-white/10 opacity-80"
                      }`}
                    >
                      {status.done ? (
                        <>
                          <Check size={11} strokeWidth={3} /> {status.result}
                        </>
                      ) : (
                        "Ready!"
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {GAMES.map((g, i) => {
          const daily = dailies[g.id];
          const stat = statFor(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              style={{ "--game": g.color, "--tilt": `${TILE_TILTS[i % TILE_TILTS.length]}deg` } as CSSProperties}
              className="game-sticker group relative flex flex-col overflow-hidden rounded-2xl bg-neutral-900/95 text-left
                         rotate-[var(--tilt)] transition-[rotate,scale] duration-200 ease-out
                         hover:z-10 hover:rotate-0 hover:scale-[1.04] focus-visible:z-10 focus-visible:rotate-0
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <div className="game-tile-band relative flex h-20 shrink-0 items-center justify-center bg-[rgb(var(--game))]">
                <span className="game-anim flex scale-[1.8] text-white drop-shadow-[2px_2px_0_rgb(10_8_12/0.55)] group-hover:animate-[game-wiggle_0.5s_ease-in-out]">
                  {g.icon}
                </span>
                {daily && !daily.done && (
                  <span className="game-sticker-sm absolute right-2 top-2 rotate-6 rounded-md bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black uppercase text-black [text-shadow:none]">
                    Daily ready!
                  </span>
                )}
                {daily?.done && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] font-bold">
                    <Check size={10} strokeWidth={3} /> Daily {daily.result}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="text-sm font-black leading-tight">{g.name}</span>
                <span className="text-xs leading-snug opacity-75">{g.blurb}</span>
                {stat && (
                  <span className="mt-auto pt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-bold text-yellow-400">
                      <Trophy size={11} /> {stat}
                    </span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
