import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bath, Brush, Drumstick, Flame, Gamepad2, Heart, Moon, Pill, Smile, Sparkles, Sun, Trash2, Zap } from "lucide-react";
import {
  act,
  advance,
  ageDays,
  FOODS,
  HORNY_HIGH,
  idleLine,
  mood,
  newPet,
  sickCause,
  type FoodId,
  type PetAction,
  type PetMood,
} from "../../lib/gusPet";
import { EMPTY_BOND, GIFTS, hasFiveHearts, isPartner, satisfied, speciesEmoji } from "../../lib/gusBond";
import { fursonaSpecies } from "../../lib/gusBrain";
import { MASCOT_NAME, type MascotMotion } from "../../lib/mascot";
import { motionReduced } from "../../lib/theme";
import { useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { SpeechBubble } from "../Mascot/MascotLayer";
import { Mascot } from "../ui/Mascot";
import laptopScreenUrl from "../../assets/laptop-e621.jpg";

const TICK_MS = 15_000;

/** Window visitors (easter egg) - see Room. */
type Visitor = "dog" | "fox" | "owl";
const VISITOR_CHECK_MS = 60_000;
const VISITOR_CHANCE = 0.25;
const VISITOR_STAY_MS = 6000;
const VISITOR_LINES: Record<Visitor, { title: string; awake: string[]; asleep: string; motion: MascotMotion; emoji: string[] }> = {
  dog: {
    title: "Who's a good boy?",
    awake: ["Oh! It's my buddy! Hi buddy!", "That's the neighbour's dog! He's a good boy. Don't tell him I said that.", "Hey! No sniffing my window!", "He's here for my snacks, isn't he."],
    asleep: "*snore*… mmf… doggo?…",
    motion: "hop",
    emoji: ["🐕", "❤️"],
  },
  fox: {
    title: "A fox!",
    awake: ["A FOX! At MY window! Best day of my life!", "Fox! Come in! Stay! Bring friends!", "*presses face to the glass* Hiiii fox!", "Did you see that?! A real fox! Nobody's going to believe me."],
    asleep: "*snore*… mmh… foxes… so many foxes…",
    motion: "spin",
    emoji: ["🦊", "😍", "💕"],
  },
  owl: {
    title: "Hoo's there?",
    awake: ["Hoo's there? …Sorry. Had to.", "An owl! Fellow night-shifter. Respect.", "He's judging my bin-raiding technique. I can tell.", "Those eyes. He's seen things. Trash things."],
    asleep: "*snore*… hoo… hoo who…",
    motion: "tilt",
    emoji: ["🦉", "🌙"],
  },
};
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
  // Keepsakes from Talk to Gus (lib/gusBond.ts) show up in his room.
  const chat = useGamesStore((s) => s.chat);
  const bond = { ...EMPTY_BOND, ...chat.bond };
  const chatAffection = chat.affection;
  const chatFursona = chat.facts.fursona ?? fursonaSpecies(chat.name);
  const [now, setNow] = useState(() => Date.now());
  const [say, setSay] = useState<{ id: number; line: string; motion: MascotMotion | null; emoji: string[] } | null>(null);
  const [feeding, setFeeding] = useState(false);
  const sayId = useRef(0);
  const reduced = motionReduced();
  // Horniness (meter + Flirt/Yiff break) only exists in adult mode with Explicit enabled.
  const adult = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));
  const adultRef = useRef(adult);
  adultRef.current = adult;

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
      if (petRef.current) speak(idleLine(petRef.current, Math.random, adultRef.current), null, []);
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
  const isSatisfied = satisfied(bond, now);
  const cause = pet.sick ? sickCause(pet) : null;
  const asleep = pet.asleep;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="grid grid-cols-3 items-center rounded-full bg-neutral-900/85 px-4 py-1.5 text-sm">
        <span className="font-bold">{MASCOT_NAME}</span>
        <span className="text-center">
          {adult && isSatisfied ? <span className="rounded-full bg-pink-500/25 px-2 py-0.5 text-xs font-semibold text-pink-200">😌 Satisfied</span> : <MoodBadge mood={m} />}
        </span>
        <span className="text-right tabular-nums opacity-80">
          Day {ageDays(pet, now) + 1} · {new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-900/85 p-3">
        <NeedBar icon={<Drumstick size={14} />} label="Hunger" value={pet.hunger} />
        <NeedBar icon={<Sparkles size={14} />} label="Hygiene" value={pet.hygiene} />
        <NeedBar icon={<Smile size={14} />} label="Fun" value={pet.fun} />
        <NeedBar icon={<Zap size={14} />} label="Energy" value={pet.energy} />
        {adult && <NeedBar icon={<Flame size={14} />} label="Horniness" value={pet.horny ?? 0} rising high={HORNY_HIGH} />}
      </div>

      <Room
        hour={new Date(now).getHours()}
        asleep={asleep}
        messes={pet.messes}
        grubby={pet.hygiene < 25}
        reduced={reduced}
        onClean={() => run({ type: "clean" })}
        onBed={() => run({ type: asleep ? "wake" : "sleep" })}
        explicit={adult}
        keepsakes={{
          gift: bond.gift ? GIFTS[bond.gift] : null,
          doodle: bond.maxedAt && hasFiveHearts(chatAffection) ? speciesEmoji(chatFursona) : null,
          partner: isPartner(bond, chatAffection) && adult,
          satisfied: isSatisfied && adult,
        }}
        onFood={() => !asleep && setFeeding(true)}
        onVisitor={(kind) => {
          const v = VISITOR_LINES[kind];
          speak(asleep ? v.asleep : v.awake[Math.floor(Math.random() * v.awake.length)], asleep ? null : v.motion, v.emoji);
        }}
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
            <Mascot size={asleep ? 104 : 140} mood={asleep ? "asleep" : pet.sick || m === "miserable" ? "sad" : "happy"} bob={!asleep} />
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
          {adult && (
            <>
              <ActionButton disabled={asleep} onClick={() => run({ type: "flirt" })}>
                <Heart size={16} /> Flirt
              </ActionButton>
              <ActionButton disabled={asleep} onClick={() => run({ type: "relieve" })}>
                <Flame size={16} /> Yiff break
              </ActionButton>
            </>
          )}
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
 *  trinket shelf, a potted plant, a plank floor with his bed, bin and bowl (all clickable), and lighting that
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
  explicit,
  keepsakes,
  onVisitor,
  children,
}: {
  /** What Talk to Gus's bond has put in his room (lib/gusBond.ts). */
  keepsakes: { gift: { emoji: string; name: string } | null; doodle: string | null; partner: boolean; satisfied: boolean };
  hour: number;
  asleep: boolean;
  messes: number;
  grubby: boolean;
  reduced: boolean;
  onClean: () => void;
  onBed: () => void;
  onFood: () => void;
  /** Adult + explicit mode: the laptop shows a real e621 screenshot instead of the drawn page. */
  explicit: boolean;
  /** Clicked a visitor in the window. */
  onVisitor: (kind: Visitor) => void;
  children: ReactNode;
}) {
  const light = daylight(hour);
  // Easter egg: every VISITOR_CHECK_MS there's a VISITOR_CHANCE someone peeks in for VISITOR_STAY_MS -
  // the dog or the fox any time, the owl only at night. `kind` outlives `up` so the one who's
  // leaving stays drawn while sinking out of view.
  const [visitor, setVisitor] = useState<{ kind: Visitor; up: boolean } | null>(null);
  const nightRef = useRef(light === "night");
  nightRef.current = light === "night";
  useEffect(() => {
    let rise: number | undefined;
    let hide: number | undefined;
    const id = window.setInterval(() => {
      if (Math.random() >= VISITOR_CHANCE) return;
      const pool: Visitor[] = nightRef.current ? ["dog", "fox", "owl"] : ["dog", "fox"];
      // Mounted below the sill first, raised a beat later, so the transition actually plays.
      setVisitor({ kind: pool[Math.floor(Math.random() * pool.length)], up: false });
      rise = window.setTimeout(() => setVisitor((v) => v && { ...v, up: true }), 50);
      hide = window.setTimeout(() => setVisitor((v) => v && { ...v, up: false }), VISITOR_STAY_MS);
    }, VISITOR_CHECK_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(rise);
      window.clearTimeout(hide);
    };
  }, []);
  const dark = asleep ? 0.72 : light === "night" ? 0.35 : light === "dusk" ? 0.15 : 0;
  const lampOn = !asleep && light !== "day";
  const flies = (messes >= 2 || grubby) && !reduced;
  return (
    <div className="relative h-80 select-none [text-shadow:none]">
      {/* The scenery is clipped to the room; Gus (below) isn't, so his speech bubble can spill out.
          `isolate` keeps the lighting overlay's z-index inside the scenery - without it the overlay sat
          above Gus too and greyed him out on top of his own brightness filter. */}
      <div className="absolute inset-0 isolate overflow-hidden rounded-2xl border-4 border-amber-950/80 shadow-xl">
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
        {/* A visitor, rising from below the sill - clipped to the glass, behind the mullions. */}
        <div className="absolute inset-0 overflow-hidden">
          {visitor && (
            <button
              type="button"
              title={VISITOR_LINES[visitor.kind].title}
              tabIndex={visitor.up ? 0 : -1}
              disabled={!visitor.up}
              onClick={() => {
                setVisitor({ ...visitor, up: false });
                onVisitor(visitor.kind);
              }}
              className={`absolute bottom-0 left-[14%] aspect-square w-[72%] ${reduced ? "" : "transition-transform duration-1000 ease-out"}`}
              style={{ transform: visitor.up ? `translateY(28%) rotate(${visitor.kind === "owl" ? 6 : -5}deg)` : "translateY(105%)" }}
            >
              {visitor.kind === "dog" ? <Dog /> : visitor.kind === "fox" ? <Fox /> : <Owl />}
            </button>
          )}
        </div>
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-[#f3e6cf]" />
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#f3e6cf]" />
        <div className="absolute -left-4 -top-1.5 h-[115%] w-5 rounded-b-lg bg-gradient-to-r from-rose-700 to-rose-500 shadow" />
        <div className="absolute -right-4 -top-1.5 h-[115%] w-5 rounded-b-lg bg-gradient-to-l from-rose-700 to-rose-500 shadow" />
        <div className="absolute -left-6 -top-3 h-1.5 w-[calc(100%+3rem)] rounded-full bg-[#5a3a22]" />
      </div>

      {/* His portrait: a fixed 4:5 frame (width from height, so the room's shape can't squash it),
          Gus as a bust in front of a mountain landscape. */}
      <div
        title="A portrait of the artist"
        className="absolute right-[11%] top-[8%] aspect-[4/5] h-[30%] overflow-hidden rounded-sm border-[5px] border-[#b8862f] shadow-[0_3px_6px_rgb(0_0_0/0.35),inset_0_0_0_1px_#7a5a1f]"
      >
        <svg aria-hidden viewBox="0 0 40 50" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="gus-portrait-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7fb6e8" />
              <stop offset="1" stopColor="#f7d9a8" />
            </linearGradient>
          </defs>
          <rect width="40" height="50" fill="url(#gus-portrait-sky)" />
          <circle cx="31" cy="11" r="4" fill="#fff3c4" opacity="0.9" />
          {/* Far range, with snowcaps. */}
          <path d="M0 30 L9 14 L16 24 L24 10 L33 22 L40 16 V50 H0 Z" fill="#8a9cc0" />
          <path d="M9 14 L11.5 18.5 L9.8 17.5 L8 19 L6.8 19.3 Z M24 10 L27 15 L25 14 L23 16 L21.3 14.4 Z" fill="#f4f7fb" />
          {/* Near hills. */}
          <path d="M0 36 Q10 28 20 34 T40 31 V50 H0 Z" fill="#5f8f5a" />
          <path d="M0 42 Q14 36 26 41 T40 40 V50 H0 Z" fill="#4a7a47" />
        </svg>
        <Mascot size={58} bob={false} className="!drop-shadow-none absolute -bottom-1 left-1/2 max-w-none shrink-0 -translate-x-1/2" />
      </div>
      {/* Trinket shelf: a wooden plank on two brackets holding a gold trophy, a little framed e621
          sign, raccoon and fox figurines on plinths (the fox is his favorite) and a jar of bottle
          caps. Drawn items share one baseline and a consistent scale so it reads as one shelf. */}
      <div className="absolute left-[34%] top-[19%] w-[32%]">
        <div className="flex h-9 items-end justify-around px-1.5">
          <svg aria-hidden viewBox="0 0 24 32" className="h-8 drop-shadow-[0_0_4px_rgb(247_220_111/0.6)]">
            <title>World's Best Raccoon trophy</title>
            <path d="M5 3 H19 V10 Q19 17 12 18 Q5 17 5 10 Z" fill="#f1c40f" stroke="#a67c00" strokeWidth="1" />
            <path d="M5 5 Q1 5 1.5 9 Q2 12 5.5 12 M19 5 Q23 5 22.5 9 Q22 12 18.5 12" stroke="#d4a017" strokeWidth="1.6" fill="none" />
            <path d="M8 5 V11 Q8 14 11 15" stroke="#fff6c8" strokeWidth="1.2" fill="none" opacity="0.8" />
            <rect x="10.5" y="18" width="3" height="5" fill="#d4a017" />
            <rect x="7" y="23" width="10" height="3" rx="0.8" fill="#d4a017" stroke="#a67c00" strokeWidth="0.8" />
            <rect x="5.5" y="26" width="13" height="6" rx="1" fill="#5a3a22" stroke="#3b2414" strokeWidth="0.8" />
            <rect x="8" y="28" width="8" height="2" rx="0.5" fill="#e8c766" />
          </svg>
          <span
            title="e621"
            className="mb-px rotate-[-4deg] rounded-[3px] border-2 border-[#7a4a26] bg-[#012e57] px-1 py-0.5 text-[9px] font-extrabold leading-none tracking-tight text-[#fcb328] shadow-[0_1px_3px_rgb(0_0_0/0.5)]"
          >
            e621
          </span>
          <Figurine emoji="🦝" title="A tiny raccoon. Handsome." />
          <svg aria-hidden viewBox="0 0 20 26" className="h-6">
            <title>Bottle cap collection. One is gold.</title>
            <path d="M3 5 H17 V23 Q17 25 15 25 H5 Q3 25 3 23 Z" fill="rgb(200 230 255 / 0.35)" stroke="rgb(220 240 255 / 0.8)" strokeWidth="1" />
            <rect x="2.5" y="2" width="15" height="3.5" rx="1" fill="#8a8f96" stroke="#5c6168" strokeWidth="0.8" />
            <circle cx="7" cy="21" r="2.6" fill="#c0392b" stroke="#00000055" strokeWidth="0.6" />
            <circle cx="13" cy="21" r="2.6" fill="#2980b9" stroke="#00000055" strokeWidth="0.6" />
            <circle cx="10" cy="16.5" r="2.6" fill="#f1c40f" stroke="#a67c00" strokeWidth="0.6" />
            <circle cx="6.5" cy="12.5" r="2.6" fill="#7f8c8d" stroke="#00000055" strokeWidth="0.6" />
            <circle cx="13" cy="12" r="2.6" fill="#27ae60" stroke="#00000055" strokeWidth="0.6" />
            <path d="M5 7 V22" stroke="#fff" strokeWidth="0.8" opacity="0.5" />
          </svg>
          <Figurine emoji="🦊" title="Fox figurine. Prized possession." />
          {keepsakes.gift && <Figurine emoji={keepsakes.gift.emoji} title={`${keepsakes.gift.name} - a gift for you, kept safe`} />}
          {keepsakes.doodle && (
            <span
              title="A crayon doodle of you two. He drew it himself."
              className="mb-px rotate-[5deg] rounded-[2px] border-2 border-[#c9a36b] bg-[#fffaf0] px-0.5 text-[10px] leading-tight shadow-[0_1px_3px_rgb(0_0_0/0.5)]"
            >
              🦝<span className="text-[7px]">💕</span>
              {keepsakes.doodle}
            </span>
          )}
          {keepsakes.partner && <Figurine emoji="🏷️" title="Matching collar tags. Official partners." />}
        </div>
        {/* Plank with a lit top edge, and two brackets. */}
        <div className="h-2 rounded-[2px] border-t-2 border-[#8f5a30] bg-[#5a3a22] shadow-[0_3px_4px_rgb(0_0_0/0.45)]" />
        <div className="flex justify-between px-[12%]">
          <span className="h-2.5 w-2 [clip-path:polygon(0_0,100%_0,0_100%)] bg-[#4a2c16]" />
          <span className="h-2.5 w-2 [clip-path:polygon(0_0,100%_0,100%_100%)] bg-[#4a2c16]" />
        </div>
      </div>

      {/* Rug. */}
      <div className="absolute bottom-[7%] left-[53%] h-[18%] w-[44%] -translate-x-1/2 rounded-[50%] border-4 border-teal-800/70 bg-teal-600/60 shadow-inner" />

      {/* Potted plant against the back wall, in the gap between the shelf and his portrait. */}
      <svg
        aria-hidden
        viewBox="0 0 40 70"
        className="pointer-events-none absolute bottom-[32%] left-[67.5%] h-[22%] drop-shadow-[0_3px_4px_rgb(0_0_0/0.4)]"
      >
        <g fill="#3f8f3a" stroke="#2a6326" strokeWidth="1">
          <path d="M20 44 Q6 36 4 18 Q16 24 20 44 Z" />
          <path d="M20 44 Q34 36 36 16 Q24 24 20 44 Z" />
          <path d="M20 44 Q12 22 18 2 Q26 22 20 44 Z" fill="#4ca646" />
          <path d="M20 44 Q8 40 2 32 Q14 32 20 44 Z" fill="#4ca646" />
          <path d="M20 44 Q32 40 38 30 Q26 32 20 44 Z" />
        </g>
        <path d="M7 44 H33 L30 68 H10 Z" fill="#c1693c" stroke="#8a4524" strokeWidth="1.2" />
        <rect x="5" y="42" width="30" height="7" rx="1.5" fill="#d27a4a" stroke="#8a4524" strokeWidth="1.2" />
      </svg>

      {/* Desk against the back wall under the shelf (left of centre, so the laptop clears his head
          when he's standing), with the laptop open to e621 - his favorites, naturally. */}
      <svg
        aria-hidden
        viewBox="0 0 120 60"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-[31%] left-[34%] h-[16%] w-[23%] drop-shadow-[0_3px_4px_rgb(0_0_0/0.4)]"
      >
        <rect x="8" y="10" width="7" height="50" fill="#5a3a22" />
        <rect x="105" y="10" width="7" height="50" fill="#5a3a22" />
        <rect x="70" y="10" width="42" height="26" fill="#6a4428" stroke="#4a2c16" strokeWidth="1.2" />
        <rect x="86" y="20" width="10" height="3" rx="1.5" fill="#c9a36b" />
        <rect x="0" y="2" width="120" height="9" rx="1.5" fill="#8f5a30" stroke="#4a2c16" strokeWidth="1.2" />
        <rect x="1" y="2.5" width="118" height="2" fill="#b07a48" opacity="0.6" />
      </svg>
      <Laptop explicit={explicit} className="absolute bottom-[45%] left-[36%] w-[11%]" />

      {/* Bed - bedtime / wake up. */}
      <button
        type="button"
        onClick={onBed}
        title={asleep ? "Wake him up" : "Bedtime"}
        className="absolute bottom-[3%] left-[3%] h-[30%] w-[27%] transition-transform hover:scale-105"
      >
        {/* A little wooden bed, side-on: headboard left, footboard right, a pillow, a mattress and
            a patchwork-ish quilt hanging over the side. Stretches to the button's box. */}
        <svg viewBox="0 0 120 80" preserveAspectRatio="none" className="h-full w-full drop-shadow-[0_4px_6px_rgb(0_0_0/0.45)]">
          {/* Legs. */}
          <rect x="6" y="66" width="7" height="12" rx="1.5" fill="#4a2c16" />
          <rect x="107" y="66" width="7" height="12" rx="1.5" fill="#4a2c16" />
          {/* Headboard, with a rounded top and an inset panel. */}
          <path d="M4 70 V18 Q4 6 17 6 Q30 6 30 18 V70 Z" fill="#7a4a26" stroke="#4a2c16" strokeWidth="2" />
          <path d="M10 40 V20 Q10 12 17 12 Q24 12 24 20 V40 Z" fill="#8f5a30" />
          {/* Footboard. */}
          <path d="M102 70 V40 Q102 32 109 32 Q116 32 116 40 V70 Z" fill="#7a4a26" stroke="#4a2c16" strokeWidth="2" />
          {/* Frame rail. */}
          <rect x="12" y="58" width="98" height="10" rx="2" fill="#6a3f20" stroke="#4a2c16" strokeWidth="1.5" />
          {/* Mattress. */}
          <rect x="22" y="44" width="84" height="16" rx="5" fill="#f4ede0" stroke="#cbbfa8" strokeWidth="1" />
          {/* Pillow. */}
          <path d="M26 46 Q24 36 34 35 L48 35 Q56 36 54 46 Q40 49 26 46 Z" fill="#ffffff" stroke="#d6cdbd" strokeWidth="1" />
          {/* Quilt over the foot end, folded back at the top, draping down the side. */}
          <path d="M50 44 Q76 40 106 44 L106 64 Q78 68 50 64 Z" fill="#be4b5c" stroke="#8e2f3e" strokeWidth="1.5" />
          <path d="M50 44 Q76 40 106 44 L106 49 Q78 46 50 49 Z" fill="#f1d3d8" />
          <path d="M68 47 V65 M87 46 V66 M50 56 Q78 59 106 56" stroke="#8e2f3e" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.7" />
          {/* Afterwards: rumpled sheets and a squashed pillow. */}
          {keepsakes.satisfied && (
            <g fill="none" stroke="#8e2f3e" strokeWidth="1.6" strokeLinecap="round">
              <path d="M56 52 Q62 47 68 53 T80 51" />
              <path d="M74 60 Q82 55 90 60 T102 57" />
              <path d="M30 41 Q38 44 46 40" stroke="#bfb4a2" />
            </g>
          )}
        </svg>
        {keepsakes.satisfied && (
          <span className="pointer-events-none absolute left-[1%] top-[22%] rotate-[-8deg] rounded-sm border border-red-900 bg-red-600 px-1 text-[7px] font-extrabold leading-tight text-white shadow">
            DO NOT
            <br />
            DISTURB
          </span>
        )}
      </button>
      {/* Floor lamp in the back corner - lit (see the glow layer below) at dusk/night while he's up. */}
      <svg aria-hidden viewBox="0 0 30 160" className="pointer-events-none absolute bottom-[32%] right-[1.5%] h-[52%] drop-shadow-[0_3px_4px_rgb(0_0_0/0.4)]">
        <ellipse cx="15" cy="155" rx="11" ry="4" fill="#3b2a1e" />
        <rect x="13.8" y="36" width="2.4" height="118" fill="#8a6a3a" />
        <circle cx="15" cy="96" r="2.2" fill="#a8844a" />
        <path d="M5 38 L8 6 H22 L25 38 Z" fill={lampOn ? "#ffe2a8" : "#e9d8b8"} stroke="#b08a52" strokeWidth="1.2" />
        <path d="M5 38 H25" stroke="#b08a52" strokeWidth="2" />
        <path d="M10 10 L8 34" stroke="#fff" strokeWidth="1" opacity="0.5" />
      </svg>

      {/* Bin (against the back wall, so a bit smaller) and bowl - food. */}
      <button type="button" onClick={onFood} title="Raid the bin (feed)" className="absolute bottom-[31%] right-[11%] text-4xl leading-none transition-transform hover:scale-110">
        🗑️
      </button>
      <button type="button" onClick={onFood} title="Food bowl (feed)" className="absolute bottom-[5%] right-[13%] text-4xl leading-none transition-transform hover:scale-110">
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
      {/* The lamp's warm pool of light, above the darkness so it actually lifts the room around it. */}
      <div
        className="pointer-events-none absolute inset-0 z-[6] mix-blend-screen transition-opacity duration-700"
        style={{
          opacity: lampOn ? 1 : 0,
          background:
            "radial-gradient(circle at 95.5% 22%, rgb(255 230 170 / 0.9) 0 2.5%, rgb(255 190 110 / 0.35) 6%, rgb(255 170 90 / 0.12) 30%, transparent 60%)",
        }}
      />
      </div>

      {/* Gus: centre stage, or curled up in bed - dimmed to match the room's light. */}
      <div
        className={`absolute z-[4] -translate-x-1/2 ${reduced ? "" : "transition-[left,bottom,filter] duration-700 ease-in-out"}`}
        style={{
          left: asleep ? "16%" : "50%",
          bottom: asleep ? "11%" : "9%",
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

/** `rising` = a meter where high is the problem (horniness): pink, turning red past `high`. */
function NeedBar({ icon, label, value, rising, high = 75 }: { icon: ReactNode; label: string; value: number; rising?: boolean; high?: number }) {
  const color = rising
    ? value >= high ? "bg-red-500" : "bg-pink-400"
    : value < 25 ? "bg-red-500" : value < 50 ? "bg-amber-400" : "bg-green-500";
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


/** A shelf ornament: an emoji on a little wooden plinth, sized to match the drawn trinkets. */
function Figurine({ emoji, title }: { emoji: string; title: string }) {
  return (
    <span title={title} className="flex flex-col items-center">
      <span className="text-lg leading-none drop-shadow-[0_1px_1px_rgb(0_0_0/0.4)]">{emoji}</span>
      <span className="h-1.5 w-5 rounded-t-[2px] border-t border-[#a06a3c] bg-[#6a3f20]" />
    </span>
  );
}

/** Tile colors for the laptop's post grid - a mix of fur tones and backgrounds, like a real page. */
const LAPTOP_TILES = ["#e8e2d6", "#7a5a3a", "#c98a3c", "#5b4b5e", "#8fa3b8", "#d9a04a", "#4d7fbf", "#b45a3c", "#a7c46b", "#9a7f6a", "#c9463d", "#3e6e5a", "#d8c7a9", "#6b4f8a", "#e07b39"];

/** An open laptop on e621. In adult + explicit mode the screen is a real (downscaled) screenshot of
 *  the owner's favorites page, src/assets/laptop-e621.jpg; otherwise it's a drawn, content-free
 *  miniature of the same layout: navy theme, logo + two nav bars, the tag sidebar, and a grid of
 *  post tiles each with its score/favorites strip. */
function Laptop({ explicit, className }: { explicit: boolean; className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 68" className={`${className} drop-shadow-[0_3px_4px_rgb(0_0_0/0.45)]`}>
      <title>e621, open in another tab. And another. And another.</title>
      {/* Lid and bezel. */}
      <rect x="9" y="1" width="82" height="52" rx="3" fill="#2b2f36" stroke="#16181c" strokeWidth="1" />
      {/* Screen. */}
      {explicit ? (
        <image href={laptopScreenUrl} x="13" y="4.5" width="74" height="45" preserveAspectRatio="xMidYMid slice" />
      ) : (
      <g>
        <rect x="13" y="4.5" width="74" height="45" fill="#152f56" />
        {/* Nav bars + logo. */}
        <rect x="13" y="4.5" width="74" height="3.5" fill="#1f3c67" />
        <rect x="13" y="8" width="74" height="3" fill="#284a81" />
        <circle cx="16" cy="7.5" r="2.4" fill="#012e57" stroke="#fcb328" strokeWidth="0.8" />
        <text x="16" y="8.6" textAnchor="middle" fontSize="3" fontWeight="900" fill="#fcb328" fontFamily="sans-serif">e</text>
        {[22, 30, 37, 44, 52].map((x) => (
          <rect key={x} x={x} y="5.6" width="5" height="1.2" rx="0.4" fill="#b4c7d9" opacity="0.8" />
        ))}
        {[22, 29, 35, 42].map((x) => (
          <rect key={x} x={x} y="9" width="5" height="1" rx="0.4" fill="#b4c7d9" opacity="0.6" />
        ))}
        <rect x="80" y="5" width="5" height="5.5" rx="0.6" fill="#7aa66b" />
        {/* Sidebar: search box + tag list (a few in the orange "species" color). */}
        <rect x="13" y="11" width="13" height="38.5" fill="#1f3c67" />
        <rect x="14.5" y="13" width="10" height="2.4" rx="0.4" fill="#ffffff" />
        {Array.from({ length: 11 }, (_, i) => (
          <rect key={i} x="14.5" y={18 + i * 2.6} width={5 + ((i * 7) % 5)} height="1" rx="0.4" fill={[3, 7, 9].includes(i) ? "#ed5d1f" : "#b4c7d9"} opacity="0.85" />
        ))}
        {/* Post grid: 5 x 3 thumbnails with score strips. */}
        {LAPTOP_TILES.map((c, i) => {
          const x = 28 + (i % 5) * 11.6;
          const y = 12.5 + Math.floor(i / 5) * 12.3;
          return (
            <g key={i}>
              <rect x={x} y={y} width="10" height="11" rx="0.5" fill="#284a81" />
              <rect x={x + 1} y={y + 0.8} width="8" height="7.6" fill={c} />
              <rect x={x + 1.2} y={y + 9.1} width="5.5" height="1" rx="0.3" fill="#3e9e49" />
              <rect x={x + 7.2} y={y + 9.1} width="1.6" height="1" rx="0.3" fill="#e45f5f" />
            </g>
          );
        })}
      </g>
      )}
      {/* Screen sheen. */}
      <path d="M13 4.5 H50 L30 49.5 H13 Z" fill="#ffffff" opacity="0.05" />
      {/* Base / keyboard deck, seen at a slight angle. */}
      <path d="M9 53 H91 L98 63 Q98 66 95 66 H5 Q2 66 2 63 Z" fill="#9ba2ab" stroke="#6b727b" strokeWidth="1" />
      <path d="M14 55.5 H86 L89 60.5 H11 Z" fill="#5f666f" opacity="0.6" />
      <rect x="42" y="61.5" width="16" height="2.5" rx="0.8" fill="#7d848d" />
    </svg>
  );
}

/** Easter egg: the neighbour's German Shepherd - ginger coat, black-grey snout, big upright ears,
 *  red polka-dot bandana and a silver tag - drawn head-and-chest so the window crops him to a peek. */
function Dog() {
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full">
      {/* Ears (behind head). */}
      <path d="M31 54 Q20 26 23 11 Q25 5 31 8 Q46 20 57 36 Z" fill="#c98a45" stroke="#8a5a2a" strokeWidth="1"/>
      <path d="M32 47 Q25 28 27 16 Q40 25 50 37 Z" fill="#e9b98a"/>
      <path d="M32 47 Q26 30 28 20 Q38 28 46 37 Z" fill="#a8683a" opacity="0.35"/>
      <path d="M89 54 Q100 26 97 11 Q95 5 89 8 Q74 20 63 36 Z" fill="#c98a45" stroke="#8a5a2a" strokeWidth="1"/>
      <path d="M88 47 Q95 28 93 16 Q80 25 70 37 Z" fill="#e9b98a"/>
      <path d="M88 47 Q94 30 92 20 Q82 28 74 37 Z" fill="#a8683a" opacity="0.35"/>
      {/* Neck / chest. */}
      <path d="M30 120 Q30 88 40 78 H80 Q90 88 90 120 Z" fill="#d49a55"/>
      <path d="M48 120 Q50 98 60 94 Q70 98 72 120 Z" fill="#f1d5a6"/>
      {/* Head. */}
      <path d="M60 28 Q84 28 88 50 Q90 66 80 76 Q72 86 60 87 Q48 86 40 76 Q30 66 32 50 Q36 28 60 28 Z" fill="#d9a05b" stroke="#8a5a2a" strokeWidth="1"/>
      {/* Forehead shading / brow. */}
      <path d="M60 30 Q66 40 64 52 L56 52 Q54 40 60 30 Z" fill="#c4884a" opacity="0.6"/>
      {/* Cheeks / muzzle, cream. */}
      <path d="M44 66 Q46 58 54 58 Q60 62 66 58 Q74 58 76 66 Q76 82 60 85 Q44 82 44 66 Z" fill="#f1d5a6"/>
      {/* Darker muzzle top. */}
      <defs><linearGradient id="gus-dog-snout" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b97d43"/><stop offset="0.55" stopColor="#4a3c36"/><stop offset="1" stopColor="#2e2624"/></linearGradient></defs>
      <path d="M53 58 Q60 54 67 58 L67 68 Q60 70 53 68 Z" fill="url(#gus-dog-snout)"/>
      {/* Black-grey snout tip and chin. */}
      <path d="M50 67 Q60 63 70 67 Q71 77 64 80.5 Q60 82 56 80.5 Q49 77 50 67 Z" fill="#3a302d"/>
      <path d="M50 67 Q49 73 52 77" stroke="#6b5f5a" strokeWidth="1.2" fill="none" opacity="0.6"/>
      {/* Nose. */}
      <path d="M54 67 Q60 64 66 67 Q66 72 60 74 Q54 72 54 67 Z" fill="#1d1715"/>
      <ellipse cx="57.5" cy="67.5" rx="1.6" ry="0.9" fill="#fff" opacity="0.5"/>
      {/* Mouth. */}
      <path d="M60 74 V77 M60 77 Q56 80 52 78 M60 77 Q64 80 68 78" stroke="#0a0807" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      {/* Eyes (almond, dark), with dark rims and soft brows. */}
      <ellipse cx="47" cy="50.5" rx="4.2" ry="3.6" fill="#3b2414"/><circle cx="47" cy="50.8" r="2.3" fill="#120c08"/>
      <ellipse cx="73" cy="50.5" rx="4.2" ry="3.6" fill="#3b2414"/><circle cx="73" cy="50.8" r="2.3" fill="#120c08"/>
      <circle cx="48.4" cy="49.4" r="1.2" fill="#fff"/><circle cx="46" cy="52" r="0.5" fill="#fff" opacity="0.7"/>
      <circle cx="74.4" cy="49.4" r="1.2" fill="#fff"/><circle cx="72" cy="52" r="0.5" fill="#fff" opacity="0.7"/>
      <path d="M42.5 45 Q47 42.5 51.5 45 M68.5 45 Q73 42.5 77.5 45" stroke="#a8683a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* Red bandana. */}
      <path d="M36 80 Q60 92 84 80 L86 88 Q72 96 62 112 Q58 114 56 110 Q48 96 34 88 Z" fill="#d22a2a" stroke="#8e1717" strokeWidth="1"/>
      <g fill="#fff" opacity="0.85">
        <circle cx="44" cy="88" r="1"/><circle cx="52" cy="92" r="1.2"/><circle cx="68" cy="92" r="1.2"/>
        <circle cx="76" cy="88" r="1"/><circle cx="60" cy="100" r="1.3"/><circle cx="57" cy="106" r="0.9"/>
        <circle cx="64" cy="96" r="0.8"/><circle cx="48" cy="85" r="0.7"/><circle cx="72" cy="85" r="0.7"/>
      </g>
      {/* Collar tag. */}
      <circle cx="60" cy="90" r="4" fill="#dfe3e8" stroke="#8a9098" strokeWidth="1"/>
      <circle cx="59" cy="89" r="1.2" fill="#fff"/>
    </svg>
  );
}

/** Easter egg visitor: a friendly red fox (his favorite animal) - black-tipped ears, fluffy
 *  white cheeks and ruff, soft brown eyes. */
function Fox() {
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full">
      {/* Ears: orange with black backs/tips and cream tufts. */}
      <path d="M33 56 Q24 30 28 12 Q30 7 35 10 Q50 24 58 40 Z" fill="#e0742a" stroke="#8a3f12" strokeWidth="1"/>
      <path d="M28 12 Q30 7 35 10 Q38 13 40 16 Q33 15 29 20 Z" fill="#2a1d18"/>
      <path d="M34 50 Q28 32 31 19 Q44 30 51 41 Z" fill="#f6e3c8"/>
      <path d="M87 56 Q96 30 92 12 Q90 7 85 10 Q70 24 62 40 Z" fill="#e0742a" stroke="#8a3f12" strokeWidth="1"/>
      <path d="M92 12 Q90 7 85 10 Q82 13 80 16 Q87 15 91 20 Z" fill="#2a1d18"/>
      <path d="M86 50 Q92 32 89 19 Q76 30 69 41 Z" fill="#f6e3c8"/>
      {/* Chest: orange shoulders, big white ruff. */}
      <path d="M28 120 Q28 92 40 80 H80 Q92 92 92 120 Z" fill="#e0742a"/>
      <path d="M40 120 Q38 96 48 84 Q60 92 72 84 Q82 96 80 120 Z" fill="#fbf4ea"/>
      <path d="M48 84 L51 92 L55 86 L60 94 L65 86 L69 92 L72 84" fill="#fbf4ea"/>
      {/* Head: round and soft, with a short snout. */}
      <path d="M60 32 Q86 32 90 54 Q92 68 80 76 Q70 85 60 86 Q50 85 40 76 Q28 68 30 54 Q34 32 60 32 Z" fill="#e57d30" stroke="#8a3f12" strokeWidth="1"/>
      {/* Fluffy white cheeks and muzzle. */}
      <path d="M31 60 Q38 66 47 64 Q54 63 60 66 Q66 63 73 64 Q82 66 89 60 Q90 70 80 76 L84 80 L76 79 Q68 86 60 86 Q52 86 44 79 L36 80 L40 76 Q30 70 31 60 Z" fill="#fbf4ea"/>
      {/* Soft forehead blaze. */}
      <path d="M60 35 Q63 42 62 50 H58 Q57 42 60 35 Z" fill="#cf6a24" opacity="0.4"/>
      {/* Friendly eyes: warm dark brown, big catchlights. */}
      <ellipse cx="47" cy="54" rx="3.8" ry="4.3" fill="#3b2414"/>
      <circle cx="47" cy="54.4" r="2.2" fill="#120c08"/>
      <circle cx="48.4" cy="52.6" r="1.3" fill="#fff"/>
      <circle cx="46" cy="56.2" r="0.5" fill="#fff" opacity="0.7"/>
      <ellipse cx="73" cy="54" rx="3.8" ry="4.3" fill="#3b2414"/>
      <circle cx="73" cy="54.4" r="2.2" fill="#120c08"/>
      <circle cx="74.4" cy="52.6" r="1.3" fill="#fff"/>
      <circle cx="72" cy="56.2" r="0.5" fill="#fff" opacity="0.7"/>
      {/* Rosy cheeks. */}
      <ellipse cx="41" cy="64" rx="3.2" ry="1.8" fill="#f2a08a" opacity="0.55"/>
      <ellipse cx="79" cy="64" rx="3.2" ry="1.8" fill="#f2a08a" opacity="0.55"/>
      {/* Nose and a little smile. */}
      <path d="M56 70 Q60 67.5 64 70 Q63.5 74 60 75.5 Q56.5 74 56 70 Z" fill="#1a1412"/>
      <ellipse cx="58.3" cy="70.3" rx="1.2" ry="0.6" fill="#fff" opacity="0.5"/>
      <path d="M60 75.5 V77 M60 77 Q57 80.5 54 78 M60 77 Q63 80.5 66 78" stroke="#2a1d18" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/** Easter egg visitor, nights only: a horned owl with big yellow eyes and a speckled belly. */
function Owl() {
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full">
      {/* Body: round, brown, with a speckled pale belly and folded wings. */}
      <path d="M26 120 Q20 76 36 56 H84 Q100 76 94 120 Z" fill="#8a5a34" stroke="#4e2f18" strokeWidth="1"/>
      <path d="M42 120 Q38 88 60 80 Q82 88 78 120 Z" fill="#e9d6b4"/>
      <g fill="#8a5a34" opacity="0.7">
        <path d="M50 92 l2 2 l2 -2"/><path d="M58 90 l2 2 l2 -2"/><path d="M66 92 l2 2 l2 -2"/>
        <path d="M46 102 l2 2 l2 -2"/><path d="M54 100 l2 2 l2 -2"/><path d="M62 100 l2 2 l2 -2"/><path d="M70 102 l2 2 l2 -2"/>
        <path d="M50 110 l2 2 l2 -2"/><path d="M58 108 l2 2 l2 -2"/><path d="M66 110 l2 2 l2 -2"/>
      </g>
      <path d="M26 120 Q24 90 38 72 Q42 96 40 120 Z" fill="#6e4426"/>
      <path d="M94 120 Q96 90 82 72 Q78 96 80 120 Z" fill="#6e4426"/>
      {/* Head with ear tufts. */}
      <path d="M30 34 L26 14 L44 28 Z" fill="#6e4426" stroke="#4e2f18" strokeWidth="1"/>
      <path d="M90 34 L94 14 L76 28 Z" fill="#6e4426" stroke="#4e2f18" strokeWidth="1"/>
      <ellipse cx="60" cy="50" rx="34" ry="28" fill="#9a6a40" stroke="#4e2f18" strokeWidth="1"/>
      {/* Facial discs. */}
      <circle cx="45" cy="50" r="14" fill="#e9d6b4"/>
      <circle cx="75" cy="50" r="14" fill="#e9d6b4"/>
      <path d="M31 50 Q45 33 59 50 M61 50 Q75 33 89 50" stroke="#6e4426" strokeWidth="1.5" fill="none"/>
      {/* Big round eyes: yellow iris, black pupil, catchlight. */}
      <circle cx="45" cy="51" r="8.5" fill="#f4c21b" stroke="#2a1a0e" strokeWidth="1.5"/>
      <circle cx="45" cy="51" r="4.6" fill="#120c08"/>
      <circle cx="47" cy="48.8" r="1.8" fill="#fff"/>
      <circle cx="75" cy="51" r="8.5" fill="#f4c21b" stroke="#2a1a0e" strokeWidth="1.5"/>
      <circle cx="75" cy="51" r="4.6" fill="#120c08"/>
      <circle cx="77" cy="48.8" r="1.8" fill="#fff"/>
      {/* Beak. */}
      <path d="M56 58 Q60 56 64 58 L60 68 Z" fill="#e3a23a" stroke="#8a5a1a" strokeWidth="1"/>
    </svg>
  );
}
