// The Wrapped card in its other shapes: a compact square single card, and the multi-slide story
// (intro -> artists -> characters -> ratings -> archetype -> verdict), each slide a standalone SVG
// at the chosen aspect. The tall single card is still lib/favoritesCard.ts's buildFavoritesCardSvg.

import { SITE_DISPLAY_NAME } from "../models/site";
import {
  bgImage,
  buildFavoritesCardSvg,
  CARD_MAX_ARTISTS,
  CARD_MAX_TAGS,
  esc,
  fit,
  FONT,
  heading,
  measure,
  nice,
  RATING_COLOR,
  segBar,
  T,
  wrapText,
  type CardOptions,
} from "./favoritesCard";
import { cardFrame, finishFrost, gusSvg } from "./wrappedFrame";

export type CardShape = "story" | "square";
export type CardMode = "single" | "multi";

export const SHAPE_SIZE: Record<CardShape, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

const PAD = 80;

function svgDoc(w: number, h: number, body: string): string {
  return finishFrost(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">${body}</svg>`,
  );
}

/** Top label + page dots + bottom watermark, shared by every slide. */
function chrome(w: number, h: number, o: CardOptions, page?: [number, number]): string {
  const p: string[] = [cardFrame(w, h, o.theme, o.collage ?? [])];
  p.push(T(PAD, 96, "MONOSODIUM DESKTOP", { size: 22, fill: o.theme.primary, weight: 700, spacing: 5 }));
  if (page) {
    const [i, n] = page;
    for (let k = 0; k < n; k++) {
      const x = w - PAD - (n - 1 - k) * 26;
      p.push(`<circle cx="${x}" cy="89" r="7" fill="#ffffff" fill-opacity="${k === i ? 0.95 : 0.25}"/>`);
    }
  }
  p.push(T(w / 2, h - 52, `Made with Monosodium Desktop  ·  ${SITE_DISPLAY_NAME[o.site]}`, {
    size: 22,
    fill: "#ffffff",
    weight: 600,
    anchor: "middle",
  }).replace("<text ", '<text fill-opacity="0.55" '));
  return p.join("");
}

function bubble(x: number, y: number, w: number, text: string, tailX: number): string {
  const lines = wrapText(text, w - 56, 700, 30, 4);
  const h = 48 + lines.length * 40;
  const p = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#ffffff"/>`,
    `<path d="M${tailX - 22} ${y + h - 1} L${tailX} ${y + h + 34} L${tailX + 22} ${y + h - 1} Z" fill="#ffffff"/>`,
  ];
  lines.forEach((ln, i) => p.push(T(x + 28, y + 62 + i * 40, ln, { size: 30, fill: "#17171f", weight: 700 })));
  return p.join("");
}

function avatarBlock(cx: number, cy: number, size: number, o: CardOptions): string {
  const x = cx - size / 2;
  const y = cy - size / 2;
  if (o.avatarDataUrl) {
    return (
      `<defs><clipPath id="avbig"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}"/></clipPath></defs>` +
      `<image href="${o.avatarDataUrl}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avbig)"/>` +
      `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}" fill="none" stroke="url(#themeBand)" stroke-width="8"/>`
    );
  }
  return (
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#themeBand)"/>` +
    T(cx, cy + size * 0.14, (o.displayName.trim()[0] ?? "?").toUpperCase(), {
      size: size * 0.4,
      fill: "#ffffff",
      weight: 900,
      anchor: "middle",
    })
  );
}

function dominantRating(o: CardOptions) {
  const total = o.analysis.ratings.reduce((s, r) => s + r.count, 0) || 1;
  const d = [...o.analysis.ratings].sort((a, b) => b.count - a.count)[0];
  return { label: d?.label ?? "Safe", pct: d ? Math.round((d.count / total) * 100) : 0, total };
}

// --- slides ---

function introSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const cy = h * 0.4;
  return svgDoc(w, h, [
    chrome(w, h, o, page),
    avatarBlock(w / 2, cy - 110, 280, o),
    T(w / 2, cy + 120, "Favorites, wrapped", { size: 78, fill: "#ffffff", weight: 900, anchor: "middle" }),
    T(w / 2, cy + 190, fit(o.displayName, w - PAD * 2, 800, 54), { size: 54, fill: o.theme.primary, weight: 800, anchor: "middle" }),
    T(w / 2, cy + 250, `${o.sampled.toLocaleString()} favorites analyzed`, { size: 30, fill: "#d8d8e4", weight: 600, anchor: "middle" }),
  ].join(""));
}

function artistsSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const p = [chrome(w, h, o, page)];
  const artists = o.analysis.topArtists.slice(0, CARD_MAX_ARTISTS);
  const top = artists[0];
  const iw = w - PAD * 2;
  let y = h * 0.14;
  p.push(heading(PAD, y, "YOUR #1 ARTIST"));
  if (!top) {
    p.push(T(PAD, y + 80, "No artist tags in this sample.", { size: 34, fill: "#b8b8c8" }));
    return svgDoc(w, h, p.join(""));
  }
  const heroH = h > 1500 ? 560 : 300;
  y += 24;
  p.push(`<rect data-frost="1" x="${PAD}" y="${y}" width="${iw}" height="${heroH}" rx="32" fill="#ffffff" fill-opacity="0.06"/>`);
  p.push(bgImage(PAD, y, iw, heroH, 32, o.artistImages?.[top.label], 0.85, 0.25));
  p.push(T(PAD + 36, y + heroH - 80, fit(nice(top.label), iw - 72, 900, 64), { size: 64, fill: "#ffffff", weight: 900 }));
  p.push(T(PAD + 36, y + heroH - 34, `${top.count.toLocaleString()} favorites`, { size: 30, fill: "#ffffff", weight: 600 }));
  y += heroH + 60;
  const max = Math.max(1, top.count);
  const rowH = h > 1500 ? 96 : 74;
  artists.slice(1).forEach((a, i) => {
    const ry = y + i * (rowH + 14);
    p.push(`<rect data-frost="1" x="${PAD}" y="${ry}" width="${iw}" height="${rowH}" rx="20" fill="#ffffff" fill-opacity="0.06"/>`);
    p.push(bgImage(PAD, ry, iw, rowH, 20, o.artistImages?.[a.label], 0.3, 0.2));
    p.push(T(PAD + 26, ry + rowH / 2 - 2, `${i + 2}. ${fit(nice(a.label), iw - 220, 700, 30)}`, { size: 30, fill: "#f4f4f8", weight: 700 }));
    p.push(T(PAD + iw - 26, ry + rowH / 2 - 2, a.count.toLocaleString(), { size: 28, fill: "#e0e0ea", weight: 700, anchor: "end" }));
    p.push(segBar(PAD + 26, ry + rowH - 24, iw - 52, 11, a.count / max, o.theme.primary));
  });
  return svgDoc(w, h, p.join(""));
}

function tagsSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const p = [chrome(w, h, o, page)];
  const tags = o.analysis.topTags.slice(0, CARD_MAX_TAGS);
  const iw = w - PAD * 2;
  let y = h * 0.14;
  p.push(heading(PAD, y, "TOP CHARACTERS & SERIES"));
  const top = tags[0];
  if (top) {
    const heroH = h > 1500 ? 480 : 260;
    y += 24;
    p.push(`<rect data-frost="1" x="${PAD}" y="${y}" width="${iw}" height="${heroH}" rx="32" fill="#ffffff" fill-opacity="0.06"/>`);
    p.push(bgImage(PAD, y, iw, heroH, 32, o.tagImages?.[top.label], 0.85, 0.25));
    p.push(T(PAD + 36, y + heroH - 80, fit(nice(top.label), iw - 72, 900, 60), { size: 60, fill: "#ffffff", weight: 900 }));
    p.push(T(PAD + 36, y + heroH - 34, `${top.count.toLocaleString()} favorites`, { size: 30, fill: "#ffffff", weight: 600 }));
    y += heroH + 50;
  }
  const chipH = h > 1500 ? 76 : 60;
  const fs = h > 1500 ? 30 : 26;
  let x = PAD;
  for (const t of tags.slice(1)) {
    const label = fit(nice(t.label), iw - 48, 700, fs);
    const cw = Math.ceil(measure(label, 700, fs)) + 48;
    if (x + cw > w - PAD) {
      x = PAD;
      y += chipH + 16;
      if (y + chipH > h - 120) break;
    }
    p.push(`<rect data-frost="1" x="${x}" y="${y}" width="${cw}" height="${chipH}" rx="${chipH / 2}" fill="${esc(o.theme.primary)}" fill-opacity="0.2"/>`);
    p.push(bgImage(x, y, cw, chipH, chipH / 2, o.tagImages?.[t.label], 0.4, 0.3));
    p.push(T(x + 24, y + chipH / 2 + fs * 0.35, label, { size: fs, fill: "#ffffff", weight: 700 }));
    x += cw + 16;
  }
  return svgDoc(w, h, p.join(""));
}

function ratingsSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const p = [chrome(w, h, o, page)];
  const a = o.analysis;
  const d = dominantRating(o);
  const iw = w - PAD * 2;
  const y0 = h * 0.26;
  p.push(T(w / 2, y0, `${d.pct}%`, { size: h > 1500 ? 260 : 190, fill: RATING_COLOR[d.label] ?? o.theme.primary, weight: 900, anchor: "middle" }));
  p.push(T(w / 2, y0 + 80, `of your favorites are ${d.label}`, { size: 40, fill: "#ffffff", weight: 700, anchor: "middle" }));
  const barY = y0 + 150;
  let bx = PAD;
  a.ratings.forEach((r, i) => {
    const bw = (r.count / d.total) * iw;
    p.push(`<rect x="${bx}" y="${barY}" width="${Math.max(0, bw - (i === a.ratings.length - 1 ? 0 : 6))}" height="40" rx="10" fill="${RATING_COLOR[r.label] ?? o.theme.primary}"/>`);
    bx += bw;
  });
  let lx = PAD;
  a.ratings.forEach((r) => {
    const lbl = `${r.label} ${Math.round((r.count / d.total) * 100)}%`;
    p.push(`<circle cx="${lx + 9}" cy="${barY + 82}" r="9" fill="${RATING_COLOR[r.label] ?? o.theme.primary}"/>`);
    p.push(T(lx + 28, barY + 92, lbl, { size: 26, fill: "#e0e0ea", weight: 600 }));
    lx += 28 + measure(lbl, 600, 26) + 44;
  });
  const tileY = barY + (h > 1500 ? 220 : 150);
  const tileW = (iw - 48) / 3;
  const tileH = 170;
  ([
    ["AVG SCORE", a.avgScore],
    ["MEDIAN", a.medianScore],
    ["TOP SCORE", a.highestScore],
  ] as [string, number][]).forEach(([label, v], i) => {
    const x = PAD + i * (tileW + 24);
    p.push(`<rect data-frost="1" x="${x}" y="${tileY}" width="${tileW}" height="${tileH}" rx="24" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.1"/>`);
    p.push(T(x + tileW / 2, tileY + 52, label, { size: 20, fill: "#b0b0c0", weight: 700, spacing: 2, anchor: "middle" }));
    p.push(T(x + tileW / 2, tileY + 126, fit(v.toLocaleString(), tileW - 30, 900, 56), { size: 56, fill: "#ffffff", weight: 900, anchor: "middle" }));
  });
  return svgDoc(w, h, p.join(""));
}

function archetypeSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const p = [chrome(w, h, o, page)];
  const iw = w - PAD * 2;
  const y0 = h * 0.15;
  p.push(T(w / 2, y0, "YOUR ARCHETYPE", { size: 26, fill: "#ffffff", weight: 700, spacing: 5, anchor: "middle" }));
  const titleLines = wrapText(o.archetype.title, iw, 900, 92, 2);
  titleLines.forEach((ln, i) =>
    p.push(T(w / 2, y0 + 110 + i * 100, ln, { size: 92, fill: o.theme.primary, weight: 900, anchor: "middle" })),
  );
  let y = y0 + 110 + titleLines.length * 100;
  const blurb = wrapText(o.archetype.blurb, iw - 40, 500, 32, 3);
  blurb.forEach((ln, i) => p.push(T(w / 2, y + i * 44, ln, { size: 32, fill: "#e8e8f0", weight: 500, anchor: "middle" })));
  y += blurb.length * 44 + 40;
  if (o.gus) {
    const gusH = Math.min(h - y - 380, h > 1500 ? 620 : 300);
    p.push(bubble(PAD + 40, y, iw - 80, o.archetype.gusLine, w / 2 - 60));
    p.push(gusSvg(o.gus, o.archetype.pose, w / 2, h - 110, Math.max(200, gusH)));
  }
  return svgDoc(w, h, p.join(""));
}

function verdictSlide(w: number, h: number, o: CardOptions, page: [number, number]): string {
  const p = [chrome(w, h, o, page)];
  const iw = w - PAD * 2;
  const a = o.analysis;
  const y0 = h * 0.16;
  p.push(T(w / 2, y0, "FINAL VERDICT", { size: 26, fill: o.theme.primary, weight: 700, spacing: 5, anchor: "middle" }));
  const lines = wrapText(o.verdict ?? "", iw - 20, 800, h > 1500 ? 46 : 38, h > 1500 ? 7 : 5);
  const lh = h > 1500 ? 62 : 52;
  lines.forEach((ln, i) =>
    p.push(T(w / 2, y0 + 90 + i * lh, ln, { size: h > 1500 ? 46 : 38, fill: "#ffffff", weight: 800, anchor: "middle" })),
  );
  // summary strip
  const d = dominantRating(o);
  const stats: [string, string][] = [
    ["ARCHETYPE", o.archetype.title],
    ["TOP ARTIST", a.topArtists[0] ? nice(a.topArtists[0].label) : "—"],
    ["TOP TAG", a.topTags[0] ? nice(a.topTags[0].label) : "—"],
    ["MOSTLY", `${d.label} (${d.pct}%)`],
  ];
  const rowH = 92;
  const sy = h - 140 - stats.length * (rowH + 12);
  stats.forEach(([k, v], i) => {
    const y = sy + i * (rowH + 12);
    p.push(`<rect data-frost="1" x="${PAD}" y="${y}" width="${iw}" height="${rowH}" rx="22" fill="#ffffff" fill-opacity="0.07"/>`);
    p.push(T(PAD + 28, y + 56, k, { size: 20, fill: "#a8a8b8", weight: 700, spacing: 2 }));
    p.push(T(PAD + iw - 28, y + 58, fit(v, iw - 260, 800, 32), { size: 32, fill: "#ffffff", weight: 800, anchor: "end" }));
  });
  return svgDoc(w, h, p.join(""));
}

/** The compact square single card - header, archetype, three headline facts, verdict + Gus. */
function squareCard(o: CardOptions): string {
  const { w, h } = SHAPE_SIZE.square;
  const iw = w - PAD * 2;
  const a = o.analysis;
  const p = [chrome(w, h, o)];
  // Frosted header slab, matching the tall card's section backdrops.
  p.push(`<rect data-frost="1" x="${PAD - 24}" y="112" width="${iw + 48}" height="176" rx="28" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.07"/>`);
  p.push(avatarBlock(w - PAD - 70, 190, 140, o));
  p.push(T(PAD, 176, "Favorites, wrapped", { size: 58, fill: "#ffffff", weight: 900 }));
  p.push(T(PAD, 232, fit(o.displayName, iw - 180, 800, 38), { size: 38, fill: o.theme.primary, weight: 800 }));
  p.push(T(PAD, 272, `${o.sampled.toLocaleString()} favorites analyzed`, { size: 22, fill: "#c8c8d6", weight: 500 }));
  p.push(`<rect x="${PAD}" y="300" width="${iw}" height="120" rx="24" fill="url(#themeBand)"/>`);
  p.push(T(PAD + 28, 340, "YOUR ARCHETYPE", { size: 18, fill: "#ffffff", weight: 700, spacing: 3 }));
  p.push(T(PAD + 28, 392, fit(o.archetype.title, iw - 56, 900, 44), { size: 44, fill: "#ffffff", weight: 900 }));
  const d = dominantRating(o);
  const facts: [string, string, string | undefined][] = [
    ["TOP ARTIST", a.topArtists[0] ? nice(a.topArtists[0].label) : "—", a.topArtists[0] && o.artistImages?.[a.topArtists[0].label]],
    ["TOP TAG", a.topTags[0] ? nice(a.topTags[0].label) : "—", a.topTags[0] && o.tagImages?.[a.topTags[0].label]],
    ["MOSTLY", `${d.label} ${d.pct}%`, undefined],
  ];
  const fw = (iw - 32) / 3;
  facts.forEach(([k, v, img], i) => {
    const x = PAD + i * (fw + 16);
    p.push(`<rect data-frost="1" x="${x}" y="444" width="${fw}" height="150" rx="22" fill="#ffffff" fill-opacity="0.07"/>`);
    p.push(bgImage(x, 444, fw, 150, 22, img, 0.5, 0.35));
    p.push(T(x + 22, 484, k, { size: 17, fill: "#d0d0dc", weight: 700, spacing: 2 }));
    p.push(T(x + 22, 560, fit(v, fw - 44, 800, 30), { size: 30, fill: "#ffffff", weight: 800 }));
  });
  const gusW = o.gus ? 230 : 0;
  const vw = iw - gusW;
  const vy = 624;
  const vh = 300;
  p.push(`<rect data-frost="1" x="${PAD}" y="${vy}" width="${vw}" height="${vh}" rx="24" fill="${esc(o.theme.primary)}" fill-opacity="0.16" stroke="${esc(o.theme.primary)}" stroke-opacity="0.45"/>`);
  p.push(T(PAD + 26, vy + 42, "FINAL VERDICT", { size: 18, fill: o.theme.primary, weight: 700, spacing: 3 }));
  wrapText(o.verdict ?? "", vw - 52, 700, 25, 7).forEach((ln, i) =>
    p.push(T(PAD + 26, vy + 82 + i * 32, ln, { size: 25, fill: "#ffffff", weight: 700 })),
  );
  if (o.gus) {
    const tx = PAD + vw;
    p.push(`<path d="M${tx - 1} ${vy + vh / 2 - 18} L${tx + 28} ${vy + vh / 2} L${tx - 1} ${vy + vh / 2 + 18} Z" fill="${esc(o.theme.primary)}" fill-opacity="0.16"/>`);
    p.push(gusSvg(o.gus, o.archetype.pose, w - PAD - gusW / 2 + 16, vy + vh + 20, 270));
  }
  return svgDoc(w, h, p.join(""));
}

/** Every SVG page for this mode/shape (single mode = one page). */
export function buildWrappedPages(o: CardOptions, mode: CardMode, shape: CardShape): string[] {
  if (mode === "single") return [shape === "story" ? buildFavoritesCardSvg(o) : squareCard(o)];
  const { w, h } = SHAPE_SIZE[shape];
  const slides = [introSlide, artistsSlide, tagsSlide, ratingsSlide, archetypeSlide, verdictSlide];
  return slides.map((s, i) => s(w, h, o, [i, slides.length]));
}
