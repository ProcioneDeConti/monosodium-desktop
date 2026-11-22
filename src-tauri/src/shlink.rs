//! Shlink (https://shlink.io) - the user's own self-hosted URL shortener. Used to shorten post links
//! for "Copy short link" and Telegram sharing. Server URL + API key + tag live in credentials.dat
//! (the key is a secret for someone else's server, same treatment as the SauceNAO key); the key
//! never goes back to the frontend - it only learns the server URL and tag.
//!
//! Not an e621 host, so this doesn't go through `api.rs::request()` / the e621 rate limiter.
//! Shortening is user-initiated (one click = one request), so no limiter of its own either.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::credentials;

/// What's stored in credentials.dat.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ShlinkConfig {
    pub server_url: String,
    pub api_key: String,
    /// Tag attached to every short URL this app creates (empty = none). Part of what Shlink's
    /// `findIfExists` matches on, so keeping it stable is what makes links get reused.
    #[serde(default)]
    pub tag: String,
}

/// What the frontend gets to see.
#[derive(Serialize)]
pub struct ShlinkStatus {
    pub server_url: String,
    pub tag: String,
}

fn client() -> Result<reqwest::Client, String> {
    crate::net::client_builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .user_agent(format!("MonosodiumDesktop/{} (Shlink client)", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// Accepts `https://s.example.com`, `s.example.com`, or a pasted `.../rest/v3` URL; returns the
/// bare origin+path with no trailing slash.
fn normalize_server(raw: &str) -> Result<String, String> {
    let mut s = raw.trim().trim_end_matches('/').to_string();
    if s.is_empty() {
        return Err("Server URL is empty".into());
    }
    if !s.contains("://") {
        s = format!("https://{s}");
    }
    for suffix in ["/rest/v3", "/rest/v2", "/rest"] {
        if let Some(stripped) = s.strip_suffix(suffix) {
            s = stripped.to_string();
        }
    }
    let url = tauri::Url::parse(&s).map_err(|_| "Server URL isn't a valid URL".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err("Server URL must be an http(s) address".into());
    }
    Ok(s)
}

/// Shlink errors are RFC 7807 problem+json: `{title, detail, status, type}`.
async fn error_message(resp: reqwest::Response) -> String {
    let status = resp.status();
    #[derive(Deserialize)]
    struct Problem {
        title: Option<String>,
        detail: Option<String>,
    }
    let detail = resp
        .json::<Problem>()
        .await
        .ok()
        .and_then(|p| p.detail.or(p.title))
        .unwrap_or_default();
    match status.as_u16() {
        401 | 403 => "Shlink rejected the API key".into(),
        _ if detail.is_empty() => format!("Shlink returned HTTP {status}"),
        _ => format!("Shlink: {detail}"),
    }
}

fn load() -> Option<ShlinkConfig> {
    credentials::shlink_config().filter(|c| !c.server_url.is_empty() && !c.api_key.is_empty())
}

/// Validates the server + key with a cheap authenticated read (one short URL) before saving, so a
/// typo shows up in Settings instead of on the first share.
#[tauri::command]
pub async fn save_shlink_config(server_url: String, api_key: String, tag: String) -> Result<(), String> {
    let server_url = normalize_server(&server_url)?;
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("API key is empty".into());
    }
    let resp = client()?
        .get(format!("{server_url}/rest/v3/short-urls"))
        .query(&[("itemsPerPage", "1")])
        .header("X-Api-Key", &api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the Shlink server: {e}"))?;
    if !resp.status().is_success() {
        return Err(error_message(resp).await);
    }
    credentials::save_shlink_config(ShlinkConfig { server_url, api_key, tag: tag.trim().to_string() })
}

#[tauri::command]
pub fn shlink_status() -> Option<ShlinkStatus> {
    load().map(|c| ShlinkStatus { server_url: c.server_url, tag: c.tag })
}

#[tauri::command]
pub fn delete_shlink_config() -> Result<(), String> {
    credentials::delete_shlink_config()
}

/// Shortens `long_url`, reusing an existing short URL for it when Shlink already has one with the
/// same tag (`findIfExists`), so sharing the same post twice doesn't mint a second link.
#[tauri::command]
pub async fn shorten_url(long_url: String) -> Result<String, String> {
    let cfg = load().ok_or("Shlink isn't set up")?;
    let parsed = tauri::Url::parse(&long_url).map_err(|_| "Not a valid URL".to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("Only http(s) links can be shortened".into());
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Body<'a> {
        long_url: &'a str,
        tags: Vec<&'a str>,
        find_if_exists: bool,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ShortUrl {
        short_url: String,
    }

    let body = Body {
        long_url: &long_url,
        tags: if cfg.tag.is_empty() { vec![] } else { vec![cfg.tag.as_str()] },
        find_if_exists: true,
    };
    let resp = client()?
        .post(format!("{}/rest/v3/short-urls", cfg.server_url))
        .header("X-Api-Key", &cfg.api_key)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the Shlink server: {e}"))?;
    if !resp.status().is_success() {
        return Err(error_message(resp).await);
    }
    resp.json::<ShortUrl>()
        .await
        .map(|s| s.short_url)
        .map_err(|e| format!("Unexpected Shlink response: {e}"))
}

#[cfg(test)]
mod tests {
    use super::normalize_server;

    #[test]
    fn normalizes_server_urls() {
        assert_eq!(normalize_server("s.example.com/").unwrap(), "https://s.example.com");
        assert_eq!(normalize_server("https://x.io/rest/v3").unwrap(), "https://x.io");
        assert_eq!(normalize_server("http://10.0.0.2:8080/").unwrap(), "http://10.0.0.2:8080");
        assert!(normalize_server("").is_err());
        assert!(normalize_server("ftp://x.io").is_err());
    }
}
