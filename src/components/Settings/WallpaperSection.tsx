import { useEffect, useState } from "react";
import { e621Api } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import {
  ROTATION_INTERVALS_MIN,
  WALLPAPER_FITS,
  type WallpaperFit,
  type WallpaperSource,
} from "../../lib/wallpaper";
import { rotateWallpaperNow } from "../../lib/wallpaperRotation";
import { SITE_DISPLAY_NAME } from "../../models/site";
import { useAccountStore } from "../../state/accountStore";
import { useCollectionsStore } from "../../state/collectionsStore";
import { useSavedSearchesStore } from "../../state/savedSearchesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWallpaperStore } from "../../state/wallpaperStore";
import { Button } from "../ui/Button";

const SELECT_CLASS =
  "rounded-[var(--radius-sm)] border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15 min-w-0 max-w-64";

function sourceKey(source: WallpaperSource | null): string {
  if (!source) return "";
  if (source.kind === "favorites") return `fav:${source.site}:${source.username}`;
  if (source.kind === "search") return `search:${source.site}:${source.query}`;
  return `col:${source.site}:${source.collectionId}`;
}

function sourceLabel(source: WallpaperSource): string {
  if (source.kind === "favorites") return `${source.username}'s favorites (${SITE_DISPLAY_NAME[source.site]})`;
  return `${source.label} (${SITE_DISPLAY_NAME[source.site]})`;
}

/** Settings > Wallpaper: fit, timed rotation from favorites / a saved search / a collection, and
 *  a way back to the wallpaper the user had before. Logic in lib/wallpaper*.ts. */
export function WallpaperSection() {
  const site = useSettingsStore((s) => s.site);
  const adultModeEnabled = useSettingsStore((s) => s.adultModeEnabled);
  const account = useAccountStore((s) => s.accounts[site]);
  const savedSearches = useSavedSearchesStore((s) => s.savedSearches);
  const collections = useCollectionsStore((s) => s.collections);
  const w = useWallpaperStore();
  const [busy, setBusy] = useState<"next" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasPrevious, setHasPrevious] = useState(false);

  useEffect(() => {
    void e621Api.hasPreviousWallpaper().then(setHasPrevious).catch(() => {});
  }, [w.lastChangedAt]);

  // Every choice available right now on the current site, plus the saved source if it's from
  // elsewhere (other site, deleted saved search) so the select never silently shows a different one.
  const options: WallpaperSource[] = [];
  if (account?.username) options.push({ kind: "favorites", site, username: account.username });
  for (const s of savedSearches) options.push({ kind: "search", site, query: s.query, label: s.label });
  for (const c of collections)
    options.push({ kind: "collection", site, collectionId: c.id, label: c.title });
  const currentKey = sourceKey(w.source);
  if (w.source && !options.some((o) => sourceKey(o) === currentKey)) options.unshift(w.source);

  async function run(kind: "next" | "restore") {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "next") {
        await rotateWallpaperNow();
        setMessage("Wallpaper changed.");
      } else {
        await e621Api.restorePreviousWallpaper();
        if (w.rotationEnabled) w.setRotationEnabled(false);
        setHasPrevious(false);
        setMessage("Your previous wallpaper is back. Rotation is off.");
      }
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Use the wallpaper button in the post viewer to set any image, or let the app rotate through
        a source while it runs (it keeps going when hidden to the tray). Videos are skipped; your
        blacklist always applies.
      </p>

      <div className="flex items-center gap-2">
        <span className="text-sm w-36 shrink-0">Fit</span>
        <select
          value={w.fit}
          onChange={(e) => w.setFit(e.target.value as WallpaperFit)}
          className={SELECT_CLASS}
        >
          {WALLPAPER_FITS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={w.rotationEnabled}
          disabled={!w.source}
          onChange={(e) => w.setRotationEnabled(e.target.checked)}
          className="accent-[rgb(var(--accent))]"
        />
        Rotate the wallpaper automatically
      </label>

      <div className="flex items-center gap-2">
        <span className="text-sm w-36 shrink-0">Source</span>
        <select
          value={currentKey}
          onChange={(e) => {
            const picked = options.find((o) => sourceKey(o) === e.target.value) ?? null;
            w.setSource(picked);
          }}
          className={SELECT_CLASS}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={sourceKey(o)} value={sourceKey(o)}>
              {o.kind === "search" ? "Saved search: " : o.kind === "collection" ? "Collection: " : ""}
              {sourceLabel(o)}
            </option>
          ))}
        </select>
      </div>
      {options.length === 0 && (
        <p className="text-xs opacity-60">
          Sign in for favorites, or make a saved search or collection to rotate through.
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm w-36 shrink-0">Change</span>
        <select
          value={w.intervalMin}
          onChange={(e) => w.setIntervalMin(Number(e.target.value))}
          className={SELECT_CLASS}
        >
          {ROTATION_INTERVALS_MIN.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={w.safeOnly || !adultModeEnabled}
          disabled={!adultModeEnabled}
          onChange={(e) => w.setSafeOnly(e.target.checked)}
          className="mt-0.5 accent-[rgb(var(--accent))]"
        />
        <span>
          Safe-rated posts only
          <span className="block text-xs opacity-60">
            {adultModeEnabled
              ? "Your desktop is visible to anyone nearby. Off uses your enabled ratings."
              : "Always on while adult mode is off."}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button disabled={!w.source || busy !== null} onClick={() => void run("next")}>
          {busy === "next" ? "Changing…" : "Next wallpaper now"}
        </Button>
        <Button disabled={!hasPrevious || busy !== null} onClick={() => void run("restore")}>
          {busy === "restore" ? "Restoring…" : "Restore my previous wallpaper"}
        </Button>
      </div>
      {(message ?? w.lastError) && (
        <p className={`text-xs ${!message && w.lastError ? "text-red-500" : "opacity-70"}`}>
          {message ?? `Last rotation failed: ${w.lastError}`}
        </p>
      )}
      {w.current && w.lastChangedAt > 0 && (
        <p className="text-xs opacity-60">
          Current: post #{w.current.postId} on {SITE_DISPLAY_NAME[w.current.site]}, set{" "}
          {new Date(w.lastChangedAt).toLocaleString()}.
        </p>
      )}
    </div>
  );
}
