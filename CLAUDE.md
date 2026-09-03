# Monosodium Desktop

A standalone Windows 10/11 desktop e621/e6AI browser (tag search, resizable post grid, full post
viewer, voting, favorites, client-side blacklist, account settings). Built as the desktop
counterpart to an existing Android client — see **Reference app** below.

The full implementation plan (architecture, milestones, rationale) lives at
`C:\Users\Alpha\.claude\plans\replicated-juggling-rain.md` on this machine — read it for the
"why" behind the choices below if picking this back up.

## Reference app

`C:\Users\Alpha\AndroidStudioProjects\e621` — "MonosodiumPDC", Kotlin + Jetpack Compose. This is
the design/feature reference, not a literal port. Its data models and API surface
(`app/src/main/java/one/proci/e621/data/`) are the source of truth for JSON shapes and business
logic (blacklist matching, cursor pagination, rating filters) — when in doubt about a field name
or a rule, check there before guessing.

## Stack & why

- **Tauri 2 (Rust backend) + React 19/TypeScript (Vite) frontend**, rendered via the
  WebView2 (Chromium) runtime. Chosen over WPF/WinUI3 specifically because WebView2 decodes
  every format e621 serves (jpg/png/gif/apng/webp/webm/mp4) natively with zero extra
  dependencies — the native-Windows alternatives all need a bundled video engine
  (LibVLCSharp, ~100MB+) just to play webm. Minimum OS is Windows 10 1809 (Tauri 2's own
  floor). Windows 11 ships the WebView2 runtime; on Windows 10 it's usually present via Edge,
  and the installer bundles an offline copy as a fallback (`bundle.windows.webviewInstallMode`
  = `offlineInstaller` in `tauri.conf.json`). The portable exe does not carry that copy.
- **Scope: core browsing first, Phase 2 complete.** User profiles, saved searches, the slideshow,
  comments, dmail/messages, on-disk cache management, an update checker, encrypted backup/
  restore, and the forum have all landed (see Progress) - every item originally queued for Phase
  2 is done. An EULA gate (not part of that original queue - added on direct request, see
  Progress) also landed along the way.

## Critical constraint: e621 API rules — do not relax these

Confirmed directly from e621's API help page (via web search, Aug 2026):
- **Hard rate limit: 2 req/sec** (503 if exceeded). Best-effort target: **≤1 req/sec sustained**.
- **Non-empty, descriptive User-Agent required on every request.** Never impersonate a browser
  UA. Format used here: `MonosodiumDesktop/{version} (by {username} on {host})`, falling back to
  `anonymous` when signed out.
- The frontend **never** calls e621 directly — browsers can't set a custom `User-Agent` via
  fetch/XHR. All API calls are Tauri commands in `src-tauri/src/api.rs`, which route through a
  per-site rate limiter (`src-tauri/src/rate_limit.rs`, `governor` crate: burst 2, refill
  1/sec) before every request.
- **Media (thumbnails/samples/full files) loads directly in the webview** via plain
  `<img>`/`<video src>` URLs to the CDN — no Rust round-trip, no auth header, so the API key
  never reaches the CDN host. Only JSON API calls go through Rust.

If you're extending `api.rs` with a new endpoint, route it through the existing `request()`
helper (handles rate limiting, User-Agent, and Basic Auth attachment automatically) — don't call
`state.http` directly.

## Architecture

```
src-tauri/src/
  site.rs         Site enum (E621/E6ai) - hosts, base URLs
  models.rs       serde structs mirroring the e621 JSON API 1:1
  rate_limit.rs   per-site governor rate limiter
  credentials.rs  Windows Credential Manager (keyring crate, v1 API) - username+api_key per site
  api.rs          AppState (http client + limiters) + all e621 API Tauri commands
  downloads.rs    download_post_file - fetches a post's CDN URL and writes it to disk
                  (Pictures/Videos/"Monosodium Desktop" by default, or the Settings-configured
                  folder)
  lib.rs          plugin/window/command wiring, tray icon, global shortcut (window is opaque -
                  no transparency/Mica, for WebView2 compositing performance on Windows)

src/
  models/         TS interfaces mirroring src-tauri/src/models.rs (post.ts, user.ts, site.ts)
  api/client.ts   typed wrappers around invoke("...") - the only place that calls Tauri commands
  state/          Zustand: settingsStore.ts (persisted via tauri-plugin-store JSON file),
                  accountStore.ts (credentials, loaded from Windows Credential Manager),
                  savedSearchesStore.ts (own tauri-plugin-store JSON file, separate from
                  settings - local-only, e621 has no server-side saved-search feature to sync)
  queries/        TanStack Query: usePostsQuery.ts (keyset pagination + blacklist-aware page
                  skipping - see doc comment), usePostMutations.ts (vote/favorite, patches
                  postCache.ts so grid + viewer update instantly), useTagAutocomplete.ts,
                  useHealthCheck.ts (60s poll, drives the shell's connection dot)
  lib/            blacklist.ts (port of the Android app's blacklist matching logic - keep in
                  sync if that logic ever changes; also owns visiblePosts(), the single
                  filtered-list function shared by PostGrid and PostViewer so click-to-open
                  indices always agree), tagCategoryStyle.ts (single source of truth for tag
                  category colors - chip bg/fg + header/autocomplete text color per category,
                  mirrors the Android app's TagChip exactly, including its merge of
                  general/lore/meta into one neutral style), color.ts, queryClient.ts
  components/
    ui/                        shared button/section chrome (IconButton, Button, Section) reused
                               across the shell, viewer, settings, and profile panel
    shell/AppShell.tsx        top bar: title, SearchBar, site toggle, thumbnail-size slider,
                               Favorites/Profile shortcuts
    SearchBar/SearchBar.tsx   tag-chip input + live category-colored autocomplete
    PostGrid/                 Pinterest-style virtualized masonry grid via `masonic` (variable
                               cell height from each post's own aspect ratio via
                               `models/post.ts`'s `aspectRatio()`, clamped [0.5, 2] like the
                               reference app's PostThumbnail; packed into whichever column is
                               shortest), resizable columns, caution-stripe for blacklisted-but-
                               shown posts. `masonic`'s own `<Masonry>` only tracks browser
                               `window` scroll, so this grid drives `useMasonry` from its own
                               bounded scroll container instead (the shell header stays fixed
                               above it) - see the doc comment in `PostGrid.tsx` for the
                               resize-observer wiring that keeps cell positions correct when the
                               column width changes, and why a new search remounts it via a
                               `key` in `App.tsx` rather than trying to reconcile in place
    PostViewer/                full-screen overlay: ZoomableImage (wheel-zoom/pan) or
                               VideoPlayer (custom loop/speed/mute controls) + TagsPanel/TagChip
                               (colored pill chips grouped by category, matching the reference
                               Android app's look exactly - click opens a menu: Search / Add to
                               search / Exclude / Add to blacklist) + InfoPanel (click-to-copy,
                               plus a clickable Uploader row that opens ProfilePanel)
    Settings/                  full-screen overlay: SiteAccountCard (per-site username/API key,
                               saves via accountStore -> Windows Credential Manager),
                               BlacklistSection (textarea + import-from-account/push-to-account
                               via e621Api.getCurrentUser/updateBlacklist), SettingsPanel (the
                               rest inline: ratings/adult-mode, accent color, video defaults,
                               download folder via @tauri-apps/plugin-dialog's `open()`)
    Profile/ProfilePanel.tsx  full-screen overlay for a user profile (own account via "me", or
                               any uploader by id): avatar (resolved from avatar_id via a
                               get_posts id: lookup, since profiles only carry a post id, not an
                               image URL), level badge, stats grid, feedback, about/artist-info
                               text, and Posts/Favorites shortcuts into the normal search flow
                               (user:<name> / fav:<name>)
    SavedSearches/SavedSearchesPanel.tsx  full-screen overlay, create/delete only (no rename or
                               reorder, matching the reference app) - a "save current search"
                               row (shown only while there's a non-blank query) plus a list of
                               saved {label, query} entries; clicking one runs it as a normal
                               search, same as Favorites/Profile's shortcuts
    Messages/MessagesPanel.tsx  full-screen overlay for dmails (e621's private messages) - inbox
                               list (keyset-paginated, same b<id> cursor convention as posts),
                               a detail view, and compose (new or, from a detail view, a reply
                               that prefills/locks the recipient - dmails aren't server-threaded,
                               same as comments). Only reachable when signed in, gated the same
                               way as Favorites/Profile; the shell's Mail button shows an unread
                               badge from `users/me.json`'s `unread_dmail_count`, polled the same
                               way as the connection dot
  App.tsx         wires everything: search state, viewer/settings/profile/saved-searches/
                  messages open-close, blacklist actions
```

Data flow for a post list: `usePostsQuery` → raw `Post[]` (unfiltered, so the blacklist
disable-toggle can show hidden posts again without refetching) → `visiblePosts()`
(`lib/blacklist.ts`) filters for display → same filtered array is passed to **both** `PostGrid`
and `PostViewer` so click-to-open indices line up exactly.

## Progress

Full milestone / feature / live-bugfix history (M1 through the current UI pass) lives in
`PROGRESS.md` at the repo root — read it for why a feature was built a certain way or whether a
bug has been seen before. Not loaded automatically; `cat PROGRESS.md` or grep it.

## Running it

**The user runs/tests the app themselves — don't launch it or drive the GUI to verify changes**
(see memory: feedback_no_manual_app_testing). Verify with static checks only:

```
cd "D:\Documents\Applications\e621 Desktop"
npx tsc --noEmit             # frontend type-check
cd src-tauri && cargo check  # Rust compile-check (fast after first build)
```

If the user asks you to run it yourself: `npm run tauri dev` starts Vite + `cargo run`, opens a
live window titled "Monosodium Desktop - e621" (title bar swaps to "- e6AI" when you toggle
sites). **The window's close (X) button now hides it to the tray instead of quitting** (see
Progress' "Global hotkey, system tray, and native notifications" entry) - to actually stop a dev
instance, use the tray icon's "Quit" item, `Ctrl+C` in the terminal running `tauri dev`, or kill
the `cargo run`/`monosodium-desktop.exe` process directly.

Rust and cargo were installed via winget mid-session — if `rustc`/`cargo` aren't on `PATH` in a
fresh shell, refresh from the User+Machine PATH env vars (a plain new terminal should already
have it via the registry-level PATH update, this was only needed because the same PowerShell
session that ran the installer doesn't auto-refresh its own PATH).

First `cargo` build pulls ~450 crates and takes 1-2 min; after that, incremental builds are
seconds.

## Known follow-ups / things to watch

- No automated tests exist yet; verification has been `tsc --noEmit` + `cargo check`, plus
  extensive live manual testing throughout the project (grid/autocomplete, and - confirmed with
  a real signed-in account - voting and favoriting via `usePostMutations.ts`).
