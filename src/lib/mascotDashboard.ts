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
  dataBytes: number;
  slideshowMs: number;
  e621Viewed: number;
  e6aiViewed: number;
  daysUsing: number;
  /** Days with any activity in the heatmap window (last 120). */
  activeDays: number;
  topSearched: string | null;
  topArtist: string | null;
  topCharacter: string | null;
}

const HOUR = 3600_000;
const GB = 1024 ** 3;
const pretty = (tag: string) => tag.replace(/_/g, " ");

/** Every remark that applies to these stats, most interesting first. The panel shows them one at
 *  a time (on open, then each click), so order matters more than count. */
export function dashboardRemarks(f: DashboardFacts): string[] {
  const out: string[] = [];
  const hours = Math.floor(f.activeMs / HOUR);
  const votes = f.votesUp + f.votesDown;

  if (f.postsViewed === 0 && f.searches === 0) {
    return ["Fresh start! Go find something good and I'll keep score."];
  }
  if (f.topArtist) out.push(`${pretty(f.topArtist)} again? You're a big fan.`);
  if (f.topSearched) out.push(`You search "${pretty(f.topSearched)}" more than anything. Noted.`);
  if (f.topCharacter) out.push(`${pretty(f.topCharacter)} keeps showing up. Favourite character?`);
  if (hours >= 100) out.push(`${hours} hours together. I'm honoured. Also slightly worried.`);
  else if (hours >= 10) out.push(`${hours} hours so far. Time flies when you're scrolling.`);
  if (f.longestSessionMs >= 4 * HOUR) {
    out.push(`Your longest session was ${Math.floor(f.longestSessionMs / HOUR)} hours. Did you blink?`);
  }
  if (votes >= 50) {
    const upShare = f.votesUp / votes;
    if (upShare >= 0.9) out.push("You upvote almost everything. Generous soul.");
    else if (upShare <= 0.4) out.push("That's a lot of downvotes. Tough critic!");
  }
  if (f.favoritesAdded >= 20 && f.favoritesRemoved >= f.favoritesAdded * 0.3) {
    out.push(`${f.favoritesRemoved} unfavourited… commitment issues?`);
  }
  if (f.dataBytes >= 10 * GB) out.push(`${Math.round(f.dataBytes / GB)} GB of data. My poor router.`);
  if (f.downloads >= 500) out.push(`${f.downloads.toLocaleString()} downloads. Your hard drive must be groaning.`);
  const sitesTotal = f.e621Viewed + f.e6aiViewed;
  if (sitesTotal >= 100 && f.e6aiViewed / sitesTotal >= 0.5) out.push("More e6AI than e621? Team robot, huh.");
  if (f.slideshowMs >= 2 * HOUR) out.push("Slideshow enjoyer. Sit back, relax, I get it.");
  if (f.activeDays >= 90) out.push(`Here ${f.activeDays} of the last 120 days. We're basically roommates.`);
  if (f.uniquePostsViewed >= 1000 && f.postsViewed >= f.uniquePostsViewed * 2) {
    out.push("You rewatch a lot. Comfort posts?");
  }
  if (f.daysUsing >= 365) out.push("Over a year together! Happy anniversary.");
  if (out.length === 0) out.push(`${f.postsViewed.toLocaleString()} posts viewed so far. Just getting started!`);
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
  if (topArtist) return `${pretty(topArtist)} tops ${whose} favourites. Good taste.`;
  if (topTag) return `"${pretty(topTag)}" is all over ${whose} favourites.`;
  return `Average score ${Math.round(a.avgScore)}. Crunched it!`;
}
