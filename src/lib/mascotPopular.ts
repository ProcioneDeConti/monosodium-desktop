// What Gus says on the Popular page - remarks built from the ranked list on screen (the period,
// the top post, who's dominating, the rating mix, the species/kink of the day). Same pattern as
// lib/mascotDashboard.ts: the panel shuffles everything that applies and serves one per click,
// plus one when the list loads. Cheeky lines only when `spicyAllowed` (adult + Explicit + toggle).

import { isAnimated, isVideo, type Post } from "../models/post";
import type { PopularScale } from "./popular";
import { prettyTag } from "./mascotDashboard";

export interface PopularFacts {
  scale: PopularScale;
  /** Viewing the current day/week/month (vs. browsing the past). */
  current: boolean;
  /** e.g. "October 27, 2026" / "Oct 20 – 26" - as shown in the header. */
  periodLabel: string;
  count: number;
  topScore: number;
  topFavs: number;
  topArtist: string | null;
  /** Most frequent artist across the list, if they have 2+ posts in it. */
  dominantArtist: { tag: string; posts: number } | null;
  topSpecies: string | null;
  topCharacter: string | null;
  topGeneral: string[];
  explicitShare: number;
  safeShare: number;
  animatedShare: number;
}

const NOT_ARTISTS = new Set(["conditional_dnp", "sound_warning", "unknown_artist", "anonymous_artist", "third-party_edit", "epilepsy_warning"]);
/** Too generic to be a "theme of the day". */
const BORING_GENERAL = new Set(["solo", "male", "female", "anthro", "nude", "hi_res", "absurd_res", "simple_background", "digital_media_(artwork)", "clothing", "smile", "looking_at_viewer", "fur", "tail", "text", "duo", "genitals", "breasts", "penis", "white_background", "standing", "open_mouth", "hair", "mammal", "teeth", "tongue", "biped", "blush", "bodily_fluids", "eyes_closed", "humanoid_genitalia", "big_breasts", "nipples", "pussy", "balls", "erection", "anus", "butt", "female_penetrated", "male_penetrated", "sex", "penetration", "male/female", "male/male", "female/female"]);

function topOf(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const e of counts) if (!best || e[1] > best[1]) best = e;
  return best;
}

function tally(posts: Post[], pick: (p: Post) => string[], skip?: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of new Set(pick(p))) if (!skip?.has(t)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Flatten a popular list (server order = rank) into what Gus comments on. */
export function popularFacts(posts: Post[], scale: PopularScale, current: boolean, periodLabel: string): PopularFacts {
  const total = posts.length || 1;
  const top = posts[0];
  const artists = tally(posts, (p) => p.tags.artist, NOT_ARTISTS);
  const dom = topOf(artists);
  const general = [...tally(posts, (p) => p.tags.general, BORING_GENERAL)].sort((a, b) => b[1] - a[1]);
  return {
    scale,
    current,
    periodLabel,
    count: posts.length,
    topScore: top?.score.total ?? 0,
    topFavs: top?.fav_count ?? 0,
    topArtist: top?.tags.artist.find((a) => !NOT_ARTISTS.has(a)) ?? null,
    dominantArtist: dom && dom[1] >= 2 ? { tag: dom[0], posts: dom[1] } : null,
    topSpecies: topOf(tally(posts, (p) => p.tags.species, new Set(["mammal", "humanoid", "animal_humanoid"])))?.[0] ?? null,
    topCharacter: topOf(tally(posts, (p) => p.tags.character))?.[0] ?? null,
    topGeneral: general.slice(0, 3).map(([t]) => t),
    explicitShare: posts.filter((p) => p.rating === "e").length / total,
    safeShare: posts.filter((p) => p.rating === "s").length / total,
    animatedShare: posts.filter((p) => isVideo(p) || isAnimated(p)).length / total,
  };
}

const n = (x: number) => x.toLocaleString();
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SCALE_WORD: Record<PopularScale, string> = { day: "today", week: "this week", month: "this month" };

/** Snarky-but-clean remarks. A few always apply so a thin list still gets variety. */
export function popularRemarks(f: PopularFacts): string[] {
  if (f.count === 0) return ["Nothing popular? Everyone must've finally gone outside.", "Empty. The internet took a day off."];
  const when = f.current ? SCALE_WORD[f.scale] : `back then`;
  const out: string[] = [
    "The people have spoken. The people have... interesting taste.",
    "Ah, the hall of fame. Or shame. Depends who you ask.",
    "Click me again, I've got opinions about all of this.",
  ];
  out.push(f.current ? `What everyone's drooling over ${when}. Peer pressure, but furry.` : `Time travel! ${f.periodLabel}. Simpler times. Not really.`);
  if (f.topScore > 0) out.push(`Number one has a score of ${n(f.topScore)}. Somebody's mom is very proud.`);
  if (f.topFavs >= 1000) out.push(`${n(f.topFavs)} favorites on the top post. That's a small town of fans.`);
  if (f.topArtist) out.push(`${prettyTag(f.topArtist)} took the crown ${when}. Bow, peasants.`);
  if (f.dominantArtist && f.dominantArtist.posts >= 3) {
    out.push(`${prettyTag(f.dominantArtist.tag)} has ${f.dominantArtist.posts} posts in here. Leave some room for everyone else!`);
  }
  if (f.topSpecies) out.push(`Most popular species ${when}: ${prettyTag(f.topSpecies)}. Raccoons robbed again.`);
  if (f.topSpecies === "procyonid" || f.topSpecies === "raccoon") out.push("Raccoons on top for once! Justice! JUSTICE!");
  if (f.topCharacter) out.push(`${prettyTag(f.topCharacter)} is everywhere ${when}. Do they ever rest?`);
  if (f.topGeneral.length) out.push(`Trending ${when}: ${f.topGeneral.map(prettyTag).join(", ")}. Make of that what you will.`);
  if (f.animatedShare >= 0.25) out.push(`${pct(f.animatedShare)} of this moves. Your fans are about to take off.`);
  if (f.safeShare >= 0.3) out.push(`${pct(f.safeShare)} Safe. Wholesome hour on the popular page, apparently.`);
  if (f.explicitShare >= 0.7) out.push(`${pct(f.explicitShare)} Explicit. Shocking. Truly. I'm shocked.`);
  if (f.scale === "month") out.push("A whole month of top posts. Pace yourself.");
  if (f.scale === "day" && f.current) out.push("Today's lineup. Fresh out of the oven. Still warm.");
  return out;
}

/** The cheeky side - innuendo, never explicit (see lib/mascotSpicy.ts). */
export function spicyPopularRemarks(f: PopularFacts): string[] {
  if (f.count === 0) return ["Nothing popular? Everyone's... busy. Wink."];
  const when = f.current ? SCALE_WORD[f.scale] : "back then";
  const out: string[] = [
    "Ah yes, the communal thirst trap.",
    "This is where everyone's been all day? Explains a lot.",
    "Popular page. A.k.a. what the whole fandom did with one hand " + when + ".",
    "Don't look at me like that. You clicked Popular.",
  ];
  if (f.topScore > 0) out.push(`${n(f.topScore)} upvotes on number one. That's a lot of people being very... supportive.`);
  if (f.topArtist) out.push(`${prettyTag(f.topArtist)} is the reason half the fandom needs a nap ${when}.`);
  if (f.dominantArtist && f.dominantArtist.posts >= 3) out.push(`${f.dominantArtist.posts} posts by ${prettyTag(f.dominantArtist.tag)}. Someone's popular in all the right ways.`);
  if (f.topSpecies) out.push(`${prettyTag(f.topSpecies)} season, huh? Everybody's in heat ${when}.`);
  if (f.topCharacter) out.push(`${prettyTag(f.topCharacter)} is having a VERY good ${f.scale}. Hydrate, buddy.`);
  if (f.explicitShare >= 0.7) out.push(`${pct(f.explicitShare)} Explicit. Nobody here came for the plot.`);
  if (f.safeShare >= 0.3) out.push("All this Safe stuff mixed in? Foreplay, I guess.");
  if (f.animatedShare >= 0.25) out.push("So much of it moves. Bouncing. So much bouncing.");
  if (f.topFavs >= 1000) out.push(`${n(f.topFavs)} people saved the top post "for later." Sure. Later.`);
  return out;
}
