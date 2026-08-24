/** "#6366f1" -> "99 102 241", for use with Tailwind's `rgb(var(--accent) / <alpha>)` pattern. */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "99 102 241";
  return `${r} ${g} ${b}`;
}
