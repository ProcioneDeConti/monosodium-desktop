import { useEffect, type CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Brush,
  ChevronRight,
  ExternalLink,
  Flag,
  Heart,
  Images,
  Layers,
  MessagesSquare,
  MessageSquare,
  ScrollText,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { Site } from "../../models/site";
import { SITE_DISPLAY_NAME, SITE_WEB_BASE_URL } from "../../models/site";
import { userLevelLabel, type UserProfile } from "../../models/user";
import { formatCount } from "../../lib/formatCount";
import { errorMessage } from "../../lib/errors";
import { useImageAccentColor } from "../../lib/dominantColor";
import { useUserProfileQuery } from "../../queries/useUserProfileQuery";
import { useAvatarUrl } from "../../queries/useAvatarUrl";
import { Button } from "../ui/Button";
import { DText } from "../ui/DText";
import { IconButton } from "../ui/IconButton";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";

interface ProfilePanelProps {
  site: Site;
  userId: number | "me";
  onClose: () => void;
  onSearch: (query: string) => void;
}

const STATS: { key: keyof UserProfile; label: string; icon: typeof Heart }[] = [
  { key: "favorite_count", label: "Favorites", icon: Heart },
  { key: "comment_count", label: "Comments", icon: MessageSquare },
  { key: "forum_post_count", label: "Forum posts", icon: MessagesSquare },
  { key: "wiki_page_version_count", label: "Wiki edits", icon: ScrollText },
  { key: "artist_version_count", label: "Artist edits", icon: Brush },
  { key: "pool_version_count", label: "Pool edits", icon: Layers },
  { key: "upload_slots", label: "Upload slots", icon: Upload },
  { key: "flag_count", label: "Flags", icon: Flag },
];

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

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm opacity-60">
              <Spinner size={15} />
              Loading…
            </div>
          ) : isError || !profile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-sm">
              <span className="max-w-xs text-center text-red-500">{errorMessage(error)}</span>
              <Button onClick={() => void refetch()}>Retry</Button>
            </div>
          ) : (
            <ProfileContent
              site={site}
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
  site,
  profile,
  avatarUrl,
  onOpenPosts,
  onOpenFavorites,
}: {
  site: Site;
  profile: UserProfile;
  avatarUrl: string | null;
  onOpenPosts: () => void;
  onOpenFavorites: () => void;
}) {
  const level = userLevelLabel(profile.level);
  const banner = useImageAccentColor(avatarUrl);

  // A soft bottom fade so the banner melts into the panel instead of ending on a hard line.
  const BANNER_FADE = "linear-gradient(to bottom, #000 38%, transparent 100%)";
  const bannerStyle: CSSProperties = {
    maskImage: BANNER_FADE,
    WebkitMaskImage: BANNER_FADE,
    ...(banner
      ? {
          background: `linear-gradient(160deg, rgb(${banner.r} ${banner.g} ${banner.b} / 0.95), rgb(${banner.r} ${banner.g} ${banner.b} / 0.45))`,
        }
      : {}),
  };

  const stats = STATS.map((s) => ({ ...s, value: profile[s.key] as number | null })).filter(
    (s) => s.value != null,
  );

  const hasFeedback =
    profile.positive_feedback_count != null ||
    profile.neutral_feedback_count != null ||
    profile.negative_feedback_count != null;

  return (
    <div>
      {/* Hero: an adaptive banner (saturation-weighted colour of the avatar, or the accent when
          it can't be sampled) that fades out at the bottom, with the aspect-preserving squircle
          avatar - and its drop shadow - punched out over the lower edge. */}
      <div className="relative">
        <div
          className={`h-40 w-full ${
            banner ? "" : "bg-gradient-to-br from-[rgb(var(--accent))]/45 via-[rgb(var(--accent))]/18 to-transparent"
          }`}
          style={bannerStyle}
        />
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -30 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile.name}
              draggable={false}
              className="block h-auto w-auto max-h-[108px] max-w-[176px] rounded-[24px] border-4
                         border-[rgb(var(--accent))] bg-[rgb(250,250,250)]
                         shadow-[0_14px_36px_-8px_rgba(0,0,0,0.55)] dark:bg-[rgb(24,24,24)]"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-[24px] border-4 border-[rgb(var(--accent))]
                         bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]
                         shadow-[0_14px_36px_-8px_rgba(0,0,0,0.55)]"
            >
              <UserRound size={44} strokeWidth={2} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-11 flex flex-col items-center gap-1.5 px-5 text-center">
        <h2 className="text-xl font-extrabold tracking-tight">{profile.name}</h2>
        {level && (
          <span className="rounded-full bg-[rgb(var(--accent))] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
            {level}
          </span>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs opacity-55">
          {profile.created_at && <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>}
          <span>·</span>
          <span>#{profile.id}</span>
        </div>
        <button
          type="button"
          onClick={() => void openUrl(`${SITE_WEB_BASE_URL[site]}/users/${profile.id}`)}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-[rgb(var(--accent))] hover:underline"
        >
          <ExternalLink size={11} />
          Open on {SITE_DISPLAY_NAME[site]}
        </button>
      </div>

      <div className="px-4 pb-5 pt-4">
        {/* Primary actions */}
        <div className="mb-4 flex flex-col gap-2">
          <BigAction
            icon={<Images size={17} />}
            label="Posts"
            hint="Everything they've uploaded"
            onClick={onOpenPosts}
          />
          <BigAction
            icon={<Heart size={17} />}
            label="Favorites"
            hint={profile.favorite_count != null ? `${formatCount(profile.favorite_count)} posts` : "Their favorites"}
            onClick={onOpenFavorites}
          />
        </div>

        {stats.length > 0 && (
          <Section title="Stats">
            <div className="grid grid-cols-2 gap-2">
              {stats.map(({ key, label, icon: Icon, value }) => (
                <div
                  key={key}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.05]"
                >
                  <Icon size={15} className="shrink-0 text-[rgb(var(--accent))] opacity-80" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold tabular-nums leading-tight">
                      {formatCount(value!)}
                    </div>
                    <div className="truncate text-[11px] opacity-55">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {hasFeedback && (
          <Section title="Feedback">
            <div className="grid grid-cols-3 gap-2 text-center">
              <FeedbackStat label="Positive" value={profile.positive_feedback_count} tone="text-green-500" />
              <FeedbackStat label="Neutral" value={profile.neutral_feedback_count} tone="opacity-70" />
              <FeedbackStat label="Negative" value={profile.negative_feedback_count} tone="text-red-500" />
            </div>
          </Section>
        )}

        {profile.profile_about && (
          <Section title="About">
            <DText text={profile.profile_about} site={site} className="text-sm" />
          </Section>
        )}

        {profile.profile_artinfo && (
          <Section title="Artist info">
            <DText text={profile.profile_artinfo} site={site} className="text-sm" />
          </Section>
        )}
      </div>
    </div>
  );
}

function BigAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[var(--radius-md)] border border-black/10 px-3 py-2.5
                 text-left transition-colors hover:border-[rgb(var(--accent))]/50 hover:bg-[rgb(var(--accent))]/[0.06]
                 dark:border-white/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-[11px] opacity-55">{hint}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 opacity-30 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function FeedbackStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-black/[0.03] py-2.5 dark:bg-white/[0.05]">
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value ?? 0}</div>
      <div className="text-[11px] opacity-55">{label}</div>
    </div>
  );
}
