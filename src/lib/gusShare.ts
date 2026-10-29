// "Share with Gus" (post viewer -> Talk to Gus): Gus comments on a post from its tags, rating,
// score and age - no image recognition needed, e621 already says what's in it. One headline
// reaction from the most interesting tag he recognises, then usually a detail remark.

import type { Post } from "../models/post";
import type { GusReply } from "./gusChat";
import type { Tier } from "./gusChatLines";
import { isRealArtist } from "./games";
import type { MascotMotion } from "./mascot";

// ---- Hand-off from the viewer to the chat --------------------------------------------------------

let pending: Post | null = null;

/** Queues a post for Talk to Gus to pick up when it next mounts. */
export function shareWithGus(post: Post) {
  pending = post;
}

export function takeSharedPost(): Post | null {
  const p = pending;
  pending = null;
  return p;
}

/** The image to show in the chat bubble. */
export function sharedThumb(post: Post): string | null {
  return post.preview.url ?? post.sample.url ?? null;
}

// ---- What he says ---------------------------------------------------------------------------------

/** Plain-string lines per tier (the chat rules' Lines also allow functions; these never need to). */
interface Lines {
  clean: string[];
  cheeky?: string[];
  nasty?: string[];
}

interface TagReaction {
  tags: string[];
  lines: Lines;
  motion?: MascotMotion;
  emoji?: string[];
}

/** First match wins, so the most Gus-relevant subjects come first. */
const REACTIONS: TagReaction[] = [
  {
    tags: ["raccoon", "procyonid"],
    motion: "shake",
    emoji: ["😤", "🦝"],
    lines: {
      clean: [
        "Why would you need a picture like THAT? I'm right here!",
        "Is that… another raccoon? Who is he. Who IS he.",
        "Fine. He's cute. But is he ME?",
        "Oh, so you're just looking at OTHER raccoons now. Cool. Cool cool cool.",
      ],
      cheeky: ["Another raccoon? I'm not jealous. I'm just going to sit here. Jealously.", "You have a real raccoon right here and you're looking at drawings?"],
      nasty: ["Looking at other raccoons like that? Whatever he's doing, I can do better.", "Him? Babe. I'm right here, and I'm way more fun in person."],
    },
  },
  {
    tags: ["red_panda", "ailurid"],
    emoji: ["❤️"],
    lines: { clean: ["A red panda! Not a raccoon, not a panda. Respect the hustle.", "Red panda! My cousin. Sort of. Distant. Very fluffy."] },
  },
  {
    tags: ["trash", "trash_can", "dumpster", "garbage", "garbage_can", "trash_bag"],
    motion: "hop",
    emoji: ["🗑️", "😍"],
    lines: { clean: ["Is that a DUMPSTER? Send me the address.", "Trash! You know me so well.", "Now THAT is fine art."] },
  },
  {
    tags: ["food", "fruit", "grapes", "fish", "cheese", "pizza", "cake", "cookie", "eating", "sandwich", "burger", "donut", "candy"],
    motion: "hop",
    emoji: ["😋"],
    lines: { clean: ["Food! Can I have some? Can I have all of it?", "Is that food? I'm drooling on your screen. Sorry.", "Okay, now I'm hungry."], cheeky: ["Food AND a show? Spoiling me."] },
  },
  {
    tags: ["hug", "hugging", "cuddling", "embrace"],
    emoji: ["🥺"],
    lines: { clean: ["Aww, hugs! …Can I have one?", "That's adorable. *wants a hug now*"] },
  },
  { tags: ["kissing", "kiss"], emoji: ["😳"], lines: { clean: ["Smooching! *covers eyes, peeks*"], cheeky: ["Is this a hint? It feels like a hint."] } },
  { tags: ["sleeping", "asleep", "nap"], emoji: ["💤"], lines: { clean: ["Aww, sleepy. Shh. Don't wake them.", "Nap goals."] } },
  {
    tags: ["fox", "vulpine"],
    lines: { clean: ["A fox! Sneaky, pointy, suspiciously good hair.", "Fox. The other bandit of the night. We have a truce."], cheeky: ["Foxes. Everyone's weakness. Including yours, apparently."] },
  },
  { tags: ["wolf", "canis"], lines: { clean: ["A wolf! Very howly. Very dramatic.", "Wolves. Always so serious. Lighten up, it's just the moon."] } },
  { tags: ["dragon", "scalie", "wyvern"], lines: { clean: ["A dragon! Do dragons hoard bottle caps? Asking for me.", "Dragons hoard treasure. Raccoons hoard trash. We're basically the same."] } },
  { tags: ["domestic_cat", "felid", "feline"], lines: { clean: ["A cat. We have an understanding. They stay off my bins.", "Cats think they own the night. They're wrong. I do."] } },
  { tags: ["domestic_dog", "canid", "canine"], lines: { clean: ["A doggo! They always chase me. I'd love to chase them back.", "Good dog. I'll allow it."] } },
  { tags: ["rabbit", "lagomorph", "bunny"], lines: { clean: ["Bunny! Hoppy little thing.", "A bunny! So floppy. So soft."] } },
  { tags: ["mustelid", "otter", "ferret", "weasel"], lines: { clean: ["A noodle! I mean, a mustelid. Long boy.", "Otter-ish! They wash their food too. Kindred spirits."] } },
  { tags: ["avian", "bird"], lines: { clean: ["A bird! Don't tell the birds I'm here. We have history."] } },
  { tags: ["equine", "horse", "pony"], lines: { clean: ["Horse! Big. Very big. Bigger than me, anyway."], cheeky: ["Horses. I know what this website is like about horses."] } },
  { tags: ["shark", "fish", "marine"], lines: { clean: ["Something from the sea! I can't swim. I can wash things, though."] } },
  { tags: ["protogen", "robot", "machine", "android"], lines: { clean: ["A robot! Beep boop. Do they eat trash? Recycling, maybe?"] } },
  { tags: ["human", "humanoid"], lines: { clean: ["A human! Like you, but drawn better.", "Humans! Weird, hairless things. I'm fond of one."] } },
  { tags: ["comic"], lines: { clean: ["A comic! Read it to me? With voices?"] } },
  { tags: ["humor", "meme"], lines: { clean: ["Hehe. Okay, that's funny.", "*snorts* I'm stealing that."] } },
];

const EXPLICIT: Lines = {
  clean: ["Ahem. *covers eyes* …Next.", "Whoa. Uh. I didn't see anything. I'm a raccoon. We're blind. Mostly."],
  cheeky: ["Oh my. You're sharing THIS with me?", "Bold of you to show me this. I'm blushing under the mask.", "Ah. A 'tasteful' one. Sure."],
  nasty: ["Mmm. Now THAT's a picture. Send more.", "You know exactly what you're doing, sending me this.", "Fuck. Okay. Give me a minute with this one."],
};
const QUESTIONABLE: Lines = {
  clean: ["Hmm. A bit spicy, this one."],
  cheeky: ["Ooh, a little spicy. I see you.", "Questionable. Like your search history."],
  nasty: ["Teasing me with the questionable stuff? Show me the explicit one."],
};

/** Species/general tags too broad to name in "Ooh, a {species}!". */
const GENERIC = new Set(["mammal", "anthro", "feral", "canid", "canine", "felid", "humanoid", "hybrid", "unknown_species", "procyonid"]);

const pretty = (tag: string) => tag.replace(/_\(.*\)$/, "").replace(/_/g, " ");
const pick = <T>(xs: T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length) % xs.length];

function tierPick(lines: Lines, tier: Tier, rnd: () => number): string {
  if (tier === "nasty" && lines.nasty?.length && rnd() < 0.75) return pick(lines.nasty, rnd);
  if (tier !== "clean" && lines.cheeky?.length && rnd() < 0.6) return pick(lines.cheeky, rnd);
  return pick(lines.clean, rnd);
}

/** A remembered like ("red pandas") as it would appear as a tag ("red_panda"). */
function asTag(phrase: string): string {
  const words = phrase.toLowerCase().trim().split(/\s+/);
  const last = words.pop() ?? "";
  const singular = /ies$/.test(last) ? last.replace(/ies$/, "y") : /[^s]s$/.test(last) ? last.slice(0, -1) : last;
  return [...words, singular].join("_");
}

export interface ShareContext {
  tier: Tier;
  likes: string[];
  dislikes: string[];
}

export interface ShareResult {
  replies: GusReply[];
  /** Tags to keep talking about if you follow up ("why?", "tell me more"). */
  topic: string;
}

export function commentOnPost(post: Post, ctx: ShareContext, rnd: () => number = Math.random): ShareResult {
  const all = new Set([...post.tags.general, ...post.tags.species, ...post.tags.character, ...post.tags.meta, ...post.tags.lore]);
  const replies: GusReply[] = [];

  // Headline: rating first if it's spicy (he'd notice that before anything), else his favourite subject.
  const reaction = REACTIONS.find((r) => r.tags.some((t) => all.has(t)));
  if (post.rating === "e" && (!reaction || rnd() < 0.5)) {
    replies.push({ text: tierPick(EXPLICIT, ctx.tier, rnd), motion: "wobble", emoji: ["😳", "🔥"] });
  } else if (reaction) {
    replies.push({ text: tierPick(reaction.lines, ctx.tier, rnd), motion: reaction.motion ?? "hop", emoji: reaction.emoji });
  } else if (post.rating === "q" && rnd() < 0.5) {
    replies.push({ text: tierPick(QUESTIONABLE, ctx.tier, rnd), motion: "tilt", emoji: ["👀"] });
  } else {
    const species = post.tags.species.find((s) => !GENERIC.has(s));
    replies.push({
      text: species ? pick([`Ooh, a ${pretty(species)}!`, `A ${pretty(species)}! Nice.`, `${pretty(species)}, huh? Good pick.`], rnd) : pick(["Ooh, what's this?", "Nice! Thanks for sharing.", "Hmm! Interesting."], rnd),
      motion: "tilt",
    });
  }

  // Detail: one remark from whatever's notable about it.
  const details: string[] = [];
  const liked = ctx.likes.find((l) => all.has(asTag(l)));
  if (liked) details.push(`You told me you like ${liked}. Of course you sent this.`, `${liked[0].toUpperCase()}${liked.slice(1)}! You're so predictable. I love it.`);
  const disliked = ctx.dislikes.find((l) => all.has(asTag(l)));
  if (disliked) details.push(`Didn't you say you don't like ${disliked}? Weird choice.`);
  const artist = post.tags.artist.find(isRealArtist);
  if (artist) details.push(`By ${pretty(artist)}! Good eye.`, `${pretty(artist)} never misses.`);
  if (post.score.total >= 500) details.push(`Score of ${post.score.total.toLocaleString()}? Everyone loves this one.`);
  else if (post.score.total < 0) details.push(`Score of ${post.score.total}… the crowd disagrees. I don't. Probably.`);
  if (post.fav_count >= 1000) details.push(`${post.fav_count.toLocaleString()} favorites. You're not the only one.`);
  const character = post.tags.character[0];
  if (character) details.push(`Is that ${pretty(character)}? I've heard of them.`);
  if (["webm", "mp4", "gif"].includes(post.file.ext.toLowerCase()) || all.has("animated")) details.push("It moves! Fancy.");
  if (all.has("group") || all.has("trio")) details.push("Busy picture. Lots going on.");
  const year = post.created_at ? new Date(post.created_at).getFullYear() : null;
  if (year && year < 2013) details.push(`From ${year}! Vintage. Like my favorite trash.`);
  if (details.length && (liked || rnd() < 0.7)) replies.push({ text: liked && rnd() < 0.7 ? details[0] : pick(details, rnd) });

  const topic = [...post.tags.species, ...post.tags.general]
    .filter((t) => !GENERIC.has(t))
    .slice(0, 4)
    .map((t) => t.replace(/_/g, " "))
    .join(" ");
  return { replies, topic };
}
