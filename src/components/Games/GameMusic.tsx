import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, SkipForward, Sparkles, Volume1, Volume2, VolumeX } from "lucide-react";
import { shuffle } from "../../lib/games";
import { useGamesStore } from "../../state/gamesStore";
import { Mascot } from "../ui/Mascot";

// The royalty-free, instrumental tracks in /bgmusic/<genre>/"Artist - Title.opus", bundled by Vite
// into the app itself (so the portable exe carries them too) - add or remove one there and it's
// picked up on the next build. An image with the same base name next to a track is its album art.
// Layout, encoding and sources/licenses: bgmusic/CREDITS.md.
const AUDIO = import.meta.glob<string>("/bgmusic/**/*.{opus,ogg,mp3}", { eager: true, query: "?url", import: "default" });
const ART = import.meta.glob<string>("/bgmusic/**/*.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" });
const artByBase = new Map(Object.entries(ART).map(([path, url]) => [stripExt(path), url]));

interface Track {
  url: string;
  title: string;
  artist: string;
  genre: string;
  art?: string;
}

const TRACKS: Track[] = Object.entries(AUDIO).map(([path, url]) => ({
  url,
  ...parseTrackPath(path),
  art: artByBase.get(stripExt(path)),
}));

function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, "");
}

/** "/bgmusic/jazz/Alex Morgan - Acid Jazz Groove.opus" -> artist "Alex Morgan", title "Acid Jazz
 *  Groove", genre "jazz". From the source path, not the built URL, which carries Vite's content
 *  hash. A file without " - " is all title; one directly in /bgmusic has no genre. */
function parseTrackPath(path: string): Pick<Track, "title" | "artist" | "genre"> {
  const parts = path.split("/");
  const name = stripExt(parts.pop() ?? "");
  const genre = parts.length > 2 ? parts[parts.length - 1] : "";
  const dash = name.indexOf(" - ");
  return dash < 0
    ? { title: name, artist: "", genre }
    : { title: name.slice(dash + 3), artist: name.slice(0, dash), genre };
}

/** Where the volume starts every time the panel opens - quiet background, not remembered, so a
 *  one-off turn-up never carries over to the next session. */
const DEFAULT_VOLUME = 0.25;

/** Background music for the Games panel: a shuffled loop through the bundled tracks, playing for
 *  as long as the panel is mounted. Renders its own play/pause, skip and volume controls; on/off
 *  is remembered in gamesStore; volume always starts at DEFAULT_VOLUME. With `showSfx`, it also
 *  carries the sound-effects toggle, so all the audio controls live in one place. */
export function GameMusic({ showSfx = false }: { showSfx?: boolean }) {
  const isLoaded = useGamesStore((s) => s.isLoaded);
  const on = useGamesStore((s) => s.musicOn);
  const setOn = useGamesStore((s) => s.setMusicOn);
  const sfxOn = useGamesStore((s) => s.sfxOn);
  const setSfxOn = useGamesStore((s) => s.setSfxOn);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  // A fresh shuffle every time the panel opens (it's unmounted while closed) and again each time
  // the playlist runs out, so no two sessions or laps play in the same order.
  const [playlist, setPlaylist] = useState(() => shuffle(TRACKS));
  const [index, setIndex] = useState(0);
  // Whether sound is actually coming out (not just "on" - a blocked autoplay or a track still
  // loading shouldn't bounce the spectrum).
  const [audible, setAudible] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const track = playlist[index];

  useEffect(() => {
    if (index < playlist.length || playlist.length === 0) return;
    const last = playlist[playlist.length - 1];
    let next = shuffle(TRACKS);
    // Never the same song twice in a row across the reshuffle.
    if (next.length > 1 && next[0] === last) next = [...next.slice(1), next[0]];
    setPlaylist(next);
    setIndex(0);
  }, [index, playlist]);

  // One element for the panel's lifetime; stopped and released when the panel closes.
  useEffect(() => {
    const el = new Audio();
    el.preload = "auto";
    audio.current = el;
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const next = () => setIndex((i) => i + 1);
    el.addEventListener("ended", next);
    // A file that won't decode shouldn't stall the playlist.
    el.addEventListener("error", next);
    const up = () => setAudible(true);
    const down = () => setAudible(false);
    el.addEventListener("playing", up);
    el.addEventListener("pause", down);
    el.addEventListener("waiting", down);
    return () => {
      el.removeEventListener("ended", next);
      el.removeEventListener("error", next);
      el.removeEventListener("playing", up);
      el.removeEventListener("pause", down);
      el.removeEventListener("waiting", down);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audio.current;
    if (!el || !track || !isLoaded) return; // track is briefly undefined while a lap reshuffles
    if (!el.src.endsWith(track.url)) el.src = track.url;
    if (on) {
      // Rejected only if the webview blocks autoplay - the play button still works then.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [track, on, isLoaded]);

  if (TRACKS.length === 0) return null;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const byline = [track?.artist, track?.genre].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-full border border-black/10 dark:border-white/15 py-0.5 pl-0.5 pr-1.5">
      <AlbumArt track={track} />
      <div
        className="mr-0.5 w-28 min-w-0 shrink leading-tight"
        title={track ? `${on ? "Now playing" : "Paused"}: ${track.title}${track.artist ? ` - ${track.artist}` : ""}` : undefined}
      >
        <div className="truncate text-xs font-semibold">{track?.title ?? ""}</div>
        <div className="truncate text-[10px] opacity-60">{byline}</div>
      </div>
      <div className="shrink-0"><Spectrum playing={on && audible} /></div>
      <button
        type="button"
        onClick={() => setOn(!on)}
        title={on ? "Pause music" : "Play music"}
        className="shrink-0 rounded-full p-[3px] opacity-80 hover:opacity-100"
      >
        {on ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button
        type="button"
        onClick={() => setIndex(index + 1)}
        title="Next track"
        className="shrink-0 rounded-full p-[3px] opacity-80 hover:opacity-100"
      >
        <SkipForward size={13} />
      </button>
      <button
        type="button"
        onClick={() => setVolume(volume === 0 ? DEFAULT_VOLUME : 0)}
        title={volume === 0 ? "Unmute" : "Mute"}
        className="shrink-0 rounded-full p-[3px] opacity-80 hover:opacity-100"
      >
        <VolumeIcon size={13} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Music volume"
        className="w-14 shrink-0 accent-[rgb(var(--accent))]"
      />
      {showSfx && (
        <button
          type="button"
          onClick={() => setSfxOn(!sfxOn)}
          title={sfxOn ? "Sound effects: on - click to mute them" : "Sound effects: off - click to turn them on"}
          aria-pressed={sfxOn}
          className={`ml-0.5 shrink-0 rounded-full border-l border-black/10 dark:border-white/15 p-[3px] pl-2 ${
            sfxOn ? "text-[rgb(var(--accent))]" : "opacity-40 hover:opacity-80"
          }`}
        >
          <Sparkles size={13} />
        </button>
      )}
    </div>
  );
}

/** The track's own cover if it has one, else Gus in headphones on a club-lit tile. */
function AlbumArt({ track }: { track?: Track }) {
  return (
    <div className="grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(var(--accent)/0.55),#1b1430_70%)] ring-1 ring-black/10 dark:ring-white/15">
      {track?.art ? (
        <img src={track.art} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <Mascot size={28} mood="listening" bob={false} />
      )}
    </div>
  );
}

/** Each bar: animation length, start offset (negative = already mid-bounce), and the height it
 *  holds when motion is reduced. */
const BARS = [
  { d: "0.9s", delay: "-0.2s", rest: 0.55 },
  { d: "1.15s", delay: "-0.7s", rest: 0.9 },
  { d: "0.8s", delay: "-0.4s", rest: 0.4 },
  { d: "1.3s", delay: "-1s", rest: 0.7 },
];

/** A 4-bar "now playing" spectrum - purely decorative, bounces while playing and settles when
 *  paused (index.css .eq-bar). */
function Spectrum({ playing }: { playing: boolean }) {
  return (
    <div aria-hidden className={`flex h-3.5 items-end gap-[2px] ${playing ? "eq-playing" : ""}`}>
      {BARS.map((b, i) => (
        <span
          key={i}
          className="eq-bar h-full w-[3px] rounded-sm bg-[rgb(var(--accent))]"
          style={{ "--eq-d": b.d, "--eq-delay": b.delay, "--eq-rest": b.rest } as CSSProperties}
        />
      ))}
    </div>
  );
}
