// The share card's "personality archetype": a title + one-liner picked from the shape of a
// favorites analysis (artist loyalty, rating mix, score taste, animation share, sheer size), plus
// the pose Gus strikes next to it. First matching rule wins, so order = priority.

import type { FavoritesAnalysis } from "./favoritesAnalysis";
import { prettyTag } from "./mascotDashboard";

/** Whole-image transforms of mascot.png - the art is a single paper-cut raccoon, so "poses" are
 *  tilts/flips/scales rather than separate drawings. */
export interface GusPose {
  tilt: number;
  flip: boolean;
  scale: number;
}

export interface Archetype {
  id: string;
  title: string;
  blurb: string;
  /** Gus's speech-bubble verdict on the archetype slide. */
  gusLine: string;
  pose: GusPose;
}

interface Facts {
  a: FavoritesAnalysis;
  total: number;
  topArtist?: string;
  topArtistShare: number;
  share: Record<string, number>;
  motionShare: number;
  balanced: boolean;
}

interface Rule {
  id: string;
  title: string;
  when: (f: Facts) => boolean;
  blurb: (f: Facts) => string;
  gus: string[];
  cheeky?: string[];
  pose: GusPose;
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const pct = (n: number) => `${Math.round(n * 100)}%`;

const RULES: Rule[] = [
  {
    id: "devotee",
    title: "The Devotee",
    when: (f) => !!f.topArtist && f.topArtistShare >= 0.25,
    blurb: (f) => `${pct(f.topArtistShare)} of your favorites are by ${prettyTag(f.topArtist!)}. That's not a fan, that's a patron.`,
    gus: ["Have you considered just marrying them?", "One artist. Total loyalty. Respect.", "They should be paying YOU at this point."],
    cheeky: ["Someone's got a type, and it's one specific person's brush.", "Do they know? They should know."],
    pose: { tilt: -8, flip: false, scale: 1 },
  },
  {
    id: "gremlin",
    title: "Chaos Gremlin",
    when: (f) => f.balanced,
    blurb: () => "A near-perfect three-way split between Safe, Questionable and Explicit. No lane. Only vibes.",
    gus: ["I can't predict you and it scares me.", "Every scroll's a coin flip with you."],
    cheeky: ["Toe beans, then THAT, then toe beans again. Unwell. Love it."],
    pose: { tilt: 14, flip: true, scale: 1.05 },
  },
  {
    id: "archivist",
    title: "The Archivist",
    when: (f) => f.total >= 5000,
    blurb: (f) => `${f.total.toLocaleString()} favorites. Somewhere, a librarian is weeping with pride.`,
    gus: ["You know there's a delete button, right? Just checking.", "This is a museum now. I'm the gift shop."],
    cheeky: ["That's not a collection, that's a lifestyle."],
    pose: { tilt: -4, flip: true, scale: 1 },
  },
  {
    id: "motion",
    title: "Motion Junkie",
    when: (f) => f.motionShare >= 0.35,
    blurb: (f) => `${pct(f.motionShare)} of your favorites move. Still images simply aren't enough for you.`,
    gus: ["Your GPU fan sends its regards.", "Frames per second? More like favorites per second."],
    cheeky: ["You like it when it moves. Noted."],
    pose: { tilt: 10, flip: false, scale: 1.05 },
  },
  {
    id: "connoisseur",
    title: "The Connoisseur",
    when: (f) => f.a.avgScore >= 300,
    blurb: (f) => `An average score of ${f.a.avgScore.toLocaleString()}. You only take the top shelf.`,
    gus: ["Fancy. Do you sniff your monitor like a wine glass?", "Only the finest. I'm honored to be near you."],
    pose: { tilt: -6, flip: false, scale: 1 },
  },
  {
    id: "digger",
    title: "Crate Digger",
    when: (f) => f.a.medianScore > 0 && f.a.medianScore < 40,
    blurb: (f) => `Median score ${f.a.medianScore}. You find the hidden gems before anyone else does.`,
    gus: ["You liked it before it was popular.", "Digging through the bins, just like me!"],
    pose: { tilt: 6, flip: true, scale: 1 },
  },
  {
    id: "pure",
    title: "Pure of Heart",
    when: (f) => (f.share.Safe ?? 0) >= 0.6,
    blurb: (f) => `${pct(f.share.Safe)} Safe. A wholesome island in a sea of chaos.`,
    gus: ["You're too good for this website. Stay that way.", "Gentle. Wholesome. Suspicious."],
    pose: { tilt: -10, flip: false, scale: 0.95 },
  },
  {
    id: "tease",
    title: "Professional Tease",
    when: (f) => (f.share.Questionable ?? 0) >= 0.45,
    blurb: (f) => `${pct(f.share.Questionable)} Questionable. Always implied, never shown.`,
    gus: ["The art of almost. Truly."],
    cheeky: ["All that buildup and no payoff. You monster."],
    pose: { tilt: 8, flip: true, scale: 1 },
  },
  {
    id: "degenerate",
    title: "Unrepentant Degenerate",
    when: (f) => (f.share.Explicit ?? 0) >= 0.75,
    blurb: (f) => `${pct(f.share.Explicit)} Explicit. You know exactly what you came here for.`,
    gus: ["Straight to business, huh?", "No small talk. I respect it."],
    cheeky: ["Your browser history needs a priest.", "I'd judge you, but I live here."],
    pose: { tilt: 12, flip: false, scale: 1.05 },
  },
];

const FALLBACK: Rule = {
  id: "enthusiast",
  title: "Well-Rounded Enthusiast",
  when: () => true,
  blurb: (f) => `${f.total.toLocaleString()} favorites with a little bit of everything. Balanced, as all things should be.`,
  gus: ["A solid, respectable collection. Boring? Never.", "Healthy taste. Rare around here."],
  pose: { tilt: -6, flip: false, scale: 1 },
};

function facts(a: FavoritesAnalysis): Facts {
  const total = a.total || 1;
  const rTotal = a.ratings.reduce((s, r) => s + r.count, 0) || 1;
  const share: Record<string, number> = {};
  for (const r of a.ratings) share[r.label] = r.count / rTotal;
  const shares = a.ratings.map((r) => r.count / rTotal);
  const motion = a.fileTypes
    .filter((t) => /^(webm|mp4|gif)$/i.test(t.label))
    .reduce((s, t) => s + t.count, 0);
  return {
    a,
    total: a.total,
    topArtist: a.topArtists[0]?.label,
    topArtistShare: (a.topArtists[0]?.count ?? 0) / total,
    share,
    motionShare: motion / total,
    balanced: a.ratings.length === 3 && Math.max(...shares) - Math.min(...shares) <= 0.16,
  };
}

/** Pick the archetype for this analysis. Call once per card open (the lines are randomised). */
export function pickArchetype(a: FavoritesAnalysis, cheeky: boolean): Archetype {
  const f = facts(a);
  const rule = RULES.find((r) => r.when(f)) ?? FALLBACK;
  const lines = cheeky && rule.cheeky?.length && Math.random() < 0.7 ? rule.cheeky : rule.gus;
  return { id: rule.id, title: rule.title, blurb: rule.blurb(f), gusLine: pick(lines), pose: rule.pose };
}
