import { useEffect } from "react";
import { X } from "lucide-react";
import eggImage from "../../assets/egg.png";
import { IconButton } from "../ui/IconButton";

interface EasterEggDialogProps {
  onClose: () => void;
}

/** Ported from the reference Android app's EasterEggDialog - typing "cooter" into the search bar
 *  (see SearchBar.tsx) triggers this instead of ever becoming a real search tag. */
export function EasterEggDialog({ onClose }: EasterEggDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-[fade-in_150ms_ease-out] items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm animate-[scale-in_150ms_ease-out] rounded-[var(--radius-lg)] bg-[rgb(20,20,24)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          tone="invert"
          onClick={onClose}
          title="Close (Esc)"
          className="absolute right-2 top-2 z-10"
        >
          <X size={18} />
        </IconButton>

        <p className="mb-3 text-center text-sm font-semibold text-white">
          Ah ah ah! You DID say the magic word
        </p>

        <div className="relative aspect-square overflow-hidden rounded-[var(--radius-md)]">
          <div className="rainbow-scroll absolute inset-0" />
          <img src={eggImage} alt="" className="absolute inset-0 h-full w-full object-contain p-6" />
        </div>
      </div>
    </div>
  );
}
