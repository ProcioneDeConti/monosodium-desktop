import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, FileDown, Image as ImageIcon, X } from "lucide-react";
import type { Site } from "../../models/site";
import type { FavoritesAnalysis } from "../../lib/favoritesAnalysis";
import { e621Api } from "../../api/client";
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import { useSettingsStore } from "../../state/settingsStore";
import { isBlacklisted, parseBlacklist } from "../../lib/blacklist";
import { buildFavoritesCardSvg, CARD_H, CARD_W, pickFinalVerdict } from "../../lib/favoritesCard";
import { exportCard, svgPreviewUrl, type CardFormat } from "../../lib/exportCard";
import { errorMessage } from "../../lib/errors";
import { pushModal } from "../../lib/modalStack";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Spinner } from "../ui/Spinner";

interface FavoritesCardDialogProps {
  analysis: FavoritesAnalysis;
  displayName: string;
  avatarId?: number | null;
  site: Site;
  sampled: number;
  onClose: () => void;
}

function safeFileName(name: string): string {
  return (name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "user") + "-favorites";
}

/** Turn a raw CDN thumbnail URL into a same-origin data: URL (so it embeds in the rasterised SVG
 *  without tainting the canvas). Returns null on any failure. */
async function toDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    return await e621Api.fetchImageDataUrl(url);
  } catch {
    return null;
  }
}

const PREP_TIMEOUT_MS = 45_000;

export function FavoritesCardDialog({
  analysis,
  displayName,
  avatarId = null,
  site,
  sampled,
  onClose,
}: FavoritesCardDialogProps) {
  const accent = useSettingsStore((s) => s.accentColor);
  const blacklist = useSettingsStore((s) => s.blacklist);
  const blacklistEntries = useMemo(() => parseBlacklist(blacklist), [blacklist]);
  // Keep the whole-site background searches within the user's rating comfort zone.
  const ratingFilter = useSettingsStore((s) => s.ratingTagFilter());
  // Picked once per dialog open, so the preview doesn't re-roll it on every image that loads in.
  const [verdict] = useState(() => pickFinalVerdict(analysis));
  const [busy, setBusy] = useState<CardFormat | null>(null);
  const [result, setResult] = useState<{ path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- avatar (data URL + aspect for the squircle) ---
  const { data: avatarUrl } = useAvatarUrl(site, avatarId);
  const [avatar, setAvatar] = useState<{ dataUrl: string; aspect: number } | null>(null);
  useEffect(() => {
    if (!avatarUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await e621Api.fetchImageDataUrl(avatarUrl);
        const aspect = await new Promise<number>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
          img.onerror = () => reject(new Error("avatar decode failed"));
          img.src = dataUrl;
        });
        if (!cancelled) setAvatar({ dataUrl, aspect });
      } catch {
        /* monogram fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  // --- card backgrounds: each artist's top post + a random post per character/series tag ---
  const [artistImages, setArtistImages] = useState<Record<string, string>>({});
  const [tagImages, setTagImages] = useState<Record<string, string>>({});
  const [preparing, setPreparing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const artists = analysis.topArtists.slice(0, 5);
    const tags = analysis.topTags.slice(0, 8);

    (async () => {
      // Each artist's top post - fetch their 5 highest-scored, take the first that passes the
      // blacklist (the "reshuffle", up to 5); fall back to the top-scored favourite we already
      // have (itself blacklist-filtered), else leave the row plain.
      const artistOut: Record<string, string> = {};
      for (const a of artists) {
        let raw = a.image;
        try {
          const r = await e621Api.getPosts(
            site,
            `${a.label} order:score ${ratingFilter ?? ""}`.trim(),
            5,
          );
          const clean = r.posts.find((p) => !isBlacklisted(blacklistEntries, p));
          if (clean) raw = clean.preview?.url ?? clean.sample?.url ?? raw;
        } catch {
          /* keep fallback */
        }
        if (cancelled) return;
        const data = await toDataUrl(raw);
        if (cancelled) return;
        if (data) {
          artistOut[a.label] = data;
          setArtistImages({ ...artistOut });
        }
      }

      // Tag backgrounds: a fresh `fav:<user> <tag> order:random` search each time (the analysis
      // reservoir - the ~8 most-recent favs per tag - gave too many repeats), first result that
      // passes the blacklist; fall back to a reservoir thumbnail, else plain.
      const tagResults = await Promise.all(
        tags.map(async (t) => {
          let raw: string | undefined;
          try {
            const r = await e621Api.getPosts(
              site,
              `fav:${displayName} ${t.label} order:random ${ratingFilter ?? ""}`.trim(),
              12,
            );
            const clean = r.posts.find((p) => !isBlacklisted(blacklistEntries, p));
            raw = clean?.preview?.url ?? clean?.sample?.url ?? undefined;
          } catch {
            /* fall through to the reservoir */
          }
          if (!raw) {
            const cands = t.imageCandidates ?? (t.image ? [t.image] : []);
            raw = cands.length ? cands[Math.floor(Math.random() * cands.length)] : undefined;
          }
          return [t.label, await toDataUrl(raw)] as const;
        }),
      );
      if (cancelled) return;
      const tagOut: Record<string, string> = {};
      for (const [label, data] of tagResults) if (data) tagOut[label] = data;
      setTagImages(tagOut);
      setPreparing(false);
    })();

    const timer = setTimeout(() => !cancelled && setPreparing(false), PREP_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysis, site, displayName, blacklistEntries, ratingFilter]);

  const svg = useMemo(
    () =>
      buildFavoritesCardSvg({
        analysis,
        displayName,
        site,
        accent,
        sampled,
        avatarDataUrl: avatar?.dataUrl ?? null,
        avatarAspect: avatar?.aspect ?? 1,
        artistImages,
        tagImages,
        verdict,
      }),
    [analysis, displayName, site, accent, sampled, avatar, artistImages, tagImages, verdict],
  );
  const previewUrl = useMemo(() => svgPreviewUrl(svg), [svg]);

  // Mark a modal as open so the Dashboard panel's own Escape handler stands down while this is up.
  useEffect(() => pushModal(), []);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  async function doExport(format: CardFormat) {
    if (busy) return;
    setBusy(format);
    setError(null);
    setResult(null);
    try {
      const path = await exportCard(svg, CARD_W, CARD_H, format, safeFileName(displayName));
      if (path) setResult({ path });
    } catch (e) {
      setError(errorMessage(e, "Export failed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 bg-[rgb(250,250,250)] shadow-2xl
                   dark:border-white/10 dark:bg-[rgb(24,24,24)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h1 className="text-sm font-semibold">Share card</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-[280px] overflow-hidden rounded-[var(--radius-md)] shadow-lg">
            {/* SVG preview - scaled down to fit; export rasterises at full 2x. */}
            <img
              src={previewUrl}
              alt="Favorites card preview"
              width={CARD_W}
              height={CARD_H}
              className="block h-auto w-full"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              icon={busy === "png" ? <Spinner size={13} /> : <ImageIcon size={13} />}
              disabled={!!busy || preparing}
              onClick={() => void doExport("png")}
              className="flex-1 justify-center"
            >
              Save PNG
            </Button>
            <Button
              icon={busy === "pdf" ? <Spinner size={13} /> : <FileDown size={13} />}
              disabled={!!busy || preparing}
              onClick={() => void doExport("pdf")}
              className="flex-1 justify-center"
            >
              Save PDF
            </Button>
          </div>

          {preparing && (
            <p className="mt-2 flex items-center gap-1.5 text-xs opacity-55">
              <Spinner size={12} />
              Preparing card images…
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          {result && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <Check size={13} />
              <span className="truncate">Saved</span>
              <button
                type="button"
                onClick={() => void revealItemInDir(result.path)}
                className="ml-auto shrink-0 text-[rgb(var(--accent))] hover:underline"
              >
                Show in folder
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
