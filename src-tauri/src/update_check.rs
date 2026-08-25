use serde::{Deserialize, Serialize};

use crate::api::AppState;

/// This app's own GitHub repo - not the reference Android app's (`ProcioneDeConti/MonosodiumPDC`,
/// what the Kotlin `UpdateCheckRepository` this was ported from actually checks). A desktop build
/// needs to compare itself against desktop releases.
const REPO_OWNER: &str = "ProcioneDeConti";
const REPO_NAME: &str = "e621-desktop";

/// Wholly separate from api.rs's `request()` helper - a different host (GitHub, not e621/e6AI),
/// with no auth/site-switching/rate-limit-courtesy machinery to share with it (GitHub's own
/// unauthenticated limit, 60/hour per IP, is tracked via the response headers below instead).
/// Manual-only (Settings > Updates > Check for Updates), never called automatically.
const USER_AGENT: &str = "MonosodiumDesktop-UpdateCheck";

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    /// Both `None` when GitHub didn't return its `X-RateLimit-*` headers (shouldn't normally
    /// happen, but not guaranteed).
    pub rate_limit_remaining: Option<i64>,
    pub rate_limit_limit: Option<i64>,
}

fn header_i64(headers: &reqwest::header::HeaderMap, name: &str) -> Option<i64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

/// Compares dotted version strings numerically, segment by segment, treating a missing/
/// unparseable segment as 0 - e.g. "1.2" vs "1.2.0" are equal, "1.10" is newer than "1.9".
fn is_newer_version(remote: &str, local: &str) -> bool {
    let parts = |s: &str| -> Vec<i64> {
        s.trim_start_matches('v').split('.').map(|p| p.parse().unwrap_or(0)).collect()
    };
    let (r, l) = (parts(remote), parts(local));
    for i in 0..r.len().max(l.len()) {
        let (rv, lv) = (r.get(i).copied().unwrap_or(0), l.get(i).copied().unwrap_or(0));
        if rv != lv {
            return rv > lv;
        }
    }
    false
}

#[tauri::command]
pub async fn check_for_update(state: tauri::State<'_, AppState>) -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest");
    let response = state
        .http
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(if response.status().as_u16() == 403 {
            "Rate limited by GitHub - try again later".to_string()
        } else {
            format!("GitHub API error {}", response.status())
        });
    }

    let rate_limit_remaining = header_i64(response.headers(), "x-ratelimit-remaining");
    let rate_limit_limit = header_i64(response.headers(), "x-ratelimit-limit");

    let release: GitHubRelease = response.json().await.map_err(|e| e.to_string())?;
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let update_available = is_newer_version(&latest_version, &current_version);

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        update_available,
        release_url: release.html_url,
        rate_limit_remaining,
        rate_limit_limit,
    })
}
