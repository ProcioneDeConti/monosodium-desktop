import { useEffect, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Globe, Heart, Info, Music, Send, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import mascotUrl from "../../assets/mascot.png";
import { pickSong, playChiptune, type Song } from "../../lib/chiptune";
import { SpeechBubble } from "../Mascot/MascotLayer";
import { useSettingsStore } from "../../state/settingsStore";

interface AboutPanelProps {
  onClose: () => void;
}

const REPO_URL = "https://github.com/ProcioneDeConti/monosodium-desktop";
const TELEGRAM_URL = "https://t.me/ProcioneDeConti";

// Curated - keep roughly in sync with package.json / src-tauri/Cargo.toml. Names only; exact
// versions would just go stale.
const STACK: { group: string; items: string[] }[] = [
  { group: "Languages", items: ["Rust", "TypeScript", "HTML", "CSS"] },
  {
    group: "Frontend",
    items: [
      "React 19",
      "Vite",
      "Tailwind CSS v4",
      "TanStack Query",
      "Zustand",
      "masonic",
      "lucide-react",
    ],
  },
  {
    group: "Backend",
    items: [
      "Tauri 2",
      "reqwest",
      "tokio",
      "serde",
      "governor",
      "aes-gcm · pbkdf2 · sha2",
    ],
  },
  { group: "Platform", items: ["Windows 11 WebView2 (Chromium)"] },
];

function Row({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-black/10 px-3 py-2 text-left text-sm
                 transition-colors hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--accent))]/[0.06] dark:border-white/10"
    >
      <span className="text-[rgb(var(--accent))] opacity-90">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ExternalLink size={13} className="shrink-0 opacity-40" />
    </button>
  );
}

const GUS_SIZE = 110;

/** What Gus says while the theme plays - shuffled, one every few seconds. "¦" adds a small aside. */
const ABOUT_QUIPS = [
  "♪ doo-doo-dee-doo ♪",
  "This one's my jam!",
  "Composed it myself. ¦ on a calculator.",
  "Can't stop, won't stop!",
  "Check out these moves!",
  "Keygen vibes only.",
  "Procione made all this, y'know.",
  "Built by robots, danced by raccoons.",
  "Is this thing on? ¦ the speakers, I mean",
  "Bounce! Bounce! Bounce!",
  "Wheee!",
  "*tiny raccoon headbang*",
  "I'm getting dizzy... ¦ don't stop the music though",
  "Thanks for checking out the About page!",
  "Fun fact: no audio files. ¦ it's all beeps made live",
  "Tail-wiggle break!",
  "Hit the corner yet? ¦ any second now...",
  "Dance like nobody's browsing.",
];
const QUIP_SHOW_MS = 3800;
const QUIP_GAP_MS = 2600;

/** Gus bouncing around the panel DVD-logo style, dancing on the beat (the Konami disco moves,
 *  one cycle per bar), with a speech bubble that travels with him. With reduced motion he dances
 *  in place in a corner instead. */
function DancingGus({ bpm }: { bpm: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;
  // The bubble opens away from the nearer side wall so it stays on-screen.
  const [side, setSide] = useState<"left" | "right">(
    reduced ? "left" : "right",
  );
  const talk = useSettingsStore((st) => st.mascotTalk);
  const [quip, setQuip] = useState<{ line: string; n: number } | null>(null);

  // Every couple of bars, a flourish: a full spin or a twirl (turning around and back).
  const bar = (60 / bpm) * 4 * 1000;
  const [move, setMove] = useState<{
    kind: "spin" | "twirl";
    n: number;
  } | null>(null);
  useEffect(() => {
    if (reduced) return;
    let n = 0;
    let t = 0;
    function next() {
      t = window.setTimeout(
        () => {
          setMove({ kind: Math.random() < 0.5 ? "spin" : "twirl", n: n++ });
          t = window.setTimeout(() => {
            setMove(null);
            next();
          }, bar);
        },
        bar * (1 + Math.floor(Math.random() * 3)),
      );
    }
    next();
    return () => window.clearTimeout(t);
  }, [bar, reduced]);

  useEffect(() => {
    if (talk === "never") return;
    const order = [...ABOUT_QUIPS].sort(() => Math.random() - 0.5);
    let n = 0;
    let t = 0;
    function say() {
      setQuip({ line: order[n % order.length], n });
      n++;
      t = window.setTimeout(() => {
        setQuip(null);
        t = window.setTimeout(say, QUIP_GAP_MS);
      }, QUIP_SHOW_MS);
    }
    t = window.setTimeout(say, 1500);
    return () => window.clearTimeout(t);
  }, [talk]);

  useEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box || reduced) return;
    let x = Math.random() * Math.max(0, box.clientWidth - GUS_SIZE);
    let y = Math.random() * Math.max(0, box.clientHeight - GUS_SIZE);
    let vx = 140 * (Math.random() < 0.5 ? -1 : 1);
    let vy = 105 * (Math.random() < 0.5 ? -1 : 1);
    let last = performance.now();
    let raf = 0;
    let lastSide: "left" | "right" | null = null;
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const maxX = box!.clientWidth - GUS_SIZE;
      const maxY = box!.clientHeight - GUS_SIZE;
      x += vx * dt;
      y += vy * dt;
      if (x < 0 || x > maxX) {
        vx = -vx;
        x = Math.max(0, Math.min(maxX, x));
      }
      if (y < 0 || y > maxY) {
        vy = -vy;
        y = Math.max(0, Math.min(maxY, y));
      }
      el!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const s = x + GUS_SIZE / 2 < box!.clientWidth / 2 ? "right" : "left";
      if (s !== lastSide) {
        lastSide = s;
        setSide(s);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={ref}
        className={`absolute ${reduced ? "bottom-4 right-4" : "left-0 top-0"}`}
        // Own compositor layer: moving a filtered/shadowed element every frame without one can
        // leave a stale copy painted behind in WebView2.
        style={{ width: GUS_SIZE, height: GUS_SIZE, willChange: "transform" }}
      >
        <div
          style={
            move
              ? { animation: `about-${move.kind} ${bar}ms ease-in-out` }
              : undefined
          }
        >
          <img
            src={mascotUrl}
            alt=""
            aria-hidden
            draggable={false}
            width={GUS_SIZE}
            height={GUS_SIZE}
            className="select-none drop-shadow-[0_6px_14px_rgb(0_0_0/0.3)]"
            style={{
              animation: `mascot-m-disco ${(60 / bpm) * 4}s linear infinite`,
            }}
          />
        </div>
        {quip && (
          <SpeechBubble
            key={quip.n}
            line={quip.line}
            side={side}
            reduced={reduced}
          />
        )}
      </div>
    </div>
  );
}

/** Menu → About. Plain local state, not part of the nav stack (same as Help / the cheatsheet). */
export function AboutPanel({ onClose }: AboutPanelProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  // The theme tune + dancing Gus. Off until asked for - no surprise audio. Stops on close.
  // Each press of play picks a random song (never the same twice running).
  const [song, setSong] = useState<Song | null>(null);
  const party = song !== null;
  useEffect(() => {
    if (!song) return;
    const playing = playChiptune(song);
    return () => playing?.stop();
  }, [song]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[65] flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(var(--lt-surface))] dark:bg-[rgb(var(--dk-surface))]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Info size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">About</h1>
        {song && (
          <span className="ml-auto truncate text-xs italic opacity-60">
            ♪ {song.title}
          </span>
        )}
        <IconButton
          onClick={() => setSong((cur) => (cur ? null : pickSong()))}
          title={party ? "Stop the music" : "Play the theme"}
          className={`${party ? "text-[rgb(var(--accent))]" : "ml-auto"}`}
        >
          <Music size={16} />
        </IconButton>
        <IconButton onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </IconButton>
      </div>

      <div className="relative min-w-0 flex-1 overflow-y-auto">
        {song && <DancingGus key={song.title} bpm={song.bpm} />}
        <div className="mx-auto max-w-lg px-6 py-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] shadow-lg">
              <Info size={30} />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Monosodium Desktop
            </h2>
            <p className="mt-0.5 text-xs opacity-55">
              {version ? `Version ${version}` : " "}
            </p>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed opacity-75">
              A desktop browser for e621 and its sister site e6AI. Not
              affiliated with, endorsed by, or operated by either site.
            </p>
          </div>

          <p className="my-7 flex items-center justify-center gap-1.5 text-center text-sm italic opacity-70">
            Conceptualized by humans, constructed by robots, built with{" "}
            <Heart
              size={13}
              className="text-[rgb(var(--accent))]"
              fill="currentColor"
            />{" "}
            love.
          </p>

          <div className="mb-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">
              Developer
            </h3>
            <p className="mb-2 text-sm">
              Procione DeConti
              <span className="opacity-55">
                {" "}
                · © {new Date().getFullYear()}
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <Row
                icon={<Send size={14} />}
                onClick={() => void openUrl(TELEGRAM_URL)}
              >
                Telegram — @ProcioneDeConti
              </Row>
              <Row
                icon={<Globe size={14} />}
                onClick={() => void openUrl(REPO_URL)}
              >
                GitHub — ProcioneDeConti/monosodium-desktop
              </Row>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">
              Built with
            </h3>
            <div className="flex flex-col gap-3">
              {STACK.map((s) => (
                <div key={s.group}>
                  <div className="mb-1 text-xs font-semibold opacity-70">
                    {s.group}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] dark:bg-white/[0.07]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
