// "Share with Gus" (post viewer -> Talk to Gus): Gus comments on a post from its tags, rating,
// score and age - no image recognition needed, e621 already says what's in it. One headline
// reaction from the most interesting tag he recognises, then usually a detail remark.

import type { Post } from "../models/post";
import type { GusReply } from "./gusChat";
import type { Tier } from "./gusChatLines";
import { isRealArtist } from "./games";
import type { MascotMotion } from "./mascot";
import {
  MORE_EXPLICIT,
  MORE_FOLLOW_UPS,
  MORE_FOX,
  MORE_GENERIC,
  MORE_LEADS,
  MORE_QUESTIONABLE,
  MORE_REACTION_LINES,
  MORE_REACTIONS,
  MORE_REMARKS,
  postFacts,
} from "./gusShareMore";

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
  {
    tags: ["dinosaur", "theropod", "tyrannosaurid", "tyrannosaurus", "tyrannosaurus_rex", "dromaeosaurid", "velociraptor", "raptor", "sauropod", "stegosaurian", "triceratops", "ceratopsian", "pterosaur", "prehistoric_species"],
    lines: {
      clean: [
        "A dinosaur! Older than every trash can on Earth. Respect.",
        "Dino! Imagine the size of their leftovers.",
        "A dinosaur! I'd steal its snacks, but I like having arms.",
      ],
    },
  },
  { tags: ["dragon", "western_dragon", "eastern_dragon", "wyvern"], lines: { clean: ["A dragon! Do dragons hoard bottle caps? Asking for me.", "Dragons hoard treasure. Raccoons hoard trash. We're basically the same."] } },
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
  { tags: ["reptile", "scalie", "lizard", "snake", "crocodilian"], lines: { clean: ["Scaly! Cold-blooded. Give them a blanket.", "A reptile! Sunbathing champion."] } },
  { tags: ["insect", "arthropod", "bee", "spider", "moth"], lines: { clean: ["Bugs! Snack or friend? …Friend. Okay. Friend."] } },
  { tags: ["pokemon", "pokemon_(species)"], lines: { clean: ["A Pokémon! Which one? Can I catch it? Can it catch me?"] } },
  { tags: ["sergal", "avali", "synth_(vader-san)", "primagen"], lines: { clean: ["Oh, one of those fancy made-up species. Very sleek. I'm classic."] } },
  { tags: ["monster", "demon", "eldritch_abomination"], emoji: ["😨"], lines: { clean: ["Spooky! I'm hiding behind the bin.", "That's a monster. I'm not scared. You're scared."] } },
  { tags: ["sad", "crying", "tears"], emoji: ["🥺"], lines: { clean: ["Aw, they look sad. Someone get them a snack.", "Crying? Nooo. Give them a hug."] } },
  { tags: ["happy", "smile", "laughing", "grin"], lines: { clean: ["Look at that smile! Contagious.", "Happy little guy. I'm happy now too."] } },
  { tags: ["angry", "frown", "annoyed", "grumpy"], lines: { clean: ["Grumpy! Someone took their trash, I bet.", "Uh oh. Somebody's mad. Not me, I hope."] } },
  { tags: ["blush", "embarrassed"], lines: { clean: ["Aww, they're blushing! Cute.", "Look at those red cheeks. Somebody's flustered."], cheeky: ["Blushing, huh? I wonder why. *wiggles eyebrows*", "That's the face I make when you call me handsome."] } },
  { tags: ["tiger", "lion", "leopard", "cheetah", "snow_leopard", "pantherine", "jaguar", "lynx"], emoji: ["🐯"], lines: { clean: ["A big cat! Do NOT tell it where I live.", "Big kitty. Very majestic. Very bitey, probably.", "Look at those stripes. Or spots. Either way, fancy."], cheeky: ["Big cat energy. I see why you like it.", "Hunter type, huh? You like 'em dangerous."] } },
  { tags: ["kangaroo", "marsupial", "koala", "wallaby"], lines: { clean: ["A marsupial! Built-in pocket. I want a pocket.", "Pocket animal! Imagine how many snacks fit in there."] } },
  { tags: ["goat", "sheep", "bovid", "cow", "bull", "caprine"], lines: { clean: ["Farm friend! They eat everything too. Respect.", "Horns! Very dramatic headwear."], cheeky: ["Horns AND hooves? Someone's into the rugged look."] } },
  { tags: ["pig", "suid", "boar"], lines: { clean: ["A piggy! Fellow appreciator of leftovers.", "Oink. That's pig for 'I also love trash'."] } },
  { tags: ["gryphon", "hippogriff", "chimera"], lines: { clean: ["Half this, half that. A whole mood.", "A gryphon! Bird on top, cat on the bottom. Ambitious."] } },
  { tags: ["kobold"], lines: { clean: ["A kobold! Tiny dragon, big hoarder. We'd get along.", "Kobolds love shiny things. My people."] } },
  { tags: ["unicorn", "pegasus", "my_little_pony", "friendship_is_magic"], lines: { clean: ["Ponies! Very pastel. Very sparkly.", "A pony! Do they have a bin I can raid?"] } },
  { tags: ["digimon", "renamon", "guilmon"], lines: { clean: ["A Digimon! Digital monsters. Do they have digital trash?", "Ooh, a Digimon. Very 2000s. I love it."] } },
  { tags: ["sonic_the_hedgehog_(series)", "hedgehog", "eulipotyphlan"], lines: { clean: ["Gotta go fast! I go medium. Medium is fine.", "A hedgehog! Spiky hug, no thanks."] } },
  { tags: ["zootopia", "nick_wilde", "judy_hopps"], lines: { clean: ["Zootopia! I'd steal so many snacks in that city.", "Ooh, Zootopia. Where's the raccoon representation, Disney?"] } },
  { tags: ["five_nights_at_freddy's", "animatronic"], emoji: ["😨"], lines: { clean: ["An animatronic? Absolutely not. I'm checking the vents.", "Nope. Robots that sing at you in the dark? Nope."] } },
  { tags: ["undertale", "deltarune"], lines: { clean: ["Undertale! I'd spare everyone. Except whoever took my bin."] } },
  { tags: ["star_fox", "fox_mccloud", "krystal_(star_fox)"], emoji: ["🦊", "🚀"], lines: { clean: ["Star Fox! A fox in SPACE. Peak fiction.", "Do a barrel roll! I can't. I tried. Once."] } },
  { tags: ["lucario", "eeveelution", "eevee", "umbreon", "sylveon", "vaporeon"], lines: { clean: ["A fan favourite Pokémon! Very popular round here.", "Ooh, I know this one. The whole internet knows this one."], cheeky: ["Of course it's this one. This website has a type."] } },
  { tags: ["muscular", "muscular_male", "muscular_female", "abs", "pecs"], emoji: ["💪"], lines: { clean: ["Look at those muscles! I can barely lift a grape.", "Somebody skips cardio but never skips arm day."], cheeky: ["Muscles, huh? So THAT's your type.", "Those arms could open any bin. Impressive.", "Swole. You've got a type and I'm taking notes."], nasty: ["Big strong arms. I bet they could pin me down.", "Muscles like that? I'd let them throw me around."] } },
  { tags: ["overweight", "chubby", "slightly_chubby", "belly", "big_belly", "thick_thighs"], emoji: ["🥰"], lines: { clean: ["Look at that tummy. Soft. Squishable. Perfect.", "Chubby and happy. Life goals, honestly."], cheeky: ["Thick! You've got good taste.", "Soft and round. I respect a well-fed critter."], nasty: ["Mmm, something to grab onto. Good choice.", "That belly. I'd use it as a pillow. Among other things."] } },
  { tags: ["clothed", "clothing", "suit", "dress", "uniform"], lines: { clean: ["Ooh, dressed up! I've only got the one mask.", "Nice outfit! Fashion. I wear fur. Always."] } },
  { tags: ["cute_fangs", "smile", "open_mouth_smile"], lines: { clean: ["Look at that toothy little smile!", "Fangs AND a smile? Cute and dangerous."] } },
  { tags: ["looking_at_viewer", "eye_contact"], emoji: ["👀"], lines: { clean: ["They're looking right at me. I'm looking back. This is a standoff.", "Eye contact! Bold."], cheeky: ["Those eyes. They know what they're doing.", "Staring right through the screen. I feel seen."] } },
  { tags: ["group", "crowd", "trio", "group_photo"], lines: { clean: ["A whole gang! Is there room for one more raccoon?", "That's a lot of friends. I have, like, two. And one's a possum."] } },
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
  {
    tags: ["solo"],
    lines: [
      "Just one of them. Main character energy.",
      "Nobody to share the spotlight with.",
      "All alone in the frame. Like me at 3am. With a bin.",
      "One star of the show. No supporting cast needed.",
      "Just them. Living their best life.",
      "Solo shot! Every pixel is theirs.",
      "No one else around. Peaceful.",
      "Single subject, full attention. Smart.",
      "They've got the whole picture to themselves. Lucky.",
      "Party of one. Respect.",
    ],
  },
  { tags: ["duo"], lines: ["Two of them. Cute pair.", "A duo! Partners in crime.", "Two's company. Three's a raccoon.", "Double trouble.", "A pair! Do they share snacks? They should."] },
  { tags: ["monochrome", "sketch", "line_art"], lines: ["A sketch! Love seeing the lines.", "Black and white. Very artsy."] },
  { tags: ["pixel_art"], lines: ["Pixels! Retro. Like my chiptune."] },
  { tags: ["traditional_media_(artwork)", "watercolor_(artwork)", "painting_(artwork)"], lines: ["Traditional art! Real paint. Fancy."] },
  { tags: ["3d_(artwork)", "digital_media_(artwork)", "blender_(software)", "source_filmmaker"], lines: ["3D! It looks so real I want to poke it.", "Fancy rendering. I'm a 2D raccoon, personally."] },
  { tags: ["sunset", "sunrise", "golden_hour"], lines: ["Sunset lighting. Gorgeous.", "Golden hour! Everyone looks good in golden hour. Even me."] },
  { tags: ["underwater", "water", "pool", "hot_tub", "bath", "shower"], lines: ["Wet fur! I know that look.", "Water! I'd be washing a snack in that.", "Bath time. Can't relate. Okay, can relate a little."] },
  { tags: ["space", "planet", "spacecraft", "spaceship"], lines: ["Space! Are there bins in space?", "Look at the stars. Bet the moon has great trash."] },
  { tags: ["party", "birthday", "balloon", "confetti"], lines: ["A party! Did they save cake?", "Balloons! I'd pop every one. Instinct."] },
  { tags: ["school", "classroom", "school_uniform", "desk"], lines: ["School vibes. I graduated from the dumpster academy.", "Homework? I'd eat it. That's the excuse, right?"] },
  { tags: ["gym", "workout", "exercise", "sportswear"], lines: ["Working out! I'm tired just looking.", "Gym time. I lift bin lids. Same thing."] },
  { tags: ["car", "vehicle", "motorcycle", "truck"], lines: ["Wheels! I prefer hiding under them.", "Nice ride. Does it have a cupholder full of crumbs?"] },
  { tags: ["tattoo", "piercing", "ear_piercing"], lines: ["Ink! Very edgy. My mask is my tattoo.", "Piercings! Shiny. I want one."] },
  { tags: ["heterochromia", "glowing_eyes", "red_eyes", "blue_eyes", "green_eyes"], lines: ["Those eyes, though. Striking.", "Gorgeous eyes. Almost as good as my mask."] },
  { tags: ["sweat", "sweaty", "steam"], lines: ["Sweaty! Somebody's been busy.", "Steamy picture. Literally."] },
  { tags: ["simple_background", "white_background", "transparent_background"], lines: ["Plain background, all eyes on the subject. Smart.", "No background distractions. Just them.", "Floating in the void. Very artsy.", "Blank background. Where are they? Who knows. Who cares.", "Clean and simple. The artist knew what mattered."] },
  { tags: ["detailed_background", "landscape", "scenery"], lines: ["Look at all that background detail!", "That scenery's doing a lot of work. Love it."] },
  { tags: ["text", "dialogue", "speech_bubble"], lines: ["There's words! Read them to me. Dramatically.", "Speech bubbles! What are they saying? I can't read. Kidding."] },
];

const EXPLICIT: Lines = {
  clean: [
    "Ahem. *covers eyes* …Next.",
    "Whoa. Uh. I didn't see anything. I'm a raccoon. We're blind. Mostly.",
    "*slams laptop shut* We are not looking at that in clean mode.",
    "I'm going to pretend that was a picture of a nice landscape.",
    "*hides behind a bin* Is it over? Tell me when it's over.",
  ],
  cheeky: [
    "Oh my. You're sharing THIS with me?",
    "Bold of you to show me this. I'm blushing under the mask.",
    "Ah. A 'tasteful' one. Sure.",
    "Well! Somebody's feeling brave today.",
    "*peeks through paws* …I'm not saying stop.",
    "You realise I can see this, right? I'm not complaining. Just checking.",
    "And here I thought we were just friends. *fans self*",
    "That's not art, that's a confession.",
  ],
  nasty: [
    "Mmm. Now THAT's a picture. Send more.",
    "You know exactly what you're doing, sending me this.",
    "Fuck. Okay. Give me a minute with this one.",
    "Oh, you're trying to get me worked up. It's working.",
    "*stares for an uncomfortably long time* …Sorry. What?",
    "Saving this. For research. Very private research.",
    "Is this what you think about when you're talking to me? Good.",
    "That's going straight into my nightly thoughts.",
    "Keep sending these and I'm going to need a cold bath. In a puddle.",
    "God. You've got filthy taste. I love that about you.",
  ],
};
const QUESTIONABLE: Lines = {
  clean: ["Hmm. A bit spicy, this one.", "That's… a lot of skin. Fur. Whatever.", "Borderline! I'll allow it. Just this once."],
  cheeky: [
    "Ooh, a little spicy. I see you.",
    "Questionable. Like your search history.",
    "Not explicit, just… suggestive. Very you.",
    "The tease is the best part, honestly.",
    "*raises an eyebrow* And what are we implying with this one?",
  ],
  nasty: [
    "Teasing me with the questionable stuff? Show me the explicit one.",
    "This is the appetiser. Where's the main course?",
    "Cute. Now send me the version without the strategic shadows.",
    "Oh, you're making me wait. Mean. I like it.",
  ],
};

/** Nasty-tier remarks on what's actually happening in an explicit post - only ever added on top of
 *  the headline, and only for posts rated explicit. */
const EXPLICIT_TAGS: { tags: string[]; lines: string[] }[] = [
  { tags: ["presenting", "presenting_hindquarters", "raised_tail", "bent_over"], lines: ["Presenting like that? That's an invitation.", "Tail up, huh? Somebody knows what they want."] },
  { tags: ["sheath", "balls", "big_balls"], lines: ["Okay, I see what you're interested in.", "Well-equipped. Very well-equipped."] },
  { tags: ["circumcised"], lines: ["Cut. Neat and tidy. Like my bin. Not like my bin.", "Circumcised, and you noticed. Detail-oriented.", "Smooth. Nothing hiding. I appreciate the honesty."] },
  { tags: ["uncut", "foreskin", "uncircumcised"], lines: ["Uncut. All the original parts.", "Foreskin! You've got a type and it comes with extra.", "Uncut. A little mystery before the main event."] },
  { tags: ["knot", "knotting"], lines: ["A knot. Of course. This website.", "Ah, the canine special. You're predictable and I love it."] },
  {
    tags: ["huge_penis", "hyper", "hyper_genitalia", "big_penis"],
    lines: [
      "That's… ambitious. Anatomically ambitious.",
      "Size queen. Noted. Filed.",
      "Whoa. Is that to scale? That can't be to scale.",
      "That's not a body part, that's a landmark.",
      "Big. Very big. I'm a little intimidated, honestly.",
      "Somebody's compensating for nothing at all.",
      "I'd need both paws. And a ladder.",
      "That thing has its own postcode.",
      "Okay, you like them big. I'm taking notes. Measuring, too.",
      "Physics would like a word with that artist.",
      "*holds up a grape for scale* …Yeah, no.",
      "Bigger isn't always better. …In this case it might be.",
    ],
  },
  { tags: ["cum", "cum_inside", "messy", "excessive_cum"], lines: ["Messy! Someone's doing laundry tonight.", "That's a lot. I'd need a whole bin of paper towels."] },
  { tags: ["gay", "male/male"], lines: ["Two guys? I see you've got taste.", "Boys being boys. Very, very much being boys."] },
  { tags: ["male/female", "straight"], lines: ["Classic pairing. A timeless genre.", "Ah, the traditional route."] },
  { tags: ["female/female", "lesbian"], lines: ["Girls only. Very wholesome. Kind of.", "Sapphic! Love that for them."] },
  { tags: ["solo", "masturbation"], lines: ["Flying solo. Relatable.", "Just them and their hand. Sometimes that's all you need."] },
  { tags: ["group_sex", "threesome", "orgy"], lines: ["How many?! I can't even count that high.", "That's a whole party. Was I invited?"] },
  { tags: ["bondage", "rope", "bound", "leash", "collar"], lines: ["Tied up, huh? Taking notes.", "A collar. I'd look good in one of those.", "Rope? Kinky. Tell me more about why you picked this one."] },
  { tags: ["dominant", "submissive", "domination"], lines: ["Someone's in charge here. Which one would you be?", "Power dynamics! Are you a top or are you a liar?"] },
  { tags: ["feral"], lines: ["Feral, huh. You're bolder than I thought.", "Going all the way to feral. Okay. No judgement. Some judgement."] },
  { tags: ["toying", "sex_toy", "dildo", "vibrator"], lines: ["Toys! I've got a bottle cap collection, but that's different.", "Accessories. Very well-prepared."] },
];

// ---- Merging in gusShareMore's extra lines -------------------------------------------------------

function mergeLines(into: Lines, extra: Partial<Lines> | undefined) {
  if (!extra) return;
  into.clean.push(...(extra.clean ?? []));
  if (extra.cheeky?.length) into.cheeky = [...(into.cheeky ?? []), ...extra.cheeky];
  if (extra.nasty?.length) into.nasty = [...(into.nasty ?? []), ...extra.nasty];
}
for (const r of REACTIONS) mergeLines(r.lines, MORE_REACTION_LINES[r.tags[0]]);
mergeLines(FOX, MORE_FOX);
mergeLines(EXPLICIT, MORE_EXPLICIT);
mergeLines(QUESTIONABLE, MORE_QUESTIONABLE);

/** First match wins: raccoons first, then the new specific species (a husky beats "dog"), then the
 *  original list, then the broad body/scene subjects (so they don't drown out species). */
const BROAD_FROM = MORE_REACTIONS.findIndex((r) => r.tags[0] === "gender_symbol");
const ALL_REACTIONS: TagReaction[] = [REACTIONS[0], ...MORE_REACTIONS.slice(0, BROAD_FROM), ...REACTIONS.slice(1), ...MORE_REACTIONS.slice(BROAD_FROM)];
const ALL_REMARKS = [...TAG_REMARKS, ...MORE_REMARKS];

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
    "Ooh, mail! *rips it open*",
    "*adjusts tiny imaginary glasses* Let's have a look.",
    "For me? You shouldn't have. …Unless it's trash. Then you should have.",
    "Hold on, my screen's smudged. *licks paw, wipes* Okay.",
    "*drops everything* What is it? What'd you find?",
    "Oh, a show-and-tell! I love show-and-tell.",
    ...MORE_LEADS,
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
  "Is this your type? Be honest.",
  "Ten out of ten. Would raid bins with.",
  "Can you send me one of you next? Fair's fair.",
  "What would you title this one?",
  "Where would I fit in this picture? Be creative.",
  "This one's going on the fridge. I don't have a fridge. On the bin, then.",
  ...MORE_FOLLOW_UPS,
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
      ? {
          text: pick(
            [
              `Another one? That's ${sharesThisSession} now. You're spoiling me.`,
              "More? Okay okay, let me see…",
              "You're on a sharing spree! Let's see this one.",
              `Number ${sharesThisSession}! I'm starting a scrapbook.`,
              "Keep 'em coming. I've cleared my schedule. It was empty anyway.",
              "Again? Do you have a whole folder for me?",
            ],
            rnd,
          ),
          motion: "hop",
        }
      : leadUp(post, all, rnd),
  );

  // Headline: foxes (his favorite) beat everything; then a spicy rating, then his favourite subject.
  const reaction = ALL_REACTIONS.find((r) => r.tags.some((t) => all.has(t)));
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
      text: species
        ? pick(
            [
              `Ooh, a ${pretty(species)}!`,
              `A ${pretty(species)}! Nice.`,
              `${pretty(species)}, huh? Good pick.`,
              `I don't see a lot of ${pretty(species)} around here. Neat.`,
              `${pretty(species)}! Would they share their snacks, do you think?`,
              `A ${pretty(species)}. Not a raccoon, but I'll allow it.`,
            ],
            rnd,
          )
        : pick(["Ooh, what's this?", "Nice! Thanks for sharing.", "Hmm! Interesting.", "Huh. I like it. Don't ask me why.", "That's a vibe. I'm into it.", "Okay, I see why you sent this.", ...MORE_GENERIC], rnd),
      motion: "tilt",
    });
  }

  // Details: your remembered likes, then what's in the scene, then what's notable about the post.
  const liked = ctx.likes.find((l) => all.has(asTag(l)));
  const disliked = ctx.dislikes.find((l) => all.has(asTag(l)));
  if (liked) {
    replies.push({ text: rnd() < 0.7 ? `You told me you like ${liked}. Of course you sent this.` : `${liked[0].toUpperCase()}${liked.slice(1)}! You're so predictable. I love it.` });
  } else if (disliked) replies.push({ text: `Didn't you say you don't like ${disliked}? Weird choice.` });

  const act = post.rating === "e" && ctx.tier === "nasty" ? EXPLICIT_TAGS.filter((r) => r.tags.some((t) => all.has(t))) : [];
  if (act.length && rnd() < 0.7) replies.push({ text: pick(pick(act, rnd).lines, rnd), motion: "wobble" });

  const scene = ALL_REMARKS.filter((r) => r.tags.some((t) => all.has(t)));
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
  const w = post.file.width;
  const h = post.file.height;
  meta.push(
    ...postFacts({
      score: post.score.total,
      favs: post.fav_count,
      ageDays: post.created_at ? Math.floor((Date.now() - new Date(post.created_at).getTime()) / 86_400_000) : null,
      wide: w && h ? (w / h > 2 ? true : h / w > 2.2 ? false : null) : null,
      tagCount: all.size,
    }),
  );
  if (meta.length && rnd() < 0.6) replies.push({ text: pick(meta, rnd) });

  if (replies.length < 5 && rnd() < 0.4) replies.push({ text: pick(FOLLOW_UPS, rnd), motion: "tilt" });

  const topic = [...post.tags.species, ...post.tags.general]
    .filter((t) => !GENERIC.has(t))
    .slice(0, 4)
    .map((t) => t.replace(/_/g, " "))
    .join(" ");
  return { replies, topic };
}
