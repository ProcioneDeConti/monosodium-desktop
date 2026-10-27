import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, ChevronLeft, ChevronRight, Copy, FileDown, Image as ImageIcon, X } from "lucide-react";
import mascotUrl from "../../assets/mascot.png";
import type { Site } from "../../models/site";
import type { FavoritesAnalysis } from "../../lib/favoritesAnalysis";
import { e621Api } from "../../api/client";
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import { useSettingsStore } from "../../state/settingsStore";
import { isBlacklisted, parseBlacklist } from "../../lib/blacklist";
import { CARD_MAX_ARTISTS, CARD_MAX_TAGS, pickFinalVerdict } from "../../lib/favoritesCard";
import { buildWrappedPages, SHAPE_SIZE, type CardMode, type CardShape } from "../../lib/wrappedSlides";
import { deriveTheme, sampleThemeColor, type GusArt } from "../../lib/wrappedFrame";
import { pickArchetype } from "../../lib/wrappedArchetype";
import { spicyAllowed } from "../../lib/mascotSpicy";
import { copyCardToClipboard, exportCard, svgPreviewUrl, type CardFormat } from "../../lib/exportCard";
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
/** Random favourites fetched for the background wall (before blacklist filtering). */
const COLLAGE_FETCH = 75;

/** mascot.png as a data: URL (an <image> in a rasterised SVG can't load external URLs). */
async function loadGus(): Promise<GusArt> {
  const blob = await (await fetch(mascotUrl)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const aspect = await new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.onerror = () => resolve(1);
    img.src = dataUrl;
  });
  return { dataUrl, aspect };
}

/** A small segmented toggle for the dialog's card options. */
function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-[var(--radius-sm)] bg-black/5 p-0.5 dark:bg-white/5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium transition-colors ${
            value === v ? "bg-[rgb(var(--accent))] text-white" : "opacity-70 hover:opacity-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

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
  const cheeky = useSettingsStore((s) => spicyAllowed(s));
  const [archetype] = useState(() => pickArchetype(analysis, cheeky));
  const [mode, setMode] = useState<CardMode>("single");
  const [shape, setShape] = useState<CardShape>("story");
  const [colorSource, setColorSource] = useState<"auto" | "accent">("auto");
  const [showImages, setShowImages] = useState(true);
  const [showGus, setShowGus] = useState(true);
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [gus, setGus] = useState<GusArt | null>(null);
  const [sampledColor, setSampledColor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGus().then(
      (g) => !cancelled && setGus(g),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);
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
  const [collageImages, setCollageImages] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const artists = analysis.topArtists.slice(0, CARD_MAX_ARTISTS);
    const tags = analysis.topTags.slice(0, CARD_MAX_TAGS);

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

      // Background wall: its own batch of random favourites, so it doesn't have to cycle the
      // ~17 row/chip images above. One API call; thumbnails come straight off the CDN.
      try {
        const r = await e621Api.getPosts(
          site,
          `fav:${displayName} order:random ${ratingFilter ?? ""}`.trim(),
          COLLAGE_FETCH,
        );
        const urls = [
          ...new Set(
            r.posts
              .filter((p) => !isBlacklisted(blacklistEntries, p))
              .map((p) => p.preview?.url)
              .filter((u): u is string => !!u),
          ),
        ];
        const data = await Promise.all(urls.map(toDataUrl));
        if (cancelled) return;
        setCollageImages(data.filter((d): d is string => !!d));
      } catch {
        /* fall back to the row/chip images */
      }
      if (cancelled) return;
      setPreparing(false);
    })();

    const timer = setTimeout(() => !cancelled && setPreparing(false), PREP_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysis, site, displayName, blacklistEntries, ratingFilter]);

  // Theme colour from the #1 artist's top post once it's in (falls back to the accent).
  const topArtistImage = analysis.topArtists[0] ? artistImages[analysis.topArtists[0].label] : undefined;
  useEffect(() => {
    if (!topArtistImage) return;
    let cancelled = false;
    sampleThemeColor(topArtistImage).then(
      (c) => !cancelled && setSampledColor(c),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [topArtistImage]);
  const theme = useMemo(
    () => deriveTheme(colorSource === "auto" && sampledColor ? sampledColor : accent),
    [colorSource, sampledColor, accent],
  );

  // Each collage photo's aspect ratio, so the background wall packs like the real masonry grid.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const missing = [...new Set([...collageImages, ...Object.values(artistImages), ...Object.values(tagImages)])].filter(
      (src) => !(src in aspects),
    );
    if (missing.length === 0) return;
    // Measured as one batch: a setAspects per image would rebuild every page's SVG ~90 times.
    void Promise.all(
      missing.map(
        (src) =>
          new Promise<[string, number]>((resolve) => {
            const img = new Image();
            img.onload = () => resolve([src, img.naturalWidth / Math.max(1, img.naturalHeight)]);
            img.onerror = () => resolve([src, 1]);
            img.src = src;
          }),
      ),
    ).then((measured) => !cancelled && setAspects((a) => ({ ...a, ...Object.fromEntries(measured) })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `aspects` only filters already-measured images
  }, [collageImages, artistImages, tagImages]);

  const pages = useMemo(() => {
    const collage = showImages
      ? [...new Set([...collageImages, ...Object.values(artistImages), ...Object.values(tagImages)])].map((src) => ({ src, aspect: aspects[src] ?? 1 }))
      : [];
    return buildWrappedPages(
      {
        analysis,
        displayName,
        site,
        sampled,
        // The avatar is itself an e621 post (possibly explicit), so SFW drops it with the rest.
        avatarDataUrl: showImages ? (avatar?.dataUrl ?? null) : null,
        avatarAspect: avatar?.aspect ?? 1,
        artistImages: showImages ? artistImages : {},
        tagImages: showImages ? tagImages : {},
        verdict,
        theme,
        archetype,
        gus: showGus ? gus : null,
        collage,
      },
      mode,
      shape,
    );
  }, [analysis, displayName, site, sampled, avatar, artistImages, tagImages, collageImages, aspects, verdict, theme, archetype, gus, showGus, showImages, mode, shape]);
  const pageIdx = Math.min(page, pages.length - 1);
  const previewUrl = useMemo(() => svgPreviewUrl(pages[pageIdx]), [pages, pageIdx]);
  const { w: cardW, h: cardH } = SHAPE_SIZE[shape];

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
      const path = await exportCard(pages, cardW, cardH, format, safeFileName(displayName));
      if (path) setResult({ path });
    } catch (e) {
      setError(errorMessage(e, "Export failed."));
    } finally {
      setBusy(null);
    }
  }

  async function doCopy() {
    if (busy) return;
    setError(null);
    try {
      await copyCardToClipboard(pages[pageIdx], cardW, cardH);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setError(errorMessage(e, "Copy failed."));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md animate-[scale-in_120ms_ease-out] flex-col
                   rounded-[var(--radius-md)] border border-black/10 bg-[rgb(var(--lt-surface))] shadow-2xl
                   dark:border-white/10 dark:bg-[rgb(var(--dk-surface))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h1 className="text-sm font-semibold">Share card</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
            <span className="opacity-60">Layout</span>
            <Seg
              value={mode}
              onChange={(v) => {
                setMode(v);
                setPage(0);
              }}
              options={[
                ["single", "Single card"],
                ["multi", "Multiple cards"],
              ]}
            />
            <span className="opacity-60">Shape</span>
            <Seg
              value={shape}
              onChange={setShape}
              options={[
                ["story", "Story 9:16"],
                ["square", "Square"],
              ]}
            />
            <span className="opacity-60">Colors</span>
            <Seg
              value={colorSource}
              onChange={setColorSource}
              options={[
                ["auto", "From #1 favorite"],
                ["accent", "Accent"],
              ]}
            />
            <span className="opacity-60">Images</span>
            <Seg
              value={showImages ? "on" : "off"}
              onChange={(v) => setShowImages(v === "on")}
              options={[
                ["on", "Show posts"],
                ["off", "SFW (no posts)"],
              ]}
            />
            <span className="opacity-60">Gus</span>
            <Seg
              value={showGus ? "on" : "off"}
              onChange={(v) => setShowGus(v === "on")}
              options={[
                ["on", "On"],
                ["off", "Off"],
              ]}
            />
          </div>

          <div className="mx-auto max-w-[280px]">
            <div className="overflow-hidden rounded-[var(--radius-md)] shadow-lg">
              {/* SVG preview - scaled down to fit; export rasterises at full 2x. */}
              <img
                src={previewUrl}
                alt="Favorites card preview"
                width={cardW}
                height={cardH}
                className="block h-auto w-full"
              />
            </div>
            {pages.length > 1 && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                <IconButton onClick={() => setPage(Math.max(0, pageIdx - 1))} title="Previous card" disabled={pageIdx === 0}>
                  <ChevronLeft size={15} />
                </IconButton>
                <span className="tabular-nums opacity-70">
                  {pageIdx + 1} / {pages.length}
                </span>
                <IconButton
                  onClick={() => setPage(Math.min(pages.length - 1, pageIdx + 1))}
                  title="Next card"
                  disabled={pageIdx === pages.length - 1}
                >
                  <ChevronRight size={15} />
                </IconButton>
              </div>
            )}
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
            <Button
              icon={copied ? <Check size={13} /> : <Copy size={13} />}
              disabled={!!busy || preparing}
              onClick={() => void doCopy()}
              title={pages.length > 1 ? "Copy the card shown above" : "Copy to clipboard"}
              className="flex-1 justify-center"
            >
              {copied ? "Copied" : "Copy"}
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
