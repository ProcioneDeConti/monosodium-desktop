import { useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import { MAX_VIDEO_SPEED, MIN_VIDEO_SPEED, STEP_VIDEO_SPEED } from "../../state/settingsStore";
import { Spinner } from "../ui/Spinner";

interface VideoPlayerProps {
  src: string;
  loopDefault: boolean;
  speedDefault: number;
  autoplayEnabled: boolean;
}

const SPEED_OPTIONS = (() => {
  const out: number[] = [];
  for (let s = MIN_VIDEO_SPEED; s <= MAX_VIDEO_SPEED + 1e-6; s += STEP_VIDEO_SPEED) {
    out.push(Math.round(s * 100) / 100);
  }
  return out;
})();

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Custom controls over a plain <video> element - WebView2's Chromium engine decodes both webm
 *  and mp4 natively, so no video engine dependency is needed (see the project plan). The
 *  loop/speed toggles here only affect the current viewing session, matching the reference app:
 *  the Settings values are just this player's starting point. */
export function VideoPlayer({ src, loopDefault, speedDefault, autoplayEnabled }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(autoplayEnabled);
  const [loop, setLoop] = useState(loopDefault);
  const [speed, setSpeed] = useState(speedDefault);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    setPlaying(autoplayEnabled);
    setLoop(loopDefault);
    setSpeed(speedDefault);
    setProgress(0);
    setDuration(0);
    setBuffering(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
  }, [speed, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, src]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <video
        ref={videoRef}
        src={src}
        loop={loop}
        muted={muted}
        autoPlay={autoplayEnabled}
        playsInline
        className="max-h-full max-w-full object-contain"
        onClick={() => setPlaying((p) => !p)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => !loop && setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
      />

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner size={32} className="text-white/80" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={(e) => {
            const video = videoRef.current;
            const time = Number(e.target.value);
            if (video) video.currentTime = time;
            setProgress(time);
          }}
          className="w-full accent-[rgb(var(--accent))]"
        />
        <div className="flex items-center gap-3 text-xs text-white">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex w-6 items-center justify-center rounded p-1 hover:bg-white/15"
          >
            {playing ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
          </button>
          <span className="tabular-nums opacity-80">
            {formatTime(progress)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded p-1 hover:bg-white/15"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            className={`rounded p-1 hover:bg-white/15 ${loop ? "text-[rgb(var(--accent))]" : ""}`}
            title="Loop"
          >
            <Repeat size={14} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedMenu((v) => !v)}
              className="rounded px-1.5 py-0.5 hover:bg-white/15 tabular-nums"
            >
              {speed}×
            </button>
            {showSpeedMenu && (
              <ul className="absolute bottom-full right-0 mb-1 max-h-48 overflow-auto rounded-[var(--radius-sm)] bg-black/90 py-1 text-xs shadow-lg">
                {SPEED_OPTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        setSpeed(s);
                        setShowSpeedMenu(false);
                      }}
                      className={`block w-full px-3 py-1 text-left hover:bg-white/15 ${
                        s === speed ? "text-[rgb(var(--accent))]" : ""
                      }`}
                    >
                      {s}×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
