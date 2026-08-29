import { useQuery } from "@tanstack/react-query";
import { e621Api } from "../api/client";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A representative colour of an image, for the adaptive profile hero banner. The e621 CDN sends
 *  `Access-Control-Allow-Origin: https://e621.net`, so a canvas read of a plain `<img>` from the
 *  app's origin taints - the bytes are fetched through Rust as a `data:` URL first (same-origin,
 *  no taint). Downscales to 32px and returns the **saturation²-weighted average** of the colourful
 *  pixels: this ignores large neutral (grey / near-white / near-black) regions and lands on the
 *  actual hue, rather than "most frequent quantised bucket" which a grey background dominates. */
export function useImageAccentColor(url: string | null | undefined): Rgb | null {
  const { data } = useQuery({
    queryKey: ["bannerColor", url],
    enabled: !!url,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const dataUrl = await e621Api.fetchImageDataUrl(url!);
      return await extractColor(dataUrl);
    },
  });
  return data ?? null;
}

function extractColor(src: string): Promise<Rgb | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(pickDominant(ctx.getImageData(0, 0, size, size).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function pickDominant(data: Uint8ClampedArray): Rgb | null {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sw = 0; // saturation²-weighted sums over colourful, non-extreme pixels
  let ar = 0;
  let ag = 0;
  let ab = 0;
  let an = 0; // plain average (fallback for a genuinely neutral image)

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    ar += r;
    ag += g;
    ab += b;
    an++;

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum > 0.92 || lum < 0.06) continue;
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    const w = sat * sat;
    sr += r * w;
    sg += g * w;
    sb += b * w;
    sw += w;
  }

  if (an === 0) return null;
  // Not enough colour anywhere - the image really is neutral, use its plain average.
  if (sw < an * 0.02) {
    return { r: Math.round(ar / an), g: Math.round(ag / an), b: Math.round(ab / an) };
  }
  return { r: Math.round(sr / sw), g: Math.round(sg / sw), b: Math.round(sb / sw) };
}
