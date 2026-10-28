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

/** Mess positions on the floor, as % from the left - fixed so they don't jump on re-render. */
const MESS_SPOTS = [18, 78, 30, 66, 8];

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

      {/* The room. Lights dim while he sleeps. */}
      <div
        className={`relative flex h-72 items-end justify-center overflow-visible rounded-2xl border border-white/10 transition-colors duration-700 ${
          asleep ? "bg-indigo-950/90" : "bg-gradient-to-b from-sky-900/70 to-amber-900/60"
        }`}
      >
        <div className="absolute inset-x-0 bottom-0 h-14 rounded-b-2xl bg-black/30" />

        {Array.from({ length: pet.messes }, (_, i) => (
          <button
            key={i}
            type="button"
            title="Clean it up"
            onClick={() => run({ type: "clean" })}
            className="absolute bottom-4 select-none text-2xl leading-none transition-transform hover:scale-125"
            style={{ left: `${MESS_SPOTS[i % MESS_SPOTS.length]}%`, textShadow: "none" }}
          >
            💩
          </button>
        ))}

        <button
          type="button"
          title={asleep ? `${MASCOT_NAME} is asleep` : `Pet ${MASCOT_NAME}`}
          onClick={() => !asleep && run({ type: "pet" })}
          className="relative mb-6"
        >
          <div
            key={say?.id ?? "idle"}
            className={`mascot-motion ${
              reduced ? "" : say?.motion ? `mascot-m-${say.motion}` : asleep ? "mascot-sleeping" : ""
            }`}
          >
            <Mascot size={150} mood={pet.sick || m === "miserable" ? "sad" : "happy"} bob={!asleep} />
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
      </div>

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

