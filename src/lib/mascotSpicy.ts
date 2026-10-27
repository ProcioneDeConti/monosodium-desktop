import type { ReactionKind } from "./mascot";
import type { DashboardFacts } from "./mascotDashboard";
import { prettyTag } from "./mascotDashboard";
import type { FavoritesAnalysis } from "./favoritesAnalysis";

/** Gus's cheeky side - only used while adult mode AND the Explicit rating are on, and the
 *  "cheeky" setting hasn't been switched off (see `spicyAllowed`). Innuendo, not explicit: he's a
 *  wisecracking raccoon on a porn browser, not a narrator. When spicy is allowed, a reaction
 *  with lines here picks from these most of the time (SPICY_SHARE) and the regular pool otherwise. */
export const SPICY_SHARE = 0.7;

/** Cheeky Gus is allowed: adult mode on, Explicit enabled, and the cheeky toggle on. */
export function spicyAllowed(s: { adultModeEnabled: boolean; enabledRatings: string[]; mascotSpicy: boolean }): boolean {
  return s.adultModeEnabled && s.enabledRatings.includes("e") && s.mascotSpicy;
}

export const SPICY_LINES: Partial<Record<ReactionKind, string[]>> = {
  // "¦" = a smaller aside under the main line (SpeechBubble).
  eggClose: ["Ooh! You're getting close! ¦ same!"],
  intro: ["Hi, I'm Gus! I'll be watching. Not in a weird way. Mostly.", "Hi, I'm Gus. I see everything you browse. Everything."],
  unknownTag: ["Never heard of it. And I've heard of everything.", "Not a tag. Yet. Want to start a trend?", "Not a tag. Have you considered just drawing it yourself?", "No such tag. Even the internet has its limits. Barely.", "That tag doesn't exist. Your mind is a dark and wonderful place."],
  emptySearch: ["Nothing? Too kinky even for e621. Impressive.", "Zero results. Your taste is ahead of its time.", "Zero results. Congratulations, you've invented a new fetish.", "Nobody's drawn that yet. Commission money's burning a hole, huh?", "Not even Rule 34 covers that. Yet."],
  endOfResults: [
    "That's all of it. You finished. Need a minute?",
    "End of the line. Hope it was good for you too.",
    "You've seen it ALL. Every last one. Proud of you. Sort of.",
    "Finished already? That was quick. …No judgement.",
    "You reached the end. Did you reach anything else?",
    "No more posts. Time to use your imagination.",
  ],
  dizzy: ["Slow down, tiger. Savor it.", "Easy! Foreplay matters.", "Whoa! Slow down - you're scrolling like the post is going to escape.", "Easy, easy. It's not a race. Unless you're racing. Are you racing?", "Scroll any faster and you'll start a fire. Friction, you know."],
  yawn: ["Up this late? I know exactly what you're doing.", "Late-night 'research', huh?", "3am and still going? The horny never sleeps.", "Shouldn't you be in bed? …Oh. You are.", "Late night, dim screen, one hand free. I know the drill."],
  sweat: ["Too much, too fast. Even e621 needs a cooldown.", "Pace yourself - e621's panting.", "e621's out of breath. You wore it out.", "Even the servers need a cigarette after that."],
  dmail: ["Ooh, someone's sliding into your DMs.", "Mail! Is it… spicy?", "A DM! Is it a commission or a booty call?", "Someone wants your attention. Fair, honestly.", "New message! Hope it's a nude. Kidding. Mostly."],
  milestone: ["{count} favorites. Your fav list must be filthy.", "{count}! I'd ask what's in there, but I peeked.", "{count} favorites. If your fav list got leaked, you'd have to change your name.", "{count}! That's not a collection, that's a confession.", "{count} favorites. Somewhere, an artist's commission queue just got longer."],
  gameWin: ["Winner! You're good with your hands.", "Nailed it. Like everything else today.", "Winner! Treat yourself. You know how.", "Victory! Now go reward yourself - privately.", "Winner winner! Celebrate however you celebrate. I won't watch."],
  gameLose: ["Rough one. Want me to kiss it better?", "Lost? Happens to the best of us. Usually after a long session.", "You lost. Go blow off some steam. You know where the posts are.", "Lost? Shake it off. Or… something else off.", "Lost again? Your hands must be tired from… everything."],
  queasy: ["Blacklist off? Brave. Or very, very horny.", "No filters? Somebody's adventurous tonight.", "Blacklist OFF. Oh, we're doing THIS tonight.", "No blacklist? Feral. I respect it. I'm a raccoon, I'd know.", "Blacklist down. Shields down. Pants… also down?"],
  robot: ["AI-made? Hey, whatever gets you going.", "Robots need love too, I guess.", "e6AI? Sometimes you just want it made to order, huh?", "Robot-made smut. The future is horny."],
  dice: ["Random! Roll the dice and pray it's your type.", "Living dangerously. I like it.", "Random! Spin the wheel of kinks.", "Feeling lucky? Or just desperate?"],
  selfie: ["Searching raccoons? Down bad for trash pandas, huh?", "Oh, so you DO have a type. 😏", "Raccoons, huh? I'm RIGHT HERE, you know. 😏", "Searching for my kind? I'm flattered. And a little exposed.", "Raccoon porn. In front of a raccoon. The audacity."],
  longScroll: [
    "500 posts. Hydrate. Wash your hands.",
    "Still going? Your stamina is honestly impressive.",
    "You've been at this a while. Tissues are on the left.",
    "You've scrolled so far your mouse wheel needs therapy.",
    "This many posts and still haven't 'finished'? Edging champion.",
    "At this point you're not browsing, you're marathoning.",
    "Your scroll wheel has seen things no wheel should see.",
    "Still scrolling. At this point, are you even looking or just flexing?",
  ],
  deepSearch: ["Page twenty. Really digging for that perfect one, huh?", "This deep? You must be very picky.", "Page twenty. Nobody digs this deep for the plot.", "This deep in the results? Somebody's hard to please. Or just hard.", "Page twenty. You're not looking for porn anymore, you're looking for THE porn."],
  juggle: ["Four tabs? Somebody's multitasking.", "So many tabs. Can't commit to just one?", "Four tabs. Can't decide which one to finish on?", "A tab for every mood. Very efficient pervert behaviour."],
  hiss: ["Cats? I'll look away. Mostly.", "Felines. Purr-verted choice.", "Cats? Fine. But I'm cuter. And I'm right here.", "Felines. Don't let them see you favorite those."],
  wag: ["Dogs, huh? Good boy energy.", "A dog person. Very… loyal. Very eager.", "Dogs! Somebody wants to be called a good boy.", "Ah, canines. Knot what I expected. …Okay, exactly what I expected.", "Dogs! Somebody likes a good knot. I mean, a good knot-ice-able personality."],
  cower: ["Dragons? Big ones? I'll be over here.", "Careful - dragons have notoriously big… hoards.", "Dragons. Size queen, huh? Noted.", "Dragons? You like 'em big and dangerous. Got it.", "Dragons with big… claws. Yes. Claws."],
  topScore: ["Only the best. You've got standards… sort of.", "Crowd-pleasers. Like you, I bet.", "Sorted by score. You want the stuff that's been… thoroughly enjoyed.", "Only the top-rated. A horny person of standards."],
  archive: ["Vintage smut. A connoisseur.", "The classics. Old, but still gets the job done.", "Oldest first? Retro horny. Respect.", "Old-school smut. Some things never go out of style."],
  longQuery: ["That many tags? You know EXACTLY what you want.", "Very specific. I won't ask. I'm curious, but I won't ask.", "Eight tags?! That's not a search, that's a fantasy with a checklist.", "You've basically written a commission brief there."],
  unicorn: ["One result. Your kink is THAT niche?", "One of a kind. Just like your taste.", "ONE post matches. You and that artist have a connection.", "Exactly one. Guard it with your life."],
  ownFavs: ["Back to the greatest hits, huh?", "Revisiting old flames?", "Your own favorites again? Old reliable.", "Back to the classics. Sometimes you just know what works."],
  popularFav: ["Everyone favorited that one. Can't blame them.", "Popular for a reason. 😏", "Everyone's favorited that one. You're in good company. Sticky company.", "Popular pick. The whole fandom's been there."],
  boldChoice: ["Into the weird stuff? No judgement. Okay, a little.", "Bold taste. I respect it.", "Downvoted by everyone, favorited by you. Your kink is contrarianism.", "The crowd hated it. You didn't. Interesting."],
  favStreak: ["Five favorites in a minute? Somebody's worked up.", "On a roll! Down bad, aren't we?", "Five favorites in a minute! Easy there, it's not going anywhere.", "Favoriting spree! Somebody's in the zone.", "Favoriting like your life depends on it. Or something else does."],
  downloadBatch: ["Saving those for… later?", "A whole stash. For research, sure.", "Downloading a whole stash. Hide that folder well.", "Five downloads. Name that folder 'Tax Documents'.", "Another batch saved. Hope that drive is encrypted."],
  shinyFav: ["Shiny! Even your hard drive is blushing.", "A golden favorite. Treasure it. Privately.", "A golden favorite! Your taste is literally precious.", "Shiny! Frame that one. Or don't. Definitely don't."],
  stretchBreak: [
    "Two hours in. Hydrate, stretch, and give your wrist a rest.",
    "Two hours… take a break before you pull something.",
    "Two hours. Seriously, go drink some water. And maybe open a window.",
    "Two hours straight. Your chair needs a break, even if you don't.",
    "Two hours. Unclench. Breathe. Blink.",
  ],
  morning: ["Morning browsing? Starting the day right.", "Coffee and smut. A balanced breakfast.", "Morning wood, morning browse. Efficient.", "Good morning! Rise and… yeah."],
  weekend: ["Weekend, no plans, unlimited smut. Living the dream.", "Ah, the weekend. Pants optional.", "Weekend! No pants, no plans, no shame.", "Saturday smut session? Clear your schedule."],
  missedYou: ["Back after a week? Pent up, huh?", "Missed you! Did you find somewhere else to browse? 🥺", "A whole week! Either you got a partner or you got a new app. Which is it?", "You're back! Did you try going outside? How'd that go?", "A week off? Did you try going cold turkey? How'd that go?"],
  updateAvailable: ["New update! Like fresh content, but for the app.", "Ooh, something new. You love new.", "New update! Install it. Treat the app as well as you treat yourself.", "An update! Fresh and ready for you."],
  flustered: ["Hey, careful where you're touching!", "Buy me dinner first!", "Okay, that's a lot of touching. Are we dating now?", "Pet me like that again and I'll start charging.", "Okay, okay, I get it, you're a touchy one."],
  annoyed: ["Hands off! I'm not THAT kind of raccoon. Well…", "Enough petting - you've got posts for that.", "Hands. OFF. You have a whole internet of furries for that.", "That's enough! Go touch… grass. Yes. Grass.", "I said NO more pets. Go pet your favorites instead."],
  manhandled: ["Rough handling. Not complaining, just noting.", "Being dragged around? Kinky.", "Tossing me around? Somebody likes to be in control.", "Rough! At least use the safe word next time."],
  restored: ["Missed me? I know you did.", "Couldn't stay away, could you?", "You brought me back. Couldn't browse without an audience, huh?", "Back again! You missed the commentary."],
  disco: ["Let's get this party started. 😏", "Shake it! Not like that. …Okay, like that.", "Body rolls! Watch the hips! 🪩", "This is my mating dance. Don't tell anyone.", "Shaking my tail for you. You're welcome. 🍑"],
  eggSpotted: [
    "Procione! Looking good, as always. 😏",
    "Well hello, Procione. Somebody's confident.",
    "Arms crossed, nothing else covered. Classic Procione.",
    "You typed that word on PURPOSE. Pervert. …Can't blame you.",
    "Procione's showing off again. Not that I'm complaining.",
    "Eyes up, Procione's face is up there! …Eh, nobody's looking there.",
  ],
  eggClosed: ["That stays between us. 😏", "Enjoyed the show? Procione's tip jar is on the left... but just the tip.", "We never speak of this. Unless you want to.", "Same time tomorrow? 😏", "You'll be back. They always come back.", "That was our little secret. One of many, I'm sure."],
  pet: [
    "Mmm. Lower. …Kidding.",
    "You're good with your hands, you know that?",
    "Careful, I bite. Gently.",
  ],
  favorite: [
    "Saved for 'later'. Sure.",
    "Into the spank bank it goes.",
    "Ooh, that one's a keeper.",
    "Bookmarked for research purposes.",
  ],
  unfavorite: [
    "Not hot enough anymore?",
    "Dumped. Cold.",
    "It's not you, it's your taste.",
  ],
  upvote: [
    "Upvoted! That artist deserves it.",
    "Yeah, that one's hot.",
    "A vote of… appreciation.",
  ],
  downvote: [
    "Not doing it for you, huh?",
    "Too vanilla? Too much? Hard to say with you.",
  ],
  download: [
    "Saved to the secret folder.",
    "Downloaded. Don't forget to clear your recents.",
    "For offline 'viewing'.",
  ],
  copy: [
    "Copying the link? Sharing is caring. Sharing is risky.",
  ],
  refresh: [
    "Fresh posts! Something new to look at.",
  ],
  rocket: [
    "Back to the top. Round two?",
  ],
  peekaboo: [
    "Hiding seen posts? Fresh meat only.",
  ],
  blacklistAdd: [
    "Blacklisted. Even you have limits. Who knew.",
  ],
  savedSearch: [
    "Saved that search. For easy access. Very easy access.",
  ],
  perkUp: [
    "Back already? Couldn't stay away.",
  ],
  gameRight: [
    "Correct! Your filthy knowledge pays off.",
    "Right! You know your smut.",
  ],
  gameWrong: [
    "Wrong! Spend less time looking, more time reading tags.",
    "Nope! Too distracted?",
  ],
  kinkMuscle: [
    "Muscles! You like 'em big and strong. Noted.",
    "Somebody wants to be manhandled.",
    "Abs you could grate cheese on. Or lick. Your call.",
  ],
  kinkThicc: [
    "Thicc! More to love.",
    "Ah, a person who appreciates a good cushion.",
    "Hips don't lie, and neither does your search history.",
  ],
  kinkPaws: [
    "Paws! Toe beans and… other things.",
    "Feet, huh? I won't judge. I'll just raise an eyebrow.",
    "Soles. Very specific. Very you.",
  ],
  kinkMacro: [
    "Big. Bigger. Biggest. You have a type and it's 'huge'.",
    "Size difference? Somebody wants to feel small.",
    "Macros! Stomp me, daddy? …Sorry, wrong app voice.",
  ],
  kinkFeral: [
    "Feral! Primal. Untamed. Like your browser history.",
    "Going wild tonight, huh?",
  ],
  kinkGroup: [
    "A whole party! You don't do things by halves.",
    "Group stuff? Hope you're good at multitasking.",
    "More is more, apparently.",
  ],
  ratingExplicit: [
    "Explicit only. No foreplay, straight to business.",
    "Skipping the safe stuff? Efficient pervert.",
    "rating:e. You came here for one thing.",
  ],
  ratingSafe: [
    "Safe only? Who are you trying to impress?",
    "Keeping it clean? Your favorites folder says otherwise.",
  ],
  gusSearch: [
    "Searching for porn of ME?! …How is it? Is it flattering?",
    "Rule 34 got me too? Wow. I've made it.",
  ],
  procioneSearch: [
    "Procione again! You can't get enough of that raccoon.",
    "Looking for more Procione? Get in line.",
  ],
  snoopFavs: [
    "Peeking at their favorites? Learning their kinks? Sneaky.",
    "Reading someone's favorites is like reading their diary. A very dirty diary.",
  ],
  uploaderStalk: [
    "Everything they uploaded? You're basically a groupie.",
    "Following an uploader around. Stalker vibes. Horny stalker vibes.",
  ],
  poolRead: [
    "A pool! 'For the story.' Sure. The story.",
    "Comic time! Skip to the good part, I won't tell.",
  ],
  picky: [
    "So many exclusions. You know EXACTLY what you don't want. Hot.",
    "Picky, picky. Only the perfect porn will do.",
  ],
  voteStreak: [
    "Voting spree! Spreading the love. Literally.",
    "That many votes? Somebody's passionate.",
  ],
  lingerHover: [
    "Hovering that long? Just open it, you know you want to.",
    "Staring at the thumbnail? Commitment issues?",
  ],
  lingered: [
    "You spent a LONG time on that one. Good post?",
    "That one kept you busy, huh?",
    "Ninety seconds on one post. I'm not asking.",
  ],
  quickHide: [
    "Someone walk in?! Act natural. 👀",
    "Panic minimize! Classic.",
    "Coast clear? Okay, carry on. I won't tell.",
  ],
  adultOn: [
    "Adult mode ON. Let's get filthy.",
    "Oh, NOW we're having fun.",
  ],
  adultOff: [
    "Safe mode? Somebody's got company.",
    "Going vanilla. For now.",
  ],
  wipeSeen: [
    "Wiping your seen history. Destroying the evidence?",
    "A clean slate. Pretend you've seen nothing.",
  ],
  wipeStats: [
    "Resetting your stats? Ashamed of the numbers?",
    "Evidence destroyed. I still remember, though.",
  ],
};

const n = (x: number) => x.toLocaleString();
const HOUR = 3600_000;
const GB = 1024 ** 3;

/** Dashboard commentary, the cheeky edition - mixed in with the regular remarks when allowed. */
export function spicyDashboardRemarks(f: DashboardFacts): string[] {
  if (f.postsViewed === 0 && f.searches === 0) return ["A blank slate. Don't worry, I'll keep your secrets."];
  const out: string[] = [];
  const hours = Math.floor(f.activeMs / HOUR);
  const [artist] = f.topArtists.map(prettyTag);
  const [char] = f.topCharacters.map(prettyTag);
  const [search] = f.topSearched.map(prettyTag);

  if (hours >= 1) out.push(`${n(hours)} hours on a porn app. I'm not judging - I live here.`);
  out.push(`${n(f.postsViewed)} posts viewed. Your eyes must be exhausted. Your hand too.`);
  if (f.longestSessionMs >= 30 * 60_000) {
    out.push(`A ${Math.round(f.longestSessionMs / 60_000)}-minute session. The stamina on you!`);
  }
  if (f.postsToday > 0) out.push(`${n(f.postsToday)} posts today, and the day isn't over yet.`);
  if (artist) {
    out.push(`${artist} has no idea how much they've done for you.`);
    out.push(`Ever thought of sending ${artist} a thank-you note? Or a tip?`);
  }
  if (char) out.push(`${char}, huh? Down bad for them specifically.`);
  if (search) out.push(`"${search}" - your most searched. Bold of you to have a type.`);
  if (f.favoritesAdded > 0) out.push(`${n(f.favoritesAdded)} favorites. Your fav list is a crime scene.`);
  if (f.busiestDay && f.busiestDay.posts > 0) {
    out.push(`${f.busiestDay.label}: ${n(f.busiestDay.posts)} posts. What happened that day? Actually, don't tell me.`);
  }
  if (f.dataBytes >= GB) out.push(`${(f.dataBytes / GB).toFixed(1)} GB of… "art". Sure.`);
  if (f.streakDays >= 3) out.push(`${f.streakDays} days straight. No nut November is NOT your month.`);
  out.push("You know you can close the app, right? …Didn't think so.");
  out.push("I've seen your search history. We're well past the point of shame.");

  // The hotter tier.
  if (hours >= 1) out.push(`${n(hours)} hours. That's not a hobby anymore, that's a lifestyle.`);
  if (f.sessions >= 2) out.push(`${n(f.sessions)} sessions. Every one ended the same way, I assume.`);
  if (artist) out.push(`If ${artist} knew what you do with their art… actually, they probably know.`);
  if (char) out.push(`${char} lives rent-free in your head. And elsewhere.`);
  if (search) out.push(`You've searched "${search}" so much the tag should send you a Christmas card.`);
  if (f.favoritesAdded >= 10) out.push("Your favorites folder needs a warning label.");
  if (f.downloads > 0) out.push(`${n(f.downloads)} downloads. Your 'Homework' folder is thriving.`);
  if (f.postsViewed >= 100) out.push("Your browser history could end careers. Mostly yours.");
  out.push("Whatever you're about to search next - I already know. And I approve.");
  out.push("Somewhere, a therapist just felt a disturbance.");
  out.push("I'm a raccoon who lives in a porn app. I've made peace with it. Have you?");

  // Batch 4.
  if (f.votesUp + f.votesDown > 0) out.push(`${n(f.votesUp)} upvotes. You really know how to show appreciation.`);
  if (f.favoritesRemoved > 0) out.push(`${n(f.favoritesRemoved)} unfavorited. Some of them just weren't hot enough in the morning.`);
  if (f.uniquePostsViewed > 0 && f.postsViewed > f.uniquePostsViewed) {
    out.push("You keep coming back to the same posts. Loyal. Or obsessed.");
  }
  if (f.slideshowMs > 0) out.push("You use the slideshow. Hands-free browsing. I see why.");
  if (f.e6aiViewed > 0) out.push("You've dabbled in AI porn. The robots thank you for your service.");
  if (f.activeDays >= 7) out.push(`${n(f.activeDays)} active days. Consistency is key. So is lube.`);
  if (artist) out.push(`I'd tell ${artist} you're their biggest fan, but I think they'd get a restraining order.`);
  if (char) out.push(`If ${char} were real, you'd need to buy them dinner first.`);
  out.push("Your stats are the most incriminating thing on this computer. Well. Second most.");
  out.push("Fun fact: the average person blinks 15 times a minute. You? Questionable.");
  out.push("I don't need a dashboard to know what you've been up to. I can smell it.");
  return out;
}

/** Cheeky take on a finished favorites analysis. */
export function spicyAnalysisRemark(a: FavoritesAnalysis, isSelf: boolean, name: string): string {
  const whose = isSelf ? "your" : `${name}'s`;
  const explicit = a.ratings.find((r) => r.label === "Explicit")?.count ?? 0;
  const safe = a.ratings.find((r) => r.label === "Safe")?.count ?? 0;
  const topArtist = a.topArtists[0]?.label;
  if (a.total > 0 && safe / a.total >= 0.8) return `Mostly safe? Who ${isSelf ? "are you" : `is ${name}`} trying to fool?`;
  if (a.total > 0 && explicit / a.total >= 0.7) {
    return `${Math.round((explicit / a.total) * 100)}% explicit. A person of culture.`;
  }
  if (topArtist) return `${prettyTag(topArtist)} tops ${whose} favorites. They'd blush if they knew.`;
  if (a.total > 0 && a.deletedCount / a.total >= 0.1) {
    return `${a.deletedCount} of ${whose} favorites got deleted. Too hot for the internet, apparently.`;
  }
  return `I've seen ${whose} favorites now. I can never unsee them.`;
}
