import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
  className?: string;
}

/** Shared spinner glyph for inline/blocking loading states (initial post load, profile load,
 *  full-res image/video load) - kept as one component so every "this is loading" moment in the
 *  app looks the same. */
export function Spinner({ size = 16, className = "" }: SpinnerProps) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}
