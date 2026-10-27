import type { FavoritesAnalysis } from "./favoritesAnalysis";

/** What the dashboard knows, flattened to what the raccoon comments on. */
export interface DashboardFacts {
  activeMs: number;
  sessions: number;
  longestSessionMs: number;
  postsViewed: number;
  uniquePostsViewed: number;
  searches: number;
  favoritesAdded: number;
  favoritesRemoved: number;
  votesUp: number;
  votesDown: number;
  downloads: number;
  apiCalls: number;
  dataBytes: number;
  slideshowMs: number;
  e621Viewed: number;
  e6aiViewed: number;
  daysUsing: number;
  /** Days with any activity in the heatmap window (last 120). */
  activeDays: number;
  /** Consecutive active days up to today (or yesterday, if today hasn't started yet). */
  streakDays: number;
  postsToday: number;
  /** Busiest day in the window, already formatted for display. */
  busiestDay: { label: string; posts: number } | null;
  /** Top entries, most first (tag names as stored - prettified here). */
  topSearched: string[];
  topArtists: string[];
  topCharacters: string[];
  /** Times the "cooter" easter egg has been summoned (0 = never found). */
  eggSummons?: number;
}

const HOUR = 3600_000;
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** A tag as a name: underscores to spaces, the disambiguation suffix dropped
 *  ("weskers_(character)" -> "Weskers"), first letter capitalised. */
export function prettyTag(tag: string): string {
  const name = tag.replace(/_\([^)]*\)$/, "").replace(/_/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const n = (x: number) => x.toLocaleString();
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

/** Every remark that applies to these stats. The panel shuffles them and serves one per click,
 *  so there are deliberately lots - a few always apply (counts, tips about him) so even a quiet
 *  account gets variety. */
export function dashboardRemarks(f: DashboardFacts): string[] {
  if (f.postsViewed === 0 && f.searches === 0) {
    return [
      "Fresh start! Go find something good and I'll keep score.",
      "Nothing to report yet. Search for something and come back!",
      "Psst - I react to all sorts of things. Try favoriting something.",
    ];
  }

  const out: string[] = [];
  const hours = Math.floor(f.activeMs / HOUR);
  const votes = f.votesUp + f.votesDown;
  const [artist1, artist2, artist3] = f.topArtists.map(prettyTag);
  const [search1, search2] = f.topSearched.map(prettyTag);
  const [char1, char2] = f.topCharacters.map(prettyTag);

  // Personal taste - the best material, with a couple of phrasings each.
  if (artist1) {
    out.push(`${artist1} again? You're a big fan.`);
    out.push(`If ${artist1} ever needs a hype man, I know who to call.`);
  }
  if (artist1 && artist2) out.push(`${artist1} and ${artist2}, your top two artists. Solid lineup.`);
  if (artist3) out.push(`Honorable mention: ${artist3}. Bronze medal in your artist rankings.`);
  if (search1) {
    out.push(`You search "${search1}" more than anything. Noted.`);
    out.push(`"${search1}" - your most searched. No judgement. Okay, a little.`);
  }
  if (search2) out.push(`Runner-up search: "${search2}". Interesting combo with "${search1}".`);
  if (char1) {
    out.push(`${char1} keeps showing up. Favorite character?`);
    out.push(`Should I start charging ${char1} rent? They're here a lot.`);
  }
  if (char1 && char2) out.push(`${char1} or ${char2}? Seems you can't decide.`);

  // Volume and habits.
  out.push(`${plural(f.postsViewed, "post")} viewed. I counted every one.`);
  if (f.uniquePostsViewed > 0) {
    out.push(`${n(f.uniquePostsViewed)} different posts seen so far. That's a lot of art.`);
  }
  if (f.searches > 0) out.push(`${plural(f.searches, "search", "searches")} and counting.`);
  if (hours >= 100) out.push(`${hours} hours together. I'm honored. Also slightly worried.`);
  else if (hours >= 1) out.push(`${plural(hours, "hour")} so far. Time flies when you're scrolling.`);
  if (f.sessions >= 2) {
    out.push(`${n(f.sessions)} sessions, averaging ${Math.max(1, Math.round(f.activeMs / f.sessions / 60_000))} minutes each.`);
  }
  if (f.longestSessionMs >= HOUR) {
    out.push(`Your longest session: ${Math.round(f.longestSessionMs / 60_000)} minutes. Did you blink?`);
  }
  if (f.postsToday > 0) out.push(`${plural(f.postsToday, "post")} today. Busy day?`);
  if (f.busiestDay && f.busiestDay.posts > 0) {
    out.push(`Your busiest day was ${f.busiestDay.label}: ${plural(f.busiestDay.posts, "post")}. What happened?`);
  }
  if (f.streakDays >= 3) out.push(`${f.streakDays} days in a row. Don't break the streak!`);
  if (f.activeDays >= 30) out.push(`Here ${f.activeDays} of the last 120 days. We're basically roommates.`);
  if (f.daysUsing >= 365) out.push("Over a year together! Happy anniversary.");
  else if (f.daysUsing >= 7) out.push(`${f.daysUsing} days since we met. Feels like longer.`);

  // Favorites and votes.
  if (f.favoritesAdded > 0) {
    const rate = f.postsViewed > 0 ? f.favoritesAdded / f.postsViewed : 0;
    out.push(`${plural(f.favoritesAdded, "favorite")} added here.`);
    if (rate >= 0.2) out.push("You favorite a lot of what you see. Easy to please!");
    else if (f.postsViewed >= 200 && rate < 0.02) out.push("You hardly favorite anything. Picky!");
  }
  if (f.favoritesAdded >= 10 && f.favoritesRemoved >= f.favoritesAdded * 0.3) {
    out.push(`${n(f.favoritesRemoved)} unfavorited… commitment issues?`);
  }
  if (votes >= 10) {
    const upShare = f.votesUp / votes;
    if (upShare >= 0.85) out.push("You upvote almost everything. Generous soul.");
    else if (upShare <= 0.4) out.push("That's a lot of downvotes. Tough critic!");
    else out.push(`${n(f.votesUp)} up, ${n(f.votesDown)} down. A fair judge.`);
  } else if (f.postsViewed >= 50) {
    out.push("You barely vote. The artists would appreciate it, you know.");
  }

  // Data and the machinery.
  if (f.dataBytes >= GB) out.push(`About ${(f.dataBytes / GB).toFixed(1)} GB of data. My poor router.`);
  else if (f.dataBytes >= 50 * MB) out.push(`${Math.round(f.dataBytes / MB)} MB of data so far. Light snacking.`);
  if (f.downloads > 0) out.push(`${plural(f.downloads, "download")}. Building a collection?`);
  if (f.apiCalls >= 100) out.push(`${n(f.apiCalls)} API calls, all politely rate-limited. e621 likes us.`);
  const sitesTotal = f.e621Viewed + f.e6aiViewed;
  if (sitesTotal >= 20) {
    if (f.e6aiViewed / sitesTotal >= 0.5) out.push("More e6AI than e621? Team robot, huh.");
    else if (f.e6aiViewed === 0) out.push("Never touched e6AI. A purist!");
    else out.push(`${Math.round((f.e6aiViewed / sitesTotal) * 100)}% of your views are on e6AI.`);
  }
  if (f.slideshowMs >= 10 * 60_000) out.push("Slideshow enjoyer. Sit back, relax, I get it.");
  if (f.uniquePostsViewed >= 100 && f.postsViewed >= f.uniquePostsViewed * 1.5) {
    out.push("You revisit a lot of posts. Comfort favorites?");
  }
  if ((f.eggSummons ?? 0) >= 2) {
    out.push(`You've said the magic word ${f.eggSummons} times. I know what you are.`);
  }

  // About him - always available, so a quiet account still gets variety.
  out.push("Click me again and I'll find something else to say.");
  out.push("Gus here, crunching your numbers. Raccoons are great at math. Trust me.");
  out.push("Gus's tip: right-click me if you ever need some privacy.");
  out.push("Fun fact: I react to games too. Go play something!");

  return out;
}

/** Fisher-Yates - the dashboard serves remarks in a fresh random order each time it opens. */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One remark about a finished favorites analysis - "your" vs "their" by `isSelf`. */
export function analysisRemark(a: FavoritesAnalysis, isSelf: boolean, name: string): string {
  const who = isSelf ? "You" : name;
  const whose = isSelf ? "your" : `${name}'s`;
  const explicit = a.ratings.find((r) => r.label === "Explicit")?.count ?? 0;
  const safe = a.ratings.find((r) => r.label === "Safe")?.count ?? 0;
  const topArtist = a.topArtists[0]?.label;
  const topTag = a.topTags[0]?.label;
  if (a.total > 0 && safe / a.total >= 0.8) return `${who} ${isSelf ? "keep" : "keeps"} it wholesome. Mostly safe!`;
  if (a.total > 0 && explicit / a.total >= 0.9) return `Wow. ${Math.round((explicit / a.total) * 100)}% explicit. Bold.`;
  if (a.total > 0 && a.deletedCount / a.total >= 0.2) return `${a.deletedCount} of those are deleted now. A digital graveyard.`;
  if (topArtist) return `${prettyTag(topArtist)} tops ${whose} favorites. Good taste.`;
  if (topTag) return `"${prettyTag(topTag)}" is all over ${whose} favorites.`;
  return `Average score ${Math.round(a.avgScore)}. Crunched it!`;
}
