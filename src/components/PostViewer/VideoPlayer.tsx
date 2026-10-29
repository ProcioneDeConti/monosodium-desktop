import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pause, Play, Repeat, Volume1, Volume2, VolumeX } from "lucide-react";
import { MAX_VIDEO_SPEED, MIN_VIDEO_SPEED, STEP_VIDEO_SPEED } from "../../state/settingsStore";
import { Spinner } from "../ui/Spinner";
import { useReleaseVideo } from "../../lib/useReleaseVideo";

interface VideoPlayerProps {
  src: string;
  loopDefault: boolean;
  speedDefault: number;
  autoplayEnabled: boolean;
  /** Slideshow mode draws its own bottom bar, so the video's controls stay out of the way. */
  hideControls?: boolean;
}

const SPEED_OPTIONS = (() => {
  const out: number[] = [];
  for (let s = MIN_VIDEO_SPEED; s <= MAX_VIDEO_SPEED + 1e-6; s += STEP_VIDEO_SPEED) {
    out.push(Math.round(s * 100) / 100);
  }
  return out;
})();

/** How long the pointer must sit still over a playing video before the control bar fades out. */
const CONTROLS_IDLE_MS = 2000;
/** Below this displayed width the volume slider is dropped (mute button stays). */
const COMPACT_WIDTH = 280;
/** PostViewer's prev/next arrows sit ~48px in from each stage edge; pad the bar clear of them
 *  when the video spans (nearly) the full stage width. */
const ARROW_GUTTER = 48;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

interface Size {
  w: number;
  h: number;
}

/** The rectangle an `object-contain` video actually occupies inside the stage, so the controls
 *  overlay the picture itself rather than letterbox bars. Null until the stage is measured. */
function useContainBox(stageRef: RefObject<HTMLDivElement | null>, natural: Size | null) {
  const [stage, setStage] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef]);

  if (!stage) return { stage, box: null };
  if (!natural || !natural.w || !natural.h) return { stage, box: stage };
  const scale = Math.min(stage.w / natural.w, stage.h / natural.h);
  return { stage, box: { w: Math.floor(natural.w * scale), h: Math.floor(natural.h * scale) } };
}

/** Control-bar button, styled like the app's IconButton (soft square, hover tint, no zoom). */
function CtrlButton({
  onClick,
  title,
  active,
  children,
  className = "",
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-1.5 transition-colors ${
        active
          ? "bg-[rgb(var(--accent)/0.18)] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.28)]"
          : "text-white/85 hover:bg-white/15 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Pointer-driven horizontal track (seek / volume). Horizontal padding leaves room for the thumb
 *  at both ends so nothing gets clipped. */
function Track({
  value,
  buffered,
  onScrub,
  onDragChange,
  onHover,
  label,
  className = "",
}: {
  value: number;
  buffered?: number;
  onScrub: (fraction: number) => void;
  onDragChange?: (dragging: boolean) => void;
  onHover?: (fraction: number | null) => void;
  label: string;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const fractionAt = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const setDrag = (d: boolean) => {
    setDragging(d);
    onDragChange?.(d);
  };

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={`group/track flex h-4 cursor-pointer touch-none items-center px-1.5 ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        onScrub(fractionAt(e.clientX));
      }}
      onPointerMove={(e) => {
        const f = fractionAt(e.clientX);
        onHover?.(f);
        if (dragging) onScrub(f);
      }}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onPointerLeave={() => onHover?.(null)}
    >
      <div ref={railRef} className="relative w-full">
        <div
          className={`relative w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 ${
            dragging ? "h-[5px]" : "h-[3px] group-hover/track:h-[5px]"
          }`}
        >
          {buffered !== undefined && (
            <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${buffered * 100}%` }} />
          )}
          <div className="absolute inset-y-0 left-0 bg-[rgb(var(--accent))]" style={{ width: `${value * 100}%` }} />
        </div>
        <div
          className={`pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow
            transition-opacity duration-150 ${dragging ? "opacity-100" : "opacity-0 group-hover/track:opacity-100"}`}
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Custom controls over a plain <video> element - WebView2's Chromium engine decodes both webm
 *  and mp4 natively, so no video engine dependency is needed (see the project plan). The
 *  loop/speed toggles here only affect the current viewing session, matching the reference app:
 *  the Settings values are just this player's starting point.
 *
 *  Layout: the stage fills the viewer; a box sized to the video's displayed (object-contain)
 *  rectangle holds the video plus every overlay, so controls never float over letterbox bars. */
export function VideoPlayer({ src, loopDefault, speedDefault, autoplayEnabled, hideControls }: VideoPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [playing, setPlaying] = useState(autoplayEnabled);
  const [loop, setLoop] = useState(loopDefault);
  const [speed, setSpeed] = useState(speedDefault);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const { stage, box } = useContainBox(stageRef, natural);
  useReleaseVideo(videoRef, src);

  useEffect(() => {
    setPlaying(autoplayEnabled);
    setLoop(loopDefault);
    setSpeed(speedDefault);
    setProgress(0);
    setDuration(0);
    setBuffered(0);
    setBuffering(true);
    setNatural(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, [volume, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, src]);

  // Speed menu: close on outside click or Escape (capture phase, so the viewer's own Escape
  // handler doesn't also close the whole viewer).
  useEffect(() => {
    if (!showSpeedMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setShowSpeedMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowSpeedMenu(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [showSpeedMenu]);

  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), CONTROLS_IDLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const updateBuffered = (video: HTMLVideoElement) => {
    if (!video.duration || video.buffered.length === 0) return;
    setBuffered(clamp(video.buffered.end(video.buffered.length - 1) / video.duration, 0, 1));
  };

  const seekTo = (fraction: number) => {
    const time = fraction * (duration || 0);
    const video = videoRef.current;
    if (video) video.currentTime = time;
    setProgress(time);
  };

  const controlsHidden = idle && playing && !showSpeedMenu && !scrubbing;
  const effectiveVolume = muted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;
  const fraction = duration ? clamp(progress / duration, 0, 1) : 0;
  const compact = (box?.w ?? 0) < COMPACT_WIDTH;
  const clearArrows = !!stage && !!box && box.w > stage.w - ARROW_GUTTER * 2;

  // Hover-time tooltip, clamped so it never pokes past the seek bar's ends.
  const TOOLTIP_HALF = 20;
  const seekWidth = seekRef.current?.clientWidth ?? 0;
  const tooltipLeft =
    hoverFraction === null ? 0 : clamp(hoverFraction * seekWidth, TOOLTIP_HALF, Math.max(TOOLTIP_HALF, seekWidth - TOOLTIP_HALF));

  return (
    <div ref={stageRef} className="flex h-full w-full items-center justify-center">
      <div
        className={`relative ${controlsHidden ? "cursor-none" : ""}`}
        style={box ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}
        onPointerMove={poke}
        onPointerLeave={() => setIdle(true)}
      >
        <video
          ref={videoRef}
          src={src}
          loop={loop}
          muted={muted}
          autoPlay={autoplayEnabled}
          playsInline
          className="block h-full w-full object-contain"
          onClick={() => setPlaying((p) => !p)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
          }}
          onProgress={(e) => updateBuffered(e.currentTarget)}
          onEnded={() => !loop && setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
        />

        {/* Centre slot: spinner while buffering, otherwise a play button while paused. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {buffering ? (
            <Spinner size={32} className="text-white/80" />
          ) : (
            !playing && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label="Play"
                className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white
                  ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-[rgb(var(--accent)/0.85)]"
              >
                <Play size={24} className="ml-1 fill-current" />
              </button>
            )
          )}
        </div>

        {!hideControls && (
          <>
            {/* Thin progress line left behind while the bar is auto-hidden. */}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/10 transition-opacity duration-200 ${
                controlsHidden ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="h-full bg-[rgb(var(--accent))]" style={{ width: `${fraction * 100}%` }} />
            </div>

            <div
              className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent pb-2 pt-8 transition-opacity duration-200 ${
                clearArrows ? "px-14" : "px-3"
              } ${controlsHidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
            >
              <div ref={seekRef} className="relative">
                {hoverFraction !== null && duration > 0 && (
                  <div
                    className="pointer-events-none absolute bottom-full mb-1 w-10 -translate-x-1/2 rounded-[var(--radius-sm)] bg-black/85
                      py-0.5 text-center text-[11px] tabular-nums text-white"
                    style={{ left: tooltipLeft }}
                  >
                    {formatTime(hoverFraction * duration)}
                  </div>
                )}
                <Track
                  label="Seek"
                  value={fraction}
                  buffered={buffered}
                  onScrub={seekTo}
                  onDragChange={setScrubbing}
                  onHover={setHoverFraction}
                />
              </div>

              <div className="mt-1 flex items-center gap-1 text-xs text-white">
                <CtrlButton onClick={() => setPlaying((p) => !p)} title={playing ? "Pause" : "Play"}>
                  {playing ? <Pause size={15} className="fill-current" /> : <Play size={15} className="fill-current" />}
                </CtrlButton>

                <CtrlButton onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}>
                  <VolumeIcon size={15} />
                </CtrlButton>
                {!compact && (
                  <Track
                    label="Volume"
                    value={effectiveVolume}
                    onScrub={(f) => {
                      setVolume(f);
                      setMuted(f === 0);
                    }}
                    className="w-20 shrink-0"
                  />
                )}

                <span className="ml-1.5 truncate tabular-nums text-white/70">
                  <span className="text-white">{formatTime(progress)}</span> / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                <CtrlButton onClick={() => setLoop((l) => !l)} title={loop ? "Loop: on" : "Loop: off"} active={loop}>
                  <Repeat size={15} />
                </CtrlButton>

                <div ref={speedRef} className="relative">
                  <CtrlButton
                    onClick={() => setShowSpeedMenu((v) => !v)}
                    title="Playback speed"
                    active={speed !== 1}
                    className="min-w-10 tabular-nums font-medium"
                  >
                    {speed}×
                  </CtrlButton>
                  {showSpeedMenu && (
                    <ul
                      className="absolute bottom-full right-0 z-30 mb-1.5 min-w-16 overflow-auto rounded-[var(--radius-sm)] bg-black/90 p-1
                        text-xs shadow-lg ring-1 ring-white/10"
                      style={{ maxHeight: box ? Math.max(96, Math.min(224, box.h - 56)) : 224 }}
                    >
                      {SPEED_OPTIONS.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            onClick={() => {
                              setSpeed(s);
                              setShowSpeedMenu(false);
                            }}
                            className={`block w-full rounded-[var(--radius-sm)] px-3 py-1 text-left tabular-nums hover:bg-white/15 ${
                              s === speed ? "text-[rgb(var(--accent))]" : "text-white/90"
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
          </>
        )}
      </div>
    </div>
  );
}
