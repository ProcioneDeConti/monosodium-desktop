import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Images, User as UserIcon, X } from "lucide-react";
import { e621Api } from "../../api/client";
import type { Site } from "../../models/site";
import { userLevelLabel, type UserProfile } from "../../models/user";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";

interface ProfilePanelProps {
  site: Site;
  userId: number | "me";
  onClose: () => void;
  onSearch: (query: string) => void;
}

const STAT_LABELS: Record<string, string> = {
  favorite_count: "Favorites",
  comment_count: "Comments",
  forum_post_count: "Forum posts",
  wiki_page_version_count: "Wiki edits",
  artist_version_count: "Artist edits",
  pool_version_count: "Pool edits",
  upload_slots: "Upload slots",
  flag_count: "Flags",
};

/** Profiles only carry an `avatar_id` (a post id) - resolve it to an image via the same
 *  rate-limited `get_posts` path everything else uses, rather than adding new backend surface. */
function useAvatarUrl(site: Site, avatarId: number | null) {
  return useQuery({
    queryKey: ["avatar", site, avatarId],
    queryFn: async () => {
      const res = await e621Api.getPosts(site, `id:${avatarId}`, 1);
      return res.posts[0]?.preview.url ?? null;
    },
    enabled: avatarId != null,
    staleTime: 5 * 60_000,
  });
}

export function ProfilePanel({ site, userId, onClose, onSearch }: ProfilePanelProps) {
  const { data: profile, isLoading, isError, error, refetch } = useUserProfileQuery(site, userId);
  const { data: avatarUrl } = useAvatarUrl(site, profile?.avatar_id ?? null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function openPosts() {
    if (!profile) return;
    onSearch(`user:${profile.name}`);
    onClose();
  }

  function openFavorites() {
    if (!profile) return;
    onSearch(`fav:${profile.name}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md animate-[scale-in_150ms_ease-out] flex-col bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)] shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold">Profile</h1>
          <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
            <X size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
              <Spinner size={15} />
              Loading…
            </div>
          ) : isError || !profile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <span className="max-w-xs text-center text-red-500">
                {(error as Error)?.message ?? "Something went wrong."}
              </span>
              <Button onClick={() => void refetch()}>Retry</Button>
            </div>
          ) : (
            <ProfileContent
              profile={profile}
              avatarUrl={avatarUrl ?? null}
              onOpenPosts={openPosts}
              onOpenFavorites={openFavorites}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileContent({
  profile,
  avatarUrl,
  onOpenPosts,
  onOpenFavorites,
}: {
  profile: UserProfile;
  avatarUrl: string | null;
  onOpenPosts: () => void;
  onOpenFavorites: () => void;
}) {
  const stats = (Object.keys(STAT_LABELS) as (keyof UserProfile)[])
    .map((key) => ({ label: STAT_LABELS[key], value: profile[key] as number | null }))
    .filter((s) => s.value != null);

  const hasFeedback =
    profile.positive_feedback_count != null ||
    profile.neutral_feedback_count != null ||
    profile.negative_feedback_count != null;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] px-4 py-6 text-center"
        style={{
          background: "linear-gradient(to bottom, rgb(var(--accent) / 0.25), transparent)",
        }}
      >
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-[rgb(var(--accent))] bg-black/10 dark:bg-white/10">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserIcon size={32} className="opacity-50" />
          )}
        </div>
        <h2 className="text-base font-bold">{profile.name}</h2>
        {userLevelLabel(profile.level) && (
          <span className="rounded-full bg-[rgb(var(--accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {userLevelLabel(profile.level)}
          </span>
        )}
        {profile.created_at && (
          <span className="text-xs opacity-60">Joined {new Date(profile.created_at).toLocaleDateString()}</span>
        )}
      </div>

      <Section title="Activity">
        <div className="flex flex-col gap-1">
          <ActivityRow icon={<Images size={16} />} label="Posts" onClick={onOpenPosts} />
          <ActivityRow icon={<Heart size={16} />} label="Favorites" onClick={onOpenFavorites} />
        </div>
      </Section>

      {stats.length > 0 && (
        <Section title="Stats">
          <div className="grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center gap-0.5 rounded-[var(--radius-sm)] bg-black/[0.03] dark:bg-white/[0.05] py-2.5"
              >
                <span className="text-lg font-bold text-[rgb(var(--accent))] tabular-nums">
                  {s.value!.toLocaleString()}
                </span>
                <span className="text-[11px] opacity-60">{s.label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {hasFeedback && (
        <Section title="Feedback">
          <div className="flex justify-evenly">
            <FeedbackStat label="Positive" value={profile.positive_feedback_count} className="text-green-500" />
            <FeedbackStat label="Neutral" value={profile.neutral_feedback_count} className="opacity-70" />
            <FeedbackStat label="Negative" value={profile.negative_feedback_count} className="text-red-500" />
          </div>
        </Section>
      )}

      {profile.profile_about && (
        <Section title="About">
          <p className="whitespace-pre-wrap text-sm">{profile.profile_about}</p>
        </Section>
      )}

      {profile.profile_artinfo && (
        <Section title="Artist info">
          <p className="whitespace-pre-wrap text-sm">{profile.profile_artinfo}</p>
        </Section>
      )}
    </div>
  );
}

function ActivityRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-black/[0.03] dark:bg-white/[0.05]
                 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[rgb(var(--accent))]/15"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]/20 text-[rgb(var(--accent))]">
        {icon}
      </span>
      {label}
    </button>
  );
}

function FeedbackStat({ label, value, className = "" }: { label: string; value: number | null; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold tabular-nums ${className}`}>{value ?? 0}</span>
      <span className="text-[11px] opacity-60">{label}</span>
    </div>
  );
}
