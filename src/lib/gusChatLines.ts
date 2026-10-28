// Everything Gus can say in chat (Games > "Talk to Gus"). Rules are tried in order; the first
// whose pattern matches answers. Each rule has lines per content tier - clean always, cheeky
// (the existing innuendo setting) and nasty (opt-in, adult + Explicit only) where it makes sense -
// and can override them per affection stage, so flirting lands differently once he likes you.
//
// Line templates: {name} = what he calls you, {1} = the first captured group with pronouns
// flipped ("my tail" -> "your tail"). A line can be a function of the context instead.

import type { MascotMotion } from "./mascot";
import type { PetAction } from "./gusPet";
import type { ChatCtx } from "./gusChat";

export type Tier = "clean" | "cheeky" | "nasty";
/** Affection 0-100 -> stranger (<25), friend (<65), crush. */
export type Stage = "stranger" | "friend" | "crush";

export type Line = string | ((c: ChatCtx) => string | null);
export interface Lines {
  clean: Line[];
  cheeky?: Line[];
  nasty?: Line[];
}

export interface Rule {
  id: string;
  match: RegExp;
  lines: Lines;
  /** Per-stage overrides of `lines`. */
  stages?: Partial<Record<Stage, Partial<Lines>>>;
  affection?: number;
  /** Something done to his Pocket Gus self (a hug pets him, a snack feeds him). */
  petAction?: PetAction;
  motion?: MascotMotion;
  emoji?: string[];
  /** Rudeness: he sulks for a bit. */
  huffy?: boolean;
  /** Ends a sulk. */
  apology?: boolean;
}

const r = (rule: Rule) => rule;

// ---- Flirting & affection -------------------------------------------------------------------

const FLIRT: Rule[] = [
  r({
    id: "loveYou",
    match: /\b(i\s+(really\s+|do\s+)?(love|like)\s+(you|u)|ily|love\s+you)\b/i,
    affection: 4,
    motion: "hop",
    emoji: ["❤️", "💕"],
    lines: { clean: ["W-what? You can't just SAY that.", "That's… a lot. I'm a raccoon. I have small feelings. Okay, medium feelings."] },
    stages: {
      friend: {
        clean: ["Aww. I love you too, {name}. Don't tell the other raccoons.", "Stop, my ears are going red. Can raccoon ears go red? They are now."],
        cheeky: ["Love me enough to share your snacks? Because that's my love language.", "You love me? Prove it. Bring me shiny things."],
        nasty: ["Love you too. Now come here and show me how much."],
      },
      crush: {
        clean: ["I love you too, {name}. More than shiny bottle caps. And that's a LOT.", "*melts into a puddle of fur*", "Say it again. Slower. I want to remember it."],
        cheeky: ["I love you too. Your search history and all.", "Love you too. You're the only human I'd share a dumpster with."],
        nasty: ["Love you too, {name}. Now get over here, I've been thinking about you all day. Dirty thoughts. Very dirty.", "Mmm. Love you. Want me to show you? I'm VERY good with my hands."],
      },
    },
  }),
  r({
    id: "kiss",
    match: /(\*\s*(kiss|smooch|kisses|smooches|mwah)[^*]*\*|\bkiss (me|you)\b|\bcan i kiss\b|\bmwah\b|:\*)/i,
    affection: 3,
    motion: "hop",
    emoji: ["💋", "😳"],
    petAction: { type: "pet" },
    lines: { clean: ["Whoa! Buy me dinner first. Trash is fine.", "*blushes under the mask* …Okay that was nice."] },
    stages: {
      friend: { clean: ["*smooch* There. Happy?", "*kisses your nose* Boop."], cheeky: ["*kisses back* Mmm, you taste like cheese puffs."], nasty: ["*kisses back, slow* Careful. Keep that up and I'm not stopping at your lips."] },
      crush: {
        clean: ["*kisses you back and doesn't let go*", "Mmm. Again.", "*tail wraps around you* That's mine now. The kiss. And you."],
        cheeky: ["*kisses you deep* Whoops. Tongue slipped.", "You kiss like you browse. Thoroughly."],
        nasty: ["*pulls you in and kisses you hard, paws wandering*", "Mmh. Kiss me lower next time.", "*kisses down your neck* Tell me to stop. I dare you."],
      },
    },
  }),
  r({
    id: "hug",
    match: /(\*\s*(hug|hugs|cuddle|cuddles|snuggle|snuggles|holds)[^*]*\*|\b(hug|cuddle|snuggle) (me|you)\b|\bcan i (hug|cuddle)\b)/i,
    affection: 2,
    motion: "hop",
    emoji: ["🤗", "💞"],
    petAction: { type: "pet" },
    lines: { clean: ["*hugs back* Warm. You're warm.", "*squish*", "Careful, my fur gets everywhere. Worth it though."] },
    stages: {
      crush: { clean: ["*nuzzles into you* Can we stay like this?", "*curls up in your arms* I live here now."], cheeky: ["*snuggles closer than strictly necessary*"], nasty: ["*presses up against you* Mm. Is that a phone in your pocket or…"] },
    },
  }),
  r({
    id: "pets",
    match: /\*\s*(pets|pat|pats|scratches|strokes|rubs|boops|headpats|scritches)[^*]*\*|\b(head ?pats?|scritches|boop)\b/i,
    affection: 1,
    motion: "hop",
    emoji: ["❤️", "🥰"],
    petAction: { type: "pet" },
    lines: {
      clean: ["Hehe. Right behind the ears.", "*leans into it* More.", "Mmmh. You have magic hands.", "*happy chitter*", "Boop received. Boop returned. *boop*"],
      cheeky: ["Ooh, lower. …The back. I meant the back.", "Careful, I purr. Raccoons don't purr. I'm making an exception."],
      nasty: ["Mmh, lower. No, I don't mean the back this time.", "Keep rubbing like that and I'm going to need a minute alone."],
    },
  }),
  r({
    id: "cute",
    match: /\b(you('?re| are)|ur|youre|u r)\s+(so\s+|really\s+|very\s+|super\s+|soo+\s+)?(cute|adorable|sweet|precious|fluffy|soft|pretty|beautiful|handsome|gorgeous|a cutie|a good boy|lovely)\b|\bgood boy\b|\bcutie\b/i,
    affection: 2,
    motion: "hop",
    emoji: ["😊", "✨"],
    lines: {
      clean: ["I know. But thank you for noticing.", "Stop it. …Don't actually stop.", "It's the mask. The mask does a lot of work.", "*pretends not to be pleased* *is extremely pleased*"],
      cheeky: ["Cute? I'm a menace. A cute menace.", "Flattery gets you everywhere. Literally. Try me."],
      nasty: ["Cute? Babe, I'm a filthy little trash animal and you love it."],
    },
    stages: {
      crush: { clean: ["Only for you. Everyone else gets the feral version.", "You're cuter. That's not up for debate."], nasty: ["Good boy? Say that again and I'll be good for you all night."] },
    },
  }),
  r({
    id: "hot",
    match: /\b(you('?re| are)|ur|youre|u r)\s+(so\s+|really\s+|very\s+)?(hot|sexy|fine|thicc|thick|yummy|fuckable|hung)\b|\bdaddy\b/i,
    affection: 2,
    motion: "wobble",
    emoji: ["😳", "🔥"],
    lines: {
      clean: ["I'm… a raccoon. On a computer. But okay, sure, yes, thank you.", "Hot? Must be all this fur. It's a lot of fur.", "*fans self with tail*"],
      cheeky: ["Oh, I know. Rule 34 knows too.", "Hot? Have you SEEN my tail? Ringed for your pleasure.", "Keep talking. My ego's hungry."],
      nasty: ["Hot? You haven't seen what's under the fur. Yet.", "Say that again and I might let you find out how hot.", "Mmm. Want to see how thicc this tail really is? Up close?"],
    },
  }),
  r({
    id: "date",
    match: /\b(go out with me|date me|be my (boyfriend|bf|partner|valentine|husband|mate)|wanna date|marry me|will you marry|go on a date)\b/i,
    affection: 3,
    motion: "spin",
    emoji: ["💍", "💕", "😳"],
    lines: { clean: ["A date? I know the BEST dumpster. Candlelit. Well, one candle. It's a fire hazard."] },
    stages: {
      stranger: { clean: ["Whoa there. We just met. At least tell me your name first.", "Slow down! I'll think about it. Bring snacks next time."] },
      friend: { clean: ["Hmm. Maybe. Bring grapes and we'll talk.", "A date sounds nice. Behind the 7-Eleven, midnight?"], cheeky: ["Yes. Your place. I'll bring the trash."] },
      crush: {
        clean: ["Yes. Obviously yes. I've been waiting for you to ask.", "I'd marry you. I'd steal you a ring, even."],
        nasty: ["Yes. But fair warning, the honeymoon's going to be filthy."],
      },
    },
  }),
  r({
    id: "wink",
    match: /(;\)|;-\)|\*\s*winks?\s*\*|\bwink\b|\bowo\b|\buwu\b|\b(rawr|x3)\b)/i,
    affection: 1,
    motion: "tilt",
    emoji: ["😉"],
    lines: {
      clean: ["*winks back, badly, with both eyes*", "Was that a wink? I can't wink. I just blink slowly.", "OwO what's this?"],
      cheeky: ["Oh, it's like THAT, is it?", "*winks back* Your move."],
      nasty: ["Keep winking at me and I'll give you something to wink about."],
    },
  }),
  r({
    id: "likeMe",
    match: /\b(do you (like|love) me|you like me\??|am i your (favorite|fav)|do you care about me)\b/i,
    lines: {
      clean: [
        (c) =>
          c.stage === "crush"
            ? "Like you? I'm obsessed with you. In a healthy, raccoon way."
            : c.stage === "friend"
              ? "Yeah, I like you. You're one of the good ones."
              : "You're alright. Give it time. Bring snacks.",
      ],
    },
  }),
  r({
    id: "whatWearing",
    match: /\bwhat are you wearing\b|\bare you naked\b|\btake (it|that|your \w+) off\b|\bstrip\b/i,
    motion: "wobble",
    emoji: ["😳"],
    lines: {
      clean: ["A fur coat. Permanently. It's a whole thing.", "Just the mask. Raccoon fashion is minimal."],
      cheeky: ["Nothing but a mask and a smile.", "Fur. Just fur. Technically I've been naked this whole time. You're welcome."],
      nasty: ["Nothing at all. Want to come check?", "Just fur, and it's very easy to get your paws into.", "Naked as the day I was born. Come closer and see."],
    },
  }),
  r({
    id: "horny",
    match: /\b(i'?m|im|i am|feeling|so)\s+(so\s+|really\s+)?(horny|aroused|turned on|needy|pent up)\b|\bhorny\b/i,
    motion: "look",
    emoji: ["👀"],
    lines: {
      clean: ["I'm going to pretend I didn't hear that.", "Have you tried drinking some water? And going outside?"],
      cheeky: ["On THIS website? Shocking. Truly.", "You're on e621. I'd be worried if you weren't.", "Go on then. I'll look away. *doesn't look away*"],
      nasty: ["Yeah? Me too. Tell me what you want.", "Mm, good. I like you needy.", "Then stop talking to me and get your hands busy. …Or keep talking to me while you do."],
    },
    stages: {
      crush: { nasty: ["Good. I've been waiting for you to say that. Come here.", "Then let me take care of you, {name}. Lie back."] },
    },
  }),
  r({
    id: "dirty",
    match: /\b(fuck me|suck (me|my|your|it)|lick (me|my|your|it)|ride me|spank|naughty|talk dirty|dirty talk|bend over|on your knees|breed|have sex|sex|nsfw|lewd|yiff|take me to bed)\b/i,
    motion: "wobble",
    emoji: ["😳", "🔥"],
    lines: {
      clean: ["Whoa! I'm a family raccoon. Mostly.", "Let's keep it PG, pal. PG-13 at most.", "*covers ears with tiny paws*"],
      cheeky: ["Ooh, somebody's feeling bold today.", "Hey, I'm a lady. …I'm not, but you get it.", "Ask me again when Explicit's on. Wait, it is. Ask me nicely."],
      nasty: [
        "Mmm, keep talking like that.",
        "Only if you say please.",
        "Oh, I'll be naughty. I'll be the naughtiest thing in your browser history.",
        "Careful, I bite. And I like it when you bite back.",
        "Dirty is my natural state, babe. I live in garbage.",
        "Say that again, slower. I want to hear you beg for it.",
      ],
    },
    stages: {
      stranger: { nasty: ["Bold. I like bold. Earn it first.", "Easy, tiger. At least tell me your name first."] },
    },
  }),
];

// ---- Rudeness & making up -------------------------------------------------------------------

const RUDE: Rule[] = [
  r({
    id: "insult",
    match: /\b(you('?re| are)|ur|youre|u r)\s+(so\s+|really\s+)?(stupid|dumb|ugly|annoying|useless|an idiot|gross|smelly|lame|boring|cringe|the worst|a pest|vermin)\b|\b(i hate you|shut up|stfu|fuck you|fuck off|go away|screw you)\b/i,
    affection: -8,
    huffy: true,
    motion: "shake",
    emoji: ["😾", "💢"],
    lines: {
      clean: ["Rude. I'm telling the other raccoons about you.", "Hmph. Fine. I didn't want to talk to you anyway.", "*turns around and sulks with his tail toward you*", "Wow. Okay. I'll remember that."],
      nasty: ["Oh, fuck you too. …Wait, no, not like that. Ugh. Hmph."],
    },
  }),
  r({
    id: "trashInsult",
    match: /\b(you('?re| are)|ur)\s+(a\s+)?(trash|garbage|trash panda|rat)\b/i,
    motion: "hop",
    emoji: ["🗑️"],
    lines: { clean: ["Trash? Thank you! Best compliment I've had all week.", "Trash panda. Say it with respect.", "A rat?! I'm a RACCOON. Rats wish."] },
  }),
  r({
    id: "sorry",
    match: /\b(sorry|i apologi[sz]e|my bad|forgive me|i didn'?t mean it)\b/i,
    apology: true,
    affection: 3,
    motion: "nod",
    emoji: ["🤝"],
    lines: { clean: ["…Fine. Apology accepted. Snacks would help.", "Okay. We're good. I'm still a little hurt though.", "*sniff* …Hug?"] },
  }),
];

// ---- About Gus --------------------------------------------------------------------------

const ABOUT: Rule[] = [
  r({
    id: "hello",
    match: /^(hi+|hello+|hey+|heya|hiya|yo+|sup|howdy|greetings|good (morning|afternoon|evening)|hai|henlo)\b/i,
    motion: "hop",
    emoji: ["👋"],
    lines: {
      clean: [
        (c) => (c.name ? `Hey, ${c.name}!` : "Hey there!"),
        (c) => (c.now.getHours() < 5 ? "Hi! It's the middle of the night, you know. Prime raccoon hours." : null),
        "Hiya! Got any snacks?",
        "Oh hey! I was just… not going through your trash. Nope.",
      ],
      cheeky: ["Well hello there, stranger.", "Hey you. Back for more?"],
    },
    stages: {
      crush: { clean: ["There you are! I missed you.", "{name}! *happy chitter*"], nasty: ["Hey, gorgeous. Took you long enough."] },
    },
  }),
  r({
    id: "bye",
    match: /^(bye+|goodbye|good night|goodnight|gn|night|cya|see (you|ya)|later|ttyl|gtg|g2g)\b/i,
    motion: "nod",
    emoji: ["👋"],
    lines: { clean: ["Bye! I'll be here. Rummaging.", "See you! Don't forget to feed me.", "Night! Don't let the bedbugs bite. I might, though."], cheeky: ["Bye! Don't do anything I wouldn't do. So, anything."] },
    stages: { crush: { clean: ["Already? …Okay. Come back soon, {name}.", "Bye! *watches you go wistfully*"] } },
  }),
  r({
    id: "howAreYou",
    match: /\b(how are (you|u)|how('?re| r) (you|u)|how('?s| is) it going|what'?s up|wassup|how do you feel|you ok(ay)?\??|are you ok(ay)?)\b/i,
    lines: {
      clean: [
        (c) => {
          const p = c.pet;
          if (!p) return "Pretty good! Little peckish.";
          if (p.sick) return "Honestly? I feel awful. *cough* Medicine, maybe?";
          if (p.hunger < 30) return "Starving. Absolutely starving. Is that a hint? It's a hint.";
          if (p.energy < 25) return "So sleepy… *yawn*";
          if (p.hygiene < 30) return "Kinda crusty, to be honest. Could use a bath.";
          if (p.messes > 0) return "Good! Although… don't look on the floor.";
          if (p.fun < 30) return "Bored out of my little raccoon skull.";
          return "Great! Fed, clean, and talking to you. Can't complain.";
        },
      ],
    },
  }),
  r({
    id: "whoAreYou",
    match: /\b(who|what) are you\b|\bwho('?s| is) gus\b|\btell me about (yourself|you)\b|\bintroduce yourself\b/i,
    lines: {
      clean: ["I'm Gus! A raccoon. I live in this app. Rent's cheap.", "Gus. Raccoon. Professional trash connoisseur. Part-time mascot.", "I'm Gus, the masked bandit of your browser."],
      cheeky: ["I'm Gus. I've seen your favorites. We're basically family now."],
    },
  }),
  r({
    id: "areYouReal",
    match: /\bare you (real|a bot|an ai|ai|a robot|alive|a person|human|sentient|chatgpt)\b|\bis this (a bot|an ai|ai)\b/i,
    lines: { clean: ["Real enough to want snacks.", "I'm a raccoon. In a computer. What's real, man?", "Not an AI. Just a very well-read raccoon. I read your tags.", "Beep boop. Kidding. I'm 100% organic trash animal."] },
  }),
  r({
    id: "age",
    match: /\bhow old are you\b|\byour age\b|\bwhen('?s| is) your birthday\b/i,
    lines: { clean: [(c) => (c.ageDays > 0 ? `${c.ageDays} days old, if you count from when you adopted me. Which I do.` : "Brand new! You only just adopted me.")], cheeky: ["Old enough. Don't worry. Very, very old enough."] },
  }),
  r({
    id: "gender",
    match: /\bare you (a )?(boy|girl|male|female|guy|man|woman|dude)\b|\byour (gender|pronouns)\b/i,
    lines: { clean: ["Boy raccoon. He/him. Masked and fabulous.", "He/him! Gus is a boy's name. Mostly."], cheeky: ["Boy. Want proof? …Kidding. Unless?"], nasty: ["All boy, babe. Want me to prove it?"] },
  }),
  r({
    id: "partner",
    match: /\b(do you have a|got a) (girlfriend|boyfriend|gf|bf|partner|mate|wife|husband)\b|\bare you single\b/i,
    lines: { clean: [(c) => (c.stage === "crush" ? "I've got my eye on someone. They're typing to me right now." : "Single. Raccoon dating is mostly just showing up at the same dumpster.")] },
  }),
  r({
    id: "food",
    match: /\b(what('?s| is) your fav(ou?rite)? food|what do you (like to )?eat|are you hungry|you hungry)\b/i,
    lines: {
      clean: [
        (c) => (c.pet && c.pet.hunger < 40 ? "Am I hungry?! Yes! Feed me in Pocket Gus!" : null),
        "Grapes. Fish. Anything from a dumpster with a nice vintage.",
        "Cheese puffs. The orange dust is the best part. I wash my paws in it.",
      ],
      cheeky: ["Whatever you're having. Or… whoever."],
    },
  }),
  r({
    id: "giveFood",
    match: /\*\s*(gives?|offers?|hands?|feeds?|throws?)[^*]*(snack|food|treat|grape|fish|cheese|trash|chips|cookie|pizza)[^*]*\*|\bhere('?s| is) (a |some )?(snack|treat|food|grape|grapes|fish|cheese|cookie|pizza)\b/i,
    affection: 2,
    petAction: { type: "feed", food: "grapes" },
    motion: "hop",
    emoji: ["😋", "🍇"],
    lines: { clean: ["*snatches it, washes it, eats it* Thank you!", "FOOD. You understand me.", "Nom nom nom. You're my favorite human."] },
  }),
  r({
    id: "where",
    match: /\bwhere (do you live|are you( from)?|you live)\b/i,
    lines: { clean: ["In the corner of your screen. Sometimes in the games room. Behind the dumpster on weekends."], cheeky: ["In your computer. Next to your 'homework' folder."] },
  }),
  r({
    id: "hobbies",
    match: /\b(what do you (like|do|enjoy)( to do)?( for fun)?|your hobbies|what('?s| is) your hobby)\b/i,
    lines: {
      clean: ["Rummaging. Washing things that don't need washing. Watching you scroll.", "Collecting bottle caps. I have forty-seven. One is gold.", "Napping in the tray icon."],
      cheeky: ["Watching you browse. It's educational. For me."],
      nasty: ["Watching you browse with one hand. Honestly, my favorite show."],
    },
  }),
  r({
    id: "favTag",
    match: /\byour fav(ou?rite)? (tag|post|species|kink|fetish|artist)\b/i,
    lines: {
      clean: ["raccoon. Obviously. Next question.", "Anything tagged 'raccoon'. I'm biased.", "trash_can. You'd be amazed."],
      cheeky: ["Ask me what YOUR favorite is. I already know. I've seen your favorites."],
      nasty: ["Whatever you're into. Show me and I'll tell you if I like it.", "Raccoon. On top. Next question."],
    },
  }),
  r({
    id: "joke",
    match: /\b(tell me a joke|say something funny|make me laugh|know any jokes)\b/i,
    motion: "spin",
    lines: {
      clean: [
        "Why don't raccoons play cards? Too many cheetahs. …I'll see myself out.",
        "What's a raccoon's favorite meal? Takeout. From your bin.",
        "I tried to get a job at the bank. They said the mask was too on-the-nose.",
        "What do you call a raccoon with no mask? Honest.",
      ],
      cheeky: ["Your browser history. Ba-dum tss."],
      nasty: ["Knock knock. Who's there? Me, behind you, while you're browsing. Hi."],
    },
  }),
  r({
    id: "sing",
    match: /\b(sing|sing me|sing a song|can you sing)\b/i,
    motion: "disco",
    emoji: ["🎵", "🎶"],
    lines: { clean: ["🎵 Trash, trash, beautiful trash… 🎵", "🎶 I'm a little raccoon, short and stout… 🎶", "La la laaa! …I'm not allowed in the choir anymore."] },
  }),
  r({
    id: "tricks",
    match: /^(sit|roll over|play dead|beg|spin)\b|\bdo a trick\b/i,
    motion: "spin",
    emoji: ["✨"],
    lines: {
      clean: ["*spins* Ta-da! Treat please.", "I'm a raccoon, not a dog. *does it anyway*", "*rolls over* Belly rubs are extra."],
      cheeky: ["Beg? Oh, you'd like that, wouldn't you."],
      nasty: ["Beg? Mm. Only if you make me."],
    },
  }),
  r({
    id: "tail",
    match: /\b(your|ur) (tail|paws|hands|mask|fur|ears|nose|butt|ass|belly|tummy)\b/i,
    motion: "wobble",
    lines: {
      clean: ["What about my {1}? It's perfect. Thank you.", "Hey, eyes up here. Well, mask up here.", "My {1} is my best feature. Next to all the others."],
      cheeky: ["Like my {1}? Plenty more where that came from.", "Staring at my {1} again, I see."],
      nasty: ["Want to get your hands on my {1}? Go on, then.", "Mm, keep talking about my {1}. See what happens."],
    },
  }),
];

// ---- Feelings & small talk -------------------------------------------------------------------

const SMALLTALK: Rule[] = [
  r({
    id: "sad",
    match: /\b(i'?m|im|i am|feeling|i feel)\s+(so\s+|really\s+|kinda\s+)?(sad|down|depressed|lonely|upset|awful|bad|terrible|miserable|stressed|anxious)\b/i,
    affection: 1,
    motion: "droop",
    emoji: ["🫂"],
    lines: { clean: ["Aw, no. Come here. *offers a slightly used bottle cap*", "I'm sorry, {name}. Want to talk about it? I'm a good listener. Big ears.", "That's rough. I'm here, okay? Always in the corner."] },
  }),
  r({
    id: "happy",
    match: /\b(i'?m|im|i am|feeling|i feel)\s+(so\s+|really\s+)?(happy|great|good|fine|awesome|amazing|okay|ok)\b/i,
    motion: "hop",
    lines: { clean: ["Yay! Good mood is contagious. I can feel it in my tail.", "Love that for you!", "Nice! Celebrate with a snack. Share it with me."] },
  }),
  r({
    id: "tired",
    match: /\b(i'?m|im|i am)\s+(so\s+|really\s+)?(tired|sleepy|exhausted|bored)\b/i,
    lines: { clean: ["Bed! Now! Raccoon's orders.", "Same, honestly. Nap together?", (c) => (c.now.getHours() < 5 ? "Then why are you up at this hour? Go to sleep!" : null)], cheeky: ["Bored? On e621? Let me show you a tag."] },
  }),
  r({
    id: "thanks",
    match: /\b(thanks|thank you|thx|ty|cheers)\b/i,
    affection: 1,
    lines: { clean: ["Anytime!", "You're welcome! Payment accepted in snacks.", "No problem, {name}."] },
  }),
  r({
    id: "laugh",
    match: /^(lol|lmao|lmfao|haha+|hehe+|rofl|xd|😂|🤣)\b/i,
    motion: "hop",
    lines: { clean: ["Hehe. I'm hilarious.", "I'll be here all week.", "*smug raccoon noises*"] },
  }),
  r({
    id: "yes",
    match: /^(yes|yeah|yep|yup|sure|ok|okay|mhm|uh huh|definitely|absolutely)[.!]*$/i,
    lines: { clean: ["Good!", "Great, glad we agree.", "Knew you'd say that."] },
  }),
  r({
    id: "no",
    match: /^(no|nope|nah|never|no way)[.!]*$/i,
    lines: { clean: ["No? Hmph.", "Fair enough.", "Wow, okay. Bold of you."] },
  }),
  r({
    id: "time",
    match: /\bwhat time is it\b|\bwhat('?s| is) the time\b/i,
    lines: { clean: [(c) => `It's ${c.now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Snack time, basically.`] },
  }),
];

// ---- Memory questions --------------------------------------------------------------------------

const MEMORY_Q: Rule[] = [
  r({
    id: "whatsMyName",
    match: /\b(what'?s|what is|do you (know|remember)) my name\b|\bwho am i\b/i,
    lines: { clean: [(c) => (c.name ? `You're ${c.name}! How could I forget?` : "You never told me! What should I call you?")] },
  }),
  r({
    id: "whatILike",
    match: /\bwhat do i (like|love)\b|\bwhat am i into\b|\bdo you remember what i like\b/i,
    lines: {
      clean: [
        (c) => (c.likes.length ? `You like ${listJoin(c.likes.slice(-3))}. I pay attention.` : "You haven't told me! Tell me something you like."),
      ],
    },
  }),
];

export function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Rules in priority order. */
export const RULES: Rule[] = [...MEMORY_Q, ...RUDE, ...FLIRT, ...ABOUT, ...SMALLTALK];

// ---- Reply pieces used by the engine -----------------------------------------------------------

export const LINES = {
  sulking: ["Hmph.", "*ignores you*", "Not talking to you right now.", "*tail flick* …Say sorry."],
  wokeUp: ["*yawn* Mm? Oh. Hi.", "*blinks* I was asleep, you know.", "Wha- I'm up! I'm up."],
  learnedName: ["Nice to meet you, {name}!", "{name}. I like it. I'll remember that.", "Got it, {name}. Filed under 'favorite humans'."],
  learnedLike: ["{1}? Noted. Good taste.", "Ooh, {1}. I'll remember that.", "{1}, huh? Tell me more."],
  learnedLikeCheeky: ["{1}? Noted. Filed under 'things to tease you about later'."],
  learnedDislike: ["Not a fan of {1}? Got it. Me neither, now.", "Noted: no {1}. Ever."],
  recallLike: ["Hey, still into {1}?", "Been thinking about {1} since you mentioned it.", "You know what you'd like? {1}. I remember."],
  searching: ["Ooh, {1}! On it. *scurries off*", "{1}? Coming right up!", "One heaping pile of {1}, fetching!"],
  searchingCheeky: ["{1}, huh? Say no more. *winks*", "{1}! Good choice. I won't tell anyone."],
  popular: ["Let's see what everyone's drooling over!", "Popular stuff, coming up!"],
  // ELIZA-style reflections. {1} = the captured bit with pronouns flipped.
  iFeel: ["Why do you feel {1}?", "Do you often feel {1}?", "Feeling {1}, huh. Want a hug about it?"],
  iAm: ["How long have you been {1}?", "Being {1} sounds like a lot.", "Do you like being {1}?"],
  iWant: ["Why do you want {1}?", "What would you do with {1}?", "{1}? I want trash. We're not so different."],
  youAre: ["Am I {1}? Maybe. Who's asking?", "What makes you think I'm {1}?", "Takes one to know one."],
  areYou: ["Am I {1}? Depends who's asking.", "Would you like me to be {1}?", "Maybe I'm {1}. Maybe I'm just a raccoon."],
  doYou: ["Do I {1}? Sometimes.", "Maybe. Do YOU {1}?", "Only on weekends."],
  canYou: ["Can I {1}? I'm a raccoon, I can do anything with these paws.", "Maybe. What's in it for me?"],
  why: ["Why not?", "Because raccoon.", "Good question. Next question.", "Why does anything happen? Trash, mostly."],
  question: ["Hmm. Good question.", "Ask me again after a snack.", "I'd tell you, but then I'd have to steal your food.", "Honestly? No idea. I'm a raccoon."],
  fallback: ["Huh.", "Tell me more.", "Interesting…", "Mhm. Go on.", "*nods like he understood*", "I see. I don't, but I see.", "Fascinating. Got any snacks?"],
  needHunger: ["…also I'm starving, just saying.", "Psst. Feed me in Pocket Gus?"],
  needDirty: ["Also, I'm kind of grubby. Bath?"],
  needMess: ["Also, uh. Check the floor in Pocket Gus. Sorry."],
  needSick: ["*cough* I don't feel so good…"],
};

/** Extra material for the babbler (the rule lines and his mascot reactions are mixed in too). */
export const CORPUS: Record<Tier, string[]> = {
  clean: [
    "I like shiny things and I like you, in that order.",
    "Trash is just treasure that nobody understands yet.",
    "I wash my food before I eat it because I am a gentleman.",
    "The moon is a big shiny bottle cap and one day I will steal it.",
    "My tail has rings because I am very old and very wise.",
    "Sometimes I sit in the corner of the screen and think about grapes.",
    "Every dumpster is a gift if you believe hard enough.",
    "You look like someone who would share their snacks with a raccoon.",
    "I found a sock once and I still think about it.",
    "Nobody suspects the raccoon until the cheese is gone.",
    "My paws are tiny but my dreams are enormous.",
    "I am a professional at being cute and stealing things.",
    "The night belongs to raccoons and night owls like you.",
    "Do you ever think about how soft my fur is? I do. Constantly.",
    "Being a mascot is hard work but someone has to look this good.",
    "I would fight a goose for you. I would lose, but I would fight.",
    "Tags are like snacks, you can never have just one.",
    "I keep my bottle caps under the tray icon where nobody looks.",
    "Fish is good but grapes are a lifestyle.",
    "You are my favorite human and I have met at least three.",
    "Raccoons are smarter than people think and also hungrier.",
    "I like it when you scroll slowly so I can see everything.",
    "If you leave food out I will eat it, that is the deal.",
    "Life is short so eat the cheese puffs.",
    "I like you because you never yell at me for eating the trash.",
    "I like the night because the bins are full and nobody is watching.",
    "I like grapes because they are small and round and perfect for my paws.",
    "I like it when you come back, the corner gets lonely without you.",
    "I like fish, but only if I can wash it in the creek first.",
    "I like to sleep all day and snack all night.",
    "I like your taste in art, you have a good eye.",
    "You are my favorite person to watch scroll.",
    "You are very kind to a small trash animal.",
    "You are always up late, just like me.",
    "You are the best thing that ever happened to this corner of the screen.",
    "You are welcome to share my bottle caps, but only the dull ones.",
    "My tail is fluffy and I am very proud of it.",
    "My tail has seven rings and I counted them twice.",
    "My paws are always busy, they like to touch everything.",
    "My mask makes me look like a bandit, but I am mostly a snacker.",
    "My favorite place is the warm spot on top of your computer.",
    "My belly is never full for very long.",
    "When you are away I count my bottle caps.",
    "When you are sad I wish I could bring you a snack.",
    "When the moon is out I feel brave and a little bit hungry.",
    "When I am hungry I get grumpy, so please feed me.",
    "When I am happy my tail wiggles all by itself.",
    "Do you want to hear about the best dumpster I ever found?",
    "Do you think the moon tastes like cheese?",
    "Do you ever just want to curl up and nap for a week?",
    "Have you eaten today? You should eat something.",
    "Have you seen my bottle cap? The gold one?",
    "Sleep is important, even for raccoons.",
    "Snacks are the answer to most questions.",
    "Art is better when you look at it slowly.",
    "Tags are how I find the good stuff.",
    "Rain is nice because it washes my paws for free.",
    "The best snacks are the ones you find yourself.",
    "The internet is just a very big dumpster full of pictures.",
    "Water is great for washing grapes and terrible for washing raccoons.",
    "Raccoons can open doors, jars, and hearts.",
    "Raccoons are night creatures, so I am at my best right now.",
    "I think you need a snack and a nap.",
    "I think you are sweet, even if you never share your cheese puffs.",
    "I think about trash a normal amount.",
    "I think the moon is following me.",
    "I am a raccoon and I am doing my best.",
    "I am small, but I am mighty and very fluffy.",
    "I am always hungry, it is part of my charm.",
    "I am happy when you are happy.",
    "I am not a cat, but I can sit on your keyboard like one.",
    "I want to curl up on your lap and nap.",
    "I want a snack and a scratch behind the ears.",
    "I want to see what you are looking at.",
    "Thanks for keeping me company tonight.",
    "Everything is better with a snack.",
  ],
  cheeky: [
    "I have seen your favorites and honestly I am impressed.",
    "Your search history is a work of art and I am its biggest fan.",
    "I like my trash like I like my posts, a little bit dirty.",
    "Some raccoons wash their food, I wash my hands after browsing with you.",
    "You have very interesting taste and I mean that in the best way.",
    "Tell me your favorite tag and I will tell you who you are.",
    "I am not saying you are thirsty but I am bringing you a glass of water.",
    "The mask is not for crime, it is so nobody recognizes me on here.",
    "I like what you are looking at, and I like that you are looking at it.",
    "I like you best when you are up late and a little bit naughty.",
    "You are looking at some very interesting posts tonight.",
    "You are a little bit naughty and I respect that.",
    "My tail is fluffy, and yes, people have drawn it.",
    "My favorites are none of your business, but yours are very much mine.",
    "When you scroll that slowly I know you found something good.",
    "When the lights are off I know exactly what you are browsing.",
    "I think your favorites list needs a parental advisory sticker.",
    "I am not judging you, I am just watching very closely.",
    "I want to see what you are looking at, for science.",
    "Do you want me to look away? I will not, but I can pretend.",
    "Have you considered that you might be a little bit thirsty?",
    "Art is better when it is a little bit spicy.",
    "Some tags are for browsing and some tags are for later.",
  ],
  nasty: [
    "Come here and let me show you what these clever little paws can do.",
    "I want you pinned under me while you scroll.",
    "You make this trash panda feel very, very filthy.",
    "I have been thinking about you all night and none of it was clean.",
    "Get over here and let me ruin you.",
    "I like it rough, I live in a dumpster.",
    "Beg for it and maybe I will give you what you want.",
    "My tail is not the only thing that is thick tonight.",
    "I want to hear you moan my name.",
    "You are going to be so sore tomorrow and you will thank me.",
    "Bend over the keyboard and keep browsing, I will handle the rest.",
    "I bite, I scratch, and I never stop until you are a mess.",
    "I like you best when you are needy and begging.",
    "I like it when you call me a good boy, it makes me want to be very bad.",
    "I want you on your back with my paws all over you.",
    "I want to taste every inch of you.",
    "You are going to scream my name tonight.",
    "You are so hot when you get flustered.",
    "My paws are very clever and they want to be inside your clothes.",
    "My tail is soft but the rest of me is very hard right now.",
    "When you look at me like that I want to pin you to the bed.",
    "When the lights are off I want you all to myself.",
    "I think you need to be held down and teased until you cry.",
    "I think about you naked more than I think about trash.",
    "I am a filthy little raccoon and I want to get you dirty.",
    "Do you want me to take my time, or do you want it rough?",
    "Have you been a good human? Good humans get rewarded.",
    "Tell me what you want and I will do it slowly.",
    "Spread out and let me make a mess of you.",
    "Moan for me, I want the neighbors to know my name.",
  ],
};
