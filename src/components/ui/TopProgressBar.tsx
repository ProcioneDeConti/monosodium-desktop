import { RainbowBar } from "./RainbowBar";

interface TopProgressBarProps {
  active: boolean;
}

/** A slim indeterminate rainbow bar (ui/RainbowBar.tsx), placed directly in normal flow right under
 *  the shell header while posts are loading/refetching/paginating, so there's always a visible
 *  "something is happening" signal beyond the per-thumbnail skeletons and the refresh button's
 *  own spin. Renders nothing (not just hidden) while inactive. */
export function TopProgressBar({ active }: TopProgressBarProps) {
  if (!active) return null;
  return <RainbowBar className="h-0.5 w-full shrink-0" />;
}
