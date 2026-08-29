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
 *  no taint). Downscales to 24px and picks the most frequent quantised colour, discounting
 *  near-white / near-black so a mostly-white avatar still yields its accent hue. */
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
        const size = 24;
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

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

function pickDominant(data: Uint8ClampedArray): Rgb | null {
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    e.count++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  if (buckets.size === 0) return null;

  const score = (e: Bucket) => {
    const r = e.r / e.count;
    const g = e.g / e.count;
    const b = e.b / e.count;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const extreme = lum > 0.9 || lum < 0.07;
    return e.count * (extreme ? 0.2 : 1);
  };

  const best = [...buckets.values()].sort((a, b) => score(b) - score(a))[0];
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}
