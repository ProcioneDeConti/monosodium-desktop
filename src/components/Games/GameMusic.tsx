import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { shuffle } from "../../lib/games";
import { useGamesStore } from "../../state/gamesStore";

// The royalty-free tracks in /bgmusic, bundled by Vite into the app itself (so the portable exe
// carries them too) - add or remove an mp3 there and it's picked up on the next build.
const TRACKS = Object.entries(
  import.meta.glob<string>("/bgmusic/*.mp3", { eager: true, query: "?url", import: "default" }),
).map(([path, url]) => ({ url, title: trackTitle(path) }));

/** "/bgmusic/alex-morgan-club-music-601087.mp3" -> "alex morgan club music". From the source
 *  path, not the built URL, which carries Vite's content hash. */
function trackTitle(path: string): string {
  return (path.split("/").pop() ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/-\d+$/, "")
    .replace(/[-_]+/g, " ");
}

/** Where the volume starts every time the panel opens - quiet background, not remembered, so a
 *  one-off turn-up never carries over to the next session. */
const DEFAULT_VOLUME = 0.25;

/** Background music for the Games panel: a shuffled loop through the bundled tracks, playing for
 *  as long as the panel is mounted. Renders its own play/pause, skip and volume controls; on/off
 *  is remembered in gamesStore; volume always starts at DEFAULT_VOLUME. */
export function GameMusic() {
  const isLoaded = useGamesStore((s) => s.isLoaded);
  const on = useGamesStore((s) => s.musicOn);
  const setOn = useGamesStore((s) => s.setMusicOn);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  // A fresh shuffle every time the panel opens (it's unmounted while closed) and again each time
  // the playlist runs out, so no two sessions or laps play in the same order.
  const [playlist, setPlaylist] = useState(() => shuffle(TRACKS));
  const [index, setIndex] = useState(0);
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
    return () => {
      el.removeEventListener("ended", next);
      el.removeEventListener("error", next);
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

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5"
      title={on ? `Now playing: ${track?.title ?? ""}` : "Music paused"}
    >
      <Music size={13} className={on ? "text-[rgb(var(--accent))]" : "opacity-50"} />
      <button
        type="button"
        onClick={() => setOn(!on)}
        title={on ? "Pause music" : "Play music"}
        className="rounded-full p-1 opacity-80 hover:opacity-100"
      >
        {on ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button
        type="button"
        onClick={() => setIndex(index + 1)}
        title="Next track"
        className="rounded-full p-1 opacity-80 hover:opacity-100"
      >
        <SkipForward size={13} />
      </button>
      <button
        type="button"
        onClick={() => setVolume(volume === 0 ? DEFAULT_VOLUME : 0)}
        title={volume === 0 ? "Unmute" : "Mute"}
        className="rounded-full p-1 opacity-80 hover:opacity-100"
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
        className="w-20 accent-[rgb(var(--accent))]"
      />
    </div>
  );
}
