import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Globe, Heart, Info, Send, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";

interface AboutPanelProps {
  onClose: () => void;
}

const REPO_URL = "https://github.com/ProcioneDeConti/monosodium-desktop";
const TELEGRAM_URL = "https://t.me/ProcioneDeConti";

// Curated - keep roughly in sync with package.json / src-tauri/Cargo.toml. Names only; exact
// versions would just go stale.
const STACK: { group: string; items: string[] }[] = [
  { group: "Languages", items: ["Rust", "TypeScript", "HTML", "CSS"] },
  {
    group: "Frontend",
    items: [
      "React 19",
      "Vite",
      "Tailwind CSS v4",
      "TanStack Query",
      "Zustand",
      "masonic",
      "lucide-react",
    ],
  },
  {
    group: "Backend",
    items: [
      "Tauri 2",
      "reqwest",
      "tokio",
      "serde",
      "governor",
      "aes-gcm · pbkdf2 · sha2",
      "window-vibrancy",
    ],
  },
  { group: "Platform", items: ["Windows 11 WebView2 (Chromium)"] },
];

function Row({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-black/10 px-3 py-2 text-left text-sm
                 transition-colors hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--accent))]/[0.06] dark:border-white/10"
    >
      <span className="text-[rgb(var(--accent))] opacity-90">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ExternalLink size={13} className="shrink-0 opacity-40" />
    </button>
  );
}

/** Menu → About. Plain local state, not part of the nav stack (same as Help / the cheatsheet). */
export function AboutPanel({ onClose }: AboutPanelProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[65] flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Info size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">About</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-6 py-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] shadow-lg">
              <Info size={30} />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">Monosodium Desktop</h2>
            <p className="mt-0.5 text-xs opacity-55">
              {version ? `Version ${version}` : " "}
            </p>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed opacity-75">
              A desktop browser for e621 and its sister site e6AI. Not affiliated with, endorsed by,
              or operated by either site.
            </p>
          </div>

          <p className="my-7 flex items-center justify-center gap-1.5 text-center text-sm italic opacity-70">
            Conceptualized by humans, constructed by robots, built with{" "}
            <Heart size={13} className="text-[rgb(var(--accent))]" fill="currentColor" /> love.
          </p>

          <div className="mb-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">
              Developer
            </h3>
            <p className="mb-2 text-sm">
              Procione DeConti
              <span className="opacity-55"> · © {new Date().getFullYear()}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Row icon={<Send size={14} />} onClick={() => void openUrl(TELEGRAM_URL)}>
                Telegram — @ProcioneDeConti
              </Row>
              <Row icon={<Globe size={14} />} onClick={() => void openUrl(REPO_URL)}>
                GitHub — ProcioneDeConti/monosodium-desktop
              </Row>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-50">
              Built with
            </h3>
            <div className="flex flex-col gap-3">
              {STACK.map((s) => (
                <div key={s.group}>
                  <div className="mb-1 text-xs font-semibold opacity-70">{s.group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] dark:bg-white/[0.07]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
