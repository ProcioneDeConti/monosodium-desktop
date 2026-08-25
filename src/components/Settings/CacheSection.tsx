import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { e621Api } from "../../api/client";
import {
  DEFAULT_CACHE_MB,
  LAST_CACHE_INDEX,
  cacheIndexForMb,
  cacheMbForIndex,
  formatCacheBytes,
  formatCacheSize,
} from "../../lib/cacheLimits";
import { useCacheInfo } from "../../queries/useCacheInfo";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

/** WebView2's own on-disk HTTP cache is what actually holds cached thumbnails/samples/full
 *  images/videos here - media loads directly in the webview with no Rust round-trip (see
 *  CLAUDE.md's critical-constraint section), unlike the reference Android app's self-managed
 *  Coil disk cache. WebView2's cache is owned by an external browser process
 *  (msedgewebview2.exe) that holds file locks on it while running, so - unlike Coil's live
 *  `.clear()`/rebuild-on-setting-change - neither a clear nor a new size limit can apply until
 *  the next launch; both controls below say so. See src-tauri/src/cache.rs's doc comment for how
 *  that's implemented (a pending-clear marker + a persisted limit, both applied by `bootstrap()`
 *  before the webview - and so the process holding those locks - exists). */
export function CacheSection() {
  const { data, isLoading, refetch, isRefetching } = useCacheInfo(true);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [clearRequested, setClearRequested] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const committedIndex = cacheIndexForMb(data?.limit_mb ?? DEFAULT_CACHE_MB);
  const displayIndex = pendingIndex ?? committedIndex;
  const displayMb = cacheMbForIndex(displayIndex);

  async function commitLimit(index: number) {
    setPendingIndex(index);
    await e621Api.setCacheLimitMb(cacheMbForIndex(index));
  }

  async function clearCache() {
    await e621Api.requestCacheClear();
    setClearRequested(true);
  }

  async function restartNow() {
    setRestarting(true);
    await relaunch();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Thumbnails, samples, and full images/videos are cached on disk by the app's embedded
        browser as they're viewed.
      </p>

      <div className="flex items-center gap-2 text-sm">
        <span className="w-36 shrink-0">Current usage</span>
        {isLoading ? (
          <Spinner size={13} className="opacity-60" />
        ) : (
          <span className="tabular-nums opacity-80">{formatCacheBytes(data?.used_bytes ?? 0)}</span>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="text-xs text-[rgb(var(--accent))] hover:underline disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-sm">Size limit</span>
        <input
          type="range"
          min={0}
          max={LAST_CACHE_INDEX}
          step={1}
          value={displayIndex}
          onChange={(e) => void commitLimit(Number(e.target.value))}
          className="w-40 accent-[rgb(var(--accent))]"
        />
        <span className="text-xs tabular-nums opacity-60">{formatCacheSize(displayMb)}</span>
      </div>
      <p className="pl-1 text-xs opacity-50">Takes effect after restarting the app.</p>

      <div className="flex items-center gap-2">
        <Button icon={<Trash2 size={13} />} onClick={() => void clearCache()} disabled={clearRequested}>
          {clearRequested ? "Cleared on restart" : "Clear cache"}
        </Button>
        {clearRequested && (
          <Button
            icon={restarting ? <Spinner size={13} /> : <RotateCcw size={13} />}
            onClick={() => void restartNow()}
            disabled={restarting}
          >
            Restart now
          </Button>
        )}
      </div>
    </div>
  );
}
