import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bath, Brush, Drumstick, Gamepad2, Moon, Pill, Smile, Sparkles, Sun, Trash2, Zap } from "lucide-react";
import {
  act,
  advance,
  ageDays,
  FOODS,
  idleLine,
  mood,
  newPet,
  sickCause,
  type FoodId,
  type PetAction,
  type PetMood,
} from "../../lib/gusPet";
import { MASCOT_NAME, type MascotMotion } from "../../lib/mascot";
import { motionReduced } from "../../lib/theme";
import { useGamesStore } from "../../state/gamesStore";
import { SpeechBubble } from "../Mascot/MascotLayer";
import { Mascot } from "../ui/Mascot";

const TICK_MS = 15_000;
const LINE_MS = 4500;
const IDLE_LINE_EVERY_MS = 40_000;

const MOOD_LABEL: Record<PetMood, string> = {
  sleeping: "Sleeping",
  sick: "Sick",
  miserable: "Miserable",
  grumpy: "Grumpy",
  okay: "Okay",
  happy: "Happy",
};

/** Mess positions on the floor (% from left, % from bottom) - clear of the bed and the bin, and
 *  fixed so they don't jump on re-render. */
const MESS_SPOTS: [number, number][] = [
  [34, 6],
  [64, 14],
  [44, 20],
  [72, 4],
  [55, 3],
];
/** The wall/floor split, % from the top. */
const FLOOR_AT = 62;

/** Tamagotchi-style Gus: four needs that drain in real time (also while the app is closed), and
 *  messes to clean up after he eats. All rules live in lib/gusPet.ts. */
export function GusPet() {
  const stored = useGamesStore((s) => s.pet);
  const setPet = useGamesStore((s) => s.setPet);
  const [now, setNow] = useState(() => Date.now());
  const [say, setSay] = useState<{ id: number; line: string; motion: MascotMotion | null; emoji: string[] } | null>(null);
  const [feeding, setFeeding] = useState(false);
  const sayId = useRef(0);
  const reduced = motionReduced();

  // First visit: he hatches.
  useEffect(() => {
    if (!stored) {
      const born = newPet(Date.now());
      setPet(born);
      speak(`Hi! I'm ${MASCOT_NAME}. Take good care of me!`, "hop", ["🥚", "🐣"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const pet = useMemo(() => (stored ? advance(stored, now) : null), [stored, now]);

  // Clear the bubble after a while.
  useEffect(() => {
    if (!say) return;
    const t = window.setTimeout(() => setSay(null), LINE_MS);
    return () => window.clearTimeout(t);
  }, [say]);

  // Unprompted chatter when nothing else is being said.
  const petRef = useRef(pet);
  petRef.current = pet;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (petRef.current) speak(idleLine(petRef.current), null, []);
    }, IDLE_LINE_EVERY_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(line: string, motion: MascotMotion | null, emoji: string[]) {
    setSay({ id: ++sayId.current, line, motion, emoji });
  }

  function run(action: PetAction) {
    if (!stored) return;
    const t = Date.now();
    const result = act(stored, action, t);
    setNow(t);
    setPet(result.state);
    speak(result.line, result.motion, result.emoji);
    setFeeding(false);
  }

  if (!pet) return null;
  const m = mood(pet);
  const cause = pet.sick ? sickCause(pet) : null;
  const asleep = pet.asleep;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between rounded-full bg-neutral-900/85 px-4 py-1.5 text-sm">
        <span className="font-bold">{MASCOT_NAME}</span>
        <span className="opacity-80">
          Day {ageDays(pet, now) + 1} · <MoodBadge mood={m} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-900/85 p-3">
        <NeedBar icon={<Drumstick size={14} />} label="Hunger" value={pet.hunger} />
        <NeedBar icon={<Sparkles size={14} />} label="Hygiene" value={pet.hygiene} />
        <NeedBar icon={<Smile size={14} />} label="Fun" value={pet.fun} />
        <NeedBar icon={<Zap size={14} />} label="Energy" value={pet.energy} />
      </div>

      <Room
        hour={new Date(now).getHours()}
        asleep={asleep}
        messes={pet.messes}
        grubby={pet.hygiene < 25}
        reduced={reduced}
        onClean={() => run({ type: "clean" })}
        onBed={() => run({ type: asleep ? "wake" : "sleep" })}
        onFood={() => !asleep && setFeeding(true)}
      >
        <button
          type="button"
          title={asleep ? `${MASCOT_NAME} is asleep` : `Pet ${MASCOT_NAME}`}
          onClick={() => !asleep && run({ type: "pet" })}
          className="relative"
        >
          <div
            key={say?.id ?? "idle"}
            className={`mascot-motion ${
              reduced ? "" : say?.motion ? `mascot-m-${say.motion}` : asleep ? "mascot-sleeping" : ""
            }`}
          >
            <Mascot size={asleep ? 104 : 140} mood={pet.sick || m === "miserable" ? "sad" : "happy"} bob={!asleep} />
          </div>
          {asleep && (
            <div className="pointer-events-none absolute -top-2 right-2 text-lg font-bold text-sky-200">
              <span className={reduced ? "" : "mascot-zzz inline-block"}>z</span>
              <span className={reduced ? "" : "mascot-zzz inline-block [animation-delay:1s]"}>z</span>
              <span className={reduced ? "" : "mascot-zzz inline-block [animation-delay:2s]"}>z</span>
            </div>
          )}
          {pet.sick && !asleep && <span className="absolute -right-1 top-2 text-2xl">🤒</span>}
          {say && say.emoji.length > 0 && <Burst key={`e${say.id}`} emoji={say.emoji} reduced={reduced} />}
          {say?.line && <SpeechBubble key={`b${say.id}`} line={say.line} side="right" reduced={reduced} />}
        </button>
      </Room>

      {cause && (
        <p className="rounded-full bg-neutral-900/85 px-3 py-1 text-center text-sm text-amber-300">
          {MASCOT_NAME} is sick from {cause}. Fix that, then give him medicine.
        </p>
      )}

      {feeding ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(FOODS) as FoodId[]).map((id) => (
            <ActionButton key={id} onClick={() => run({ type: "feed", food: id })}>
              <span className="text-lg leading-none">{FOODS[id].emoji}</span>
              {FOODS[id].label}
            </ActionButton>
          ))}
          <button type="button" onClick={() => setFeeding(false)} className="col-span-full text-xs opacity-70 hover:opacity-100">
            Never mind
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <ActionButton disabled={asleep} onClick={() => setFeeding(true)}>
            <Drumstick size={16} /> Feed
          </ActionButton>
          <ActionButton disabled={asleep} onClick={() => run({ type: "groom" })}>
            <Brush size={16} /> Groom
          </ActionButton>
          <ActionButton disabled={asleep} onClick={() => run({ type: "bath" })}>
            <Bath size={16} /> Bath
          </ActionButton>
          <ActionButton disabled={pet.messes === 0} onClick={() => run({ type: "clean" })}>
            <Trash2 size={16} /> Clean up
          </ActionButton>
          <ActionButton disabled={asleep} onClick={() => run({ type: "play" })}>
            <Gamepad2 size={16} /> Play
          </ActionButton>
          {asleep ? (
            <ActionButton onClick={() => run({ type: "wake" })}>
              <Sun size={16} /> Wake up
            </ActionButton>
          ) : (
            <ActionButton onClick={() => run({ type: "sleep" })}>
              <Moon size={16} /> Bedtime
            </ActionButton>
          )}
          <ActionButton disabled={asleep || !pet.sick} onClick={() => run({ type: "medicine" })}>
            <Pill size={16} /> Medicine
          </ActionButton>
        </div>
      )}
    </div>
  );
}

type Daylight = "day" | "dusk" | "night";

function daylight(hour: number): Daylight {
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

const SKY: Record<Daylight, string> = {
  day: "linear-gradient(to bottom, #4fa3e6, #bfe3fb)",
  dusk: "linear-gradient(to bottom, #6b4a9e, #f08a4b 75%, #f7c46b)",
  night: "linear-gradient(to bottom, #0b1030, #27305a)",
};

/** Gus's room: wallpapered wall with a window onto the real time of day, his portrait and
 *  bottle-cap shelf, a plank floor with his bed, bin and bowl (all clickable), and lighting that
 *  dims at night and goes dark - moonlit through the window - while he sleeps. He walks over to
 *  his bed at bedtime. */
function Room({
  hour,
  asleep,
  messes,
  grubby,
  reduced,
  onClean,
  onBed,
  onFood,
  children,
}: {
  hour: number;
  asleep: boolean;
  messes: number;
  grubby: boolean;
  reduced: boolean;
  onClean: () => void;
  onBed: () => void;
  onFood: () => void;
  children: ReactNode;
}) {
  const light = daylight(hour);
  const dark = asleep ? 0.72 : light === "night" ? 0.35 : light === "dusk" ? 0.15 : 0;
  const flies = (messes >= 2 || grubby) && !reduced;
  return (
    <div className="relative h-80 select-none [text-shadow:none]">
      {/* The scenery is clipped to the room; Gus (below) isn't, so his speech bubble can spill out. */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl border-4 border-amber-950/80 shadow-xl">
      {/* Wall: wallpaper stripes over a warm base, darker toward the corners. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: `${FLOOR_AT}%`,
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 40%, rgb(0 0 0 / 0.25)), repeating-linear-gradient(90deg, #d8b98c 0 18px, #cfae80 18px 36px)",
        }}
      />
      {/* Baseboard. */}
      <div className="absolute inset-x-0 h-2.5 bg-[#5a3a22] shadow-[0_2px_4px_rgb(0_0_0/0.4)]" style={{ top: `calc(${FLOOR_AT}% - 10px)` }} />
      {/* Floor: planks, darker toward the back. */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: `${FLOOR_AT}%`,
          background:
            "linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 60%), repeating-linear-gradient(90deg, #8a5a32 0 58px, #6e4626 58px 61px), #8a5a32",
        }}
      />

      {/* Window, with curtains. */}
      <div className="absolute left-[9%] top-[9%] h-[38%] w-[22%] rounded-sm border-[5px] border-[#f3e6cf] shadow-[inset_0_0_8px_rgb(0_0_0/0.35),0_3px_6px_rgb(0_0_0/0.3)]" style={{ background: SKY[light] }}>
        <span className="absolute right-[12%] top-[10%] text-2xl leading-none">{light === "day" ? "☀️" : light === "dusk" ? "🌇" : "🌙"}</span>
        {light === "night" &&
          [
            [15, 20],
            [35, 55],
            [60, 25],
            [25, 75],
            [75, 65],
          ].map(([x, y], i) => (
            <span key={i} className="absolute h-0.5 w-0.5 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-[#f3e6cf]" />
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#f3e6cf]" />
        <div className="absolute -left-4 -top-1.5 h-[115%] w-5 rounded-b-lg bg-gradient-to-r from-rose-700 to-rose-500 shadow" />
        <div className="absolute -right-4 -top-1.5 h-[115%] w-5 rounded-b-lg bg-gradient-to-l from-rose-700 to-rose-500 shadow" />
        <div className="absolute -left-6 -top-3 h-1.5 w-[calc(100%+3rem)] rounded-full bg-[#5a3a22]" />
      </div>

      {/* His portrait. */}
      <div
        title="A portrait of the artist"
        className="absolute right-[11%] top-[8%] flex h-[30%] w-[13%] items-center justify-center overflow-hidden rounded-sm border-[5px] border-[#b8862f] bg-[#f6ecd6] shadow-[0_3px_6px_rgb(0_0_0/0.35)]"
      >
        <Mascot size={46} bob={false} className="!drop-shadow-none" />
      </div>
      {/* Bottle-cap shelf. */}
      <div title="Bottle cap collection. One is gold." className="absolute left-[40%] top-[30%] w-[20%]">
        <div className="flex justify-around px-1">
          {["#c0392b", "#7f8c8d", "#f1c40f", "#2980b9", "#7f8c8d"].map((c, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full border border-black/30"
              style={{ background: c, boxShadow: c === "#f1c40f" ? "0 0 6px #f7dc6f" : undefined }}
            />
          ))}
        </div>
        <div className="h-1.5 rounded-sm bg-[#5a3a22] shadow-[0_2px_3px_rgb(0_0_0/0.4)]" />
      </div>
      <span className="absolute bottom-[34%] left-[1.5%] text-4xl leading-none">🪴</span>

      {/* Rug. */}
      <div className="absolute bottom-[4%] left-1/2 h-[18%] w-[44%] -translate-x-1/2 rounded-[50%] border-4 border-teal-800/70 bg-teal-600/60 shadow-inner" />

      {/* Bed - bedtime / wake up. */}
      <button
        type="button"
        onClick={onBed}
        title={asleep ? "Wake him up" : "Bedtime"}
        className="absolute bottom-[5%] left-[4%] h-[20%] w-[24%] rounded-[50%] bg-rose-900 shadow-[0_4px_8px_rgb(0_0_0/0.45)] transition-transform hover:scale-105"
      >
        <span className="absolute inset-x-[10%] inset-y-[18%] rounded-[50%] bg-rose-300/90" />
      </button>
      {/* Bin and bowl - food. */}
      <button type="button" onClick={onFood} title="Raid the bin (feed)" className="absolute bottom-[8%] right-[4%] text-5xl leading-none transition-transform hover:scale-110">
        🗑️
      </button>
      <button type="button" onClick={onFood} title="Food bowl (feed)" className="absolute bottom-[6%] right-[20%] text-2xl leading-none transition-transform hover:scale-110">
        🥣
      </button>

      {Array.from({ length: messes }, (_, i) => {
        const [x, y] = MESS_SPOTS[i % MESS_SPOTS.length];
        return (
          <button
            key={i}
            type="button"
            title="Clean it up"
            onClick={onClean}
            className="absolute z-[2] text-2xl leading-none transition-transform hover:scale-125"
            style={{ left: `${x}%`, bottom: `${y}%` }}
          >
            💩
          </button>
        );
      })}
      {flies &&
        [0, 1].map((i) => (
          <span
            key={i}
            className="pointer-events-none absolute z-[3] animate-bounce text-sm"
            style={{ left: `${MESS_SPOTS[i][0] + 3}%`, bottom: `${MESS_SPOTS[i][1] + 14}%`, animationDelay: `${i * 300}ms` }}
          >
            🪰
          </span>
        ))}

      {/* Lighting: darker at night, dark when he sleeps, with moonlight from the window. */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-700"
        style={{
          opacity: dark ? 1 : 0,
          background:
            light === "night" || asleep
              ? `radial-gradient(ellipse at 20% 28%, rgb(150 170 255 / 0.12), rgb(8 10 35 / ${dark}) 45%)`
              : `rgb(40 20 50 / ${dark})`,
        }}
      />
      </div>

      {/* Gus: centre stage, or curled up in bed - dimmed to match the room's light. */}
      <div
        className={`absolute z-[4] -translate-x-1/2 ${reduced ? "" : "transition-[left,bottom,filter] duration-700 ease-in-out"}`}
        style={{
          left: asleep ? "16%" : "50%",
          bottom: asleep ? "6%" : "9%",
          filter: dark ? `brightness(${1 - dark * 0.6})` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MoodBadge({ mood: m }: { mood: PetMood }) {
  const color =
    m === "happy" ? "text-green-400" : m === "okay" ? "text-sky-300" : m === "sleeping" ? "text-indigo-300" : m === "grumpy" ? "text-amber-300" : "text-red-400";
  return <span className={`font-semibold ${color}`}>{MOOD_LABEL[m]}</span>;
}

function NeedBar({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  const color = value < 25 ? "bg-red-500" : value < 50 ? "bg-amber-400" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex w-20 items-center gap-1.5 opacity-85">
        {icon}
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${Math.round(value)}%` }} />
      </div>
    </div>
  );
}

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-neutral-900/85 px-3 py-2 text-sm font-semibold
                 transition-colors hover:border-[rgb(var(--accent))] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A few emoji floating up from him - reuses the companion's `mascot-feed` animation. */
function Burst({ emoji, reduced }: { emoji: string[]; reduced: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        emoji: emoji[i % emoji.length],
        x: (Math.random() - 0.5) * 60,
        dx: (Math.random() - 0.5) * 50,
        rot: (Math.random() - 0.5) * 40,
        delay: i * 110,
      })),
    [emoji],
  );
  if (reduced) return <span className="pointer-events-none absolute -top-2 left-1/2 text-2xl">{emoji[0]}</span>;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 h-0 w-0">
      {parts.map((p, i) => (
        <span
          key={i}
          className="mascot-feed absolute select-none text-2xl leading-none"
          style={
            {
              left: p.x,
              animationDelay: `${p.delay}ms`,
              "--feed-dx": `${p.dx}px`,
              "--feed-rot": `${p.rot}deg`,
              "--feed-dur": "1700ms",
            } as CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

