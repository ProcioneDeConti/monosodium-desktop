// What Gus says on the "For you" page - remarks built from the taste profile and the suggestions
// on screen, for your own profile and for someone else's. Same pattern as lib/mascotPopular.ts:
// the panel shuffles everything that applies and serves one per pet, plus one when suggestions
// land. Building/empty/private states get their own small pools. Cheeky lines only when
// `spicyAllowed` (adult + Explicit + toggle) - innuendo, never explicit (see lib/mascotSpicy.ts).
//
// Other users are only ever "they" or their name - never a guessed pronoun.

import { isAnimated, isVideo, type Post } from "../models/post";
import type { TasteMode, TasteProfile } from "./tasteProfile";
import { prettyTag } from "./mascotDashboard";
import { BORING_GENERAL, NOT_ARTISTS } from "./mascotPopular";

export interface ForYouFacts {
  isSelf: boolean;
  /** Display name of whoever the suggestions are for. */
  name: string;
  mode: TasteMode;
  sampled: number;
  usedVotes: boolean;
  partial: boolean;
  topArtist: string | null;
  secondArtist: string | null;
  topCharacter: string | null;
  topCopyright: string | null;
  topSpecies: string | null;
  /** Strongest non-generic general tags. */
  themes: string[];
  avoidCount: number;
  avoidSample: string | null;
  suggestions: number;
  /** Artists in the suggestions that aren't among the profile's tags - fresh finds. */
  newArtists: number;
  firstNewArtist: string | null;
  explicitShare: number;
  safeShare: number;
  animatedShare: number;
  /** Raccoons anywhere in the profile's top tags. */
  raccoon: boolean;
}

const RACCOON = new Set(["procyonid", "raccoon", "red_panda"]);

export function forYouFacts(
  profile: TasteProfile,
  posts: Post[],
  isSelf: boolean,
  partial: boolean,
): ForYouFacts {
  const of = (c: string) => profile.tags.filter((t) => t.category === c && !NOT_ARTISTS.has(t.name));
  const artists = of("artist");
  const known = new Set(profile.tags.map((t) => t.name));
  const fresh = new Map<string, number>();
  for (const p of posts) {
    for (const a of p.tags.artist) {
      if (NOT_ARTISTS.has(a) || known.has(a)) continue;
      fresh.set(a, (fresh.get(a) ?? 0) + 1);
    }
  }
  const freshSorted = [...fresh].sort((a, b) => b[1] - a[1]);
  const total = posts.length || 1;
  return {
    isSelf,
    name: profile.user.name,
    mode: profile.mode,
    sampled: profile.sampled,
    usedVotes: profile.usedVotes,
    partial,
    topArtist: artists[0]?.name ?? null,
    secondArtist: artists[1]?.name ?? null,
    topCharacter: of("character")[0]?.name ?? null,
    topCopyright: of("copyright")[0]?.name ?? null,
    topSpecies: of("species").find((t) => !["mammal", "humanoid", "animal_humanoid"].includes(t.name))?.name ?? null,
    themes: of("general")
      .filter((t) => !BORING_GENERAL.has(t.name))
      .slice(0, 3)
      .map((t) => t.name),
    avoidCount: profile.avoid.length,
    avoidSample: profile.avoid[0] ?? null,
    suggestions: posts.length,
    newArtists: fresh.size,
    firstNewArtist: freshSorted[0]?.[0] ?? null,
    explicitShare: posts.filter((p) => p.rating === "e").length / total,
    safeShare: posts.filter((p) => p.rating === "s").length / total,
    animatedShare: posts.filter((p) => isVideo(p) || isAnimated(p)).length / total,
    raccoon: profile.tags.slice(0, 40).some((t) => RACCOON.has(t.name)),
  };
}

const n = (x: number) => x.toLocaleString();
const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (tags: string[]) => tags.map(prettyTag).join(", ");

/** While the brick wall goes up. */
export function forYouBuildingRemarks(isSelf: boolean, name: string, mode: TasteMode): string[] {
  const all = mode === "all";
  return isSelf
    ? [
        "Hold still, I'm reading your favorites. Every single one. No judgment. Some judgment.",
        "Building your wall of taste, one brick at a time.",
        "Ooh, I'm learning so much about you right now.",
        "Give me a sec, I'm figuring out what makes you tick.",
        "Every brick is something you can't stop favoriting. It's a very honest wall.",
        all ? "ALL of them? Okay. Okay. Pacing myself." : "Just the recent stuff. Who you are now, not who you were.",
        all ? "This is going to take a minute. You've been busy." : "Your last few hundred favorites. Fresh tea.",
        "I'm not snooping. It's called research.",
        "Brick by brick. Favorite by favorite. Raccoon by raccoon. Well, one raccoon.",
        "Every wall tells a story. Yours has a lot of tails in it.",
        "Measure twice, lay once. I didn't measure.",
        "Hard hat on. Safety first.",
        "This is the most honest wall in the whole app.",
        "Look at it go! I'm basically an architect now.",
        "Your taste, in masonry form. Very avant-garde.",
        "Is this what bricklayers feel like? I get it now.",
        "Hold on, I'm getting a good look at your type.",
        "Sorting your favorites into neat little bricks. Very satisfying.",
        "If this wall falls over, it's because your taste is too strong.",
        "Grout? Who needs grout. Pure vibes holding this together.",
      ]
    : [
        `Reading ${name}'s favorites… this feels a little like reading a diary.`,
        `Building ${name}'s wall. Let's see what they're made of.`,
        `Don't tell ${name} we're doing this.`,
        `So THIS is what ${name} has been up to.`,
        `Every brick is something ${name} couldn't resist. Fascinating.`,
        all ? `All of ${name}'s favorites? Hope they didn't save too many.` : `Just ${name}'s recent favorites. The current era.`,
        `Snooping is a strong word. Let's call it curating for ${name}.`,
        `Gift shopping for ${name}, raccoon style.`,
        `${name}'s taste, brick by brick. It's a lot to take in.`,
        `If ${name} ever asks, I was never here.`,
        `So many bricks. ${name} has been busy.`,
        `Building ${name} a wall of their own taste. Weird gift. Great gift.`,
        `I feel like I'm reading ${name}'s browser history. In brick form.`,
        `Careful, ${name}'s favorites are load-bearing.`,
        `A wall of everything ${name} loves. Hope it holds.`,
        `Hard hat on. Investigating ${name}'s taste.`,
        `Every brick here is a little secret about ${name}.`,
        `Look at ${name}'s wall go! It's got character. Lots of characters.`,
        `Is this crossing a line, ${name}? Too late, I've started building.`,
      ];
}

/** Snarky-but-clean remarks once suggestions are on screen. */
export function forYouRemarks(f: ForYouFacts): string[] {
  const whose = f.isSelf ? "your" : `${f.name}'s`;
  const out: string[] = f.isSelf
    ? [
        "Fresh picks, hand-sorted by a raccoon. You're welcome.",
        "Based on your favorites, I think you'll like these. I'm rarely wrong. Occasionally wrong.",
        "If you favorite any of these, I'm taking full credit.",
        "Not feeling it? Hit Suggest more. I've got a whole bag of these.",
        "I shuffle these every time, so no two visits are the same. Keeps you on your toes.",
        "Click me for more of my brilliant analysis of you.",
        "Think of me as your personal shopper. Payment accepted in snacks.",
      ]
    : [
        `Picks for ${f.name}. Send them over, look like a genius.`,
        `If ${f.name} likes these, I accept tips. If not, it was your idea.`,
        `I've never met ${f.name}, but I feel like I know them now.`,
        `Curated for ${f.name} by a raccoon who has seen too much.`,
        `Some of these might be news to ${f.name}. Some of these might be news to you.`,
        `Want ${f.name}'s picks shuffled? Run it again. Never the same twice.`,
        `This is a great way to make friends or lose them. Exciting!`,
      ];

  if (f.topArtist) {
    out.push(
      f.isSelf
        ? `${prettyTag(f.topArtist)} is clearly your favorite. I found more like that.`
        : `${prettyTag(f.topArtist)} is ${f.name}'s go-to artist. I brought more.`,
    );
  }
  if (f.topArtist && f.secondArtist) {
    out.push(`${prettyTag(f.topArtist)} and ${prettyTag(f.secondArtist)}? ${f.isSelf ? "You've" : `${f.name} has`} got range.`);
  }
  if (f.newArtists >= 3) {
    out.push(`${n(f.newArtists)} artists in here ${f.isSelf ? "you haven't" : `${f.name} hasn't`} favorited yet. New friends!`);
  }
  if (f.firstNewArtist) {
    out.push(`Keep an eye on ${prettyTag(f.firstNewArtist)}. Feels like ${f.isSelf ? "your" : `${f.name}'s`} kind of thing.`);
  }
  if (f.topCharacter) {
    out.push(
      f.isSelf
        ? `${prettyTag(f.topCharacter)} again? You have a type. I respect it.`
        : `${f.name} really likes ${prettyTag(f.topCharacter)}. Like, REALLY.`,
    );
  }
  if (f.topCopyright) out.push(`Lots of ${prettyTag(f.topCopyright)} in ${whose} favorites. A fan, clearly.`);
  if (f.topSpecies) {
    out.push(`${prettyTag(f.topSpecies)} at the top of ${whose} list. Not raccoons. Noted. Hurt, but noted.`);
  }
  if (f.raccoon) out.push(`Raccoons in ${whose} top tags?! Finally, someone with taste.`);
  if (f.themes.length >= 2) out.push(`${whose === "your" ? "Your" : whose} vibe in three words: ${list(f.themes)}. Accurate?`);
  if (f.mode === "recent") out.push(`Built from ${whose} last ${n(f.sampled)} favorites. Want the deep cut? Try All favorites.`);
  if (f.mode === "all" && f.sampled >= 1000) {
    out.push(`I read all ${n(f.sampled)} of ${whose} favorites for this. My eyes. My poor little eyes.`);
  }
  if (f.mode === "all" && f.sampled < 200) out.push(`Only ${n(f.sampled)} favorites to go on. ${f.isSelf ? "Favorite more and I'll" : "Give them time, I'll"} get sharper.`);
  if (f.usedVotes) out.push("I checked your upvotes and downvotes too. Thorough, that's me.");
  if (f.usedVotes && f.avoidCount > 0 && f.avoidSample) {
    out.push(`You keep downvoting ${prettyTag(f.avoidSample)}, so I left it out. I listen.`);
  }
  if (f.partial) out.push(`You stopped me early, so these are based on part of ${whose} favorites. Rebuild for the full picture.`);
  if (f.suggestions >= 100) out.push(`${n(f.suggestions)} suggestions and counting. Scroll responsibly.`);
  if (f.suggestions > 0 && f.suggestions < 20) out.push("A short list this time. Quality over quantity. Mostly.");
  if (f.safeShare >= 0.4) out.push(`${pct(f.safeShare)} Safe. ${f.isSelf ? "You're" : `${f.name} is`} more wholesome than I expected.`);
  if (f.explicitShare >= 0.8) out.push(`${pct(f.explicitShare)} Explicit. I just follow the data. The data is very clear.`);
  if (f.animatedShare >= 0.25) out.push(`Lots of animation in here. ${f.isSelf ? "You like" : `${f.name} likes`} things that move.`);
  return out;
}

/** The cheeky side - innuendo, never explicit. */
export function spicyForYouRemarks(f: ForYouFacts): string[] {
  const whose = f.isSelf ? "your" : `${f.name}'s`;
  const out: string[] = f.isSelf
    ? [
        "I've seen your favorites now. We're closer than ever. Too close, maybe.",
        "Hand-picked to keep you up at night.",
        "These should keep you… occupied.",
        "Don't thank me. Actually, do. Loudly.",
      ]
    : [
        `So this is what ${f.name} does when nobody's watching.`,
        `${f.name}'s favorites told me things. Things I can't unsee.`,
        `Sending these to ${f.name}? Bold. I like it.`,
        `I know ${f.name}'s secrets now. All of them. Every last one.`,
      ];
  if (f.topArtist) out.push(`${prettyTag(f.topArtist)} has clearly done things to ${f.isSelf ? "you" : f.name}. Here's more trouble.`);
  if (f.topCharacter) out.push(`${prettyTag(f.topCharacter)}, huh? ${f.isSelf ? "Your" : `${f.name}'s`} crush is showing.`);
  if (f.topSpecies) out.push(`${prettyTag(f.topSpecies)} season, all year round, for ${f.isSelf ? "you" : f.name}.`);
  if (f.themes.length) out.push(`${prettyTag(f.themes[0])}? Of course. I'm not even surprised anymore.`);
  if (f.explicitShare >= 0.8) out.push("Nobody here came for the plot. Least of all me.");
  if (f.mode === "all" && f.sampled >= 1000) out.push(`${n(f.sampled)} favorites. That's not a hobby, that's a lifestyle.`);
  if (f.avoidCount > 0) out.push("Even you have limits, apparently. I've made a note.");
  out.push(`Reading ${whose} favorites was an education.`);
  out.push(
    ...(f.isSelf
      ? [
          "Picked with love. And a little concern.",
          "Everything here is your type. I checked. Thoroughly.",
          "If any of these don't do it for you, I'll eat my tail.",
          "Fresh material. Pace yourself.",
          "Go on, favorite one. You know you want to.",
          "I know what you like now. That's power.",
          "These are basically a love letter. To your worst instincts.",
          "Shuffled fresh every time. Variety is the spice of life. And of this.",
        ]
      : [
          `${f.name} is going to LOVE these. Maybe a little too much.`,
          `Gift idea for ${f.name}: this whole page. Wrapped in plain paper.`,
          `If ${f.name} asks how you knew, say it was a lucky guess.`,
          `${f.name} has a type, and I found more of it.`,
          `These would make ${f.name} blush. Then favorite all of them.`,
          `Send these to ${f.name} and watch them pretend to be shocked.`,
          `I've learned more about ${f.name} today than I ever needed to.`,
        ]),
  );
  if (f.newArtists >= 3) out.push(`${n(f.newArtists)} new artists for ${f.isSelf ? "you" : f.name} to get acquainted with. Intimately.`);
  if (f.topArtist && f.secondArtist) {
    out.push(`${prettyTag(f.topArtist)} AND ${prettyTag(f.secondArtist)}? ${f.isSelf ? "You're" : `${f.name} is`} greedy. Respect.`);
  }
  if (f.topCopyright) out.push(`All that ${prettyTag(f.topCopyright)}. Nobody's watching it for the story.`);
  if (f.raccoon) out.push(`Raccoons in ${whose} top tags. I'm flattered. And a little flustered.`);
  if (f.safeShare >= 0.4) out.push("Lots of Safe stuff in here. Building up slowly. I see you.");
  if (f.animatedShare >= 0.25) out.push("So much of this moves. Turn your volume down first.");
  if (f.usedVotes) out.push("I read your votes too. Your downvotes say a lot. Your upvotes say more.");
  if (f.partial) out.push("Stopped me early? Couldn't wait, huh?");
  if (f.suggestions >= 100) out.push(`${n(f.suggestions)} suggestions. That's a whole evening. Or a very busy hour.`);
  return out;
}

/** Cheeky lines while the wall goes up. */
export function spicyForYouBuildingRemarks(isSelf: boolean, name: string, mode: TasteMode): string[] {
  const all = mode === "all";
  return isSelf
    ? [
        "Reading your favorites. Oh. Oh my.",
        "Every brick here is something that got you going. Big wall.",
        "Building a monument to your thirst.",
        "This wall knows things about you. Dirty things.",
        "Hold still, I'm cataloguing your sins.",
        "I'm learning so much. Too much, maybe.",
        "Brick by brick, I'm finding out what you're into. And it's a lot.",
        "Your type, in masonry. Very structurally horny.",
        "Don't look at me like that. You favorited all of these.",
        all ? "ALL your favorites. I'm going to need a cold shower after this." : "Just the recent ones. Your current mood. Very current. Very moody.",
        all ? "Every single favorite. You've been very, very busy." : "The last few hundred. Recent sins only.",
        "Some of these bricks are blushing.",
      ]
    : [
        `Reading ${name}'s favorites. Oh. OH.`,
        `${name} has been naughty. I can tell from the bricks.`,
        `Building ${name} a monument to their thirst.`,
        `Every brick is something ${name} would never admit to liking.`,
        `I now know things about ${name} that their friends don't.`,
        `${name}'s favorites. Wow. Okay. Who knew.`,
        `Don't tell ${name} I've seen all this.`,
        `This wall is ${name}'s whole personality. The secret one.`,
        all ? `All of ${name}'s favorites? I'm going to need a minute.` : `${name}'s recent favorites. Fresh sins.`,
        `Snooping through ${name}'s stash. Very educational.`,
        `If ${name} finds out you did this, act natural.`,
      ];
}

/** Cheeky live commentary for wall events. */
export function spicyForYouWallRemarks(
  e: { type: WallEventKind; word?: string; count?: number },
  isSelf: boolean,
  name: string,
): string[] {
  const w = e.word ? prettyTag(e.word) : "";
  const whose = isSelf ? "your" : `${name}'s`;
  switch (e.type) {
    case "first":
      return [`${w} first. Straight to the point.`, `Leading with ${w}. No foreplay.`, `${w}. Of course. Everyone knows that's ${whose} thing.`];
    case "big":
      return [
        `${w} is a BIG one. Size matters, apparently.`,
        `Whoa, ${w}! That's a mouthful. Of a word.`,
        `${w} is huge. ${isSelf ? "You" : name} clearly can't get enough.`,
        `${w}. Thick brick. Very thick.`,
        `Look at the size of ${w}! Somebody's obsessed.`,
      ];
    case "vertical":
      return [`${w} standing at attention.`, `${w}, nice and upright.`, `${w} is standing up. Excited, maybe.`, `Rock hard ${w}. The brick. The brick is rock hard.`];
    case "avatarBump":
      return isSelf
        ? [`${w} right in your face. You'd like that.`, `Bonk! ${w} got a little too close.`, `${w} is all over you. Typical.`]
        : [`${w} right in ${name}'s face. They'd like that.`, `${w} is all over ${name}. Shocking, truly.`, `Bonk! ${name} took that one head-on.`];
    case "raccoon":
      return [
        `${w}! ${isSelf ? "You've" : `${name} has`} got a thing for raccoons? I'm blushing.`,
        `A ${w} brick. ${isSelf ? "You" : name} clearly ${isSelf ? "have" : "has"} excellent, filthy taste.`,
        `${w}. Now we're talking.`,
      ];
    case "count":
      return e.count && e.count >= 30
        ? [`Nearly done. ${isSelf ? "You've" : `${name} has`} got a LOT of tastes.`, "This wall is enormous. Like the appetite behind it.", "Almost finished. Don't finish before me."]
        : e.count && e.count >= 20
          ? ["Halfway. Keep going. Don't stop now.", `It just keeps getting bigger. Like ${whose} fav list.`, "Halfway there. Building up nicely."]
          : ["It's growing!", "Getting bigger. No comment. Okay, one comment: nice.", "A few rows in. Firm foundations."];
    case "topCourse":
      return [`${w} on top. ${isSelf ? "You like" : `${name} likes`} it on top?`, "Top row! The climax of the wall.", `${w} gets to be on top. Lucky.`];
  }
}

/** Cheeky phase lines. */
export function spicyForYouPhaseRemarks(phase: "waiting" | "gathering", isSelf: boolean, name: string): string[] {
  if (phase === "waiting") {
    return ["Taking a breather. You might want one too.", "Slowing down. Good things come to those who wait.", "Patience. Edging builds character."];
  }
  return isSelf
    ? ["Got your type locked in. Now finding you something new to drool over.", "Wall's done. Now: shopping for your next obsession.", "I know your kinks now. Let's find more of them."]
    : [`Got ${name}'s kinks figured out. Now finding them fresh material.`, `Shopping for ${name}. Something to make them blush.`, `I know what ${name} likes now. Oh boy, do I know.`];
}

/** Empty / private / error states. */
export function forYouEmptyRemarks(kind: "private" | "empty" | "noResults", isSelf: boolean, name: string): string[] {
  if (kind === "private") {
    return [
      `${name}'s favorites are private. A raccoon respects a locked door. Mostly.`,
      `Locked tight. ${name} doesn't want us peeking.`,
      `No snooping on ${name} today, I guess.`,
    ];
  }
  if (kind === "empty") {
    return isSelf
      ? ["No favorites yet? Go favorite some stuff, then come back. I'll wait.", "I can't read a blank page. Favorite a few things first!"]
      : [`${name} hasn't favorited anything. A mystery.`, `Nothing to go on for ${name}. Blank slate.`];
  }
  return [
    "I came up empty. That's never happened. That's happened a few times.",
    "Nothing turned up this time. Try All favorites, or rebuild later.",
    "Even raccoons strike out sometimes.",
  ];
}

/** Occasional nod when "Suggest more" loads another batch. */
export function forYouMoreRemarks(isSelf: boolean, name: string): string[] {
  return [
    "Digging deeper…",
    "More? Coming right up.",
    "There's always more in the bin.",
    isSelf ? "Greedy. I like it." : `Still shopping for ${name}, huh?`,
    "Fresh batch, still warm.",
  ];
}

/** Live commentary as specific bricks land on the For you wall (BrickWall's WallEvent). */
export type WallEventKind = "first" | "big" | "vertical" | "avatarBump" | "raccoon" | "count" | "topCourse";

export function forYouWallRemarks(
  e: { type: WallEventKind; word?: string; count?: number },
  isSelf: boolean,
  name: string,
): string[] {
  const w = e.word ? prettyTag(e.word) : "";
  const whose = isSelf ? "your" : `${name}'s`;
  switch (e.type) {
    case "first":
      return [
        `First brick: ${w}. A strong foundation.`,
        `${w} goes in first. Makes sense.`,
        `Starting with ${w}. Of course we are.`,
        `${w}. The cornerstone of ${whose} taste.`,
      ];
    case "big":
      return [
        `Whoa, ${w} is a BIG one!`,
        `${w}! That brick needed two hands.`,
        `Heavy! ${w} is clearly a big deal to ${isSelf ? "you" : name}.`,
        `${w} takes up a lot of room. In the wall and in ${whose} heart.`,
        `Mind your toes, ${w} coming through!`,
        `${w}. Load-bearing. Do not remove.`,
      ];
    case "vertical":
      return [
        `${w} standing tall.`,
        `${w} insisted on going in sideways. Fine.`,
        `A little pillar of ${w}. Architectural.`,
        `${w}, standing on end. Very dramatic.`,
      ];
    case "avatarBump":
      return isSelf
        ? [`Hey! ${w} hit your face!`, "Watch the avatar!", `Ow. ${w} bonked you.`, "Careful, that's your face!", "Mind the portrait!"]
        : [`${w} just bonked ${name}!`, `Watch ${name}'s face!`, `Sorry, ${name}!`, `${name} took a brick to the face. Respect.`];
    case "raccoon":
      return [`${w}! A raccoon brick! My favorite kind.`, `Ooh, ${w}. Excellent taste, honestly.`, `${w} gets a place of honor.`, `I'm not biased, but ${w} is the best brick here.`];
    case "count":
      return e.count && e.count >= 30
        ? ["Almost there. Look at this thing!", "It's practically a fortress now.", `This is a whole building's worth of ${whose} taste.`]
        : e.count && e.count >= 20
          ? ["Halfway there! Probably!", "We're really getting somewhere now.", "Look at it rise!"]
          : ["It's coming together!", "A few rows in. Looking sturdy.", "Starting to look like a wall!"];
    case "topCourse":
      return [`${w} on top. Topping it off.`, `Up on the top row: ${w}.`, "Top row! Nearly done.", "Who put the roof bricks in? Me. I did."];
  }
}

/** Phase changes while the wall is up. */
export function forYouPhaseRemarks(phase: "waiting" | "gathering", isSelf: boolean, name: string): string[] {
  if (phase === "waiting") {
    return [
      "Catching my breath. e621 likes us to take it slow.",
      "One second, I'm being polite to the servers.",
      "Waiting my turn. Raccoons can be patient. Sometimes.",
    ];
  }
  return isSelf
    ? [
        "Got your taste down. Now hunting for things you haven't seen.",
        "Wall's built. Now the fun part: shopping.",
        "Rummaging through e621 for you. Digging through the good bins.",
        "Okay, I know you now. Let's find you something new.",
      ]
    : [
        `Got ${name}'s taste down. Now finding things they haven't seen.`,
        `Shopping for ${name} now. Hope they like surprises.`,
        `Digging through e621 on ${name}'s behalf. Very official business.`,
        `I know ${name} now. Let's find them something new.`,
      ];
}
