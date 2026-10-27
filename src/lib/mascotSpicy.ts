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
  intro: ["Hi, I'm Gus! I'll be watching. Not in a weird way. Mostly.", "Hi, I'm Gus. I see everything you browse. Everything."],
  unknownTag: ["Never heard of it. And I've heard of everything.", "Not a tag. Yet. Want to start a trend?", "Not a tag. Have you considered just drawing it yourself?", "No such tag. Even the internet has its limits. Barely."],
  emptySearch: ["Nothing? Too kinky even for e621. Impressive.", "Zero results. Your taste is ahead of its time.", "Zero results. Congratulations, you've invented a new fetish.", "Nobody's drawn that yet. Commission money's burning a hole, huh?"],
  endOfResults: [
    "That's all of it. You finished. Need a minute?",
    "End of the line. Hope it was good for you too.",
    "You've seen it ALL. Every last one. Proud of you. Sort of.",
    "Finished already? That was quick. …No judgement.",
  ],
  dizzy: ["Slow down, tiger. Savor it.", "Easy! Foreplay matters.", "Whoa! Slow down - you're scrolling like the post is going to escape.", "Easy, easy. It's not a race. Unless you're racing. Are you racing?"],
  yawn: ["Up this late? I know exactly what you're doing.", "Late-night 'research', huh?", "3am and still going? The horny never sleeps.", "Shouldn't you be in bed? …Oh. You are."],
  sweat: ["Too much, too fast. Even e621 needs a cooldown.", "Pace yourself - e621's panting.", "e621's out of breath. You wore it out.", "Even the servers need a cigarette after that."],
  dmail: ["Ooh, someone's sliding into your DMs.", "Mail! Is it… spicy?", "A DM! Is it a commission or a booty call?", "Someone wants your attention. Fair, honestly."],
  milestone: ["{count} favorites. Your fav list must be filthy.", "{count}! I'd ask what's in there, but I peeked.", "{count} favorites. If your fav list got leaked, you'd have to change your name.", "{count}! That's not a collection, that's a confession."],
  gameWin: ["Winner! You're good with your hands.", "Nailed it. Like everything else today.", "Winner! Treat yourself. You know how.", "Victory! Now go reward yourself - privately."],
  gameLose: ["Rough one. Want me to kiss it better?", "Lost? Happens to the best of us. Usually after a long session.", "You lost. Go blow off some steam. You know where the posts are.", "Lost? Shake it off. Or… something else off."],
  queasy: ["Blacklist off? Brave. Or very, very horny.", "No filters? Somebody's adventurous tonight.", "Blacklist OFF. Oh, we're doing THIS tonight.", "No blacklist? Feral. I respect it. I'm a raccoon, I'd know."],
  robot: ["AI-made? Hey, whatever gets you going.", "Robots need love too, I guess.", "e6AI? Sometimes you just want it made to order, huh?", "Robot-made smut. The future is horny."],
  dice: ["Random! Roll the dice and pray it's your type.", "Living dangerously. I like it.", "Random! Spin the wheel of kinks.", "Feeling lucky? Or just desperate?"],
  selfie: ["Searching raccoons? Down bad for trash pandas, huh?", "Oh, so you DO have a type. 😏", "Raccoons, huh? I'm RIGHT HERE, you know. 😏", "Searching for my kind? I'm flattered. And a little exposed."],
  longScroll: [
    "500 posts. Hydrate. Wash your hands.",
    "Still going? Your stamina is honestly impressive.",
    "You've been at this a while. Tissues are on the left.",
    "You've scrolled so far your mouse wheel needs therapy.",
    "This many posts and still haven't 'finished'? Edging champion.",
    "At this point you're not browsing, you're marathoning.",
  ],
  deepSearch: ["Page twenty. Really digging for that perfect one, huh?", "This deep? You must be very picky.", "Page twenty. Nobody digs this deep for the plot.", "This deep in the results? Somebody's hard to please. Or just hard."],
  juggle: ["Four tabs? Somebody's multitasking.", "So many tabs. Can't commit to just one?", "Four tabs. Can't decide which one to finish on?", "A tab for every mood. Very efficient pervert behaviour."],
  hiss: ["Cats? I'll look away. Mostly.", "Felines. Purr-verted choice.", "Cats? Fine. But I'm cuter. And I'm right here.", "Felines. Don't let them see you favorite those."],
  wag: ["Dogs, huh? Good boy energy.", "A dog person. Very… loyal. Very eager.", "Dogs! Somebody wants to be called a good boy.", "Ah, canines. Knot what I expected. …Okay, exactly what I expected."],
  cower: ["Dragons? Big ones? I'll be over here.", "Careful - dragons have notoriously big… hoards.", "Dragons. Size queen, huh? Noted.", "Dragons? You like 'em big and dangerous. Got it."],
  topScore: ["Only the best. You've got standards… sort of.", "Crowd-pleasers. Like you, I bet.", "Sorted by score. You want the stuff that's been… thoroughly enjoyed.", "Only the top-rated. A horny person of standards."],
  archive: ["Vintage smut. A connoisseur.", "The classics. Old, but still gets the job done.", "Oldest first? Retro horny. Respect.", "Old-school smut. Some things never go out of style."],
  longQuery: ["That many tags? You know EXACTLY what you want.", "Very specific. I won't ask. I'm curious, but I won't ask.", "Eight tags?! That's not a search, that's a fantasy with a checklist.", "You've basically written a commission brief there."],
  unicorn: ["One result. Your kink is THAT niche?", "One of a kind. Just like your taste.", "ONE post matches. You and that artist have a connection.", "Exactly one. Guard it with your life."],
  ownFavs: ["Back to the greatest hits, huh?", "Revisiting old flames?", "Your own favorites again? Old reliable.", "Back to the classics. Sometimes you just know what works."],
  popularFav: ["Everyone favorited that one. Can't blame them.", "Popular for a reason. 😏", "Everyone's favorited that one. You're in good company. Sticky company.", "Popular pick. The whole fandom's been there."],
  boldChoice: ["Into the weird stuff? No judgement. Okay, a little.", "Bold taste. I respect it.", "Downvoted by everyone, favorited by you. Your kink is contrarianism.", "The crowd hated it. You didn't. Interesting."],
  favStreak: ["Five favorites in a minute? Somebody's worked up.", "On a roll! Down bad, aren't we?", "Five favorites in a minute! Easy there, it's not going anywhere.", "Favoriting spree! Somebody's in the zone."],
  downloadBatch: ["Saving those for… later?", "A whole stash. For research, sure.", "Downloading a whole stash. Hide that folder well.", "Five downloads. Name that folder 'Tax Documents'."],
  shinyFav: ["Shiny! Even your hard drive is blushing.", "A golden favorite. Treasure it. Privately.", "A golden favorite! Your taste is literally precious.", "Shiny! Frame that one. Or don't. Definitely don't."],
  stretchBreak: [
    "Two hours in. Hydrate, stretch, and give your wrist a rest.",
    "Two hours… take a break before you pull something.",
    "Two hours. Seriously, go drink some water. And maybe open a window.",
    "Two hours straight. Your chair needs a break, even if you don't.",
  ],
  morning: ["Morning browsing? Starting the day right.", "Coffee and smut. A balanced breakfast.", "Morning wood, morning browse. Efficient.", "Good morning! Rise and… yeah."],
  weekend: ["Weekend, no plans, unlimited smut. Living the dream.", "Ah, the weekend. Pants optional.", "Weekend! No pants, no plans, no shame.", "Saturday smut session? Clear your schedule."],
  missedYou: ["Back after a week? Pent up, huh?", "Missed you! Did you find somewhere else to browse? 🥺", "A whole week! Either you got a partner or you got a new app. Which is it?", "You're back! Did you try going outside? How'd that go?"],
  updateAvailable: ["New update! Like fresh content, but for the app.", "Ooh, something new. You love new.", "New update! Install it. Treat the app as well as you treat yourself.", "An update! Fresh and ready for you."],
  flustered: ["Hey, careful where you're touching!", "Buy me dinner first!", "Okay, that's a lot of touching. Are we dating now?", "Pet me like that again and I'll start charging."],
  annoyed: ["Hands off! I'm not THAT kind of raccoon. Well…", "Enough petting - you've got posts for that.", "Hands. OFF. You have a whole internet of furries for that.", "That's enough! Go touch… grass. Yes. Grass."],
  manhandled: ["Rough handling. Not complaining, just noting.", "Being dragged around? Kinky.", "Tossing me around? Somebody likes to be in control.", "Rough! At least use the safe word next time."],
  restored: ["Missed me? I know you did.", "Couldn't stay away, could you?", "You brought me back. Couldn't browse without an audience, huh?", "Back again! You missed the commentary."],
  disco: ["Let's get this party started. 😏", "Shake it! Not like that. …Okay, like that.", "Body rolls! Watch the hips! 🪩", "This is my mating dance. Don't tell anyone."],
  eggSpotted: [
    "Procione! Looking good, as always. 😏",
    "Well hello, Procione. Somebody's confident.",
    "Arms crossed, nothing else covered. Classic Procione.",
    "You typed that word on PURPOSE. Pervert. …Can't blame you.",
    "Procione's showing off again. Not that I'm complaining.",
    "Eyes up, Procione's face is up there! …Eh, nobody's looking there.",
  ],
  eggClosed: ["That stays between us. 😏", "Enjoyed the show? Procione's tip jar is on the left... but just the tip.", "We never speak of this. Unless you want to.", "Same time tomorrow? 😏", "You'll be back. They always come back.", "That was our little secret. One of many, I'm sure."],
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
