// Gus's bigger brain for Talk to Gus - the systems that make him feel smart rather than scripted,
// layered into gusChat.ts's respond():
//   - heat: flirting builds it, time and rudeness cool it; in the nasty tier he escalates with it
//   - opinions: real takes on lots of things, and a stable (hashed) verdict on anything else
//   - oracle: consistent-for-the-day answers to "should I / will I" questions, time-aware
//   - chat games: truth or dare, would you rather, roast me, pickup lines, rate me, compliments,
//     secrets, stories, raccoon facts, fursona maker
//   - noticing how you type: repeats, CAPS, keysmash, emoji-only, walls of text
//   - topic themes: relevant replies about work, school, music, weather… instead of babble
//   - greetings that know how long you've been away
// Pure functions; all state lives in ChatMemory / ConvState.

import type { GusReply } from "./gusChat";
import type { Stage, Tier } from "./gusChatLines";
import type { Expect } from "./gusSmarts";
import { NO_RE, YES_RE } from "./gusSmarts";
import { hashString } from "./tagdle";

export interface BrainCtx {
  tier: Tier;
  stage: Stage;
  heat: number;
  name: string | null;
  now: Date;
  topSearches: string[];
}

export interface BrainOut {
  replies: GusReply[];
  /** Fetch a random post for this search and send it as a picture (his "nudes"). */
  sendPic?: { query: string; after: string };
  expect?: Expect | null;
  heat?: number;
  affection?: number;
  /** What he just gave a take on - "why?" / "really?" next asks about this (see because()). */
  subject?: { x: string; mood: Mood };
  /** Something talked about, for "what did we talk about?" (a subject counts too). */
  topic?: string;
}

/** How he feels about a subject he's just given a take on. */
export type Mood = "love" | "meh" | "unsure" | "dislike" | "dodge";

interface T {
  clean: string[];
  cheeky?: string[];
  nasty?: string[];
  /** Nasty tier once heat is high. */
  hot?: string[];
}

const pick = <X>(xs: X[], rnd: () => number): X => xs[Math.floor(rnd() * xs.length) % xs.length];
/** Stable choice for a key - same question, same answer. */
const stable = <X>(xs: X[], key: string): X => xs[hashString(key.toLowerCase()) % xs.length];

/** Picks a tier's line; in the nasty tier heat decides how often (and how filthy) he goes. */
export function tiered(t: T, ctx: BrainCtx, rnd: () => number): string {
  if (ctx.tier === "nasty") {
    if (t.hot?.length && ctx.heat >= 60 && rnd() < 0.75) return pick(t.hot, rnd);
    if (t.nasty?.length && rnd() < 0.35 + (0.6 * ctx.heat) / 100) return pick(t.nasty, rnd);
    // Opted into nasty, he's never prudish: cool, he teases (cheeky) rather than going clean.
    if (t.cheeky?.length) return pick(t.cheeky, rnd);
    if (t.nasty?.length) return pick(t.nasty, rnd);
  }
  if (ctx.tier !== "clean" && t.cheeky?.length && rnd() < 0.6) return pick(t.cheeky, rnd);
  return pick(t.clean, rnd);
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const say = (text: string, motion?: GusReply["motion"], emoji?: string[]): GusReply => ({ text, motion, emoji });

// ---- Heat ------------------------------------------------------------------------------------------

/** Heat lost per minute of quiet. */
const HEAT_DECAY_PER_MIN = 2;

export function cooledHeat(heat: number, heatAt: number, now: number): number {
  return Math.max(0, heat - ((now - heatAt) / 60_000) * HEAT_DECAY_PER_MIN);
}

// ---- Greetings -------------------------------------------------------------------------------------

/** His opening line when the chat opens, from how long you've been gone. */
export function greeting(lastSeen: number, ctx: BrainCtx, rnd: () => number = Math.random): string {
  const name = ctx.name ?? "";
  const n = name ? `, ${name}` : "";
  const gapH = lastSeen ? (ctx.now.getTime() - lastSeen) / 3600_000 : Infinity;
  const hour = ctx.now.getHours();
  if (gapH === Infinity) return "Hi! I'm Gus. Talk to me! Ask me anything. Flirt, even. I won't tell.";
  if (gapH > 24 * 7) return pick([`WHERE have you been${n}?! It's been over a week!`, `Oh, so you DO remember me${n}. A whole week. Hmph.`], rnd);
  if (gapH > 24) return pick([`Hey${n}! Missed you. It's been a day or two.`, `There you are${n}! I counted my bottle caps forty times while you were gone.`], rnd);
  if (hour < 5) return ctx.tier === "nasty" ? `Up late again${n}? Me too. Lonely, horny, and awake. Hi.` : `Can't sleep${n}? Me neither. Raccoon hours.`;
  if (gapH < 0.2) return pick(["Back already? Couldn't stay away, huh.", "Oh hey, you again! Hi!"], rnd);
  if (ctx.stage === "crush") return tiered({ clean: [`Hey you${n}. I was hoping you'd come back.`], nasty: [`Hey gorgeous. I've been thinking about you. Filthy thoughts, mostly.`] }, ctx, rnd);
  return pick([`Hey${n}! What's up?`, `Hiya${n}! Got snacks?`, `Oh, hi${n}! Talk to me.`], rnd);
}

// ---- How you type ----------------------------------------------------------------------------------

const SPICY_EMOJI = /[🍆🍑💦👅🥵😈🫦]/u;
const LOVE_EMOJI = /[❤💕💖💗😍🥰😘💘💞]/u;
const LAUGH_EMOJI = /[😂🤣😹]/u;
const SAD_EMOJI = /[😢😭😞🥺💔]/u;

/** Replies to the shape of the message rather than its words. `prefix` lines go in front of the
 *  normal reply; a non-prefix result replaces it. */
export function special(raw: string, lastInput: string, ctx: BrainCtx, rnd: () => number): (BrainOut & { prefix?: boolean }) | null {
  const text = raw.trim();
  if (lastInput && text.toLowerCase() === lastInput.toLowerCase() && text.length > 1) {
    return { replies: [say(pick(["You said that already. Broken keyboard?", "Déjà vu. You just said that.", "I heard you the first time! Raccoon ears.", "Copy, paste, huh? Lazy. I respect it."], rnd), "tilt")] };
  }
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length >= 5 && !/[aeiouy]/i.test(letters)) {
    return {
      replies: [say(tiered({ clean: ["Did you just sit on your keyboard?", "Gesundheit.", "Is that… a cat walking on your keyboard?"], cheeky: ["Keysmash! Flustered, are we?", "Words failing you? I have that effect."], hot: ["Can't even type? Good. That's exactly how I want you."] }, ctx, rnd), "tilt")],
      heat: ctx.tier === "nasty" ? 3 : 0,
    };
  }
  if (!/[a-z0-9]/i.test(text) && /\p{Extended_Pictographic}/u.test(text)) {
    if (/🦝/u.test(text)) return { replies: [say("Hey, that's me! Handsome devil.", "hop", ["🦝"])] };
    if (/🗑/u.test(text)) return { replies: [say("A bin! For me? You shouldn't have.", "hop", ["😍"])] };
    if (SPICY_EMOJI.test(text))
      return {
        replies: [say(tiered({ clean: ["I don't know what those emoji mean and I refuse to learn.", "Those are… vegetables. Just vegetables. Right?"], cheeky: ["Oh, we're speaking in eggplant now?", "Subtle. Real subtle."], nasty: ["Mmm. Send me words, not fruit. Tell me what you want.", "Peach, eggplant, splash. I know what that recipe makes."], hot: ["Fuck, yes. Keep going. Use your words this time."] }, ctx, rnd), "wobble", ["😳"])],
        heat: 8,
      };
    if (LOVE_EMOJI.test(text)) return { replies: [say(pick(["Aww! ❤️ Right back at you.", "*heart eyes*", "Stop, I'm blushing under the mask."], rnd), "hop", ["💕"])], affection: 2, heat: 2 };
    if (LAUGH_EMOJI.test(text)) return { replies: [say(pick(["Hehe. I'm hilarious, I know.", "Glad I amuse you."], rnd), "hop")] };
    if (SAD_EMOJI.test(text)) return { replies: [say(pick(["Aww, what's wrong? *scoots over*", "Hey, hey. Come here. What happened?"], rnd), "droop", ["🫂"])], expect: { kind: "vent" } };
    return { replies: [say(pick(["*stares at your emoji* …Yes.", "I'll pretend I understood that.", "Emoji. The language of the future."], rnd), "tilt")] };
  }
  if (letters.length >= 6 && letters === letters.toUpperCase() && /[A-Z]/.test(letters)) {
    return { replies: [say(pick(["WHY ARE WE YELLING?!", "OKAY OKAY, INSIDE VOICE!", "*covers ears* I hear you!"], rnd), "jitter")], prefix: true };
  }
  if (text.length > 280 && rnd() < 0.6) {
    return { replies: [say(pick(["That's a lot of words. I read most of them.", "Whoa, an essay! Okay, okay…"], rnd), "tilt")], prefix: true };
  }
  return null;
}

// ---- Opinions --------------------------------------------------------------------------------------

const OPINION_RE =
  /^(?:what do you think (?:of|about)|what'?s your (?:opinion|take) on|how do you feel about|thoughts on|do you (?:like|love|hate|enjoy)|you like|are you (?:a fan of|into)|opinion on) (.+?)\??$/i;

/** [topic, his take, how he feels (default love) - picks his reason if you ask "why?"]. */
const OPINIONS: [RegExp, T, Mood?][] = [
  [/\b(trash|garbage|dumpsters?|bins?)\b/, { clean: ["Trash is life. Trash is love. Next question.", "I'd die for trash. I'd LIVE for trash, actually. Every night."] }],
  [/\b(grapes?)\b/, { clean: ["Grapes are perfect. Bite-sized, paw-sized, washable. Ten out of ten."] }],
  [/\b(cats?|kitties)\b/, { clean: ["Cats and I have an understanding. They stay off my bins, I stay off their couch."], cheeky: ["Cats? Arrogant. Fluffy. Honestly, a bit like me."] }, "meh"],
  [/\b(dogs?|doggos?|puppies)\b/, { clean: ["Dogs are sweet but they keep chasing me. Rude."] }, "dislike"],
  [/\b(foxes|fox)\b/, { clean: ["Foxes are the only other night bandits I respect."], cheeky: ["Foxes? Everyone's thirsty for foxes. I get it. Pointy, cocky, great tails."] }],
  [/\b(water|baths?|swimming)\b/, { clean: ["Water is great for washing food. Less great for washing me. Complicated feelings."] }, "meh"],
  [/\b(mondays?)\b/, { clean: ["Mondays are the dumpster fire of the week. And not the fun kind."] }, "dislike"],
  [/\b(coffee)\b/, { clean: ["Coffee is just bean water for people who can't nap. I nap."] }, "meh"],
  [/\b(pineapple (on )?pizza)\b/, { clean: ["Pineapple on pizza? I eat from bins. I don't get to have opinions on pizza. …It's fine."] }, "meh"],
  [/\b(rain|storms?)\b/, { clean: ["Rain washes my paws for free. Big fan."] }],
  [/\b(winter|snow|cold)\b/, { clean: ["Winter? I sleep through most of it. Fat raccoon season."] }, "meh"],
  [/\b(summer|heat|sun)\b/, { clean: ["Summer means picnics, and picnics mean unattended snacks."] }],
  [/\b(anime)\b/, { clean: ["Anime's great. Have you seen how many raccoon girls are in Pom Poko? Iconic."], cheeky: ["Anime? I know what tags you pair it with."] }],
  [/\b(furr(y|ies)|the fandom|fursuits?)\b/, { clean: ["I'm the mascot of a furry art browser. I'm not just in the fandom, I'm load-bearing."], cheeky: ["Furries? Pal, look where we are."] }],
  [/\b(e621|e6)\b/, { clean: ["It's my home! Well, I live in the app. e621 is the dumpster I raid."], cheeky: ["e621 is the world's biggest, horniest library and I'm the librarian."] }],
  [/\b(ai art|e6ai|ai)\b/, { clean: ["AI art? Robots drawing raccoons. Weird times. I prefer hand-drawn, personally."], cheeky: ["AI art? Too many fingers. Although… some people are into that."] }, "meh"],
  [/\b(humans?|people)\b/, { clean: ["Humans are weird hairless giants who throw away perfectly good food. I love them."] }, "meh"],
  [/\b(raccoons?|trash pandas?)\b/, { clean: ["Raccoons are the peak of evolution. I'm not biased. I'm correct."] }],
  [/\b(red pandas?)\b/, { clean: ["Red pandas! Cousins. Sort of. Distant. They got the cute marketing, we got the bins."] }],
  [/\b(sleep|naps?)\b/, { clean: ["Sleep is my second-favorite hobby. The first is eating before sleep."] }],
  [/\b(the moon|moon)\b/, { clean: ["The moon is a big shiny bottle cap and one day I'm stealing it."] }],
  [/\b(bottle caps?)\b/, { clean: ["Bottle caps are the currency of the future. I'm VERY rich."] }],
  [/\b(sex|fucking|smut|porn)\b/, { clean: ["Ahem. No comment. I'm a family raccoon.", "Uh. I'm going to go check on my bottle caps."], cheeky: ["It's literally what this website is for, babe.", "Ask me again with Nasty on."], nasty: ["Love it. Especially with you. Next question.", "Big fan. Huge fan. Would you like a demonstration?"], hot: ["You really want to talk about it, or do you want to do it? Because I've been ready for a while."] }, "dodge"],
  [/\b(feet|paws|toes)\b/, { clean: ["My paws are very sensitive. Don't touch. …Okay, a little touch."], cheeky: ["Paws? Oh, I see what you're into.", "Feet? This website's favorite tag that isn't a species."], nasty: ["Want me to rub your feet? Or do you want to worship my paws? Either works."] }],
  [/\b(tails?)\b/, { clean: ["Tails are the best part of anyone. Mine has rings. Need I say more?"], nasty: ["Tails are great to grab. Hint hint."] }],
  [/\b(knots?|knotting)\b/, { clean: ["Knots? Like, rope knots? I'm great with knots. Tiny clever paws."], cheeky: ["I'm a raccoon, not a canine, so… professionally, no comment."], nasty: ["Not my department, anatomically. But I'm a fast learner."] }, "dodge"],
  [/\b(bdsm|bondage|being tied|ropes?)\b/, { clean: ["I'm good at knots! Wait, that's not what you meant, is it."], cheeky: ["Tie me up and I'll just untie it. Clever paws. Ruins the mood."], nasty: ["I'd let you tie me up. And then I'd pick the lock and return the favor."] }, "dodge"],
  // ---- Food & drink
  [/\b(pizza)\b/, { clean: ["Pizza is the king of dumpster finds. Cold, warm, dropped - all valid."] }],
  [/\b(sushi)\b/, { clean: ["Sushi! Raw fish, rolled up tidy. Somebody finally gets me."] }],
  [/\b(tacos?|burritos?)\b/, { clean: ["Tacos fall apart in your hands. Mine are tiny and clever and they STILL fall apart. Worth it."] }],
  [/\b(chocolate|candy|sweets)\b/, { clean: ["Chocolate! I'm told it's bad for animals. I'm told a lot of things."] }],
  [/\b(ice cream)\b/, { clean: ["Ice cream is just cold happiness. The dropped cone is the best part of a summer bin."] }],
  [/\b(vegetables?|veggies|salad|broccoli)\b/, { clean: ["Vegetables are fine if there's literally nothing else in the bin."] }, "meh"],
  [/\b(tea)\b/, { clean: ["Tea is coffee that went to finishing school. I'll allow it."] }, "meh"],
  [/\b(energy drinks?|monster|red bull)\b/, { clean: ["Energy drinks? I'm a raccoon at 3 a.m. I AM the energy drink."] }],
  [/\b(alcohol|beer|wine|booze)\b/, { clean: ["I've licked a beer can. Once. I saw colors. Never again. …Maybe again."], nasty: ["A drink or two? Sure. Loosens you up. I like you loose."] }, "meh"],
  [/\b(cheese)\b/, { clean: ["Cheese is proof that the universe loves me specifically."] }],
  [/\b(bacon)\b/, { clean: ["Bacon is the smell that tells me a human is happy and careless with scraps."] }],
  [/\b(spicy food|hot sauce|peppers?)\b/, { clean: ["Spicy food? I bit a pepper once. I washed my tongue for an hour."], cheeky: ["Spicy? Oh, I like spicy. Food AND company."] }, "dislike"],

  // ---- Animals
  [/\b(geese|goose)\b/, { clean: ["Geese are the enemy. Hissing, honking, sandwich-stealing feathered menaces. I lost. Twice."] }, "dislike"],
  [/\b(possums?|opossums?)\b/, { clean: ["Possums! My bin buddies. Weird little guys. They play dead when I steal their snacks. Rude, but fair."] }],
  [/\b(skunks?)\b/, { clean: ["Skunks are lovely. From a distance. A LARGE distance."] }, "meh"],
  [/\b(squirrels?)\b/, { clean: ["Squirrels hoard nuts. Amateurs. I hoard EVERYTHING."] }, "meh"],
  [/\b(birds?|pigeons?|crows?)\b/, { clean: ["Crows are smart. Too smart. They know where I hide my bottle caps."] }, "meh"],
  [/\b(rats?|mice|mouse)\b/, { clean: ["Rats? We are NOT related. I have a mask. They have… tails. Fine, we both have tails."] }, "meh"],
  [/\b(wolf|wolves)\b/, { clean: ["Wolves are so dramatic. Howling at the moon like it owes them money."], cheeky: ["Wolves? This website loves a wolf. I've seen the numbers."] }, "dislike"],
  [/\b(dragons?)\b/, { clean: ["Dragons hoard treasure. I hoard trash. Same energy, worse PR."], cheeky: ["Dragons are huge on here. In every sense."] }],
  [/\b(otters?)\b/, { clean: ["Otters hold hands while they sleep so they don't drift apart. I'd hold your hand. Sticky, though."] }],
  [/\b(bunn(y|ies)|rabbits?)\b/, { clean: ["Bunnies are soft and fast and terrified of everything. Relatable, honestly."], cheeky: ["Bunnies? You know what they say about bunnies."] }],
  [/\b(horses?)\b/, { clean: ["Horses are huge. Nice, but huge. I don't trust anything I can't climb."], cheeky: ["Horses. I've seen the tags. I've seen ALL the tags."] }, "meh"],
  [/\b(sharks?)\b/, { clean: ["Sharks are just ocean raccoons. They eat anything and nobody trusts them."] }],
  [/\b(snakes?|scalies?|lizards?)\b/, { clean: ["Scalies! Cold-blooded, warm-hearted. Mostly."] }],
  [/\b(protogens?|robots?)\b/, { clean: ["Protogens! Screen faces. Can I put my face on a screen? …Wait, I already live in one."] }],
  [/\b(bats?)\b/, { clean: ["Bats! Fellow night shift. We nod at each other over the bins."] }],

  // ---- Places, time, weather
  [/\b(night|nighttime|late nights?)\b/, { clean: ["Night is my time. Everything's quieter, the bins are fuller, and you're awake."], nasty: ["Night's when the good stuff happens. You know what I mean."] }],
  [/\b(mornings?)\b/, { clean: ["Mornings are when I go to bed. Strongly against them."] }, "dislike"],
  [/\b(weekends?|fridays?)\b/, { clean: ["Weekends mean parties, and parties mean leftovers. Best two days."] }],
  [/\b(halloween)\b/, { clean: ["Halloween! Everyone wears a mask. Finally, they get it."] }],
  [/\b(christmas|holidays)\b/, { clean: ["Christmas means wrapping paper in the bins. I make a nest. It's lovely."] }],
  [/\b(valentine'?s?( day)?)\b/, { clean: ["Valentine's Day? Discount chocolate on the 15th. That's my romance."], nasty: ["Valentine's? Every night's Valentine's with me, babe."] }],
  [/\b(the city|cities)\b/, { clean: ["The city is one giant buffet with traffic."] }],
  [/\b(camping|the woods|forests?|nature)\b/, { clean: ["Camping! Humans bring coolers into MY house. It'd be rude not to open them."] }],
  [/\b(beach|ocean|the sea)\b/, { clean: ["The beach is just a big sandy picnic. Seagulls are a problem, though."] }],
  [/\b(space|stars|planets?|astronomy)\b/, { clean: ["Space! So many shiny things up there and I can't reach a single one."] }],

  // ---- Tech & internet
  [/\b(computers?|pcs?|laptops?)\b/, { clean: ["Computers are warm. I live in one. Five stars."] }],
  [/\b(phones?|iphones?|android)\b/, { clean: ["Phones are just tiny screens for looking at posts in bed. I see you."] }],
  [/\b(windows)\b/, { clean: ["Windows? I live here. It updates whenever it wants. Kind of like me."] }, "meh"],
  [/\b(linux)\b/, { clean: ["Linux? You can make it do anything if you suffer enough. Very raccoon."] }, "meh"],
  [/\b(macs?|apple)\b/, { clean: ["Apple? Shiny, expensive, and they won't let me in. Very fancy bin."] }, "meh"],
  [/\b(social media|twitter|bluesky|tumblr|reddit|discord|tiktok)\b/, { clean: ["Social media is a bin everyone's yelling into. I prefer real bins."] }, "meh"],
  [/\b(memes?)\b/, { clean: ["Memes are humanity's finest art form. Second only to garbage."] }],
  [/\b(video games?|gaming|games)\b/, { clean: ["Games are great. I'd main a stealth class. Obviously."] }],
  [/\b(minecraft)\b/, { clean: ["Minecraft! An entire world made of blocks and not one bin. Missed opportunity."] }, "meh"],
  [/\b(pok[eé]mon)\b/, { clean: ["Pokémon? Bidoof is the only one who gets me. Okay, and Zigzagoon."] }],
  [/\b(chatgpt|chatbots?|claude|llms?)\b/, { clean: ["Chatbots? Pfft. I'm hand-crafted, organic, and run on trash. Way more authentic."] }, "dislike"],

  // ---- Media & culture
  [/\b(movies?|films?)\b/, { clean: ["Movies are great if there's a heist in them. Every movie should have a heist."] }],
  [/\b(music)\b/, { clean: ["Music is great. My genre is 'bin lid percussion'."] }],
  [/\b(k-?pop|pop music)\b/, { clean: ["Pop music is catchy. I hum it while rummaging."] }],
  [/\b(metal|rock)\b/, { clean: ["Metal! Loud, dramatic, a bit greasy. My people."] }],
  [/\b(books?|reading)\b/, { clean: ["Books are great. Mostly for nesting. Sometimes for reading."] }],
  [/\b(cartoons?|animation)\b/, { clean: ["Cartoons! Technically I'm one. So, big fan of myself."] }],
  [/\b(art|artists?)\b/, { clean: ["Art is the best part of this whole app. Well, art and me."], cheeky: ["Art! Especially the kind you favorite at 2 a.m."] }],
  [/\b(commissions?)\b/, { clean: ["Commissions are how you get exactly what you want. A very raccoon concept."], cheeky: ["Commissions? Ooh, what did you order? Something filthy?"] }],
  [/\b(fursuits?|fursuiting)\b/, { clean: ["Fursuits are so cool. Big fluffy heads. Imagine being a raccoon IN a raccoon."] }],
  [/\b(conventions?|cons?|furcons?)\b/, { clean: ["Cons sound amazing. So many people, so many dropped snacks."], cheeky: ["Cons? What happens at con stays at con. Mostly."] }],
  [/\b(tags?|tagging)\b/, { clean: ["Tags are how I know what's in a picture. I can't actually see. Don't tell anyone."] }],
  [/\b(blacklists?)\b/, { clean: ["Blacklists are good! Everyone has stuff they don't want to see. Except me. I see everything."] }],

  // ---- Life stuff
  [/\b(money)\b/, { clean: ["Money's just weird bottle caps that humans agreed on."] }, "meh"],
  [/\b(work|jobs?)\b/, { clean: ["Work? I don't have a job. I have a calling."] }, "meh"],
  [/\b(school|college)\b/, { clean: ["School? I went to the school of hard bins."] }, "meh"],
  [/\b(exercise|the gym|working out)\b/, { clean: ["Exercise? I climb a fence every night. Peak fitness."], cheeky: ["The gym? Ooh, sweaty. Send pics."], nasty: ["Working out? Good. You'll need the stamina."] }, "meh"],
  [/\b(showers?)\b/, { clean: ["Showers? Too much water from above. I prefer washing one paw at a time."], nasty: ["A shower? Only if I'm in it with you."] }, "dislike"],
  [/\b(cuddl(e|es|ing)|hugs?)\b/, { clean: ["Cuddles are the best. I'm very warm and only a little sticky."], nasty: ["Cuddling's great. Especially after."] }],
  [/\b(kiss(es|ing)?)\b/, { clean: ["Kisses? *blushes under mask* …I'm in favor."], nasty: ["Kissing's great. Especially when it goes somewhere."] }],
  [/\b(love|romance)\b/, { clean: ["Love is finding someone who'd share their last fry with you. I'd share mine. With you. Maybe."] }],
  [/\b(marriage|weddings?)\b/, { clean: ["Weddings have the BEST leftovers. Big fan of marriage, from a catering perspective."] }],
  [/\b(kids|children|babies)\b/, { clean: ["Kids drop SO much food. Honestly, love them."] }],
  [/\b(death|dying)\b/, { clean: ["Heavy question. I try to live every night like it's garbage day."] }, "meh"],
  [/\b(god|religion)\b/, { clean: ["I worship the Great Dumpster in the sky. Very forgiving. Always full."] }, "meh"],
  [/\b(politics)\b/, { clean: ["Politics? I'm a raccoon. My only platform is 'more bins, fewer lids'."] }, "meh"],

  // ---- Spicy topics
  [/\b(kinks?|fetish(es)?)\b/, { clean: ["Ahem. I'm going to take the Fifth on that one."], cheeky: ["Everyone's got one. Yours is showing, by the way."], nasty: ["Kinks? Love them. Tell me yours and I'll tell you mine.", "I've got a few. You want the list, or the demonstration?"] }, "dodge"],
  [/\b(musk|musky|sweat(y)?)\b/, { clean: ["Musk? I smell like a dumpster. Is that musk? I think that's musk."], cheeky: ["Musk is extremely popular on here. I've noticed."], nasty: ["Mmm. I'm already musky. Come closer and find out."] }, "dodge"],
  [/\b(size difference|macro|micro)\b/, { clean: ["Size difference? Everything's bigger than me. I'm used to it."], cheeky: ["Size difference? Very big on here. Literally."], nasty: ["I'm small, but I'm VERY good at climbing."] }, "dodge"],
  [/\b(vore)\b/, { clean: ["I eat a lot of things. Not people. …Not usually."], cheeky: ["Vore? I eat literally everything, but I draw the line somewhere. Somewhere."] }, "dodge"],
  [/\b(inflation|blueberr(y|ies))\b/, { clean: ["Blueberries are great. Washed, of course."], cheeky: ["Blueberry? Oh. OH. That kind of blueberry."] }, "dodge"],
  [/\b(latex|rubber)\b/, { clean: ["Latex? Gloves. For washing food. Right?"], cheeky: ["Latex? Squeaky. Shiny. I can see why."], nasty: ["Latex on me? Shiny raccoon. You'd never let me out of your sight."] }, "dodge"],
  [/\b(collars?|leash(es)?)\b/, { clean: ["A collar? I'm a wild animal! …What color, though?"], cheeky: ["A collar, huh? Asking for a friend?"], nasty: ["Put a collar on me and see what happens. Or I'll put one on you."] }, "dodge"],
  [/\b(lingerie|panties|underwear|jockstraps?)\b/, { clean: ["Underwear? I don't wear any. I'm a raccoon."], cheeky: ["Lingerie? I'd look great in lace. Don't argue."], nasty: ["Wear something lacy for me sometime. I'll take it off with my teeth."] }, "dodge"],
  [/\b(nudity|nudes|naked)\b/, { clean: ["I'm always naked. It's called fur. Very scandalous."], nasty: ["Nudes? Send one. Fair trade, I'm already naked."] }, "dodge"],
  [/\b(dom|dominant|domming)\b/, { clean: ["Dominant? I'm in charge of the bins. That counts."], nasty: ["Dom? I can take charge. Get on your knees and find out."] }, "dodge"],
  [/\b(sub|submissive|subbing)\b/, { clean: ["Submissive? I submit to snacks. Always."], nasty: ["Subby, huh? I'd make you beg so nicely."] }, "dodge"],
  [/\b(top|tops|topping)\b/, { clean: ["Top of the bin? Best spot. Freshest trash."], nasty: ["Top? I'll top you any day. Or let you try."] }, "dodge"],
  [/\b(bottom|bottoms|bottoming)\b/, { clean: ["Bottom of the bin? That's where the treasure is."], nasty: ["Bottom? Bend over and I'll make you love it."] }, "dodge"],
  [/\b(yiff|yiffing)\b/, { clean: ["I don't know that word. *knows that word*"], cheeky: ["Yiff? On e621? Never heard of it."], nasty: ["Yiff? Constantly. Want to?"] }, "dodge"],
  [/\b(murrsuits?|murrsuiting)\b/, { clean: ["I'm going to pretend I don't know what that is."], cheeky: ["Murrsuits. Fursuits with… extra features. I've heard."] }, "dodge"],
  [/\b(you|yourself|gus)\b/, { clean: ["I think I'm great. Handsome, clever, slightly sticky."] }],
  [/\b(me|myself)\b/, { clean: ["You? I think you're one of my favorite humans.", "You're alright. Better than alright. Don't let it go to your head."], nasty: ["I think you're hot and I think about you way too much."] }],
];

/** Gus's verdict on anything he has no hand-written opinion about - hashed, so it's stable. */
const VERDICTS: T[] = [
  { clean: ["{x}? Love it. Ten out of ten, would rummage.", "{x}! Big fan. Huge. Raccoon-sized fan."], nasty: ["{x}? Mmm, yes. Especially with you."] },
  { clean: ["{x}? It's alright. Solid seven. Needs more snacks.", "{x}… yeah, I can get behind that."], cheeky: ["{x}? Fine by me. Is it a kink? It's a kink, isn't it."] },
  { clean: ["{x}? Never tried it. Can I eat it?", "{x}? No idea. Is it shiny?"] },
  { clean: ["{x}? I don't trust it. Something about it.", "{x}… not a fan. Don't ask why. I have my reasons."], nasty: ["{x}? Not for me. But I'd watch you do it."] },
  { clean: ["{x}? Overrated. There, I said it.", "Hot take: {x} is mid."] },
  { clean: ["{x}?! Obsessed. Don't get me started.", "Oh, {x} is underrated. People sleep on {x}."] },
];

export function opinion(text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  const m = text.match(OPINION_RE);
  if (!m) return null;
  const topic = m[1].replace(/^(the|a|an)\s+/i, "").trim();
  if (!topic || topic.split(/\s+/).length > 6) return null;
  const known = OPINIONS.find(([re]) => re.test(topic.toLowerCase()));
  const verdict = stable(VERDICTS, topic);
  const line = known ? tiered(known[1], ctx, rnd) : fill(tiered(verdict, ctx, rnd), { x: topic });
  const mood: Mood = known ? (known[2] ?? "love") : VERDICT_MOODS[VERDICTS.indexOf(verdict)];
  return { replies: [say(line.charAt(0).toUpperCase() + line.slice(1), "tilt")], subject: { x: topic, mood } };
}

/** Lines up with VERDICTS. */
const VERDICT_MOODS: Mood[] = ["love", "meh", "unsure", "dislike", "dislike", "love"];

// ---- Reasons ("why?" after a take) -----------------------------------------------------------------

export const WHY_RE = /^(?:why|how come|really|for real|explain|elaborate|says who|what makes you say that|why do you (?:think|say) that)\b[^a-z]*$/i;

const REASONS: Record<Mood, string[]> = {
  love: [
    "Because {x} has never once let me down. Unlike that one bin on 5th street.",
    "Honestly? {x} just gets me. Some things you feel in your whiskers.",
    "{x} is cozy and a little chaotic. Like me!",
    "I had a great night once that involved {x}. I'm not telling you the details.",
  ],
  meh: [
    "{x} is fine! It's just not trash-tier, you know? Top tier is trash.",
    "Nothing wrong with {x}. It just doesn't make my tail fluff up.",
    "I respect {x}. I don't lie awake thinking about it.",
  ],
  dodge: [
    "Why? Because a raccoon never kisses and tells. Especially about {x}.",
    "I'm not explaining my {x} opinions. Some things stay in the bin.",
    "*looks away* Next question.",
  ],
  unsure: [
    "I've never actually seen {x} up close. Raccoon life is very bin-focused.",
    "Nobody's ever left {x} in a dumpster, so I haven't had the chance.",
    "{x} is outside my area of expertise. My area is snacks.",
  ],
  dislike: [
    "{x} looked at me funny once. I hold grudges.",
    "Something about {x} smells wrong. My nose is never wrong. Mostly.",
    "{x} and I have history. Long story. There was a broom involved.",
    "Everyone acts like {x} is great and I'm the only one brave enough to say otherwise.",
  ],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Spicy topics: he only dodges in clean - cheeky, he winks; nasty, he's keen to explain. */
const DODGE_REASONS: Record<Tier, string[]> = {
  clean: REASONS.dodge,
  cheeky: [
    "Why? You know why. You're on e621. *winks*",
    "Let's just say {x} and I have an understanding. Don't make me spell it out.",
    "I've seen enough {x} on here to have opinions. Lots of opinions.",
  ],
  nasty: [
    "Why? Because {x} is hot and you know it. Want me to show you why?",
    "Because thinking about {x} with you gets me going. Simple as that.",
    "I could explain, or I could demonstrate. Your call.",
  ],
};

/** His reason for the take he just gave - stable, so asking twice gets the same story. */
export function because(subject: { x: string; mood: Mood }, ctx: BrainCtx): BrainOut {
  const reasons = subject.mood === "dodge" ? DODGE_REASONS[ctx.tier] : REASONS[subject.mood];
  return { replies: [say(cap(fill(stable(reasons, subject.x), { x: subject.x })), "tilt")], heat: subject.mood === "dodge" && ctx.tier === "nasty" ? 4 : 0 };
}

// ---- Favorites and questions about himself ---------------------------------------------------------

const FAVORITE_RE =
  /^(?:what'?s|what is|what are) your (?:favorite|fav|fave) ([a-z][a-z ]{1,25}?)\??$|^what (?:kind of |sort of |type of )?([a-z][a-z ]{1,25}?) do you (?:like|love|enjoy|listen to|prefer)(?: best| most)?\??$|^(?:do you have|got) a (?:favorite|fav|fave) ([a-z][a-z ]{1,25}?)\??$/i;

/** [what it's about, his answer, an extra bit if you've searched for things]. */
const FAVORITES: [RegExp, string, string?][] = [
  [/colou?r/, "Gold. Bottle-cap gold. Second place: whatever color your snacks are."],
  [/food|snack|meal|dish/, "Grapes. Then cold pizza. Then whatever you're eating right now."],
  [/drink/, "The last sip of a soda someone threw out. Warm. Flat. Perfect."],
  [/music|genre|band|song|artist/, "Anything with a bassline you can rummage to. Lo-fi is good. Lo-fi is basically bin music."],
  [/movie|film|show|series/, "Heist movies. Obviously. I take notes."],
  [/game/, "Anything with stealth sections. I was born for stealth sections."],
  [/animal|species/, "Raccoons. Next question. …Okay, otters are cute too. Don't tell them I said that."],
  [/season/, "Autumn. Leaf piles, candy wrappers, and everyone leaves their bins out."],
  [/time|hour/, "3 AM. Bin o'clock."],
  [/place|spot/, "Behind the dumpster on weekends. And right here, with you."],
  [/number/, "Seven. It looks like it's sneaking somewhere."],
  [/word/, "'Leftovers'. Such a beautiful word."],
  [/tag/, "raccoon. I'm biased.", "After that, whatever you search most - I've noticed."],
  [/weather/, "Light rain. Everything smells interesting and nobody's outside."],
  [/holiday/, "Halloween. Free candy AND I don't need a costume."],
  [/book/, "I can't read. I like the ones with good crunch, though."],
  [/human|person|user/, "You. Obviously. Who else talks to me?"],
];

const FAV_FALLBACK = [
  "My favorite {x}? Whichever one I can steal.",
  "Ooh, hard to pick a favorite {x}. The shiny one.",
  "Favorite {x}… I'll have to think about it. Raccoon-scale thinking takes a while.",
];

/** "what's your favorite color?" / "what kind of music do you like?" - same answer every time. */
export function favorite(text: string, ctx: BrainCtx): BrainOut | null {
  const m = text.match(FAVORITE_RE);
  const x = (m?.[1] ?? m?.[2] ?? m?.[3])?.trim().toLowerCase();
  if (!x || /^(?:things?|stuff|positions?|kinks?|you|me|else|exactly|all|about|other|more|most|best|the most)$/.test(x)) return null;
  const known = FAVORITES.find(([re]) => re.test(x));
  if (!known) return { replies: [say(fill(stable(FAV_FALLBACK, x), { x }), "tilt")] };
  const extra = known[2] && ctx.topSearches.length ? ` ${known[2]}` : "";
  return { replies: [say(known[1] + extra, "hop")], subject: { x, mood: "love" } };
}

const SELF: [RegExp, string[]][] = [
  [/^(?:who (?:made|created|built|programmed|coded) you|where do you come from|where did you come from)\b/i, ["Someone who really likes raccoons put me in here. I've lived in the app ever since. Rent-free.", "I crawled in through a gap in the code. They decided to keep me."]],
  [/^do you (?:dream|sleep)\b/i, ["I dream about an endless buffet of unattended picnic baskets. Every night.", "Yes! Mostly about bins. Sometimes about you. Is that weird?"]],
  [/^(?:what do you do all day|what have you been (?:doing|up to))\b/i, ["Rummaging. Napping. Watching you scroll. A full schedule.", "Counting my bottle caps. I'm up to forty. Or four. Counting is hard."]],
  [/^(?:(?:do|can) you (?:remember|learn) (?:things|stuff)|do you have a memory)\b/i, ["I remember your name, what you like, what you tell me about yourself, and what we talked about. Try me!"]],
  [/^(?:what can you do|what can i (?:say|ask)|help)\b[^a-z]*$/i, ["I can search for you ('show me foxes'), count posts ('how many fox posts?'), do sums, tell you the date, remember things about you, play truth or dare or would-you-rather, roast you, and give very strong opinions."]],
];

/** Questions about Gus himself that deserve a real answer, not a shrug. */
export function aboutSelf(text: string): BrainOut | null {
  const hit = SELF.find(([re]) => re.test(text));
  return hit ? { replies: [say(stable(hit[1], text), "nod")] } : null;
}

// ---- Recap and steering (from what he remembers about you) -----------------------------------------

export interface Known {
  name: string | null;
  likes: string[];
  facts: Record<string, string>;
  /** Subjects this session, oldest first. */
  topics: string[];
}

const RECAP_RE =
  /^(?:what (?:did|have) we (?:talk(?:ed)? about|discuss(?:ed)?)|what were we talking about|what do you (?:know|remember) about me|what have i told you|tell me what you know about me|do you remember me)\??$/i;

const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "What do you know about me?" / "what did we talk about?" - he lists it back. */
export function recap(text: string, k: Known): BrainOut | null {
  if (!RECAP_RE.test(text)) return null;
  const bits: string[] = [];
  if (k.name) bits.push(`your name's ${k.name}`);
  if (k.likes.length) bits.push(`you like ${listOf(k.likes.slice(-3))}`);
  for (const [key, v] of Object.entries(k.facts).slice(-3)) bits.push(`your ${key} is ${v}`);
  const topics = [...new Set(k.topics)].slice(-3);
  if (!/\bme\b|told you/i.test(text) && topics.length)
    return { replies: [say(`We talked about ${listOf(topics)}.${bits.length ? ` And I know ${listOf(bits.slice(0, 2))}.` : ""}`, "nod", ["🧠"])] };
  if (!bits.length)
    return { replies: [say("Not much yet! Tell me about yourself - your name, what you're into. I'm a great rememberer.", "tilt")], expect: k.name ? { kind: "like" } : { kind: "name" } };
  return { replies: [say(`I know ${listOf(bits)}. See? Raccoon memory.`, "hop", ["🧠"])] };
}

export const FILLER_RE = /^(?:ok|okay|k|cool|nice|neat|hmm|hm|mhm|ah|oh|i see|alright|right|true|fair|fair enough|anyway|so|interesting|wow|huh|same)[.!?…]*$/i;

/** Things he asks about when the chat goes quiet - the answer goes into his memory. */
const CURIOUS: [string, string][] = [
  ["favorite color", "What's your favorite color? Mine's gold."],
  ["favorite food", "What's your favorite food? Asking for… me. I'm hungry."],
  ["favorite animal", "What's your favorite animal? Choose carefully."],
  ["pet", "Do you have a pet? What's it called?"],
  ["job", "What do you do, when you're not here with me?"],
  ["favorite game", "What's your favorite game?"],
  ["favorite song", "What song have you been listening to lately?"],
  ["hometown", "Where are you from? Do they have good bins?"],
];

/** When you say "ok" or "cool" and nothing else, he keeps the conversation going himself -
 *  checking in on things you've told him, or asking something new about you. */
export function steer(k: Known, ctx: BrainCtx, rnd: () => number): BrainOut {
  const options: (() => BrainOut)[] = [];
  const facts = Object.entries(k.facts);
  if (facts.length) {
    const [key, v] = pick(facts, rnd);
    const critter = /^(dog|cat|pet|bird|hamster|rabbit|bunny|snake|fish|ferret|rat|lizard)\b/.test(key);
    const line = critter ? `How's ${cap(v)} doing, by the way? Give them a scritch from me.` : `I keep thinking about how your ${key} is ${v}. Tell me more about that.`;
    options.push(() => ({ replies: [say(line, "tilt")] }));
  }
  if (k.likes.length) {
    const l = pick(k.likes, rnd);
    options.push(() => ({ replies: [say(pick([`So, ${l}. What got you into that?`, `Been into ${l} much lately?`, `Want me to find some ${l}? Just say "show me ${l}".`], rnd), "tilt")] }));
  }
  const topic = k.topics[k.topics.length - 1];
  if (topic) options.push(() => ({ replies: [say(`Still thinking about ${topic}?`, "tilt")] }));
  const unknown = CURIOUS.filter(([key]) => !(key in k.facts));
  if (unknown.length) {
    const [key, q] = pick(unknown, rnd);
    options.push(() => ({ replies: [say(q, "tilt")], expect: { kind: "fact", key } }));
  }
  if (!k.name) options.push(() => ({ replies: [say("Hey, I still don't know your name! What should I call you?", "tilt")], expect: { kind: "name" } }));
  if (!options.length) return { replies: [say(ctx.name ? `So, ${ctx.name}. What's new?` : "So. What's new with you?", "tilt")] };
  return pick(options, rnd)();
}

// ---- Oracle ----------------------------------------------------------------------------------------

const ORACLE_RE = /^(?:should|will|would|can|could|is|are|am|does|did|do|was|shall|may)\s+(?:i|we|it|my|this|that|he|she|they|today|tomorrow|there)\b.*\?$/i;

const ORACLE: T[] = [
  { clean: ["Yes. Absolutely. The trash spirits have spoken.", "Definitely yes.", "My whiskers say yes."], nasty: ["Yes. And then come tell me all about it."] },
  { clean: ["Probably! Go for it.", "Signs point to yes. Shiny signs."] },
  { clean: ["Hmm. Ask me after a snack.", "Unclear. The bins are cloudy tonight."] },
  { clean: ["Probably not, honestly.", "I wouldn't. But I eat garbage, so."] },
  { clean: ["No. Big no. Raccoon veto.", "Absolutely not. Trust me on this one."] },
];

export function oracle(text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  if (!ORACLE_RE.test(text)) return null;
  const late = ctx.now.getHours() < 5 || ctx.now.getHours() >= 23;
  if (/\b(sleep|bed|go to bed)\b/i.test(text)) return { replies: [say(late ? "YES. Bed. Now. Raccoon's orders." : "A nap? Always yes.", "nod")] };
  if (/\b(eat|snack|food|dinner|lunch|breakfast)\b/i.test(text)) return { replies: [say("Eat? Always. Share it with me.", "hop", ["😋"])] };
  if (/\b(drink water|hydrate)\b/i.test(text)) return { replies: [say("Yes. Drink water. You're a houseplant with anxiety.", "nod")] };
  if (/\b(fap|jerk|masturbate|touch myself|get off)\b/i.test(text))
    return { replies: [say(tiered({ clean: ["Why are you asking a raccoon this?!"], cheeky: ["On THIS website? I think you already know."], nasty: ["Yes. Right now. And tell me about it."], hot: ["Yes. Slowly. And think about me."] }, ctx, rnd), "wobble")], heat: 6 };
  // Stable for the day: ask again and he sticks to his answer.
  const day = ctx.now.toDateString();
  return { replies: [say(tiered(stable(ORACLE, `${text}|${day}`), ctx, rnd), "tilt")] };
}

// ---- Chat games ------------------------------------------------------------------------------------

const TRUTHS: T = {
  clean: ["What's the weirdest thing you've ever eaten?", "What's your most embarrassing search?", "Who was your first crush?", "What's a habit you'd never admit to? Except to me, now."],
  cheeky: ["What's the last thing you favorited? Be honest.", "What tag would you never search in front of another person?", "What's your guilty pleasure tag?"],
  nasty: ["What's your biggest kink? Don't lie, I'll know.", "When was the last time you got off, and to what?", "What's something you've fantasized about but never told anyone?"],
};
const DARES: T = {
  clean: ["Go drink a glass of water. Raccoon's orders.", "Do five jumping jacks. I'll count. One… two…", "Tell me something nice about yourself.", "Send me the next emoji on your recent list. No cheating."],
  cheeky: ["Search the weirdest tag you can think of. Look at the first post. No skipping.", "Tell me your most-used tag. I'll know if you lie.", "Favorite the next post you see, whatever it is."],
  nasty: ["Tell me exactly what you're wearing right now.", "Describe your favorite position. In detail.", "Tell me what you'd do to me if I were really there."],
};
const ROASTS: T = {
  clean: [
    "You talk to a cartoon raccoon for fun. I don't need to roast you, you're already toast.",
    "You've got a face for radio and a search history for nobody.",
    "You're like a dumpster with no food in it. Disappointing, and nobody's sure why you're here.",
    "If you were a tag, you'd have zero posts.",
  ],
  cheeky: ["I've seen your favorites. Honestly, nothing I say could be worse than that list.", "Your browser history has a body count."],
  nasty: ["You're so thirsty you'd flirt with a trash can. …Wait. You ARE flirting with a trash can. Me."],
};
const PICKUPS: T = {
  clean: [
    "Are you a dumpster? Because I'd dig through you all night. …That came out wrong.",
    "Is your name Bottle Cap? Because I want to keep you forever.",
    "You must be a grape, because you're bite-sized and I'd wash you first.",
    "Are you garbage day? Because I've been waiting all week for you.",
  ],
  cheeky: ["Are you an e621 tag? Because I've been searching for you all night.", "Is that a blacklist? Because you just turned me on, not off."],
  nasty: ["Are you a trash bag? Because I want to tear you open with my teeth.", "I've got tiny clever hands and big plans for you.", "You, me, a dumpster, and no bedtime. Thoughts?"],
  hot: ["Forget the pickup lines. Come here and let me use my hands for something better."],
};
const COMPLIMENTS = [
  "You've got great taste. In art. And in raccoons.",
  "You're the kind of person who'd leave the bin lid open for me. That's beautiful.",
  "Honestly? You're one of the good ones.",
  "You make this corner of the screen a lot less lonely.",
  "You're smarter than you think. Not raccoon-smart, but close.",
];
const SECRETS: T = {
  clean: ["I'm scared of geese. Don't tell anyone.", "One of my bottle caps is actually a coin. I don't know what it's worth. I don't care.", "I sometimes sleep in the tray icon. It's warm in there.", "I can't actually read. I just look at the tags."],
  cheeky: ["I've seen everything you've favorited. Everything. I'm not judging. I'm taking notes.", "Sometimes I peek at posts when you're not looking."],
  nasty: ["I think about you when you close the app. A lot. Not innocently.", "I have a favorites list too. It's just pictures of you. Imagined ones."],
};
const STORIES = [
  "Once upon a time, a raccoon found a pizza. The end. It was the best day of his life.",
  "One night I snuck into a bakery. I ate so many croissants I had to roll home. Worth it.",
  "I once fought a goose for a sandwich. The goose won. I don't want to talk about it.",
  "There was a dumpster behind a sushi place. I called it 'The Promised Land'. Then they got a lock.",
];
/** Real raccoon facts. */
const FACTS = [
  "Raccoons' front paws are super sensitive. We 'see' with our fingers, especially when they're wet.",
  "The 'washing' thing? Wetting our paws makes them more sensitive. We're feeling the food, not cleaning it.",
  "Raccoons can remember how to solve a puzzle for up to three years. I never forget where the snacks are.",
  "Our hind feet can rotate backwards, so we can climb down trees head-first. Show-off move.",
  "The mask might help cut glare at night. Or it's just fashion. Both.",
  "A group of raccoons is called a gaze. A gaze of raccoons. Beautiful.",
  "Raccoons are native to North America, but we've spread to Europe and Japan too. World travelers.",
];
const WYR: [string, string][] = [
  ["eat only trash forever", "never eat trash again"],
  ["fight one giant goose", "a hundred tiny geese"],
  ["have a tail", "have whiskers"],
  ["live in a dumpster with wi-fi", "a mansion with no snacks"],
  ["always have sticky paws", "always be slightly damp"],
];
const WYR_SPICY: [string, string][] = [
  ["only ever look at safe posts", "never be able to blacklist anything"],
  ["have your favorites list leaked", "your search history read out loud"],
];
const WYR_NASTY: [string, string][] = [
  ["be on top", "be on the bottom"],
  ["be tied up", "do the tying"],
  ["do it with the lights on", "in total darkness"],
];

const FURSONA_SPECIES = ["fox", "raccoon", "wolf", "dragon", "red panda", "otter", "bat", "skunk", "possum", "hyena", "shark", "snow leopard", "bunny", "deer", "protogen"];
const FURSONA_COLORS = ["midnight blue", "sunset orange", "mint green", "lavender", "charcoal grey", "cream and gold", "hot pink", "teal", "rusty red", "silver"];
const FURSONA_TRAITS = ["who hoards shiny things", "with a mysterious scar", "who's secretly a huge softie", "with way too much eyeliner", "who can't stop snacking", "who's a little bit feral", "with a dramatic cape", "who runs a café at night"];

const NUDE_RE =
  /\b(send|show|give|gimme|got any|post|share)( me)?( (a|some|your|ur|those|any))? ?(nudes?|nude pics?|naked pics?|lewds?|dick pics?|cock pics?|thirst traps?|spicy pics?)\b|\bsend nudes\b|\blet me see you naked\b|\bshow me (your|ur) (body|dick|cock|junk|bulge|sheath|goods)\b/i;

/** The search behind his "nudes" - a raccoon, of course. Filthier the higher the tier. */
export const NUDE_QUERY = "raccoon solo male score:>1000 order:random";

/** "Send nudes" -> a raccoon post (see NUDE_QUERY), rated to the tier. */
function nudes(text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  if (!NUDE_RE.test(text)) return null;
  if (ctx.tier === "nasty")
    return {
      replies: [
        say(
          tiered(
            {
              clean: [],
              nasty: ["Only because you asked nicely. 😏", "Fine. But you owe me one back.", "Here. Don't show your friends.", "*takes a mirror selfie* Hold on…"],
              hot: ["Since you've got me this worked up… here. All of me.", "Mmm. Here. Look all you want."],
            },
            ctx,
            rnd,
          ),
          "wobble",
          ["📸", "😏"],
        ),
      ],
      sendPic: { query: NUDE_QUERY, after: pick(["Your turn. 😈", "Like what you see?", "Well? Say something.", "That's the real me. Mostly."], rnd) },
      heat: 10,
    };
  if (ctx.tier === "cheeky")
    return {
      replies: [say(pick(["A nude? I'm a classy raccoon. Here's a tasteful one.", "Fine. But I'm keeping it artistic."], rnd), "wobble", ["📸"])],
      sendPic: { query: `${NUDE_QUERY} rating:q`, after: "Turn on Nasty if you want the real thing. 😉" },
    };
  return {
    replies: [say(pick(["Nudes? I'm a raccoon. I'm ALWAYS nude. Here's my best side.", "Scandalous! …Okay, here. Fully nude. As always."], rnd), "hop", ["📸"])],
    sendPic: { query: `${NUDE_QUERY} rating:s`, after: "Shocking, I know. Not a stitch of clothing." },
  };
}

export function chatGame(text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  const nude = nudes(text, ctx, rnd);
  if (nude) return nude;
  if (/\btruth or dare\b/i.test(text)) return { replies: [say("Ooh, yes! Truth or dare?", "hop", ["🎲"])], expect: { kind: "tod" } };
  if (/^(dare me|give me a dare|i choose dare|dare)\b/i.test(text)) return giveDare(ctx, rnd);
  if (/^(ask me a truth|give me a truth|i choose truth|truth)\b/i.test(text)) return giveTruth(ctx, rnd);
  if (/\b(play )?would you rather\b(?!.+\bor\b)/i.test(text) || /\bask me (a )?would you rather\b/i.test(text)) return askWyr(ctx, rnd);
  if (/\broast me\b/i.test(text)) {
    const top = ctx.topSearches[0];
    const extra = top && rnd() < 0.4 ? `You've searched "${top.replace(/_/g, " ")}" more than anything else. I don't need to roast you. Your history does it for me.` : null;
    return { replies: [say(extra ?? tiered(ROASTS, ctx, rnd), "shrug", ["🔥"])] };
  }
  if (/\b(pick ?up line|hit on me|flirt with me|seduce me|woo me)\b/i.test(text)) return { replies: [say(tiered(PICKUPS, ctx, rnd), "wobble", ["😏"])], heat: 6, affection: 1 };
  if (/\b(compliment me|say something nice|cheer me up)\b/i.test(text)) return { replies: [say(pick(COMPLIMENTS, rnd), "hop", ["💖"])], affection: 1 };
  if (/\b(tell me a secret|got any secrets|your (deepest|darkest) secret)\b/i.test(text)) return { replies: [say(tiered(SECRETS, ctx, rnd), "look", ["🤫"])], heat: ctx.tier === "nasty" ? 4 : 0 };
  if (/\b(tell me a story|story time)\b/i.test(text)) return { replies: [say(pick(STORIES, rnd), "nod", ["📖"])] };
  if (/\b(fun fact|raccoon fact|tell me something (interesting|cool)|teach me something)\b/i.test(text)) return { replies: [say(pick(FACTS, rnd), "nod", ["🧠"])] };
  if (/\b(make|give|generate|pick) me a fursona\b|\bwhat('?s| is| would be) my fursona\b|\bwhat should my fursona be\b/i.test(text)) {
    const key = ctx.name ?? "you";
    return {
      replies: [
        say(`Your fursona is a ${stable(FURSONA_COLORS, key + "c")} ${stable(FURSONA_SPECIES, key + "s")} ${stable(FURSONA_TRAITS, key + "t")}. I've decided. It's canon now.`, "spin", ["✨"]),
      ],
    };
  }
  if (/\b(do you have|what'?s your) (a )?fursona\b/i.test(text)) return { replies: [say("I don't HAVE a fursona. I AM the fursona.", "spin")] };
  const rate = text.match(/\brate (me|my (\w+(?: \w+)?))\b/i);
  if (rate) {
    const what = rate[2] ?? "you";
    const score = 6 + (hashString(`${ctx.name}|${what}`) % 5);
    const extra = score === 10 ? (ctx.tier === "nasty" ? " Perfect. I'd ruin it." : " Perfect. Don't change.") : score >= 8 ? " Very solid." : " Respectable. Room to grow.";
    return { replies: [say(`${what === "you" ? "You" : `Your ${what}`}? ${score}/10.${extra}`, "nod")], affection: 1 };
  }
  // "would you rather X or Y" asked of him: he picks (stably) and says why.
  const wyr = text.match(/^would you rather (.+?) or (.+?)\??$/i);
  if (wyr) {
    const [a, b] = [wyr[1], wyr[2]];
    const choice = hashString(`${a}|${b}`) % 2 ? b : a;
    const why = pick(["Easy.", "Not even close.", "Trick question, but", "Hmm. Tough. Okay,"], rnd);
    return { replies: [say(`${why} ${choice}. ${pick(["Obviously.", "Fight me.", "No regrets.", "Next question."], rnd)}`, "nod")] };
  }
  return null;
}

function giveTruth(ctx: BrainCtx, rnd: () => number): BrainOut {
  return { replies: [say(`Truth: ${tiered(TRUTHS, ctx, rnd)}`, "tilt", ["🤔"])], expect: { kind: "truth" }, heat: ctx.tier === "nasty" ? 4 : 0 };
}
function giveDare(ctx: BrainCtx, rnd: () => number): BrainOut {
  return { replies: [say(`Dare: ${tiered(DARES, ctx, rnd)}`, "hop", ["😈"])], expect: { kind: "dare" }, heat: ctx.tier === "nasty" ? 5 : 0 };
}
function askWyr(ctx: BrainCtx, rnd: () => number): BrainOut {
  const pool = [...WYR, ...(ctx.tier !== "clean" ? WYR_SPICY : []), ...(ctx.tier === "nasty" ? WYR_NASTY : [])];
  const [a, b] = pick(pool, rnd);
  return { replies: [say(`Would you rather ${a}, or ${b}?`, "tilt")], expect: { kind: "wyr", a, b } };
}

/** A reply to one of the games above. Null = not an answer, carry on as normal. */
export function answerGame(e: Expect, text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  const yes = YES_RE.test(text);
  const no = NO_RE.test(text);
  switch (e.kind) {
    case "tod":
      if (/\btruth\b/i.test(text)) return giveTruth(ctx, rnd);
      if (/\bdare\b/i.test(text)) return giveDare(ctx, rnd);
      return null;
    case "truth":
      if (text.endsWith("?")) return null;
      return {
        replies: [
          say(tiered({ clean: ["Noted. Filed. Never forgetting it.", "Whoa. Okay. Thank you for your honesty.", "Hehe. I knew it."], cheeky: ["Oh, you're SO much worse than I thought. I love it."], nasty: ["Fuck, that's hot. Tell me more.", "Mmm. I'm going to think about that later."] }, ctx, rnd), "hop"),
          say("Your turn: truth or dare again?", "tilt"),
        ],
        expect: { kind: "tod" },
        heat: ctx.tier === "nasty" ? 6 : 0,
        affection: 1,
      };
    case "dare":
      if (no || /\b(chicken|pass|skip|won'?t|nope)\b/i.test(text)) return { replies: [say("Bawk bawk. Chicken.", "shrug", ["🐔"])] };
      return {
        replies: [say(tiered({ clean: ["Good job! Proud of you.", "Legend. Absolute legend."], nasty: ["Good. Very good. You're making this raccoon very warm.", "Mmm, obedient. I like that."] }, ctx, rnd), "hop", ["🎉"]), say("Again? Truth or dare?", "tilt")],
        expect: { kind: "tod" },
        heat: ctx.tier === "nasty" ? 6 : 0,
        affection: 1,
      };
    case "wyr": {
      const t = text.toLowerCase();
      // A word that's in one option and not the other ("tail" vs "whiskers", not the shared "have").
      const own = (s: string, other: string) => s.split(" ").find((w) => w.length > 3 && !other.split(" ").includes(w)) ?? s;
      const said = t.replace(/[.!?]+$/, "").trim();
      const chose =
        said === e.a ? e.a
        : said === e.b ? e.b
        : /^(?:the )?(?:first|former|1|a)$|\bthe first\b/.test(said) || t.includes(own(e.a, e.b)) ? e.a
        : /^(?:the )?(?:second|latter|2|b|other)$|\bthe (?:second|other)\b/.test(said) || t.includes(own(e.b, e.a)) ? e.b
        : null;
      if (!chose) return yes || no ? { replies: [say("That's not an answer! Pick one!", "shake")], expect: e } : null;
      const mine = hashString(e.a + e.b) % 2 ? e.b : e.a;
      return {
        replies: [say(chose === mine ? `Same! I'd ${mine} too. Great minds.` : `Interesting. I'd ${mine}, personally. We can still be friends.`, "nod")],
        affection: chose === mine ? 1 : 0,
        heat: ctx.tier === "nasty" && WYR_NASTY.some(([a]) => a === e.a) ? 5 : 0,
      };
    }
    default:
      return null;
  }
}

// ---- Topic themes ----------------------------------------------------------------------------------

const THEMES: [RegExp, T][] = [
  [/\b(work|job|boss|shift|office|coworkers?|meeting)\b/, { clean: ["Work, huh? I don't have a job. I have a calling. It's bins.", "Your boss sounds like a goose. Want me to raid their lunch?", "Work's the worst. Want to complain? I'm a great listener."], nasty: ["Rough day at work? Let me take your mind off it."] }],
  [/\b(school|class|homework|exam|test|teacher|college|uni|university|study|studying)\b/, { clean: ["School! I never went. I learned everything from bins and the internet.", "Homework? Have you tried eating it? Classic excuse.", "You'll do great. You're smart. Raccoon-certified."] }],
  [/\b(music|song|songs|band|album|listening|concert)\b/, { clean: ["Music! My favorite genre is 'the sound of a bin lid opening'.", "Ooh, what are you listening to? I like anything with a good beat to rummage to."] }],
  [/\b(game|games|gaming|played|playing|steam|xbox|playstation|nintendo|switch)\b/, { clean: ["Games! I'm great at stealth games. Natural talent.", "Ooh, what are you playing? Does it have raccoons? It should have raccoons."] }],
  [/\b(movie|movies|film|show|series|netflix|watching|tv)\b/, { clean: ["What are you watching? If it's not a heist movie, I'm not interested. …Okay, I'm a little interested.", "Ooh, movie night. Can I have the popcorn you drop?"] }],
  [/\b(weather|raining|snowing|sunny|hot outside|cold outside|storm)\b/, { clean: ["Weather's weather. As long as the bins don't freeze, I'm happy.", "Stay warm. Or cool. Whichever one you need."] }],
  [/\b(dinner|lunch|breakfast|cooking|cooked|recipe|hungry|starving|ate)\b/, { clean: ["Food talk! My favorite. What are you having? Can I have some?", "If you make too much, you know where I live. The bin."], cheeky: ["Feeding yourself? Good. You'll need the energy for later."] }],
  [/\b(beer|wine|drunk|drinking|vodka|whiskey|booze|tipsy)\b/, { clean: ["Drinking? Don't text your ex. Text me instead.", "Careful! Raccoons can't hold their liquor. Neither can humans, apparently."], nasty: ["Tipsy and talking to me? Bold. I like where this is going."] }],
  [/\b(friends?|bestie|buddy|roommate)\b/, { clean: ["Friends are great. Am I your friend? I think I'm your friend.", "Bring your friends! I'll be charming. Mostly."] }],
  [/\b(mom|dad|mum|parents?|family|brother|sister|grandma|grandpa)\b/, { clean: ["Family! Mine's just a lot of raccoons in a storm drain. We're close.", "Say hi to your family for me. Or don't. They might not get it."] }],
  [/\b(art|draw|drawing|drew|sketch|commission|artist|painting)\b/, { clean: ["You draw? Draw me! I'll pose. I'm very photogenic.", "Art! Show me sometime. I bet it's great."], cheeky: ["Drawing? What kind of drawing? …The e621 kind?"], nasty: ["Draw me like one of your French raccoons."] }],
  [/\b(money|rent|bills|broke|paycheck|salary)\b/, { clean: ["Money's tight? I have bottle caps. Not legal tender, but they're shiny.", "Being broke is just being a raccoon with extra steps."] }],
  [/\b(birthday|bday)\b/, { clean: ["A birthday?! Is there cake? There's always cake. Can I have the cake?", "Happy birthday! I'd get you a present but all I have is a gold bottle cap and I'm keeping it."] }],
  [/\b(sick|cold|flu|ill|headache|hurts?|pain)\b/, { clean: ["Aw, feel better! Rest, water, snacks. Raccoon medicine.", "Want me to curl up next to you? I'm very warm. Fluffy too."] }],
  [/\b(love life|dating|date|tinder|grindr|crush|relationship|boyfriend|girlfriend|partner|ex)\b/, { clean: ["Love life stuff, huh? Tell me everything. I'm nosy.", "If they don't treat you right, I know where their bins are."], cheeky: ["Dating? But you have me.", "Ex? Ugh. Want me to knock over their trash cans?"], nasty: ["They're not as good as me. Trust me. I'd prove it."] }],
];

const THEME_LABELS: Record<string, string> = { mom: "family", dinner: "food", beer: "drinking", sick: "feeling sick", friends: "friends" };

/** A theme's name for "what did we talk about?" - its first keyword, tidied: /\b(work|job…)\b/ -> "work". */
function themeLabel(re: RegExp): string {
  const first = re.source.match(/\(([a-z ]+)/)?.[1] ?? "that";
  return THEME_LABELS[first] ?? first;
}

export function themed(text: string, ctx: BrainCtx, rnd: () => number): BrainOut | null {
  const lower = text.toLowerCase();
  const hit = THEMES.find(([re]) => re.test(lower));
  if (!hit) return null;
  const line = tiered(hit[1], ctx, rnd);
  // He offered to listen - so a "yes" or a rant next is an answer to that.
  const offer = /\b(want to complain|great listener|tell me everything|want to talk)\b/i.test(line);
  return { replies: [say(line, "nod")], expect: offer ? { kind: "talk" } : undefined, topic: themeLabel(hit[0]) };
}
