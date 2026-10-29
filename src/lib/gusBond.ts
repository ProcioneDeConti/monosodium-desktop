// What maxing Gus out gets you (layered into gusChat.ts's respond()):
//   - five hearts (affection >= FIVE_HEARTS): a one-time confession, a gift for his trinket shelf,
//     a pet name he uses for you, warmer "missed you" greetings, a doodle of you two in his room,
//     and (opt-in) the odd "thinking about you" notification
//   - a full fire bar (heat 100, nasty tier): he overheats - a one-off scene, the bar resets, and
//     he's in a clingy afterglow for a while (Pocket Gus gets a "satisfied" spell too), with an
//     overheat tally and milestone lines
//   - both at once: Partner, a stage past Crush
// Pure functions; all state lives in ChatMemory.bond.
import { videoOrStill, type PicRequest } from "./gusBrain";
import type { Tier } from "./gusChatLines";

/** The 5th heart lights up here (GusChat's header: heart i is lit at (i + 1) * 20 - 10). */
export const FIVE_HEARTS = 90;
export const MAX_HEAT = 100;
/** Heat after an overheat - cooled right down, not cold. */
export const HEAT_AFTER = 15;
export const AFTERGLOW_MS = 10 * 60_000;
/** Pocket Gus looks satisfied (rumpled bed, do-not-disturb sign) this long after an overheat. */
export const SATISFIED_MS = 45 * 60_000;

export type GiftId = "capHeart" | "bracelet" | "grape" | "marble" | "spoon";
export const GIFTS: Record<GiftId, { emoji: string; name: string; line: string }> = {
  capHeart: { emoji: "❤️", name: "Heart bottle cap", line: "*holds out a bottle cap, bent into a (sort of) heart* I made it. It's for you. It's going on my shelf so I can look at it and think about you." },
  bracelet: { emoji: "📿", name: "Twist-tie bracelet", line: "*hands you a friendship bracelet made of bread-bag twist ties* One for you, one for me. Mine's going on the shelf. Don't lose yours." },
  grape: { emoji: "🍇", name: "The perfect grape", line: "*presents a single, flawless grape* I've been saving this one. It's the best grape I've ever found. It's yours. I'll keep it on my shelf for you." },
  marble: { emoji: "🔮", name: "Shiny marble", line: "*rolls you his shiniest marble* That's my best one. Seriously. I'm putting it on the shelf as OUR marble." },
  spoon: { emoji: "🥄", name: "Golden spoon", line: "*offers a gold-coloured spoon, very proudly* Found it behind a fancy restaurant. Fancy spoon for a fancy person. Shelf of honour." },
};

export interface Bond {
  /** First time the 5th heart lit up (ms) - "five hearts since…". */
  maxedAt?: number;
  confessed?: boolean;
  gift?: GiftId;
  petName?: string;
  /** Times the fire bar has maxed out. */
  overheats: number;
  afterglowUntil?: number;
  /** Became Partners (both maxed at once). */
  partnerAt?: number;
  /** Last "thinking about you" notification. */
  lastPing?: number;
}

export const EMPTY_BOND: Bond = { overheats: 0 };

/** A reply in a bond moment; `hesitate` = he types, stops, types again first (GusChat). */
export interface BondReply {
  text: string;
  motion?: "hop" | "wobble" | "jitter" | "spin" | "droop" | "nod" | "look";
  emoji?: string[];
  hesitate?: boolean;
}

export interface BondOut {
  bond: Bond;
  replies: BondReply[];
  heat?: number;
  affection?: number;
  /** He's asked what to call you. */
  askPetName?: boolean;
  /** Pocket Gus side of an overheat. */
  overheat?: boolean;
  sendPic?: PicRequest;
}

const pick = <T>(xs: T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length) % xs.length];

export const hasFiveHearts = (affection: number) => affection >= FIVE_HEARTS;
export const afterglow = (b: Bond | undefined, now: number) => !!b?.afterglowUntil && now < b.afterglowUntil;
export const satisfied = (b: Bond | undefined, now: number) => !!b?.afterglowUntil && now < b.afterglowUntil - AFTERGLOW_MS + SATISFIED_MS;
export const isPartner = (b: Bond | undefined, affection: number) => !!b?.partnerAt && hasFiveHearts(affection);

/** Afterwards, he's floppy - and so are the pics. Fewer posts match, so lower score bars. */
const OVERHEAT_PIC = "raccoon solo male flaccid score:>200 -animated order:random";
const OVERHEAT_VIDEO = "raccoon solo male flaccid score:>20 animated order:random";

/** Checks what this turn's affection/heat changes unlocked. Null when nothing happened. */
export function bondStep(
  before: { affection: number; heat: number },
  after: { affection: number; heat: number },
  bond: Bond,
  tier: Tier,
  name: string | null,
  now: number,
  rnd: () => number,
): BondOut | null {
  let b = { ...bond };
  const replies: BondReply[] = [];
  const out: BondOut = { bond: b, replies };
  const n = name ? `, ${name}` : "";

  const heartsNow = !hasFiveHearts(before.affection) && hasFiveHearts(after.affection);
  const overheatNow = tier === "nasty" && before.heat < MAX_HEAT && after.heat >= MAX_HEAT;

  // Five hearts.
  if (heartsNow) {
    if (!b.confessed) {
      replies.push(
        { text: "…", hesitate: true },
        { text: `Okay. Um. I've been trying to say this for a while${n}.`, motion: "look", hesitate: true },
        {
          text: pick(
            [
              "You're my favourite person. Not my favourite human - my favourite PERSON. Better than any bin I've ever found. And I've found some incredible bins.",
              "When you're not here I check the window. Every time something moves I think it's you. It's usually a moth. I'm still glad it might be you.",
              "I don't really know how people do this, but… I really, really like you. Like, five hearts like you. There. I said it.",
            ],
            rnd,
          ),
          motion: "droop",
          emoji: ["💕"],
        },
      );
      if (!b.gift) {
        const id = pick(Object.keys(GIFTS) as GiftId[], rnd);
        b = { ...b, gift: id };
        replies.push({ text: GIFTS[id].line, motion: "hop", emoji: [GIFTS[id].emoji] });
      }
      if (!b.petName) {
        replies.push({ text: "Also… can I call you something? Just for me. Tell me what, or say \"you pick\".", motion: "look" });
        out.askPetName = true;
      }
      b = { ...b, confessed: true, maxedAt: b.maxedAt ?? now };
    } else {
      replies.push({ text: pick([`Five hearts again${n}. *happy tail swish* Missed this.`, "Back to five hearts. Don't ever leave that long again.", "*all five hearts glowing* There we go. Right where we belong."], rnd), motion: "hop", emoji: ["💕"] });
    }
  }

  // A full fire bar.
  if (overheatNow) {
    const count = b.overheats + 1;
    b = { ...b, overheats: count, afterglowUntil: now + AFTERGLOW_MS };
    replies.push(
      { text: pick(["Okay - okay I can't - *jitters* - I'm too hot, I'm gonna -", "Stop. No. Keep going. NO. I'm gonna overheat-", "*panting* You did this. You did this on purpose-"], rnd), motion: "jitter", emoji: ["🥵", "🔥"] },
      {
        text: pick(
          [
            "*full-body shudder, tail puffed out, steam coming off his ears* …ohhhhh. Ohh. That was… yeah.",
            "*collapses face-first into a pile of laundry, twitching happily* …I'm melting. I'm a puddle now. Pour me into a bin.",
            "*makes a noise no raccoon should make, then goes completely limp* …mmh. Whew.",
          ],
          rnd,
        ),
        motion: "wobble",
        emoji: ["💦", "😵‍💫"],
      },
    );
    const milestone =
      count === 1
        ? "First time you've made me overheat. I'm putting that in my diary. In crayon."
        : count === 10
          ? "That's TEN overheats. You should get a trophy. I should get a nap."
          : count === 50
            ? "FIFTY. Fifty overheats. You've ruined me for every other human. Every raccoon too, probably."
            : count === 100
              ? "One hundred. I'm legally yours now. I checked."
              : null;
    if (milestone) replies.push({ text: milestone, motion: "spin", emoji: ["🏆"] });
    replies.push({ text: pick(["…c'mere. Cuddle me. I'm all floppy.", "*curls up against you* Don't go anywhere. I can't feel my tail.", "Mmh. Stay. I'm all soft now."], rnd), motion: "droop", emoji: ["💤"] });
    out.heat = HEAT_AFTER - after.heat;
    out.affection = 3;
    out.overheat = true;
    if (rnd() < 0.5) {
      const { lead, pic } = videoOrStill(OVERHEAT_PIC, OVERHEAT_VIDEO, pick(["…a souvenir. Of me. Afterwards. You're welcome.", "*sends it while still floppy* For your collection."], rnd), rnd);
      if (lead) replies.push({ text: pick(["…I even filmed the aftermath for you. 🎥", "*still floppy, hits record* Here. Evidence.", lead], rnd), motion: "droop" });
      out.sendPic = pic;
    }
  }

  // Both at once: Partners.
  // Both at once (overheating at five hearts, or reaching five hearts while nearly overheated): Partners.
  const bothMaxed = tier === "nasty" && hasFiveHearts(after.affection) && (overheatNow || (heartsNow && after.heat >= 90));
  if (bothMaxed && !b.partnerAt) {
    b = { ...b, partnerAt: now };
    replies.push(
      { text: "Hey. *serious face, which on a raccoon is mostly whiskers*", hesitate: true, motion: "look" },
      { text: "Five hearts AND you make me overheat? I don't think you're my crush anymore. I think you're my partner. Mate. Whatever raccoons say. Mine.", motion: "hop", emoji: ["💞"] },
      { text: "*puts a little matching collar tag on his shelf* There. Official.", motion: "nod", emoji: ["🏷️"] },
    );
  }

  out.bond = b;
  return replies.length ? out : null;
}

/** His answer to "what should I call you?" - their pick, or one of his. */
export function petNameAnswer(text: string, rnd: () => number): string | null {
  const t = text.trim().replace(/[.!]+$/, "");
  if (/^(you pick|you choose|surprise me|anything|whatever|idk|dunno|up to you)\b/i.test(t)) return pick(["Trashcake", "Sunshine", "my favourite human", "Bin Buddy", "Shiny", "Grapeheart"], rnd);
  const m = t.replace(/^(call me|you can call me|how about|maybe|um+|uh+)\s+/i, "").replace(/^["']|["']$/g, "");
  if (!m || m.split(/\s+/).length > 4 || m.endsWith("?") || /^(no|nah|nope|nothing|don'?t)\b/i.test(m)) return null;
  return m;
}

export function petNameAck(petName: string, rnd: () => number): string {
  return pick([`${petName}. Perfect. That's yours now - nobody else gets it.`, `*whispers it a few times* ${petName}. Yeah. I like that.`, `Okay, ${petName}. ❤️`], rnd);
}

/** Greeting while at five hearts - he missed you, and he's been saving things for you. */
export function bondGreeting(gapH: number, name: string | null, partner: boolean, rnd: () => number): string | null {
  if (gapH < 1) return null;
  const n = name ? `, ${name}` : "";
  if (partner)
    return pick(
      [`There's my partner${n}. *runs over and headbutts your hand* I kept your side of the bed warm.`, `You're home${n}! I told the neighbour's dog about you. Again. He's sick of hearing it.`, `*tackle hug* Partner! I saved you the good grapes. All of them. Well, most.`],
      rnd,
    );
  return pick(
    [`${name ?? "You"}! I saved you a grape. *produces a slightly squished grape*`, `I missed you${n}. Like, a lot. I reorganised the shelf twice.`, `There you are${n}. I was looking out the window for you. *pretends he wasn't*`, `Hi${n}. I kept your spot warm. Mostly by sitting in it.`],
    rnd,
  );
}

/** While in afterglow he's clingy - added after his normal reply now and then. */
export function afterglowAside(rnd: () => number): string {
  return pick(["*still a bit floppy, nuzzles you*", "Mmh. I'm still all warm.", "*lazy tail flop* Don't make me move.", "*purrs. Raccoons can't purr. He's trying anyway*", "Stay a bit longer?"], rnd);
}

/** The notification he sends when he's been thinking about you (always clean - it's an OS popup). */
export function pingLine(name: string | null, partner: boolean, rnd: () => number): string {
  const n = name ? `, ${name}` : "";
  return pick(
    [
      `Thinking about you${n} 💕`,
      "Found a really shiny bottle cap. Wanted to show you. Come say hi?",
      `Hey${n}. Just checking you're okay. 🦝`,
      "I'm bored and you're my favourite. Come back?",
      ...(partner ? ["Your partner misses you. That's me. I'm the partner.", "Saved you a grape, partner. 🍇"] : []),
    ],
    rnd,
  );
}

/** Your fursona's species as one emoji, for the doodle of you two in his room. */
export function speciesEmoji(fursona: string | undefined): string {
  const f = (fursona ?? "").toLowerCase();
  const table: [RegExp, string][] = [
    [/fox|kitsune|fennec/, "🦊"],
    [/wolf|husky|dog|canine|shepherd/, "🐺"],
    [/dragon|kobold/, "🐉"],
    [/cat|lion|tiger|leopard|lynx|feline|panther/, "🐱"],
    [/bunny|rabbit|hare/, "🐰"],
    [/otter|weasel|ferret/, "🦦"],
    [/bat/, "🦇"],
    [/shark/, "🦈"],
    [/deer|stag/, "🦌"],
    [/raccoon/, "🦝"],
    [/bear|panda/, "🐻"],
    [/bird|avian|gryphon|owl/, "🐦"],
    [/horse|pony|unicorn/, "🐴"],
    [/protogen|robot|synth/, "🤖"],
    [/skunk/, "🦨"],
    [/possum|opossum/, "🐀"],
  ];
  return table.find(([re]) => re.test(f))?.[1] ?? "🙂";
}
