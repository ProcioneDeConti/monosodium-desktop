import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** How long the exit animation runs before the parent is told to unmount us. Keep in step with
 *  the `fade-out` / `scale-out` durations in index.css. */
const EXIT_MS = 130;

export interface OverlayHandle {
  /** Play the exit animation, then fire the overlay's `onClose`. Idempotent. */
  close: () => void;
}

interface OverlayProps {
  onClose: () => void;
  /** "full" fills the screen with an opaque surface (Popular, Wiki, Pool …). "sheet" is a
   *  full-height max-width panel that scales in over a dark scrim (Settings, Profile, Messages …).
   *  "dialog" is a centered, height-fitting card over a scrim (cheatsheet, downloads …). */
  variant?: "full" | "sheet" | "dialog";
  /** sheet/dialog - the max-width utility for the panel (default "max-w-md"). */
  sheetWidth?: string;
  /** Esc closes the overlay. Panels that first want Esc to close a nested sub-view pass `false`
   *  and drive the ref's `close()` from their own Esc handler once nothing nested is left. */
  closeOnEsc?: boolean;
  /** sheet/dialog - clicking the scrim closes. Default false (matches how the panels behaved
   *  before this component - the scrim was inert); dialogs opt in. */
  closeOnScrimClick?: boolean;
  /** Extra classes for the surface (full: the fullscreen div; sheet: the panel). */
  className?: string;
  /** Stacking - default "z-50". Dialogs that must sit above the viewer pass e.g. "z-[70]". */
  zClassName?: string;
  children: ReactNode;
}

/** The shared overlay chrome: consistent enter **and** exit animation (the exit is the point -
 *  overlays used to just vanish the instant the parent stopped rendering them), Esc handling,
 *  and, for sheets, a click-the-scrim-to-close backdrop. The parent still owns mount/unmount;
 *  this only delays the `onClose` call by one exit animation. Close buttons and custom Esc
 *  handlers call `ref.current.close()`. */
export const Overlay = forwardRef<OverlayHandle, OverlayProps>(function Overlay(
  {
    onClose,
    variant = "full",
    sheetWidth = "max-w-md",
    closeOnEsc = true,
    closeOnScrimClick = false,
    className = "",
    zClassName = "z-50",
    children,
  },
  ref,
) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useImperativeHandle(ref, () => ({ close }), [close]);

  useEffect(() => {
    if (!closeOnEsc) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOnEsc, close]);

  if (variant === "dialog") {
    return (
      <div
        className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/60 p-4 ${
          closing ? "animate-[fade-out_130ms_ease-in]" : "animate-[fade-in_150ms_ease-out]"
        }`}
        onClick={closeOnScrimClick ? close : undefined}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex max-h-[85vh] w-full ${sheetWidth} flex-col rounded-[var(--radius-md)] border
                      border-black/10 dark:border-white/10 bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl ${
                        closing ? "animate-[scale-out_130ms_ease-in]" : "animate-[scale-in_120ms_ease-out]"
                      } ${className}`}
        >
          {children}
        </div>
      </div>
    );
  }

  if (variant === "sheet") {
    return (
      <div
        className={`fixed inset-0 ${zClassName} flex justify-center bg-black/60 ${
          closing ? "animate-[fade-out_130ms_ease-in]" : "animate-[fade-in_150ms_ease-out]"
        }`}
        onClick={closeOnScrimClick ? close : undefined}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex h-full w-full ${sheetWidth} flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl ${
            closing ? "animate-[scale-out_130ms_ease-in]" : "animate-[scale-in_150ms_ease-out]"
          } ${className}`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] ${
        closing ? "animate-[fade-out_130ms_ease-in]" : "animate-[fade-in_150ms_ease-out]"
      } ${className}`}
    >
      {children}
    </div>
  );
});
