//! Optional sign-in to third-party sites, so deleted-post recovery can reach login-gated pages
//! (Fur Affinity's Mature/Adult submissions). The user signs in inside a separate window that
//! loads the site's own login page; this module then lifts the site's session cookies out of that
//! window, checks they really are a logged-in session, and stores them encrypted
//! (credentials.rs). Design constraints:
//!
//! - The window is a plain external page with **no app IPC** (its label isn't in
//!   `capabilities/default.json`), and runs in its own throwaway WebView2 profile, so the site
//!   never shares storage with the app's own webview and the profile can simply be deleted.
//! - Cookies are only ever read by `source_fetch` and sent only to the site's own host; the
//!   frontend only learns "signed in or not".

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{COOKIE, USER_AGENT};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::{credentials, paths};

const WINDOW_LABEL: &str = "source-login";

/// A site the user can sign in to.
struct LoginSite {
    id: &'static str,
    title: &'static str,
    /// Key the cookie is stored under, and the host `source_fetch` attaches it to.
    host: &'static str,
    login_url: &'static str,
    /// Cookies that make up the session.
    cookie_names: &'static [&'static str],
    /// A page that renders differently when logged in, plus a substring only the logged-in
    /// version contains.
    check_url: &'static str,
    logged_in_marker: &'static str,
}

const SITES: &[LoginSite] = &[LoginSite {
    id: "furaffinity",
    title: "Sign in to Fur Affinity",
    host: "furaffinity.net",
    login_url: "https://www.furaffinity.net/login/",
    cookie_names: &["a", "b"],
    check_url: "https://www.furaffinity.net/",
    logged_in_marker: "/logout/",
}];

fn site(id: &str) -> Result<&'static LoginSite, String> {
    SITES.iter().find(|s| s.id == id).ok_or_else(|| format!("unknown site: {id}"))
}

fn profile_dir() -> std::path::PathBuf {
    paths::data_root().join("source-login-profile")
}

#[derive(Clone, serde::Serialize)]
struct LoginChanged {
    site: &'static str,
    signed_in: bool,
}

/// Reads the site's session cookies out of the login window. (Must run off the main thread:
/// WebView2's cookie API deadlocks if called from an event handler or a sync command.)
fn session_cookie(window: &WebviewWindow, s: &LoginSite) -> Option<String> {
    let url = Url::parse(s.login_url).ok()?;
    let cookies = window.cookies_for_url(url).ok()?;
    let parts: Vec<String> = s
        .cookie_names
        .iter()
        .map(|name| {
            cookies
                .iter()
                .find(|c| c.name() == *name)
                .map(|c| format!("{}={}", c.name(), c.value()))
        })
        .collect::<Option<_>>()?;
    Some(parts.join("; "))
}

async fn verify_logged_in(s: &LoginSite, cookie: &str) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
    else {
        return false;
    };
    let ua = format!("MonosodiumDesktop/{} (source recovery for deleted e621 posts)", env!("CARGO_PKG_VERSION"));
    let Ok(response) = client.get(s.check_url).header(COOKIE, cookie).header(USER_AGENT, ua).send().await else {
        return false;
    };
    response.text().await.is_ok_and(|body| body.contains(s.logged_in_marker))
}

/// Captures and verifies the session. On success stores it and closes the window; returns
/// whether the user is now signed in. Never leaves a half-saved state.
async fn finish(app: &AppHandle, window: &WebviewWindow, s: &'static LoginSite) -> bool {
    let Some(cookie) = session_cookie(window, s) else { return false };
    if !verify_logged_in(s, &cookie).await {
        return false;
    }
    if credentials::save_source_cookie(s.host, cookie).is_err() {
        return false;
    }
    let _ = app.emit("source-login-changed", LoginChanged { site: s.id, signed_in: true });
    true
}

/// Opens the site's login page in an isolated window. Signing in completes automatically (the
/// window closes itself once a logged-in session is detected); closing the window by hand also
/// triggers one last capture attempt.
#[tauri::command]
pub async fn open_source_login(app: AppHandle, site_id: String) -> Result<(), String> {
    let s = site(&site_id)?;
    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.set_focus();
        return Ok(());
    }

    // Fresh profile each time, so a previous session (or another account) can't leak in.
    let dir = profile_dir();
    let _ = std::fs::remove_dir_all(&dir);

    let url = Url::parse(s.login_url).map_err(|e| e.to_string())?;
    let done = Arc::new(AtomicBool::new(false));

    let app_for_load = app.clone();
    let done_for_load = done.clone();
    let window = WebviewWindowBuilder::new(&app, WINDOW_LABEL, WebviewUrl::External(url))
        .title(s.title)
        .inner_size(520.0, 760.0)
        .data_directory(dir.clone())
        .on_page_load(move |win, payload| {
            // After each finished page that isn't the login form itself, check whether the user
            // has become signed in - e.g. after submitting the form it redirects to the home page.
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
                || payload.url().path().starts_with("/login")
                || done_for_load.load(Ordering::SeqCst)
            {
                return;
            }
            let (app, done) = (app_for_load.clone(), done_for_load.clone());
            tauri::async_runtime::spawn(async move {
                if !done.swap(true, Ordering::SeqCst) {
                    if finish(&app, &win, s).await {
                        let _ = win.destroy();
                    } else {
                        done.store(false, Ordering::SeqCst); // not signed in yet - allow another try
                    }
                }
            });
        })
        .build()
        .map_err(|e| e.to_string())?;

    let app_for_close = app.clone();
    let window_for_close = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            // Hold the close until the cookies have been read (off this thread - see
            // `session_cookie`), then really close.
            api.prevent_close();
            let (app, win, done) = (app_for_close.clone(), window_for_close.clone(), done.clone());
            tauri::async_runtime::spawn(async move {
                if !done.swap(true, Ordering::SeqCst) {
                    finish(&app, &win, s).await;
                }
                let _ = win.destroy();
            });
        }
    });

    // Best-effort cleanup of the throwaway profile once the window is gone.
    let app_for_cleanup = app.clone();
    tauri::async_runtime::spawn(async move {
        while app_for_cleanup.get_webview_window(WINDOW_LABEL).is_some() {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        tokio::time::sleep(Duration::from_secs(2)).await; // WebView2 releases its files a moment late
        let _ = std::fs::remove_dir_all(&dir);
    });

    Ok(())
}

#[tauri::command]
pub fn source_login_status(site_id: String) -> Result<bool, String> {
    Ok(credentials::source_cookie(site(&site_id)?.host).is_some())
}

#[tauri::command]
pub fn source_logout(app: AppHandle, site_id: String) -> Result<(), String> {
    let s = site(&site_id)?;
    credentials::delete_source_cookie(s.host)?;
    let _ = app.emit("source-login-changed", LoginChanged { site: s.id, signed_in: false });
    Ok(())
}
