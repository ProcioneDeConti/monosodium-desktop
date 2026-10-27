// Shared chrome for the Wrapped share card(s): the themed gradient background, the tilted
// favourites collage behind it, Gus, and the watermark. Pure SVG-string builders (see
// lib/favoritesCard.ts for the conventions); `sampleThemeColor` is the one DOM-touching helper.

import type { GusPose } from "./wrappedArchetype";

export interface CardTheme {
  primary: string;
  secondary: string;
}

export interface GusArt {
  dataUrl: string;
  /** width / height */
  aspect: number;
}

function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [270, 0.6, 0.6];
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** Build the card's two-colour theme from a base colour: a vivid primary plus a hue-shifted
 *  partner, both clamped bright/saturated enough to read as "bold" on the dark base. */
export function deriveTheme(base: string): CardTheme {
  const [h, s, l] = hexToHsl(base);
  const sat = Math.max(0.55, s);
  return {
    primary: hsl(h, sat, Math.min(0.66, Math.max(0.52, l))),
    secondary: hsl(h + 48, sat, 0.42),
  };
}

/** The dominant vivid colour of an image (`data:` URL) as #rrggbb, or null if it's all greys. */
export async function sampleThemeColor(dataUrl: string): Promise<string | null> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode failed"));
    img.src = dataUrl;
  });
  const S = 32;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  // Hue histogram weighted by saturation, so one vivid region beats a sea of beige.
  const bins = new Array(24).fill(0);
  const sums = bins.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < px.length; i += 4) {
    const [r, gg, b] = [px[i], px[i + 1], px[i + 2]];
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.25 || max < 50) continue;
    const [hue] = hexToHsl(`#${[r, gg, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    const bin = Math.floor(hue / 15) % 24;
    bins[bin] += sat;
    sums[bin][0] += r;
    sums[bin][1] += gg;
    sums[bin][2] += b;
    sums[bin][3] += 1;
  }
  const best = bins.indexOf(Math.max(...bins));
  if (bins[best] === 0) return null;
  const [r, gg, b, n] = sums[best];
  return `#${[r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("")}`;
}

/** Background: dark base, a diagonal two-colour gradient wash, a top glow, and (optionally) a
 *  tilted masonry wall of favourites. Also defines `#themeBand` for highlight bands. */
/** A collage photo: `data:` URL + its width/height ratio (for the masonry layout). */
export interface CollageItem {
  src: string;
  aspect: number;
}

export function cardFrame(w: number, h: number, theme: CardTheme, collage: CollageItem[]): string {
  const out: string[] = [
    `<defs>
      <linearGradient id="themeWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${theme.primary}" stop-opacity="0.55"/>
        <stop offset="55%" stop-color="${theme.secondary}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${theme.secondary}" stop-opacity="0.45"/>
      </linearGradient>
      <linearGradient id="themeBand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${theme.primary}"/>
        <stop offset="100%" stop-color="${theme.secondary}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="${theme.primary}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${theme.primary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="wallFadeGrad" cx="50%" cy="50%" r="72%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>
      </radialGradient>
      <mask id="wallFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="url(#wallFadeGrad)"/></mask>
      <filter id="frost" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter>
      <filter id="tileLift" x="-30%" y="-30%" width="160%" height="170%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="far"/>
        <feOffset in="far" dx="0" dy="22" result="farO"/>
        <feComponentTransfer in="farO" result="farS"><feFuncA type="linear" slope="0.85"/></feComponentTransfer>
        <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="near"/>
        <feOffset in="near" dx="0" dy="4" result="nearO"/>
        <feComponentTransfer in="nearO" result="nearS"><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
        <feMerge><feMergeNode in="farS"/><feMergeNode in="nearS"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`,
    `<rect width="${w}" height="${h}" fill="#0b0b11"/>`,
  ];
  if (collage.length) {
    // The grid's own masonry: fixed-width columns, each photo at its real aspect (clamped
    // [0.5, 2] like PostThumbnail) dropped into the shortest column. Laid out on a 30° tilt over a
    // square that spans the card's diagonal, so the rotation never exposes a bare corner. Each
    // photo is lifted off the background by a two-layer shadow plus a faint top-edge highlight.
    const gap = 22;
    const colW = 340;
    const span = Math.hypot(w, h);
    const cols = Math.ceil(span / (colW + gap)) + 1;
    const x0 = w / 2 - (cols * (colW + gap)) / 2;
    const y0 = h / 2 - span / 2 - colW;
    const heights = new Array(cols).fill(0);
    const tiles: string[] = [];
    // Deterministic shuffle (seeded by the set itself) so the wall doesn't re-roll on every
    // preview rebuild.
    const order = [...collage];
    let seed = collage.length * 9301 + 49297;
    for (let i = order.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const tileH = (item: (typeof order)[number]) => colW / Math.min(2, Math.max(0.5, item.aspect || 1));
    let k = 0;
    while (Math.min(...heights) < span + colW * 2 && k < 400) {
      const c = heights.indexOf(Math.min(...heights));
      // Walk a shuffled copy in order, so no photo repeats until every one has been used.
      const item = order[k % order.length];
      const th = tileH(item);
      const x = (x0 + c * (colW + gap)).toFixed(1);
      const y = (y0 + heights[c]).toFixed(1);
      tiles.push(
        `<clipPath id="ct${k}"><rect x="${x}" y="${y}" width="${colW}" height="${th.toFixed(1)}" rx="12"/></clipPath>` +
          `<g filter="url(#tileLift)"><image href="${item.src}" x="${x}" y="${y}" width="${colW}" height="${th.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ct${k})"/></g>` +
          `<rect x="${x}" y="${y}" width="${colW}" height="${th.toFixed(1)}" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5"/>`,
      );
      heights[c] += th + gap;
      k++;
    }
    // Faded toward the middle (where the content sits) so the wall frames the card rather than
    // fighting the text. `#wall` itself is unfaded - the frosted panels re-use it (see finishFrost).
    out.push(
      `<g mask="url(#wallFade)"><g id="wall" opacity="0.8"><g transform="rotate(30 ${w / 2} ${h / 2})">${tiles.join("")}</g></g></g>`,
    );
    out.push(`<rect width="${w}" height="${h}" fill="#0b0b11" fill-opacity="0.5"/>`);
  }
  out.push(`<rect width="${w}" height="${h}" fill="url(#themeWash)"/>`);
  out.push(`<rect width="${w}" height="${h}" fill="url(#glow)"/>`);
  if (collage.length) out.push(FROST_MARK);
  return out.join("");
}

const FROST_MARK = "<!--frost-->";

/** Frosted-glass panels: every `<rect data-frost>` in the finished SVG gets a heavily blurred,
 *  darkened copy of the wall behind it. Done as ONE blurred layer clipped to the union of all
 *  panels (not a filter per panel), so the 20-odd boxes on the tall card cost a single blur.
 *  Call on the complete SVG string; a card without a collage just drops the marker. */
export function finishFrost(svg: string): string {
  if (!svg.includes(FROST_MARK)) return svg;
  const panels = svg.match(/<rect data-frost="1"[^>]*>/g) ?? [];
  if (!panels.length) return svg.replace(FROST_MARK, "");
  const layer =
    `<defs><clipPath id="frostClip">${panels.join("")}</clipPath></defs>` +
    `<g clip-path="url(#frostClip)"><use href="#wall" filter="url(#frost)"/>` +
    `<rect width="100%" height="100%" fill="#0b0b11" fill-opacity="0.45"/></g>`;
  return svg.replace(FROST_MARK, layer);
}

/** Gus standing on (cx, bottomY), `height` tall, in the archetype's pose. */
export function gusSvg(gus: GusArt, pose: GusPose, cx: number, bottomY: number, height: number): string {
  const hh = height * pose.scale;
  const ww = hh * gus.aspect;
  const flip = pose.flip ? ` translate(${cx * 2} 0) scale(-1 1)` : "";
  return (
    `<g transform="rotate(${pose.tilt} ${cx} ${bottomY})${flip}">` +
    `<image href="${gus.dataUrl}" x="${cx - ww / 2}" y="${bottomY - hh}" width="${ww}" height="${hh}"/>` +
    `</g>`
  );
}
