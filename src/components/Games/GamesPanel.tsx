import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Heart,
  Rabbit,
  ScanSearch,
  SearchX,
  Siren,
  SprayCan,
  X,
} from "lucide-react";
import type { GameId } from "../../lib/games";
import type { Site } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { loadGames, useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Graffiti } from "../Tagdle/Graffiti";
import { TagdleGame } from "../Tagdle/TagdlePanel";
import { IconButton } from "../ui/IconButton";
import { Overlay, type OverlayHandle } from "../ui/Overlay";
import { GameMusic } from "./GameMusic";
import { HigherLower } from "./HigherLower";
import { OddOneOut } from "./OddOneOut";
import { TagBingo } from "./TagBingo";
import { YearGuesser } from "./YearGuesser";
import { ArtistGuesser, SpeciesGuesser } from "./GuessGames";
import { RatingJudge } from "./RatingJudge";
import { SixDegrees } from "./SixDegrees";
import { ZoomReveal } from "./ZoomReveal";
import { CenteredSpinner } from "./common";

/** Horny Jail or Sunday School: a police siren and a church sharing one tile, split diagonally. */
function JailOrChurch() {
  return (
    <span className="relative block h-[22px] w-[22px]">
      <Siren size={14} className="absolute left-0 top-0 text-red-400" />
      <Church size={14} className="absolute bottom-0 right-0 text-sky-300" />
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
}

const GAMES: GameInfo[] = [
  {
    id: "tagdle",
    name: "Tagdle",
    blurb: "Which tag has more posts? Daily puzzle + endless.",
    icon: <SprayCan size={22} />, // the alley it lives in
    tint: "from-orange-500/30 to-rose-500/20",
  },
  {
    id: "higherLower",
    name: "Score Sniffer",
    blurb: "Does the next post have a higher score or more favorites? Keep the streak alive.",
    icon: <Dog size={22} />, // sniffing out the score
    tint: "from-sky-500/30 to-indigo-500/20",
  },
  {
    id: "artist",
    name: "Whodunnit",
    blurb: "Who drew this? Four names, ten posts.",
    icon: <FingerprintPattern size={22} />, // the detective angle
    tint: "from-fuchsia-500/30 to-purple-500/20",
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
  },
  {
    id: "zoom",
    name: "Enhance!",
    blurb: "Starts zoomed way in. Every wrong guess pulls the camera back.",
    icon: <ScanSearch size={22} />, // CSI "enhance"
    tint: "from-amber-500/30 to-yellow-500/20",
  },
  {
    id: "rating",
    name: "Horny Jail or Sunday School",
    blurb: "A blurred post and its tags: safe, questionable, or explicit?",
    icon: <JailOrChurch />,
    tint: "from-red-500/30 to-orange-500/20",
  },
  {
    id: "sixDegrees",
    name: "Tag Hopper",
    blurb: "Hop from one tag to another through shared posts. Daily puzzle + endless.",
    icon: <Rabbit size={22} />, // hop
    tint: "from-cyan-500/30 to-blue-500/20",
  },
  {
    id: "oddOneOut",
    name: "Sus",
    blurb: "Three posts share a tag. Spot the impostor.",
    icon: <SearchX size={22} />,
    tint: "from-rose-500/30 to-pink-500/20",
  },
  {
    id: "yearGuess",
    name: "Time Machine",
    blurb: "When was this uploaded? The closer the year, the more points.",
    icon: <CalendarClock size={22} />,
    tint: "from-violet-500/30 to-indigo-500/20",
  },
  {
    id: "bingo",
    name: "Tag Bingo",
    blurb: "Claim posts for the squares on your card. First line in the fewest posts wins.",
    icon: <Grid3x3 size={22} />,
    tint: "from-lime-500/30 to-green-500/20",
  },
];

interface GamesPanelProps {
  site: Site;
  onClose: () => void;
}

/** The Games launcher: a grid of game cards, then the chosen game in the same sheet. Esc (and
 *  the back arrow) return from a game to the launcher; Esc on the launcher closes the panel. */
export function GamesPanel({ site, onClose }: GamesPanelProps) {
  const overlay = useRef<OverlayHandle>(null);
  const [selected, setSelected] = useState<GameId | null>(null);
  const isLoaded = useGamesStore((s) => s.isLoaded);
  const game = GAMES.find((g) => g.id === selected);

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
        <h1 className="text-base font-black tracking-tight">{game ? game.name : "Games"}</h1>
        {/* Every game but Tagdle (whose site-wide tag counts don't narrow to a favorites list). */}
        <div className="ml-auto flex items-center gap-1.5">
          <GameMusic />
          <BlacklistToggle />
          {selected !== "tagdle" && <FavoritesToggle site={site} />}
        </div>
        <IconButton onClick={() => overlay.current?.close()} title="Close">
          <X size={18} />
        </IconButton>
      </div>

      {/* Positioned wrapper so the mascot can sit in a corner of the game area - the sheet
          covers the grid's own companion. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <MascotLayer inOverlay />
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
        >
          <Graffiti />
          <div className="relative h-full overflow-y-auto px-4 py-4">
            {!game ? (
              <Launcher onSelect={setSelected} />
            ) : !isLoaded ? (
              <CenteredSpinner label="Loading…" />
            ) : (
              <GameBody id={game.id} site={site} />
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
      title={signedIn ? "Play with posts from your favorites only" : "Sign in (Settings) to play with your favorites"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors
                  disabled:opacity-40 ${
                    active
                      ? "border-pink-400 bg-pink-500/20 text-pink-500 dark:text-pink-300"
                      : "border-black/10 dark:border-white/15 opacity-70 hover:opacity-100"
                  }`}
    >
      <Heart size={13} className={active ? "fill-current" : ""} />
      Favorites only
    </button>
  );
}

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
      title={showing ? "Blacklisted posts are showing - click to hide them again" : "Show blacklisted posts"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        showing
          ? "border-amber-400 bg-amber-500/20 text-amber-600 dark:text-amber-300"
          : "border-black/10 dark:border-white/15 opacity-70 hover:opacity-100"
      }`}
    >
      {showing ? <EyeOff size={13} /> : <Eye size={13} />}
      {showing ? "Blacklist off" : "Blacklist on"}
    </button>
  );
}

function GameBody({ id, site }: { id: GameId; site: Site }) {
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
    case "tagdle":
      return null; // rendered full-bleed by GamesPanel itself
  }
}

function Launcher({ onSelect }: { onSelect: (id: GameId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {GAMES.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelect(g.id)}
          className={`group flex items-start gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 bg-gradient-to-br ${g.tint} backdrop-blur-sm
                      p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--accent))] hover:shadow-lg`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10 text-[rgb(var(--accent))] transition-transform group-hover:scale-110">
            {g.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{g.name}</span>
            <span className="mt-0.5 block text-xs opacity-70">{g.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
