import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Brain, Flame, Settings2, Sparkles, Trash2, Volume2 } from "lucide-react";
import { hasFiveHearts } from "../../lib/gusBond";
import { useSemanticStatus } from "../../lib/gusSemantic";
import { useGamesStore } from "../../state/gamesStore";
import { useSettingsStore } from "../../state/settingsStore";

/** Fired by "Forget me" - GusChat resets its log and session state when it hears it. */
export const GUS_FORGET_EVENT = "gus:forget";

/** Talk to Gus's settings, as a menu in the Games panel's top bar (left of the music), so the
 *  chat itself only shows the conversation. */
export function GusChatSettings() {
  const [open, setOpen] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const games = useGamesStore();
  const smart = useSemanticStatus((s) => s.status);
  const adultExplicit = useSettingsStore((s) => s.adultModeEnabled && s.enabledRatings.includes("e"));

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close the menu, not the game behind it.
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!confirmForget) return;
    const t = window.setTimeout(() => setConfirmForget(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmForget]);

  const smartNote = !games.chatSmart
    ? "A small local model (~23 MB, downloaded once) helps him understand what you mean. Not an LLM."
    : smart.state === "loading"
      ? `Downloading… ${Math.round(smart.progress * 100)}%`
      : smart.state === "error"
        ? `Couldn't load: ${smart.message}`
        : "On - running locally.";

  function forget() {
    if (!confirmForget) return setConfirmForget(true);
    window.dispatchEvent(new Event(GUS_FORGET_EVENT));
    setConfirmForget(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Chat settings"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
          open ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]" : "border-black/10 opacity-80 hover:opacity-100 dark:border-white/15"
        }`}
      >
        <Settings2 size={13} /> Chat
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72 origin-top-right animate-[scale-in_100ms_ease-out] overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900">
          <div className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide opacity-50">Talk to Gus</div>
          <Row
            icon={<Flame size={15} className="text-red-400" />}
            label="Nasty"
            note={adultExplicit ? "He can get explicit, and the fire bar shows." : "Needs adult mode and the Explicit rating (Settings)."}
            on={games.chatNasty && adultExplicit}
            disabled={!adultExplicit}
            onToggle={() => games.setChatNasty(!games.chatNasty)}
          />
          <Row
            icon={<Brain size={15} className="text-sky-400" />}
            label="Learn from me"
            note={`He picks up how you talk${games.learned.length ? ` (${games.learned.length} lines)` : ""}. Used only in adult + Explicit.`}
            on={games.chatLearn}
            onToggle={() => games.setChatLearn(!games.chatLearn)}
          />
          <Row
            icon={<Sparkles size={15} className={`text-amber-300 ${games.chatSmart && smart.state === "loading" ? "animate-pulse" : ""}`} />}
            label="Smart brain"
            note={smartNote}
            on={games.chatSmart}
            onToggle={() => games.setChatSmart(!games.chatSmart)}
          />
          <Row icon={<Volume2 size={15} className="text-emerald-400" />} label="Voice" note="Reads his replies aloud." on={games.chatVoice} onToggle={() => games.setChatVoice(!games.chatVoice)} />
          {hasFiveHearts(games.chat.affection) && (
            <Row
              icon={<Bell size={15} className="text-pink-400" />}
              label="Let him text me"
              note="A notification now and then when you've been away."
              on={games.chatPings}
              onToggle={() => games.setChatPings(!games.chatPings)}
            />
          )}
          <div className="mt-1 border-t border-black/10 p-1.5 dark:border-white/10">
            <button
              type="button"
              onClick={forget}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold transition-colors ${
                confirmForget ? "bg-red-500/20 text-red-500 dark:text-red-300" : "text-red-500/80 hover:bg-red-500/10 dark:text-red-300/80"
              }`}
              title="Name, likes, hearts, memories and learned lines"
            >
              <Trash2 size={15} />
              {confirmForget ? "Sure? Click again to forget" : "Make Gus forget me"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, note, on, disabled, onToggle }: { icon: ReactNode; label: string; note: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs leading-snug opacity-60">{note}</span>
      </span>
      <span className={`mt-1 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${on ? "bg-[rgb(var(--accent))]" : "bg-black/20 dark:bg-white/20"}`}>
        <span className={`h-3 w-3 rounded-full bg-white shadow transition-transform ${on ? "translate-x-3" : ""}`} />
      </span>
    </button>
  );
}
