import { SPICY_LINES } from "./mascotSpicy";
import type { MascotMode, MascotTalk } from "../state/settingsStore";

/** The raccoon's name - from monosodium **g**l**u**tamate. Used in Settings, the hide pill, the
 *  easter egg card and his own lines. */
export const MASCOT_NAME = "Gus";

/** Everything the raccoon can react to. Fired via `useMascotStore.getState().react(kind)`. */
export type ReactionKind =
  | "pet"
  | "favorite"
  | "unfavorite"
  | "upvote"
  | "downvote"
  | "download"
  | "unknownTag"
  | "endOfResults"
  | "emptySearch"
  | "milestone"
  | "dizzy"
  | "yawn"
  | "sweat"
  | "dmail"
  | "wake"
  | "gameRight"
  | "gameWrong"
  | "gameWin"
  | "gameLose"
  | "queasy"
  | "peekaboo"
  | "robot"
  | "homeSite"
  | "dice"
  | "selfie"
  | "squint"
  | "bigThumbs"
  | "blacklistAdd"
  | "savedSearch"
  | "holiday"
  // browsing
  | "longScroll"
  | "deepSearch"
  | "rocket"
  | "juggle"
  | "refresh"
  | "layoutMasonry"
  | "layoutUniform"
  // what's searched
  | "hiss"
  | "wag"
  | "cower"
  | "topScore"
  | "archive"
  | "longQuery"
  | "unicorn"
  | "ownFavs"
  // post interactions
  | "popularFav"
  | "boldChoice"
  | "favStreak"
  | "downloadBatch"
  | "copy"
  | "shinyFav"
  // time / habits / app
  | "stretchBreak"
  | "morning"
  | "weekend"
  | "missedYou"
  | "updateAvailable"
  | "perkUp"
  // him
  | "flustered"
  | "annoyed"
  | "manhandled"
  | "restored"
  | "fidget"
  | "disco"
  // dashboard
  | "dashComment"
  | "analysisDone"
  // the cooter easter egg - the card is Procione (the owner's character), Gus just reacts to it
  | "eggSpotted"
  | "eggClosed"
  // first pet ever
  | "intro"
  // batch 4: searches
  | "kinkMuscle"
  | "kinkThicc"
  | "kinkPaws"
  | "kinkMacro"
  | "kinkFeral"
  | "kinkGroup"
  | "ratingExplicit"
  | "ratingSafe"
  | "gusSearch"
  | "procioneSearch"
  | "snoopFavs"
  | "uploaderStalk"
  | "poolRead"
  | "picky"
  // batch 4: behaviour
  | "voteStreak"
  | "lingerHover"
  | "lingered"
  | "quickHide"
  | "adultOn"
  | "adultOff"
  | "wipeSeen"
  | "wipeStats"
  // typing the magic word
  | "eggClose";

/** CSS motion (`.mascot-m-<name>` in index.css) - all whole-image transforms of mascot.png. */
export type MascotMotion =
  | "hop" | "nod" | "tilt" | "shake" | "wobble" | "shrug" | "droop" | "jitter" | "stretch" | "spin" | "disco" | "look";

export interface ReactionDef {
  motion: MascotMotion;
  /** Emoji released into the live-stream-style feed - each particle picks one at random, so a
   *  list mixes the burst. Empty = no feed. `react(kind, { emoji })` overrides per call. */
  emoji: string[];
  durationMs: number;
  /** Min gap before this same kind plays again (companion mode; cameos use at least CAMEO_COOLDOWN_MS). */
  cooldownMs: number;
  /** Frequent, low-stakes - skipped entirely in cameo mode, never talks. */
  minor: boolean;
  /** Higher interrupts lower; equal-or-lower is dropped while something plays. */
  priority: number;
  /** How many emoji float up (default 4). */
  burst?: number;
  /** Speech-bubble candidates (empty = never talks for this kind). `{name}` fills from vars. */
  lines: string[];
  /** Rare by nature - skips the 50% speech roll (the gap still applies). */
  alwaysTalks?: boolean;
  /** Asked-for commentary (Dashboard) - ignores the speech gap too. */
  ignoreGap?: boolean;
  /** Reserved: a pose image to swap in for this reaction, if pose art ever exists. */
  pose?: string;
}

export const REACTIONS: Record<ReactionKind, ReactionDef> = {
  pet: { motion: "hop", emoji: ["❤️", "🥰"], durationMs: 900, cooldownMs: 0, minor: true, priority: 1, lines: ["Hehe.", "Right behind the ears. Perfect.", "More of that, please."] },
  favorite: { motion: "hop", emoji: ["❤️", "💖", "😍"], durationMs: 1000, cooldownMs: 4000, minor: true, priority: 1, lines: ["Ooh, good one.", "Saved! Good taste.", "Into the favorites it goes."] },
  unfavorite: { motion: "droop", emoji: ["💔"], durationMs: 1000, cooldownMs: 4000, minor: true, priority: 1, burst: 2, lines: ["Changed your mind?", "Out it goes.", "Breaking up already?"] },
  upvote: { motion: "nod", emoji: ["👍", "⬆️"], durationMs: 900, cooldownMs: 4000, minor: true, priority: 1, lines: ["Agreed!", "Good call.", "Deserved."] },
  downvote: { motion: "tilt", emoji: ["👎", "😒"], durationMs: 900, cooldownMs: 4000, minor: true, priority: 1, lines: ["Harsh.", "Ouch.", "Not your thing, huh?"] },
  download: { motion: "hop", emoji: ["📥", "✅"], durationMs: 1000, cooldownMs: 6000, minor: true, priority: 1, lines: ["Saved to disk!", "Got it.", "Downloaded."] },
  unknownTag: {
    motion: "tilt", emoji: ["❓", "🤔"], durationMs: 1800, cooldownMs: 10_000, minor: false, priority: 2,
    lines: ["Hmm, never heard of that one.", "Is that spelled right?", "That's not a tag I know."],
  },
  emptySearch: {
    motion: "droop", emoji: ["😢", "🫥"], durationMs: 1800, cooldownMs: 10_000, minor: false, priority: 2,
    lines: ["Nothing here…", "Came up empty.", "Not a single one."],
  },
  endOfResults: {
    motion: "shrug", emoji: ["🤷", "✨"], durationMs: 1600, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["That's everything!", "You've reached the bottom.", "All caught up."],
  },
  dizzy: {
    motion: "wobble", emoji: ["😵‍💫", "💫"], durationMs: 1400, cooldownMs: 45_000, minor: false, priority: 2,
    lines: ["Whoa, slow down…", "Everything's spinning."],
  },
  yawn: {
    motion: "stretch", emoji: ["🥱", "🌙"], durationMs: 2000, cooldownMs: 6 * 3600_000, minor: false, priority: 2,
    lines: ["Bit late, isn't it?", "*yawn* Still up?"],
  },
  sweat: {
    motion: "jitter", emoji: ["💦", "😰"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Whoa, slow down - e621 needs a breather.", "Uh oh, can't reach the site."],
  },
  dmail: {
    motion: "hop", emoji: ["💌", "📬"], durationMs: 2000, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Mail for you!", "You've got a message."],
  },
  milestone: {
    motion: "hop", emoji: ["🎉", "🥳", "💖"], durationMs: 2400, cooldownMs: 0, minor: false, priority: 4, burst: 7,
    lines: ["{count} favorites?! Impressive.", "That's {count} favorites!"], alwaysTalks: true,
  },
  wake: { motion: "shake", emoji: [], durationMs: 500, cooldownMs: 0, minor: true, priority: 0, lines: [] },

  // Games: per-round right/wrong are minor (companion only, never talk); a finished run isn't.
  // No cooldown - every round should get its reaction.
  gameRight: { motion: "hop", emoji: ["😄", "👏", "✨"], durationMs: 1000, cooldownMs: 0, minor: true, priority: 2, lines: ["Correct!", "Nice!", "Got it!"] },
  gameWrong: { motion: "shake", emoji: ["😡", "💢"], durationMs: 1000, cooldownMs: 0, minor: true, priority: 2, lines: ["Nope!", "Wrong!", "Argh!"] },
  gameWin: {
    motion: "hop", emoji: ["🎉", "🏆", "🥳"], durationMs: 2400, cooldownMs: 0, minor: false, priority: 4, burst: 7,
    lines: ["Nailed it!", "Champion!", "Look at you go!"],
  },
  gameLose: {
    motion: "droop", emoji: ["😢", "💧"], durationMs: 1800, cooldownMs: 0, minor: false, priority: 3,
    lines: ["Aw, next time.", "Rough one.", "Shake it off!"],
  },

  // Browsing toggles - all things done from the grid, where he can actually be seen.
  queasy: {
    motion: "wobble", emoji: ["🤮", "🤢"], durationMs: 1600, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["Ugh, I didn't need to see that.", "My stomach…", "You sure about this?"],
  },
  peekaboo: { motion: "shrug", emoji: ["🙈"], durationMs: 1200, cooldownMs: 20_000, minor: true, priority: 1, burst: 3, lines: ["Hiding what you've seen."] },
  robot: {
    motion: "jitter", emoji: ["🤖", "⚙️"], durationMs: 1400, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["Beep boop.", "Welcome to the machine."],
  },
  homeSite: { motion: "nod", emoji: ["🦊", "🐺", "🐾"], durationMs: 1000, cooldownMs: 30_000, minor: true, priority: 1, lines: ["Home sweet home."] },
  dice: {
    motion: "wobble", emoji: ["🎲"], durationMs: 1200, cooldownMs: 30_000, minor: false, priority: 2, burst: 3,
    lines: ["Feeling lucky?", "Let's roll!"],
  },
  selfie: {
    motion: "hop", emoji: ["🦝", "😎", "💕"], durationMs: 2000, cooldownMs: 60_000, minor: false, priority: 3, burst: 6,
    lines: ["Hey, that's me!", "Raccoons? Excellent taste."], alwaysTalks: true,
  },
  squint: { motion: "tilt", emoji: ["🧐", "🔍"], durationMs: 1200, cooldownMs: 30_000, minor: true, priority: 1, lines: ["Tiny! I can barely see them."] },
  bigThumbs: { motion: "stretch", emoji: ["😲", "🖼️"], durationMs: 1200, cooldownMs: 30_000, minor: true, priority: 1, lines: ["Big pictures!"] },
  blacklistAdd: { motion: "shake", emoji: ["🚫", "👋"], durationMs: 1000, cooldownMs: 10_000, minor: true, priority: 1, lines: ["Blacklisted. Begone!", "Never again."] },
  savedSearch: { motion: "nod", emoji: ["🔖", "⭐"], durationMs: 1000, cooldownMs: 5000, minor: true, priority: 1, lines: ["Saved for later."] },
  holiday: {
    motion: "hop", emoji: ["🎉"], durationMs: 2000, cooldownMs: 6 * 3600_000, minor: false, priority: 2, burst: 6,
    lines: ["{greeting}"], alwaysTalks: true,
  },

  // --- Browsing ---
  longScroll: {
    motion: "shrug", emoji: ["😅", "💦"], durationMs: 1600, cooldownMs: 0, minor: false, priority: 2,
    lines: ["Still going?", "That's a lot of scrolling.", "Your thumb okay?"],
  },
  deepSearch: {
    motion: "look", emoji: ["🗺️", "🧭"], durationMs: 1800, cooldownMs: 0, minor: false, priority: 2,
    lines: ["We're deep in now.", "Page twenty… where are we?"],
  },
  rocket: { motion: "hop", emoji: ["🚀"], durationMs: 1000, cooldownMs: 8000, minor: true, priority: 1, burst: 3, lines: ["Back to the top!", "Wheee!"] },
  juggle: {
    motion: "wobble", emoji: ["🤹", "🗂️"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["So many tabs…", "I can only juggle so much."],
  },
  refresh: { motion: "spin", emoji: ["🔄"], durationMs: 900, cooldownMs: 10_000, minor: true, priority: 1, burst: 2, lines: ["Fresh posts!", "Refreshing…"] },
  layoutMasonry: { motion: "nod", emoji: ["🧱"], durationMs: 900, cooldownMs: 5000, minor: true, priority: 1, burst: 3, lines: ["Masonry mode. Classy."] },
  layoutUniform: { motion: "nod", emoji: ["📐"], durationMs: 900, cooldownMs: 5000, minor: true, priority: 1, burst: 3, lines: ["Neat little squares."] },

  // --- What's searched ---
  hiss: {
    motion: "jitter", emoji: ["🙀", "😾"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Hsss! Cats.", "I don't trust cats."],
  },
  wag: {
    motion: "wobble", emoji: ["🐶", "🦴"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Good dogs!", "Who's a good boy?"],
  },
  cower: {
    motion: "droop", emoji: ["🐉", "😨"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["D-dragons? I'll wait here.", "Don't let them see me."],
  },
  topScore: {
    motion: "nod", emoji: ["🏆", "⭐"], durationMs: 1200, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Only the best.", "Cream of the crop."],
  },
  archive: {
    motion: "look", emoji: ["🦖", "📜"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Digging through the archives.", "Ancient history!"],
  },
  longQuery: {
    motion: "tilt", emoji: ["🧠", "💦"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["That's a lot of tags.", "Very specific. I respect it."],
  },
  unicorn: {
    motion: "hop", emoji: ["🦄", "✨"], durationMs: 1600, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["One of a kind!", "Just the one. Lucky find."],
  },
  ownFavs: {
    motion: "hop", emoji: ["💕", "📚"], durationMs: 1400, cooldownMs: 120_000, minor: false, priority: 2,
    lines: ["Ah, the classics.", "Revisiting old friends?"],
  },

  // --- Post interactions ---
  popularFav: { motion: "hop", emoji: ["⭐", "❤️", "🌟"], durationMs: 1200, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["Everyone loves this one.", "A crowd favorite!"] },
  boldChoice: {
    motion: "tilt", emoji: ["🤨"], durationMs: 1200, cooldownMs: 30_000, minor: false, priority: 2, burst: 3,
    lines: ["Bold choice.", "Going against the crowd, huh?"],
  },
  favStreak: {
    motion: "hop", emoji: ["🔥", "❤️‍🔥"], durationMs: 1600, cooldownMs: 120_000, minor: false, priority: 3, burst: 6,
    lines: ["You're on a roll!", "Hearts everywhere!"],
  },
  downloadBatch: {
    motion: "hop", emoji: ["📦", "✨"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2, burst: 5,
    lines: ["All saved!", "That's a haul."],
  },
  copy: { motion: "nod", emoji: ["📋"], durationMs: 800, cooldownMs: 5000, minor: true, priority: 1, burst: 2, lines: ["Copied!", "On the clipboard."] },
  shinyFav: {
    motion: "hop", emoji: ["✨", "🌟", "💛"], durationMs: 2200, cooldownMs: 0, minor: false, priority: 4, burst: 9,
    lines: ["✨ Shiny! ✨", "Ooh, a golden one!"], alwaysTalks: true,
  },

  // --- Time / habits / the app ---
  stretchBreak: {
    motion: "stretch", emoji: ["🧘", "🌿"], durationMs: 2000, cooldownMs: 12 * 3600_000, minor: false, priority: 2,
    lines: ["Maybe stretch your legs?", "Two hours! Water break?"], alwaysTalks: true,
  },
  morning: {
    motion: "stretch", emoji: ["☕", "🌅"], durationMs: 1800, cooldownMs: 6 * 3600_000, minor: false, priority: 2,
    lines: ["Morning!", "Coffee first."],
  },
  weekend: {
    motion: "shrug", emoji: ["🛋️", "😌"], durationMs: 1600, cooldownMs: 6 * 3600_000, minor: false, priority: 2,
    lines: ["Weekend vibes.", "No plans? Perfect."],
  },
  missedYou: {
    motion: "hop", emoji: ["👋", "🥹"], durationMs: 2000, cooldownMs: 6 * 3600_000, minor: false, priority: 3, burst: 5,
    lines: ["Missed you!", "Long time no see!"], alwaysTalks: true,
  },
  updateAvailable: {
    motion: "hop", emoji: ["🎁", "✨"], durationMs: 1600, cooldownMs: 3600_000, minor: false, priority: 3,
    lines: ["Something new for you!", "Ooh, an update!"], alwaysTalks: true,
  },
  perkUp: { motion: "look", emoji: ["👀"], durationMs: 1000, cooldownMs: 30 * 60_000, minor: true, priority: 1, burst: 2, lines: ["Oh! You're back."] },

  // --- Him ---
  flustered: {
    motion: "wobble", emoji: ["😳", "💕"], durationMs: 1400, cooldownMs: 15_000, minor: false, priority: 2, burst: 5,
    lines: ["H-hey, that tickles!", "Okay okay, I get it!"],
  },
  annoyed: {
    motion: "shake", emoji: ["😤", "💢"], durationMs: 1400, cooldownMs: 0, minor: false, priority: 3,
    lines: ["Enough! No more pets.", "Hands off for a minute."], alwaysTalks: true,
  },
  manhandled: {
    motion: "wobble", emoji: ["🥴", "💫"], durationMs: 1400, cooldownMs: 30_000, minor: false, priority: 2,
    lines: ["Put me down!", "I'm getting motion sick."],
  },
  restored: {
    motion: "hop", emoji: ["🥺", "💖"], durationMs: 1400, cooldownMs: 0, minor: false, priority: 3,
    lines: ["I'm back!", "Thanks for bringing me back."], alwaysTalks: true,
  },
  fidget: { motion: "look", emoji: [], durationMs: 1600, cooldownMs: 0, minor: true, priority: 0, lines: [] },
  disco: {
    motion: "disco", emoji: ["🪩", "🕺", "🎶", "✨"], durationMs: 5000, cooldownMs: 0, minor: false, priority: 5, burst: 10,
    lines: ["Let's dance!", "♪ Night fever ♪"], alwaysTalks: true,
  },

  // --- Dashboard: the line comes from lib/mascotDashboard.ts via vars.line ---
  dashComment: {
    motion: "nod", emoji: ["💭"], durationMs: 2600, cooldownMs: 0, minor: false, priority: 2, burst: 2,
    lines: ["{line}"], alwaysTalks: true, ignoreGap: true,
  },
  analysisDone: {
    motion: "hop", emoji: ["📊", "✨", "🧮"], durationMs: 2600, cooldownMs: 0, minor: false, priority: 3, burst: 5,
    lines: ["{line}"], alwaysTalks: true, ignoreGap: true,
  },
  eggSpotted: {
    motion: "jitter", emoji: ["😳", "🫣", "🙈"], durationMs: 2200, cooldownMs: 0, minor: false, priority: 4, burst: 6,
    lines: ["Whoa! Is that Procione?!", "Procione! Put some clothes on!", "Don't tell Procione I saw that.", "Cover your eyes! …Okay, peek."],
    alwaysTalks: true, ignoreGap: true,
  },
  intro: {
    motion: "hop", emoji: ["👋", "🦝"], durationMs: 2400, cooldownMs: 0, minor: false, priority: 3, burst: 3,
    lines: ["Hi, I'm Gus! Nice to meet you."], alwaysTalks: true, ignoreGap: true,
  },
  eggClosed: {
    motion: "droop", emoji: ["😶", "🤐"], durationMs: 2000, cooldownMs: 0, minor: false, priority: 4, burst: 3,
    lines: ["We never speak of this.", "That never happened.", "Delete your browser history."],
    alwaysTalks: true, ignoreGap: true,
  },
  // --- Batch 4: what's searched ---
  kinkMuscle: {
    motion: "hop", emoji: ["💪", "🔥"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Muscles! Somebody's been working out.", "Gains! Very impressive gains."],
  },
  kinkThicc: {
    motion: "wobble", emoji: ["🍑", "😮"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Thicc. That's the technical term.", "Extra cushion for… comfort."],
  },
  kinkPaws: {
    motion: "tilt", emoji: ["🐾", "👀"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Paws, huh? I have paws too, you know.", "Toe beans! Adorable."],
  },
  kinkMacro: {
    motion: "stretch", emoji: ["🏙️", "😲"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Big ones! Like, building-sized.", "Size difference. A classic."],
  },
  kinkFeral: {
    motion: "jitter", emoji: ["🐺", "🌲"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Going feral! Wild.", "Back to nature."],
  },
  kinkGroup: {
    motion: "wobble", emoji: ["👥", "😳"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["A crowd! The more the merrier, I guess.", "That's a lot of characters to keep track of."],
  },
  ratingExplicit: {
    motion: "nod", emoji: ["🔞", "😏"], durationMs: 1200, cooldownMs: 120_000, minor: false, priority: 2,
    lines: ["Explicit only. Straight to the point.", "No beating around the bush."],
  },
  ratingSafe: {
    motion: "shrug", emoji: ["😇", "🧸"], durationMs: 1200, cooldownMs: 120_000, minor: false, priority: 2,
    lines: ["Safe only? Wholesome browsing. Nice.", "Keeping it clean today."],
  },
  gusSearch: {
    motion: "hop", emoji: ["🦝", "❓"], durationMs: 1800, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Searching for me? I'm right here!", "There's art of me?! …Wait, don't show me."],
    alwaysTalks: true,
  },
  procioneSearch: {
    motion: "hop", emoji: ["🦝", "💙"], durationMs: 1800, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Looking for Procione? Good taste.", "Ah, the boss's character."], alwaysTalks: true,
  },
  snoopFavs: {
    motion: "look", emoji: ["👀", "🕵️"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Snooping through someone else's favorites? 👀", "Checking out their taste, huh?"],
  },
  uploaderStalk: {
    motion: "look", emoji: ["🔍", "🕵️"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Everything one uploader posted? Big fan.", "Following an uploader. Dedicated."],
  },
  poolRead: {
    motion: "nod", emoji: ["📖", "🍿"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["A whole pool! Reading for the story?", "Comic time. Grab some snacks."],
  },
  picky: {
    motion: "tilt", emoji: ["🙅", "🧐"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["That's a lot of things you DON'T want.", "Picky! I respect a person with standards."],
  },

  // --- Batch 4: behaviour ---
  voteStreak: {
    motion: "nod", emoji: ["🗳️", "👍"], durationMs: 1400, cooldownMs: 120_000, minor: false, priority: 2,
    lines: ["Voting spree! Civic duty.", "Judge, jury and upvoter."],
  },
  lingerHover: {
    motion: "look", emoji: ["👀"], durationMs: 1200, cooldownMs: 90_000, minor: false, priority: 1, burst: 2,
    lines: ["Just gonna stare at it? Click it!", "You've been hovering a while there."],
  },
  lingered: {
    motion: "tilt", emoji: ["👀", "⏱️"], durationMs: 1600, cooldownMs: 120_000, minor: false, priority: 2,
    lines: ["You stared at that one for a while.", "That post really held your attention."],
  },
  quickHide: {
    motion: "jitter", emoji: ["😳", "🚪"], durationMs: 1600, cooldownMs: 10 * 60_000, minor: false, priority: 3,
    lines: ["Someone walk in? 👀", "Coast clear?", "Phew. That was close."],
  },
  adultOn: {
    motion: "hop", emoji: ["🔞", "😏"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Adult mode! Oh, it's THAT kind of night.", "Grown-up mode engaged."], alwaysTalks: true,
  },
  adultOff: {
    motion: "shrug", emoji: ["😇"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Safe mode. Somebody's at work.", "Back to vanilla."],
  },
  wipeSeen: {
    motion: "shake", emoji: ["🧹", "🫣"], durationMs: 1400, cooldownMs: 60_000, minor: false, priority: 2,
    lines: ["Seen history wiped. Fresh start!", "Forgetting what you've seen? Lucky."],
  },
  eggClose: {
    motion: "hop", emoji: ["👀", "🥵"], durationMs: 1800, cooldownMs: 20_000, minor: false, priority: 3, burst: 3,
    lines: ["Ooh! You're getting close!"], alwaysTalks: true, ignoreGap: true,
  },
  wipeStats: {
    motion: "droop", emoji: ["🗑️", "😶"], durationMs: 1600, cooldownMs: 60_000, minor: false, priority: 3,
    lines: ["Stats reset. Destroying the evidence?", "All my hard counting… gone."], alwaysTalks: true,
  },
};

/** Odds that a favorite is a ✨shiny✨ one. */
export const SHINY_ODDS = 1 / 500;
export const POPULAR_FAV_COUNT = 2000;
export const LONG_SCROLL_POSTS = 500;
export const DEEP_SEARCH_PAGE = 20;
export const TAB_SPREE = 4;
export const LONG_QUERY_TERMS = 8;
export const LONG_SESSION_MS = 2 * 3600_000;
export const AWAY_PERK_MS = 30 * 60_000;
export const MISSED_YOU_MS = 7 * 24 * 3600_000;
export const FAV_STREAK = { count: 5, windowMs: 60_000 };
export const DOWNLOAD_BATCH = { count: 5, windowMs: 30_000 };
export const DRAG_SPREE = { count: 3, windowMs: 20_000 };
/** Ambient fidget: after this long with no reaction (while awake), occasionally look around. */
export const FIDGET_AFTER_MS = 20 * 60_000;
export const ANNOYED_REFUSE_MS = 60_000;
export const VOTE_STREAK = { count: 6, windowMs: 60_000 };
/** Hovering one thumbnail this long without opening it. */
export const LINGER_HOVER_MS = 6000;
/** Spending this long on a single post in the viewer. */
export const LINGER_VIEW_MS = 90_000;
/** Window hidden then shown again within this range - minimised in a hurry. */
export const QUICK_HIDE = { minMs: 2000, maxMs: 60_000 };
export const PICKY_NEGATIONS = 3;
export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** Kink-ish tags -> reaction (after species, before ordering). */
export const KINK_REACTIONS: [Set<string>, ReactionKind][] = [
  [new Set(["muscular", "muscular_male", "muscular_female", "muscular_anthro", "abs", "biceps"]), "kinkMuscle"],
  [new Set(["overweight", "chubby", "thick_thighs", "big_butt", "wide_hips", "slightly_chubby"]), "kinkThicc"],
  [new Set(["feet", "foot_focus", "paws", "pawpads", "foot_fetish", "soles"]), "kinkPaws"],
  [new Set(["macro", "micro", "size_difference", "giant", "hyper"]), "kinkMacro"],
  [new Set(["feral", "feral_on_feral", "feral_on_anthro"]), "kinkFeral"],
  [new Set(["group_sex", "threesome", "orgy", "foursome", "group"]), "kinkGroup"],
];

/** Species tags -> reaction, checked against the query's plain terms. */
export const SPECIES_REACTIONS: [Set<string>, ReactionKind][] = [
  [new Set(["raccoon", "procyonid", "raccoon_humanoid"]), "selfie"],
  [new Set(["cat", "felid", "feline", "domestic_cat"]), "hiss"],
  [new Set(["dog", "canis", "domestic_dog"]), "wag"],
  [new Set(["dragon", "western_dragon", "eastern_dragon", "wyvern"]), "cower"],
];

/** What a search says about itself - species first (most specific), then ordering, then size. */
export function queryReaction(query: string, ownName: string | null): ReactionKind | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const plain = terms.map((t) => t.replace(/^~/, ""));
  if (plain.includes("gus")) return "gusSearch";
  if (plain.some((t) => t === "procione" || t.startsWith("procione_"))) return "procioneSearch";
  for (const [tags, kind] of SPECIES_REACTIONS) if (plain.some((t) => tags.has(t))) return kind;
  for (const [tags, kind] of KINK_REACTIONS) if (plain.some((t) => tags.has(t))) return kind;
  const favOf = plain.find((t) => t.startsWith("fav:"))?.slice(4);
  if (favOf && ownName && favOf === ownName.toLowerCase()) return "ownFavs";
  if (favOf) return "snoopFavs";
  if (plain.some((t) => t.startsWith("user:"))) return "uploaderStalk";
  if (plain.some((t) => t.startsWith("pool:"))) return "poolRead";
  if (plain.some((t) => t === "rating:e" || t === "rating:explicit")) return "ratingExplicit";
  if (plain.some((t) => t === "rating:s" || t === "rating:safe")) return "ratingSafe";
  if (plain.includes("order:random")) return "dice";
  if (plain.includes("order:score")) return "topScore";
  if (plain.includes("order:id") || plain.includes("order:id_asc")) return "archive";
  if (terms.filter((t) => t.startsWith("-")).length >= PICKY_NEGATIONS) return "picky";
  if (terms.length >= LONG_QUERY_TERMS) return "longQuery";
  return null;
}

/** Count of timestamps inside the trailing window. */
export function countRecent(stamps: number[], now: number, windowMs: number): number {
  return stamps.filter((t) => now - t < windowMs).length;
}

/** Petting combos: 5 pets in 3s gets him flustered, 15 in 10s annoyed. */
export function petReaction(stamps: number[], now: number): "pet" | "flustered" | "annoyed" {
  if (countRecent(stamps, now, 10_000) >= 15) return "annoyed";
  if (countRecent(stamps, now, 3000) >= 5) return "flustered";
  return "pet";
}

/** The one greeting to play at launch, most special first. `lastLaunch` from the previous run. */
export function launchGreeting(
  now: Date,
  lastLaunch: number | null,
): { kind: ReactionKind; vars?: Record<string, string> } | null {
  const holiday = holidayFor(now);
  if (holiday) return { kind: "holiday", vars: holiday };
  if (lastLaunch != null && now.getTime() - lastLaunch >= MISSED_YOU_MS) return { kind: "missedYou" };
  if (isLateNight(now)) return { kind: "yawn" };
  const h = now.getHours();
  if (h >= 5 && h < 11) return { kind: "morning" };
  const day = now.getDay();
  if (day === 0 || day === 6) return { kind: "weekend" };
  return null;
}

/** Seasonal launch greeting, or null on an ordinary day. */
export function holidayFor(date: Date): { emoji: string; greeting: string } | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 10 && d === 31) return { emoji: "🎃", greeting: "Happy Halloween!" };
  if (m === 12 && (d === 24 || d === 25)) return { emoji: "🎄", greeting: "Merry Christmas!" };
  if (m === 12 && d === 31) return { emoji: "🎆", greeting: "Happy New Year's Eve!" };
  if (m === 1 && d === 1) return { emoji: "🎆", greeting: "Happy New Year!" };
  if (m === 2 && d === 14) return { emoji: "💘", greeting: "Happy Valentine's Day!" };
  if (m === 4 && d === 1) return { emoji: "🃏", greeting: "Don't trust anything today." };
  if (m === 7 && d === 1) return { emoji: "🦝", greeting: "It's Raccoon Appreciation Day!" };
  if (m === 2 && d === 5) return { emoji: "🎂", greeting: "It's my birthday!" };
  return null;
}

export const CAMEO_COOLDOWN_MS = 60_000;
/** Per-talkativeness speech limits: the gap between lines and the chance a line is spoken, for
 *  regular reactions and for the frequent "minor" ones (favorite, vote, pet…). */
export const TALK_TUNING: Record<Exclude<MascotTalk, "never">, { gapMs: number; chance: number; minorGapMs: number; minorChance: number }> = {
  sometimes: { gapMs: 3 * 60_000, chance: 0.5, minorGapMs: Infinity, minorChance: 0 },
  chatty: { gapMs: 90_000, chance: 1, minorGapMs: 20_000, minorChance: 0.35 },
  always: { gapMs: 0, chance: 1, minorGapMs: 0, minorChance: 1 },
};
/** Speech is rare: at most one line in this window, and only half the eligible times. */
export const SPEECH_GAP_MS = 3 * 60_000;
export const SPEECH_CHANCE = 0.5;
export const IDLE_SLEEP_MS = 5 * 60_000;
export const FAVORITE_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000];

export interface Playing {
  kind: ReactionKind;
  startedAt: number;
}

/** Whether `kind` should play now. Pure - the store passes its own clock and history. */
export function shouldPlay(
  kind: ReactionKind,
  mode: MascotMode,
  now: number,
  lastPlayed: Partial<Record<ReactionKind, number>>,
  playing: Playing | null,
): boolean {
  if (mode === "off") return false;
  const def = REACTIONS[kind];
  if (mode === "cameos" && def.minor) return false;
  const cooldown = mode === "cameos" ? Math.max(def.cooldownMs, CAMEO_COOLDOWN_MS) : def.cooldownMs;
  const last = lastPlayed[kind];
  if (last != null && now - last < cooldown) return false;
  if (playing && now - playing.startedAt < REACTIONS[playing.kind].durationMs) {
    return def.priority > REACTIONS[playing.kind].priority;
  }
  return true;
}

/** A speech line for this reaction, or null to stay quiet. `rand` in [0,1).
 *  "always" skips the gap and the chance roll entirely; "sometimes" is the rate-limited default. */
export function pickLine(
  kind: ReactionKind,
  talk: MascotTalk,
  now: number,
  lastSpokeAt: number | null,
  rand: number,
  vars: Record<string, string> = {},
  /** Use Gus's cheeky pool for this kind, if it has one (caller decides - see mascotSpicy.ts). */
  spicy = false,
): string | null {
  const def = REACTIONS[kind];
  const lines = spicy && SPICY_LINES[kind]?.length ? SPICY_LINES[kind]! : def.lines;
  if (talk === "never" || lines.length === 0) return null;
  const tune = TALK_TUNING[talk];
  // Frequent little reactions (favorite, vote, pet…) stay quiet on "sometimes", talk now and then
  // on "chatty", every time on "always".
  const gap = def.minor ? tune.minorGapMs : tune.gapMs;
  const chance = def.alwaysTalks ? 1 : def.minor ? tune.minorChance : tune.chance;
  if (chance <= 0) return null;
  if (!def.ignoreGap && lastSpokeAt != null && now - lastSpokeAt < gap) return null;
  if (rand >= chance) return null;
  const scaled = rand / chance;
  const line = lines[Math.floor(scaled * lines.length) % lines.length];
  return line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** The highest milestone crossed going from `before` to `after` favorites, if any. */
export function crossedMilestone(before: number, after: number): number | null {
  let hit: number | null = null;
  for (const m of FAVORITE_MILESTONES) if (before < m && after >= m) hit = m;
  return hit;
}

/** "Late night" = midnight to 5am local. */
export function isLateNight(date: Date): boolean {
  return date.getHours() < 5;
}
