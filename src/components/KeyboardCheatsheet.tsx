import { useRef } from "react";
import { Keyboard, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { Overlay, type OverlayHandle } from "./ui/Overlay";

interface KeyboardCheatsheetProps {
  onClose: () => void;
}

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Global",
    rows: [
      ["/", "Focus the search box"],
      ["?", "This shortcut list"],
      ["F11", "Toggle fullscreen"],
      ["Alt + ←", "Back"],
      ["Backspace", "Back (when not typing)"],
      ["Mouse back button", "Back"],
      ["Ctrl + Shift + E", "Show / hide the window (works app-unfocused)"],
    ],
  },
  {
    title: "Search tabs",
    rows: [
      ["Ctrl + T", "New tab"],
      ["Ctrl + W", "Close the current tab"],
      ["Ctrl + Tab", "Next tab (Shift for previous)"],
      ["Ctrl + 1…9", "Jump to the nth tab"],
    ],
  },
  {
    title: "Post viewer",
    rows: [
      ["← / →", "Previous / next post"],
      ["Esc", "Close the viewer"],
      ["Space", "Pause / resume slideshow"],
      ["Double-click", "Zoom image in / out"],
      ["Mouse wheel", "Zoom image at the cursor"],
      ["Drag", "Pan a zoomed image"],
    ],
  },
  {
    title: "Grid",
    rows: [
      ["↑ ↓ ← → / h j k l", "Move the focus ring (click the grid first)"],
      ["Enter / Space", "Open the focused post (or select it, in multi-select)"],
      ["Home / End", "Jump to the first / last result"],
      ["Ctrl / ⌘ + click", "Select a post (enters multi-select)"],
      ["Shift + click", "Select a range"],
      ["Esc", "Exit multi-select"],
    ],
  },
];

/** `?` from anywhere (unless typing) opens this. Plain help modal - not part of the nav stack. */
export function KeyboardCheatsheet({ onClose }: KeyboardCheatsheetProps) {
  const overlay = useRef<OverlayHandle>(null);

  return (
    <Overlay
      ref={overlay}
      onClose={onClose}
      variant="dialog"
      sheetWidth="max-w-lg"
      zClassName="z-[70]"
      closeOnScrimClick
    >
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <Keyboard size={15} className="text-[rgb(var(--accent))]" />
          <h1 className="text-sm font-semibold">Keyboard shortcuts</h1>
          <IconButton onClick={() => overlay.current?.close()} title="Close (Esc)" className="ml-auto">
            <X size={17} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            {GROUPS.map((group) => (
              <section key={group.title}>
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">
                  {group.title}
                </h2>
                <dl className="flex flex-col gap-1">
                  {group.rows.map(([key, desc]) => (
                    <div key={key} className="flex items-baseline gap-3 text-sm">
                      <dt className="w-40 shrink-0">
                        <kbd
                          className="rounded border border-black/15 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.08]
                                     px-1.5 py-0.5 text-xs font-medium"
                        >
                          {key}
                        </kbd>
                      </dt>
                      <dd className="opacity-80">{desc}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
    </Overlay>
  );
}
