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

// ---- Foxes: his favorite animal, so they get their own everything ---------------------------------

const FOX_TAGS = ["fox", "red_fox", "arctic_fox", "fennec_fox", "fennec", "gray_fox", "kit_fox", "kitsune", "vulpine", "silver_fox", "corsac_fox"];

const FOX: Lines = {
  clean: [
    "A FOX! Oh my gosh. Oh my GOSH. You know foxes are my favorite!",
    "FOX! *spins* Best animal. No contest. Sorry, raccoons.",
    "You found a fox! For me? You shouldn't have. You absolutely should have.",
    "Look at those ears. Look at that TAIL. I need a minute.",
    "Foxes are perfect and I will not be taking questions.",
  ],
  cheeky: ["A fox? You really know the way to my heart.", "Oh, you're sending me FOXES now. Trying to butter me up? It's working."],
  nasty: ["A fox. Okay. Now you've got my full attention.", "Foxes. My one weakness. You're playing dirty and I love it."],
};

/** Kind-specific fox follow-ups - first match wins, so the specific kinds come first. */
const FOX_KINDS: [string[], string[]][] = [
  [["fennec_fox", "fennec"], ["A fennec! Those EARS. They're bigger than its whole face!", "Fennecs are basically ears with a fox attached. Perfect design."]],
  [["arctic_fox"], ["Arctic fox! Fluffy snowball. Built for cold, made for cuddles.", "An arctic fox! Like a cloud with opinions."]],
  [["kitsune"], ["A kitsune! How many tails? More tails, more magic. Everyone knows that.", "Kitsune! Mystical fox. The best kind of fox. Well. All kinds are the best kind."]],
  [["gray_fox"], ["A gray fox! They can climb trees, you know. Like me! Kindred spirit."]],
  [["red_fox"], ["Classic red fox. Orange coat, white tail tip, black socks. Iconic.", "Red fox! The original. The legend."]],
];

const FOX_EXTRAS = [
  "Fun fact: foxes use the earth's magnetic field to pounce. They're basically wizards.",
  "Foxes make the funniest screams. I love them anyway. Maybe more.",
  "Did you know foxes are in the dog family, but act like cats? Chaos. I love it.",
  "If I could be any animal besides a raccoon… fox. Obviously.",
  "*stares at the fox tail* …Sorry, what were we talking about?",
  "Save this one. Actually, save all the foxes.",
];

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
  {
    tags: ["bear", "ursid", "panda", "giant_panda"],
    lines: { clean: ["A bear! Big trash-can rivals. They knock over the whole thing. Amateurs.", "Bear! Hug-shaped, but I wouldn't risk it."] },
  },
  { tags: ["skunk", "mephitid"], lines: { clean: ["A skunk! Fellow night shift. Nice stripe.", "Skunk! We share bins sometimes. Polite, mostly."] } },
  { tags: ["opossum", "possum", "didelphid"], emoji: ["🤝"], lines: { clean: ["A possum! My bin buddy. Screams a lot, great guy.", "Opossum! Respect. Plays dead better than I do."] } },
  { tags: ["rodent", "mouse", "rat", "squirrel", "hamster"], lines: { clean: ["A little rodent! Tiny paws. I approve of tiny paws.", "Squeaky friend! Do they share snacks?"] } },
  { tags: ["deer", "cervid", "reindeer"], lines: { clean: ["A deer! All legs. How do they even stand.", "Deer! Pretty. Terrible at crossing roads."] } },
  { tags: ["hyena", "hyaenid"], lines: { clean: ["A hyena! They laugh at everything. Even my jokes. Especially my jokes."] } },
  { tags: ["reptile", "lizard", "snake", "crocodilian"], lines: { clean: ["Scaly! Cold-blooded. Give them a blanket.", "A reptile! Sunbathing champion."] } },
  { tags: ["insect", "arthropod", "bee", "spider", "moth"], lines: { clean: ["Bugs! Snack or friend? …Friend. Okay. Friend."] } },
  { tags: ["pokemon", "pokemon_(species)"], lines: { clean: ["A Pokémon! Which one? Can I catch it? Can it catch me?"] } },
  { tags: ["sergal", "avali", "synth_(vader-san)", "primagen"], lines: { clean: ["Oh, one of those fancy made-up species. Very sleek. I'm classic."] } },
  { tags: ["monster", "demon", "eldritch_abomination"], emoji: ["😨"], lines: { clean: ["Spooky! I'm hiding behind the bin.", "That's a monster. I'm not scared. You're scared."] } },
  { tags: ["sad", "crying", "tears"], emoji: ["🥺"], lines: { clean: ["Aw, they look sad. Someone get them a snack.", "Crying? Nooo. Give them a hug."] } },
  { tags: ["happy", "smile", "laughing", "grin"], lines: { clean: ["Look at that smile! Contagious.", "Happy little guy. I'm happy now too."] } },
  { tags: ["angry", "frown", "annoyed", "grumpy"], lines: { clean: ["Grumpy! Someone took their trash, I bet.", "Uh oh. Somebody's mad. Not me, I hope."] } },
  { tags: ["blush", "embarrassed"], lines: { clean: ["Aww, they're blushing! Cute."], cheeky: ["Blushing, huh? I wonder why. *wiggles eyebrows*"] } },
];

/** Smaller things in the picture he'll mention as a detail, alongside the score/artist ones. */
const TAG_REMARKS: { tags: string[]; lines: string[] }[] = [
  { tags: ["night", "moon", "starry_sky", "stars"], lines: ["Nighttime! My favorite shift.", "Look at that night sky. Prime bin-raiding hours."] },
  { tags: ["snow", "winter", "snowing"], lines: ["Snow! Cold paws. Hard pass.", "Brr. Winter. I'd be curled up in a box."] },
  { tags: ["rain", "raining", "umbrella"], lines: ["Rainy! Great for washing snacks, bad for fur."] },
  { tags: ["beach", "ocean", "swimwear", "bikini", "swimming"], lines: ["Beach day! Sand gets everywhere though.", "Swimming? I'll stick to wading."] },
  { tags: ["forest", "tree", "outside", "nature", "grass"], lines: ["Nice outdoors. I can smell it through the screen.", "Trees! Good for climbing. And hiding."] },
  { tags: ["city", "street", "alley", "building", "cityscape"], lines: ["City! Where all the good bins live.", "That alley looks… promising."] },
  { tags: ["bed", "bedroom", "pillow", "blanket"], lines: ["A cozy bed. I'd steal that blanket.", "That pillow looks perfect for a nap."] },
  { tags: ["kitchen", "cooking", "chef"], lines: ["A kitchen! Where the scraps come from."] },
  { tags: ["halloween", "pumpkin", "jack-o'-lantern", "costume"], lines: ["Spooky season! I already have a mask.", "Halloween! The one night I fit in."] },
  { tags: ["christmas", "santa_hat", "holidays", "christmas_tree"], lines: ["Festive! Wrapping paper is my favorite trash."] },
  { tags: ["valentine's_day", "heart_symbol", "<3"], lines: ["Hearts everywhere. Very lovey.", "<3 right back at you."] },
  { tags: ["hat", "headwear", "cap", "beanie"], lines: ["Love the hat. Can I borrow it?", "Hat! Very stylish."] },
  { tags: ["glasses", "eyewear", "sunglasses"], lines: ["Glasses! Smart look.", "Sunglasses. Too cool for me."] },
  { tags: ["hoodie", "sweater", "scarf"], lines: ["That hoodie looks so comfy.", "Cozy outfit! I'm jealous."] },
  { tags: ["armor", "sword", "weapon", "melee_weapon"], lines: ["Armed and dangerous! Please don't point that at me.", "Fancy sword. I fight with my hands. Tiny hands."] },
  { tags: ["magic", "glowing", "sparkles"], lines: ["Sparkly! Shiny things are my weakness.", "Magic! Can they make snacks appear?"] },
  { tags: ["musical_instrument", "guitar", "music", "singing"], lines: ["Music! Play me a song.", "Is that a guitar? I'd just chew the strings."] },
  { tags: ["video_games", "gaming", "controller", "computer"], lines: ["Games! Want to play one with me after?", "Gamer. Respect."] },
  { tags: ["book", "reading"], lines: ["Reading! Very smart. I just eat the pages."] },
  { tags: ["coffee", "tea", "mug", "beverage"], lines: ["A warm drink. Cozy vibes.", "Coffee? I'd knock that off the table. Sorry, instinct."] },
  { tags: ["plushie", "toy"], lines: ["A plushie! Is it a raccoon plushie? It should be."] },
  { tags: ["flower", "flowers", "rose"], lines: ["Flowers! Pretty. Do they taste good?"] },
  { tags: ["tongue_out", "blep"], lines: ["Blep! Classic."] },
  { tags: ["wings", "feathered_wings"], lines: ["Wings! Must be nice not having to climb."] },
  { tags: ["fluffy", "fluffy_tail", "big_tail"], lines: ["So fluffy! Almost as fluffy as my tail.", "That tail. Respect."] },
  { tags: ["pawpads", "paws"], lines: ["Beans! Look at those beans."] },
  { tags: ["solo"], lines: ["Just one of them. Main character energy."] },
  { tags: ["duo"], lines: ["Two of them. Cute pair."] },
  { tags: ["monochrome", "sketch", "line_art"], lines: ["A sketch! Love seeing the lines.", "Black and white. Very artsy."] },
  { tags: ["pixel_art"], lines: ["Pixels! Retro. Like my chiptune."] },
  { tags: ["traditional_media_(artwork)", "watercolor_(artwork)", "painting_(artwork)"], lines: ["Traditional art! Real paint. Fancy."] },
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

/** "Hmm, let me look" - he takes a second before reacting. */
function leadUp(post: Post, all: Set<string>, rnd: () => number): GusReply {
  if (["webm", "mp4"].includes(post.file.ext.toLowerCase())) {
    return { text: pick(["Ooh, a video! Hold on, let me press play…", "A video? Gimme a sec, it's buffering. In my brain."], rnd), motion: "look" };
  }
  if (all.has("comic")) return { text: pick(["A comic? Okay, reading… reading…", "Ooh, panels. Let me read this properly."], rnd), motion: "look" };
  const lines = [
    "Hmm, let me take a look at that!",
    "Ooh, what'd you bring me? Let me see…",
    "*squints at the screen*",
    "A picture? For me? Okay, hold on…",
    "*leans in close* Let's see here…",
    "Oh! Hang on, let me get a good look.",
    "*wipes paws* Okay. Show me.",
  ];
  return { text: pick(lines, rnd), motion: "look" };
}

/** Something to keep the conversation going after he's had his say. */
const FOLLOW_UPS = [
  "Got any more like this?",
  "Where do you even find these?",
  "Is this one going in your favorites?",
  "What made you pick this one?",
  "Send me another! I'm on a roll.",
  "I'm keeping this one in my den. Mentally.",
];

/** Posts shared since the app started - after a few, he notices the streak. */
let sharesThisSession = 0;

export function commentOnPost(post: Post, ctx: ShareContext, rnd: () => number = Math.random): ShareResult {
  const all = new Set([...post.tags.general, ...post.tags.species, ...post.tags.character, ...post.tags.meta, ...post.tags.lore]);
  const replies: GusReply[] = [];
  sharesThisSession++;

  // Lead-up: a beat to "look" before reacting.
  replies.push(
    sharesThisSession >= 3 && rnd() < 0.5
      ? { text: pick([`Another one? That's ${sharesThisSession} now. You're spoiling me.`, "More? Okay okay, let me see…", "You're on a sharing spree! Let's see this one."], rnd), motion: "hop" }
      : leadUp(post, all, rnd),
  );

  // Headline: foxes (his favorite) beat everything; then a spicy rating, then his favourite subject.
  const reaction = REACTIONS.find((r) => r.tags.some((t) => all.has(t)));
  if (FOX_TAGS.some((t) => all.has(t))) {
    const raccoonToo = all.has("raccoon") || all.has("procyonid");
    replies.push(
      raccoonToo
        ? { text: pick(["A fox AND a raccoon?! Together?! This is the best picture ever made.", "Fox and raccoon. Night bandits united. I'm getting emotional."], rnd), motion: "disco", emoji: ["🦊", "🦝", "💕"] }
        : { text: tierPick(FOX, ctx.tier, rnd), motion: rnd() < 0.5 ? "spin" : "hop", emoji: ["🦊", "😍", "💕"] },
    );
    const kind = FOX_KINDS.find(([tags]) => tags.some((t) => all.has(t)));
    replies.push({ text: kind && rnd() < 0.7 ? pick(kind[1], rnd) : pick(FOX_EXTRAS, rnd) });
    if (post.rating === "e" && ctx.tier !== "clean") replies.push({ text: tierPick(EXPLICIT, ctx.tier, rnd), motion: "wobble", emoji: ["😳"] });
  } else if (post.rating === "e" && (!reaction || rnd() < 0.5)) {
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

  // Details: your remembered likes, then what's in the scene, then what's notable about the post.
  const liked = ctx.likes.find((l) => all.has(asTag(l)));
  const disliked = ctx.dislikes.find((l) => all.has(asTag(l)));
  if (liked) {
    replies.push({ text: rnd() < 0.7 ? `You told me you like ${liked}. Of course you sent this.` : `${liked[0].toUpperCase()}${liked.slice(1)}! You're so predictable. I love it.` });
  } else if (disliked) replies.push({ text: `Didn't you say you don't like ${disliked}? Weird choice.` });

  const scene = TAG_REMARKS.filter((r) => r.tags.some((t) => all.has(t)));
  if (scene.length && rnd() < 0.8) replies.push({ text: pick(pick(scene, rnd).lines, rnd) });

  const meta: string[] = [];
  const artist = post.tags.artist.find(isRealArtist);
  if (artist) meta.push(`By ${pretty(artist)}! Good eye.`, `${pretty(artist)} never misses.`);
  if (post.score.total >= 500) meta.push(`Score of ${post.score.total.toLocaleString()}? Everyone loves this one.`);
  else if (post.score.total < 0) meta.push(`Score of ${post.score.total}… the crowd disagrees. I don't. Probably.`);
  if (post.fav_count >= 1000) meta.push(`${post.fav_count.toLocaleString()} favorites. You're not the only one.`);
  const character = post.tags.character[0];
  if (character) meta.push(`Is that ${pretty(character)}? I've heard of them.`);
  if (["webm", "mp4", "gif"].includes(post.file.ext.toLowerCase()) || all.has("animated")) meta.push("It moves! Fancy.");
  if (all.has("group") || all.has("trio")) meta.push("Busy picture. Lots going on.");
  const year = post.created_at ? new Date(post.created_at).getFullYear() : null;
  if (year && year < 2013) meta.push(`From ${year}! Vintage. Like my favorite trash.`);
  if (meta.length && rnd() < 0.6) replies.push({ text: pick(meta, rnd) });

  if (replies.length < 5 && rnd() < 0.4) replies.push({ text: pick(FOLLOW_UPS, rnd), motion: "tilt" });

  const topic = [...post.tags.species, ...post.tags.general]
    .filter((t) => !GENERIC.has(t))
    .slice(0, 4)
    .map((t) => t.replace(/_/g, " "))
    .join(" ");
  return { replies, topic };
}
