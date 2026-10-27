// Rasterises an SVG string to PNG/JPEG in a canvas and writes it to a user-chosen path via the
// Rust export commands (or copies it to the clipboard). Used by the Dashboard's favourites-card export.

import { save } from "@tauri-apps/plugin-dialog";
import { e621Api } from "../api/client";

export type CardFormat = "png" | "pdf";

const SCALE = 2; // export at 2x the SVG's nominal size for a crisp share image

async function rasterize(
  svg: string,
  width: number,
  height: number,
  mime: "image/png" | "image/jpeg",
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the card image."));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#0e0e14"; // JPEG has no alpha - match the card background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
        mime,
        0.95,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Rasterise the card page(s) and save them. PNG: one file, or for several pages the first at the
 * chosen name and the rest suffixed `-2`, `-3`... (never overwriting). PDF: one document, one page per card. Returns the first
 * saved path, or null if the user cancelled the dialog.
 */
export async function exportCard(
  svgs: string[],
  width: number,
  height: number,
  format: CardFormat,
  defaultName: string,
): Promise<string | null> {
  if (format === "png") {
    const path = await save({
      defaultPath: `${defaultName}.png`,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (!path) return null;
    // Page 1 goes to exactly the name the user confirmed (the dialog already asked about
    // overwriting it); later pages get `-2`, `-3`... and never replace an existing file.
    await e621Api.saveExportFile(path, await blobToBase64(await rasterize(svgs[0], width, height, "image/png")));
    for (let i = 1; i < svgs.length; i++) {
      const blob = await rasterize(svgs[i], width, height, "image/png");
      await e621Api.saveExportFileNew(path.replace(/(\.png)?$/i, `-${i + 1}.png`), await blobToBase64(blob));
    }
    return path;
  }

  const path = await save({
    defaultPath: `${defaultName}.pdf`,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (!path) return null;
  const jpegs: string[] = [];
  for (const svg of svgs) jpegs.push(await blobToBase64(await rasterize(svg, width, height, "image/jpeg")));
  await e621Api.savePdfWithJpeg(path, jpegs, width * SCALE, height * SCALE);
  return path;
}

/** Rasterise one card page to PNG and put it on the system clipboard. */
export async function copyCardToClipboard(svg: string, width: number, height: number): Promise<void> {
  const blob = await rasterize(svg, width, height, "image/png");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** A data: URL for previewing the SVG in an <img> without rasterising. */
export function svgPreviewUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
