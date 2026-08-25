import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { exit } from "@tauri-apps/plugin-process";
import { EULA_TEXT } from "../../lib/eula";

interface EulaScreenProps {
  onAgree: () => void;
}

/** Full-screen first-launch gate - App.tsx renders this instead of the rest of the app until
 *  onAgree fires, ported from the reference Android app's EulaScreen (same copy, same
 *  scroll-to-the-bottom-enables-Agree gating, same disagree behavior: show an error and close
 *  the app after a few seconds rather than letting the user back out some other way). */
export function EulaScreen({ onAgree }: EulaScreenProps) {
  const [disagreed, setDisagreed] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!disagreed) return;
    const timer = setTimeout(() => void exit(0), 3000);
    return () => clearTimeout(timer);
  }, [disagreed]);

  function checkScrolled() {
    const el = scrollRef.current;
    if (!el) return;
    // True once nothing's left to scroll past - also trivially true on mount if the whole EULA
    // already fits without scrolling, matching the reference app's own derivedStateOf comment.
    setHasReachedEnd(el.scrollHeight - el.clientHeight <= el.scrollTop + 1);
  }

  useEffect(() => {
    checkScrolled();
  }, []);

  if (disagreed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] p-8 text-center">
        <TriangleAlert size={48} className="text-red-500" />
        <p className="max-w-sm text-base font-semibold">
          You must agree to the EULA to use this app. Closing…
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] p-5">
      <h1 className="mb-4 shrink-0 text-xl font-bold">End User License Agreement</h1>
      <div
        ref={scrollRef}
        onScroll={checkScrolled}
        className="flex-1 overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-relaxed"
      >
        {EULA_TEXT}
      </div>
      {!hasReachedEnd && (
        <p className="shrink-0 pt-2 text-xs opacity-60">Scroll to the bottom to enable Agree.</p>
      )}
      <div className="mt-4 flex shrink-0 gap-3">
        <button
          type="button"
          onClick={() => setDisagreed(true)}
          className="flex-1 rounded-[var(--radius-sm)] border border-black/10 dark:border-white/10 py-2
                     text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          Disagree
        </button>
        <button
          type="button"
          onClick={onAgree}
          disabled={!hasReachedEnd}
          className="flex-1 rounded-[var(--radius-sm)] bg-[rgb(var(--accent))] py-2 text-sm font-semibold
                     text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Agree
        </button>
      </div>
    </div>
  );
}
