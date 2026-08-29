// Builds the shareable "Favorites, wrapped" card as a self-contained SVG string (no external
// refs, so it rasterises cleanly to PNG/JPEG on a canvas - see lib/exportCard.ts). Text widths
// are measured with a real canvas context so chips fit their labels and long names truncate to
// the space available, rather than guessing from character counts.

import type { FavoritesAnalysis } from "./favoritesAnalysis";
import type { Site } from "../models/site";
import { SITE_DISPLAY_NAME } from "../models/site";

export const CARD_W = 1080;
export const CARD_H = 1750;

const PAD = 72;
const INNER_W = CARD_W - PAD * 2;
// Quoted family name - unquoted "Segoe UI" parses as two separate families and falls back.
const FONT = "'Segoe UI', -apple-system, Roboto, Helvetica, Arial, sans-serif";

const RATING_COLOR: Record<string, string> = {
  Safe: "#4CAF50",
  Questionable: "#FFA726",
  Explicit: "#E53935",
};

// "Final Verdict" one-liners, keyed by the dominant rating - one is picked at random each time a
// card is generated. TODO(user): Safe / Questionable lists still need the real lines.
const RATING_VERDICT: Record<string, string[]> = {
  Safe: [
    "Literally just here for the character design references.",
    "\"I only read e621 for the articles.\"",
    "Actively ignoring 90% of the website's actual content.",
    "Too pure for this world, or just deeply terrified of the explicit filter.",
    "The digital equivalent of a gentle pat on the head.",
    "A beacon of absolute innocence in a sea of complete degeneracy.",
    "Has a black belt in dodging the \"suggestive\" tags.",
    "Only looks at the beans. Just the toe beans.",
    "Bubble-wrapped and securely buckled into the passenger seat.",
    "The only person on this app with a completely safe-for-work search history.",
    "Treats this app like a highly curated Pinterest board for cute animal art.",
    "\"I'm just looking for a nice new desktop wallpaper, I swear!\"",
    "Needs a juice box and a nap, definitely not a bonk.",
    "The designated driver of the late-night browsing session.",
    "Actually knows what color the grass is outside.",
    "Squeaky clean, freshly groomed, and ready for Sunday school.",
    "Searching for the \"hug\" tag and sorting by new.",
    "Thinks a \"knot\" is strictly a way to tie your shoes.",
    "Shielding their eyes every time a questionable thumbnail sneaks through.",
    "Completely oblivious to why the blacklist feature even exists.",
    "Here to respectfully appreciate the shading techniques and absolutely nothing else.",
    "100% wholesome, 0% risk of an emergency HR meeting.",
    "Pure enough to make an angel sigh with relief.",
    "Certified good bean with a spotless record.",
    "Successfully tiptoeing through the minefield while wearing blinders.",
  ],
  Questionable: [
    "Too spicy for work, too vanilla for the degenerate group chat.",
    "Flirting with danger, but too scared to commit to the knot.",
    "The furry equivalent of an edgy PG-13 movie.",
    "Living life on the dangerous edge of the crop.",
    "A true connoisseur of strategically placed fluffy tails.",
    "\"I swear I'm just looking because I admire the art style.\"",
    "Keeping it highly suggestive, but keeping the pants on.",
    "Hovering over the explicit filter but never actually clicking it.",
    "Respectfully looking, but definitely sweating a little bit.",
    "Constantly edging the workplace HR guidelines.",
    "Suspiciously detailed pawb enjoyer.",
    "Staring at the bakery, but too afraid to buy the whole cake.",
    "Exclusively here for the \"clothing lift\" and \"suggestive smirk\" tags.",
    "Riding the fence between \"adorable\" and \"immediate HR violation.\"",
    "Plausible deniability is your favorite kink.",
    "You like your art like your coffee: just a little bit frothy.",
    "Not quite feral, but definitely not entirely housebroken either.",
    "Testing the waters of the deep end without actually getting wet.",
    "The undisputed champion of the \"mostly safe\" gray area.",
    "Needs a cold shower, but just a quick five-minute one.",
    "Safely strapped into the passenger seat of the horny bus.",
    "Thinks exposed collarbones and tight spandex are a personality trait.",
    "Always exactly one stray click away from absolute ruin.",
    "Just doing some casual window shopping in the red-light district.",
    "Leaving just enough to the imagination to avoid total damnation.",
  ],
  Explicit: [
    "Certified knot enthusiast.",
    "Browsing history that requires a priest and a mop.",
    "Has a Ph.D. in sorting by 'score:desc'.",
    "Warning: May bite, will definitely swallow.",
    "More kinks than a cheap garden hose.",
    "Your FBI agent needs a therapist.",
    "Absolute feral degenerate status achieved.",
    "Needs a bonk and a one-way ticket to horny jail.",
    "Powered by questionable tags and poor impulse control.",
    "Putting the 'yiff' in 'yikes'.",
    "Fluent in safe words and bad decisions.",
    "Good boy on the streets, bad dog in the sheets.",
    "Just a hole looking for a goal.",
    "One tag away from total damnation.",
    "The reason the blacklist feature was invented.",
    "Currently accepting applications for a new leash.",
    "Always sorts by explicit, never sorts out their life.",
    "God's bravest soldier in the NSFW trenches.",
    "Down bad and barking at the moon.",
    "Needs Jesus, but will settle for a tight collar.",
    "Keeping the local incognito tab industry alive.",
    "Spitters are quitters, and you never quit.",
    "A search history darker than the app's dark mode.",
    "Only here for the 'anatomically correct' tags.",
    'The reason "Are you 18 or older?" warnings exist.',
  ],
};
// The "secret" pool, shown (label-less, centred) only when the split is near-even across all
// three ratings. These run long / multi-sentence on purpose - it's the rare payoff.
const VERDICT_BALANCED = [
  'A truly terrifying chaotic neutral. Your FBI agent has severe whiplash from watching you jump between the "hug" and "knot" tags in the exact same session.',
  "Perfectly balanced, as all degenerates should be. You do absolute parkour from wholesome toe beans straight into feral damnation without breaking a sweat.",
  'The Avatar of the blacklist: Master of all three ratings. One minute you\'re studying character design references, the next you\'re actively violating HR guidelines.',
  "The browsing equivalent of ordering a Diet Coke with a massive triple-bacon grease-burger. You're fooling absolutely no one with those interspersed safe tags.",
  "You need Jesus, a cold shower, and a gentle pat on the head—and everyone is genuinely terrified to ask in what order.",
];

function pickRandom<T>(list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

// Special verdict tiers for a big collection. A card draws *exclusively* from the highest tier it
// qualifies for (10k > 5k > normal). `{count}` in any line is replaced with the analysed
// favourite count at card time.
const VERDICT_5K_MIN = 5000;
const VERDICT_10K_MIN = 10_000;
const RATING_VERDICT_10K: Record<string, string[]> = {
  Safe: [
    "{count} safe favorites on a porn site. You haven't just touched grass; you have fully assimilated into the pasture like a deranged, heavily medicated cryptid.",
    "You've forced the API to fetch {count} images of pure, unblemished innocence. Even Procione DeConti is sweating over this level of obsessive, squeaky-clean psychosis.",
    "Hoarding {count} SFW images in the deepest trenches of e621 is like crawling naked through a radioactive blast zone just to pick {count} perfectly intact daisies.",
  ],
  Questionable: [
    "{count} favorites of pure, unadulterated edging. The sheer friction of your relentless, {count}-image blue-balling is enough to start a five-alarm forest fire.",
    "Curating {count} images of almost-but-not-quite-fucking is a psychological horror story. Drop the pants or go to church, you absolute coward.",
    "A {count}-image monument dedicated entirely to sheer spandex, exposed thighs, and heavy breathing. You are the undisputed grandmaster of the world's most frustrating gooning session.",
  ],
  Explicit: [
    "{count} explicit favorites. You've officially hoarded enough knot mechanics and questionable bodily fluids to require a Level-4 hazmat suit just to launch this app.",
    "At {count} deep into the filth, HBO After Dark looks like a goddamn Sunday school picnic compared to the absolute biohazard containment cell you call a favorites list.",
    "You've hoarded {count} instances of characters getting absolutely bred. Your poor smartphone screen has been exposed to more virtual bodily fluids than the floor of a furry convention after-party.",
  ],
};
const VERDICT_BALANCED_10K: string[] = [
  "{count} favorites perfectly split between Sunday mass, softcore teasing, and getting absolutely destroyed. You are a walking, scrolling psychiatric anomaly.",
  "Swiping through your favorites is a game of Russian Roulette where the chambers are loaded with wholesome toe beans, suggestive crop tops, and fourteen-inch horse cocks.",
  "{count} perfectly balanced bookmarks proving your brain is an active warzone. You seamlessly transition from \"aww, cute puppy\" to \"choke me out in a Denny's parking lot\" without skipping a single beat.",
];
const RATING_VERDICT_5K: Record<string, string[]> = {
  Safe: [
    "5,000 safe favorites on e621? You didn't just dodge the landmines, you built a fully functioning wholesome suburb in the middle of a warzone.",
    "You've somehow managed to curate a 5,000-image Disney vault on a site famous for feral chaos. It's honestly intimidating.",
    "The sheer willpower required to hunt down and save 5,000 pictures of purely innocent toe beans is frankly psychotic.",
    "Hoarding 5,000 SFW images here is like going to an all-you-can-eat steakhouse and slowly consuming 5,000 plain saltine crackers.",
    "Your favorites list is so aggressively, obsessively pure that it's looping right back around to being highly suspicious.",
  ],
  Questionable: [
    "5,000 favorites and not a single one crosses the line. The sheer stamina of edging your search history for this long is terrifying.",
    "Hoarding over 5,000 pictures of strategically placed fluff requires a level of plausible deniability that belongs in politics.",
    "You have enough softcore tease saved to insulate a three-bedroom house, yet you still refuse to just click the explicit filter.",
    "5,000 documented instances of \"I'm just looking at the outfits.\" Who are you lying to, us or yourself?",
    "A monumental, meticulously curated museum of heavy breathing, thigh-highs, and absolutely zero follow-through.",
  ],
  Explicit: [
    "Over 5,000 explicit favorites? Your digital footprint is basically a biohazard zone at this point.",
    "Bro is building the Library of Alexandria for sheer, unfiltered degeneracy. Please go outside and touch some actual grass.",
    "5,000 deep into the abyss. You haven't just lost your mind, you've permanently leased it to the 'score:desc' page.",
    "You've stared at so much feral smut that your poor scroll wheel legally requires a restraining order.",
    "Proudly hoarding enough highly questionable anatomy to put a college biology textbook completely out of business.",
  ],
};
const VERDICT_BALANCED_5K: string[] = [
  "5,000 favorites perfectly split between Sunday school and absolute damnation. Your algorithm is begging for a psychiatric evaluation.",
  "Over 5,000 saved posts of pure emotional whiplash. You are a chaotic god of hoarding, oscillating between 'pet the dog' and 'ruin my life' with every click.",
  "Archiving 5,000 images evenly across the spectrum proves you have absolutely zero consistency, just an impossibly strong scrolling finger.",
  "A 5,000-image monument to your absolute inability to pick a lane. You are the final boss of cognitive dissonance.",
  "You've hoarded a massive, perfectly balanced mountain of art, proving you contain multitudes—and at least half of them are completely unhinged.",
];

function isBalancedRatings(analysis: FavoritesAnalysis): boolean {
  const total = analysis.ratings.reduce((s, r) => s + r.count, 0) || 1;
  const shares = analysis.ratings.map((r) => r.count / total);
  return analysis.ratings.length === 3 && Math.max(...shares) - Math.min(...shares) <= 0.16;
}

/** Pick a random Final Verdict line for this analysis. The near-even case uses the secret pools;
 *  otherwise it's keyed by the dominant rating. A large analysed sample draws exclusively from
 *  the highest size tier it qualifies for (10k > 5k > normal), falling through if that tier is
 *  empty. `{count}` tokens are filled with the analysed count. Call once per card so it doesn't
 *  re-roll on preview rebuilds. */
export function pickFinalVerdict(analysis: FavoritesAnalysis): string {
  const dominant = [...analysis.ratings].sort((a, b) => b.count - a.count)[0]?.label ?? "Safe";
  const balanced = isBalancedRatings(analysis);
  const total = analysis.total;

  const base = balanced ? VERDICT_BALANCED : RATING_VERDICT[dominant] ?? [];
  const t5 = balanced ? VERDICT_BALANCED_5K : RATING_VERDICT_5K[dominant] ?? [];
  const t10 = balanced ? VERDICT_BALANCED_10K : RATING_VERDICT_10K[dominant] ?? [];

  let pool = base;
  if (total >= VERDICT_5K_MIN && t5.length) pool = t5;
  if (total >= VERDICT_10K_MIN && t10.length) pool = t10;

  return (pickRandom(pool) ?? "").replace(/\{count\}/g, total.toLocaleString());
}

// --- text measurement ---
let measureCtx: CanvasRenderingContext2D | null | undefined;
function ctx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  }
  return measureCtx;
}
function measure(str: string, weight: number, size: number): number {
  const c = ctx();
  if (!c) return str.length * size * 0.54;
  c.font = `${weight} ${size}px ${FONT}`;
  return c.measureText(str).width;
}
function fit(str: string, maxW: number, weight: number, size: number): string {
  if (measure(str, weight, size) <= maxW) return str;
  let s = str;
  while (s.length > 1 && measure(s + "…", weight, size) > maxW) s = s.slice(0, -1);
  return s.replace(/\s+$/, "") + "…";
}
/** Greedy word wrap into at most `maxLines`; the final line is fit-truncated if it overflows. */
function wrapText(str: string, maxW: number, weight: number, size: number, maxLines: number): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || measure(test, weight, size) <= maxW) {
      cur = test;
    } else {
      lines.push(cur);
      if (lines.length === maxLines - 1) {
        cur = words.slice(i).join(" ");
        break;
      }
      cur = words[i];
    }
  }
  if (cur) lines.push(fit(cur, maxW, weight, size));
  return lines;
}

// --- xml helpers ---
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
const nice = (tag: string) => tag.replace(/_/g, " ");

let clipSeq = 0;
/** A post thumbnail as a faded, rounded-rect-clipped background, with a dark scrim on top so
 *  overlaid text keeps its contrast regardless of the image. Empty string when no image. */
function bgImage(
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  dataUrl: string | undefined,
  opacity: number,
  scrim: number,
): string {
  if (!dataUrl) return "";
  const id = `clip${clipSeq++}`;
  return (
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}"/></clipPath>` +
    `<image href="${dataUrl}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" opacity="${opacity}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="#0e0e14" fill-opacity="${scrim}"/>`
  );
}

interface TextOpts {
  size: number;
  fill: string;
  weight?: number;
  spacing?: number;
  italic?: boolean;
  anchor?: "start" | "middle" | "end";
}
function T(x: number, baseline: number, content: string, o: TextOpts): string {
  const a = [
    `x="${x}"`,
    `y="${baseline}"`,
    `font-size="${o.size}"`,
    `fill="${esc(o.fill)}"`,
    `font-weight="${o.weight ?? 400}"`,
    o.spacing ? `letter-spacing="${o.spacing}"` : "",
    o.italic ? 'font-style="italic"' : "",
    o.anchor && o.anchor !== "start" ? `text-anchor="${o.anchor}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${a}>${esc(content)}</text>`;
}
const heading = (x: number, baseline: number, label: string) =>
  T(x, baseline, label, { size: 21, fill: "#8a8a9c", weight: 700, spacing: 3 });

/** A "fun" ticked bar: `cells` little rounded blocks, the first `round(ratio * cells)` in accent. */
function segBar(x: number, y: number, w: number, h: number, ratio: number, accent: string, cells = 20): string {
  const gap = 3;
  const cellW = (w - gap * (cells - 1)) / cells;
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = clamped > 0 ? Math.max(1, Math.round(clamped * cells)) : 0;
  const out: string[] = [];
  for (let i = 0; i < cells; i++) {
    const cx = (x + i * (cellW + gap)).toFixed(1);
    out.push(
      i < filled
        ? `<rect x="${cx}" y="${y}" width="${cellW.toFixed(1)}" height="${h}" rx="2" fill="${esc(accent)}"/>`
        : `<rect x="${cx}" y="${y}" width="${cellW.toFixed(1)}" height="${h}" rx="2" fill="#ffffff" fill-opacity="0.08"/>`,
    );
  }
  return out.join("");
}

export interface CardOptions {
  analysis: FavoritesAnalysis;
  displayName: string;
  site: Site;
  accent: string;
  sampled: number;
  /** The user's avatar as a `data:` URL (fetched + encoded by the caller). Falls back to a
   *  monogram squircle when absent. */
  avatarDataUrl?: string | null;
  /** Avatar width/height ratio, so the squircle keeps the image's real proportions. */
  avatarAspect?: number;
  /** Per top-artist label: a `data:` URL for that artist's top post, as a faded row background. */
  artistImages?: Record<string, string>;
  /** Per top-tag label: a `data:` URL for a favourite carrying that tag, as a faded chip bg. */
  tagImages?: Record<string, string>;
  /** The Final Verdict line, chosen once by the caller (see `pickFinalVerdict`). */
  verdict?: string;
}

export function buildFavoritesCardSvg({
  analysis,
  displayName,
  site,
  accent,
  sampled,
  avatarDataUrl,
  avatarAspect = 1,
  artistImages = {},
  tagImages = {},
  verdict,
}: CardOptions): string {
  clipSeq = 0;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const ratingTotal = analysis.ratings.reduce((s, r) => s + r.count, 0) || 1;
  const dominant = [...analysis.ratings].sort((a, b) => b.count - a.count)[0];
  const dominantRating = dominant?.label ?? "Safe";
  const ratingShare = dominant ? Math.round((dominant.count / ratingTotal) * 100) : 0;
  const topTag = analysis.topTags[0]?.label;
  // A data-driven one-liner for the header: "72% explicit · top pick: wolf".
  const vibe = dominant
    ? `${ratingShare}% ${dominantRating.toLowerCase()}${topTag ? ` · top pick: ${nice(topTag)}` : ""}`
    : `A look at ${sampled.toLocaleString()} favourites.`;

  // "Final Verdict" line (bottom of card). The caller picks it once (`pickFinalVerdict`) so it's
  // stable across preview rebuilds; fall back to a fresh pick if not supplied.
  const balancedVerdict = isBalancedRatings(analysis);
  const verdictLine = verdict ?? pickFinalVerdict(analysis);
  const sharePct = analysis.total
    ? Math.round(
        (analysis.topArtists.slice(0, 5).reduce((s, a) => s + a.count, 0) / analysis.total) * 100,
      )
    : 0;

  const p: string[] = [];

  p.push(`
    <defs>
      <radialGradient id="glow" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="${esc(accent)}" stop-opacity="0.42"/>
        <stop offset="55%" stop-color="${esc(accent)}" stop-opacity="0.07"/>
        <stop offset="100%" stop-color="${esc(accent)}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${CARD_W}" height="${CARD_H}" fill="#0e0e14"/>
    <rect width="${CARD_W}" height="${CARD_H}" fill="url(#glow)"/>
  `);

  // avatar (top-right) - an aspect-preserving squircle, vertically centred on the header text
  const AV_MAX = 172;
  const aspect = Number.isFinite(avatarAspect) && avatarAspect > 0 ? avatarAspect : 1;
  const avW = Math.round(aspect >= 1 ? AV_MAX : AV_MAX * aspect);
  const avH = Math.round(aspect >= 1 ? AV_MAX / aspect : AV_MAX);
  const avX = CARD_W - PAD - avW;
  const avY = Math.round(200 - avH / 2); // header text runs ~y70..y330; centre the avatar in it
  const avRx = 28;
  if (avatarDataUrl) {
    p.push(
      `<defs><clipPath id="avclip"><rect x="${avX}" y="${avY}" width="${avW}" height="${avH}" rx="${avRx}" ry="${avRx}"/></clipPath></defs>` +
        `<image href="${avatarDataUrl}" x="${avX}" y="${avY}" width="${avW}" height="${avH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avclip)"/>` +
        `<rect x="${avX}" y="${avY}" width="${avW}" height="${avH}" rx="${avRx}" ry="${avRx}" fill="none" stroke="${esc(accent)}" stroke-width="6"/>`,
    );
  } else {
    const initial = (displayName.trim()[0] ?? "?").toUpperCase();
    p.push(
      `<rect x="${avX}" y="${avY}" width="${avW}" height="${avH}" rx="${avRx}" ry="${avRx}" fill="${esc(accent)}" fill-opacity="0.16" stroke="${esc(accent)}" stroke-width="5"/>`,
    );
    p.push(T(avX + avW / 2, avY + avH / 2 + 24, initial, { size: 66, fill: accent, weight: 800, anchor: "middle" }));
  }
  const nameMaxW = avX - PAD - 28;

  // header
  p.push(T(PAD, 92, "MONOSODIUM DESKTOP", { size: 22, fill: accent, weight: 700, spacing: 5 }));
  p.push(T(PAD, 168, "Favorites, wrapped", { size: 64, fill: "#f5f5f8", weight: 800 }));
  p.push(T(PAD, 226, fit(displayName, nameMaxW, 800, 40), { size: 40, fill: accent, weight: 800 }));
  p.push(
    T(
      PAD,
      264,
      fit(
        `${SITE_DISPLAY_NAME[site]}  ·  ${sampled.toLocaleString()} favorites analyzed  ·  ${date}`,
        nameMaxW,
        500,
        22,
      ),
      { size: 22, fill: "#9a9aac", weight: 500 },
    ),
  );
  p.push(T(PAD, 312, fit(vibe, INNER_W, 600, 26), { size: 26, fill: "#d8d8e4", weight: 600, italic: true }));

  // score tiles
  const tileY = 360;
  const tileH = 148;
  const tileW = (INNER_W - 56) / 3;
  ([
    ["AVG SCORE", analysis.avgScore],
    ["MEDIAN", analysis.medianScore],
    ["TOP SCORE", analysis.highestScore],
  ] as [string, number][]).forEach(([label, value], i) => {
    const x = PAD + i * (tileW + 28);
    p.push(
      `<rect x="${x}" y="${tileY}" width="${tileW}" height="${tileH}" rx="20" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.08"/>`,
    );
    p.push(T(x + 26, tileY + 46, label, { size: 19, fill: "#8a8a9c", weight: 700, spacing: 2 }));
    p.push(
      T(x + 26, tileY + 112, fit(value.toLocaleString(), tileW - 40, 800, 46), {
        size: 46,
        fill: "#f5f5f8",
        weight: 800,
      }),
    );
  });

  // top artists - full-width rows, each with its top post as a faded background
  p.push(heading(PAD, 574, "TOP ARTISTS"));
  const artists = analysis.topArtists.slice(0, 5);
  const artistMax = Math.max(1, ...artists.map((a) => a.count));
  const rowH = 78;
  const rowStep = rowH + 12;
  artists.forEach((a, i) => {
    const y = 596 + i * rowStep;
    p.push(`<rect x="${PAD}" y="${y}" width="${INNER_W}" height="${rowH}" rx="18" fill="#ffffff" fill-opacity="0.05"/>`);
    p.push(bgImage(PAD, y, INNER_W, rowH, 18, artistImages[a.label], 0.32, 0.22));
    p.push(`<rect x="${PAD}" y="${y}" width="${INNER_W}" height="${rowH}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>`);
    p.push(
      T(PAD + 24, y + 37, fit(nice(a.label), INNER_W - 48 - 120, 700, 27), {
        size: 27,
        fill: "#f2f2f6",
        weight: 700,
      }),
    );
    p.push(
      T(PAD + INNER_W - 24, y + 37, a.count.toLocaleString(), {
        size: 24,
        fill: "#d7d7e0",
        weight: 700,
        anchor: "end",
      }),
    );
    p.push(segBar(PAD + 24, y + rowH - 26, INNER_W - 48, 13, a.count / artistMax, accent));
  });
  if (artists.length === 0) {
    p.push(T(PAD, 636, "No artist tags in this sample.", { size: 24, fill: "#6c6c7c" }));
  }
  const afterArtists = artists.length > 0 ? 596 + artists.length * rowStep : 700;

  // ratings segmented bar
  const ratHeadingY = afterArtists + 40;
  p.push(heading(PAD, ratHeadingY, "RATINGS"));
  const segY = ratHeadingY + 20;
  const segH = 30;
  let segX = PAD;
  analysis.ratings.forEach((r, i) => {
    const w = (r.count / ratingTotal) * INNER_W;
    const last = i === analysis.ratings.length - 1;
    p.push(
      `<rect x="${segX}" y="${segY}" width="${Math.max(0, w - (last ? 0 : 4))}" height="${segH}" rx="6" fill="${RATING_COLOR[r.label] ?? accent}"/>`,
    );
    segX += w;
  });
  let legX = PAD;
  analysis.ratings.forEach((r) => {
    const lbl = `${r.label} ${Math.round((r.count / ratingTotal) * 100)}%`;
    p.push(`<circle cx="${legX + 7}" cy="${segY + segH + 36}" r="7" fill="${RATING_COLOR[r.label] ?? accent}"/>`);
    p.push(T(legX + 24, segY + segH + 43, lbl, { size: 22, fill: "#c9c9d6", weight: 600 }));
    legX += 24 + measure(lbl, 600, 22) + 40;
  });

  // top characters & series - bigger chips, each with a faded favourite behind it
  const chipsHeadingY = segY + segH + 44 + 44;
  p.push(heading(PAD, chipsHeadingY, "TOP CHARACTERS & SERIES"));
  const chipH = 56;
  const chipPadX = 22;
  const chipGap = 14;
  const rowGap = 14;
  const maxChipRows = 3;
  let chipX = PAD;
  let chipRowTop = chipsHeadingY + 22;
  let rows = 0;
  for (const t of analysis.topTags.slice(0, 12)) {
    const label = fit(nice(t.label), INNER_W - chipPadX * 2, 600, 24);
    const w = Math.ceil(measure(label, 600, 24)) + chipPadX * 2;
    if (chipX + w > CARD_W - PAD && chipX > PAD) {
      chipX = PAD;
      chipRowTop += chipH + rowGap;
      rows += 1;
      if (rows >= maxChipRows) break;
    }
    p.push(`<rect x="${chipX}" y="${chipRowTop}" width="${w}" height="${chipH}" rx="${chipH / 2}" fill="${esc(accent)}" fill-opacity="0.14"/>`);
    p.push(bgImage(chipX, chipRowTop, w, chipH, chipH / 2, tagImages[t.label], 0.36, 0.3));
    p.push(T(chipX + chipPadX, chipRowTop + 37, label, { size: 24, fill: "#f2f2f8", weight: 600 }));
    chipX += w + chipGap;
  }

  // final verdict. Short canned lines get a labelled, left-aligned 2-line box; the long
  // secret / 5k-bonus lines get a label-less, centred, italic box that runs up to 4 lines.
  if (verdictLine) {
    const longStyle =
      balancedVerdict || wrapText(verdictLine, INNER_W - 52, 700, 25, 6).length > 2;
    const vH = longStyle ? 168 : 130;
    const vY = CARD_H - 92 - 24 - vH; // footer divider at CARD_H-92, ~24px above it
    p.push(
      `<rect x="${PAD}" y="${vY}" width="${INNER_W}" height="${vH}" rx="18" fill="${esc(accent)}" fill-opacity="0.08" stroke="${esc(accent)}" stroke-opacity="0.28"/>`,
    );
    if (longStyle) {
      const lh = 27;
      const lines = wrapText(verdictLine, INNER_W - 68, 700, 21, 5);
      const startY = vY + vH / 2 - ((lines.length - 1) * lh) / 2 + 7;
      lines.forEach((ln, i) =>
        p.push(
          T(CARD_W / 2, startY + i * lh, ln, {
            size: 21,
            fill: "#f4f4f8",
            weight: 700,
            italic: true,
            anchor: "middle",
          }),
        ),
      );
    } else {
      p.push(T(PAD + 26, vY + 38, "FINAL VERDICT", { size: 19, fill: accent, weight: 700, spacing: 3 }));
      const lines = wrapText(verdictLine, INNER_W - 52, 700, 25, 2);
      const oneLine = lines.length === 1;
      lines.forEach((ln, i) =>
        p.push(
          T(PAD + 26, vY + (oneLine ? 90 : 74) + i * 33, ln, { size: 25, fill: "#f4f4f8", weight: 700 }),
        ),
      );
    }
  }

  // footer
  p.push(`<rect x="0" y="${CARD_H - 92}" width="${CARD_W}" height="1" fill="#ffffff" fill-opacity="0.08"/>`);
  p.push(T(PAD, CARD_H - 46, "Made with Monosodium Desktop", { size: 22, fill: "#7c7c8c", weight: 600 }));
  if (analysis.topArtists.length >= 3) {
    p.push(
      T(CARD_W - PAD, CARD_H - 46, `${sharePct}% from the top 5 artists`, {
        size: 22,
        fill: "#7c7c8c",
        weight: 600,
        anchor: "end",
      }),
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="${FONT}">${p.join(
    "",
  )}</svg>`;
}
