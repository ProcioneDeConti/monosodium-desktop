import { CheckCircle2, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useUpdateCheck } from "../../queries/useUpdateCheck";
import { errorMessage } from "../../lib/errors";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

/** Manual-only (Check for Updates button) - never automatic, since GitHub's unauthenticated API
 *  is rate limited at 60/hour *per IP*, not per install, and many users could share one IP -
 *  same reasoning as the reference Android app's own UpdateCheckRepository. Checks this app's
 *  own GitHub repo, not the reference app's (see src-tauri/src/update_check.rs). */
export function UpdateSection() {
  const check = useUpdateCheck();
  const result = check.data;

  return (
    <div className="flex flex-col gap-2">
      <Button
        icon={check.isPending ? <Spinner size={13} /> : undefined}
        onClick={() => check.mutate()}
        disabled={check.isPending}
      >
        Check for updates
      </Button>

      {check.isError && (
        <p className="text-xs text-red-500">{errorMessage(check.error, "Update check failed.")}</p>
      )}

      {result?.update_available && (
        <button
          type="button"
          onClick={() => void openUrl(result.release_url)}
          className="flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--accent))] hover:underline"
        >
          <ExternalLink size={12} />
          Update available: v{result.latest_version}
        </button>
      )}

      {result?.no_releases && (
        <p className="flex items-center gap-1.5 text-xs opacity-60">
          <CheckCircle2 size={12} />
          No releases published yet (v{result.current_version})
        </p>
      )}

      {result && !result.no_releases && !result.update_available && (
        <p className="flex items-center gap-1.5 text-xs opacity-60">
          <CheckCircle2 size={12} />
          You&rsquo;re up to date (v{result.current_version})
        </p>
      )}

      {result?.rate_limit_remaining != null && result.rate_limit_limit != null && (
        <p className="text-[11px] opacity-40">
          {result.rate_limit_remaining}/{result.rate_limit_limit} GitHub checks remaining this hour
        </p>
      )}
    </div>
  );
}
