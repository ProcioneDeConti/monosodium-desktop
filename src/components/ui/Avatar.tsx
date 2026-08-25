import { UserRound } from "lucide-react";

interface AvatarProps {
  url: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

/** Circular avatar - an image once `url` resolves (see queries/useAvatarUrl.ts), otherwise a
 *  generic person glyph. Shared by ProfilePanel and CommentsPanel so both look identical. */
export function Avatar({ url, name, size = 36, className = "" }: AvatarProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full
                  bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound size={Math.round(size * 0.5)} strokeWidth={2} />
      )}
    </div>
  );
}
