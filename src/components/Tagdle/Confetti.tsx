import { useEffect, useRef } from "react";

const CONFETTI_COLORS = ["#f94144", "#f8961e", "#f9c74f", "#90be6d", "#43aa8b", "#577590", "#c77dff"];

interface ConfettiBurstProps {
  /** "confetti" - mixed-colour paper bits; "rainbow" - a bigger spray swept through the hue wheel. */
  variant?: "confetti" | "rainbow";
  count?: number;
}

/** One-shot particle burst from behind its (positioned) parent: each piece launches from a random
 *  point just inside the parent's edges, outward and then down under gravity. The pieces live on
 *  document.body (fixed-position) so the overlay's scroll container can't clip them or flash a
 *  scrollbar. Plain DOM + Web Animations - no canvas, no dependency. Nothing under reduced motion. */
export function ConfettiBurst({ variant = "confetti", count = variant === "rainbow" ? 90 : 36 }: ConfettiBurstProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const spread = variant === "rainbow" ? 340 : 190;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      const size = 5 + Math.random() * 6;
      const color =
        variant === "rainbow"
          ? `hsl(${Math.round((i / count) * 360)} 90% 60%)`
          : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      Object.assign(piece.style, {
        position: "fixed",
        // Start hidden just inside the card's outline, so it reads as spraying out from behind.
        left: `${cx + (Math.random() - 0.5) * rect.width * 0.85}px`,
        top: `${cy + (Math.random() - 0.5) * rect.height * 0.85}px`,
        zIndex: "9999",
        width: `${size}px`,
        height: `${size * (Math.random() < 0.5 ? 0.45 : 1)}px`,
        background: color,
        borderRadius: Math.random() < 0.3 ? "50%" : "1px",
        pointerEvents: "none",
      });
      document.body.appendChild(piece);
      // Mostly upward fan; gravity pulls each piece back down past its launch height.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (variant === "rainbow" ? 1.6 : 1.3);
      const dist = spread * (0.5 + Math.random() * 0.6);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const spin = (Math.random() - 0.5) * 1080;
      const duration = 1700 + Math.random() * 900;
      const anim = piece.animate(
        [
          { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy + spread * 0.9}px)) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)", fill: "forwards" },
      );
      // Each piece removes itself when it lands - deliberately no unmount cleanup, so moving to
      // the next round doesn't cut a spray off mid-air.
      anim.onfinish = () => piece.remove();
    }
  }, [variant, count]);

  return <div ref={host} aria-hidden className="pointer-events-none absolute inset-0" />;
}
