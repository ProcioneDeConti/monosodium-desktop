# e621 Desktop

A standalone Windows 11 desktop e621/e6AI browser (tag search, resizable post grid, full post
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

- **Tauri 2 (Rust backend) + React 19/TypeScript (Vite) frontend**, rendered via Windows 11's
  built-in WebView2 (Chromium). Chosen over WPF/WinUI3 specifically because WebView2 decodes
  every format e621 serves (jpg/png/gif/apng/webp/webm/mp4) natively with zero extra
  dependencies — the native-Windows alternatives all need a bundled video engine
  (LibVLCSharp, ~100MB+) just to play webm.
- **Scope: core browsing first.** Comments, Dmail/messages, forum, user profiles, saved
  searches, encrypted backup/restore, and the update checker are explicitly deferred — not
  built yet, not stubbed.

## Critical constraint: e621 API rules — do not relax these

Confirmed directly from e621's API help page (via web search, Aug 2026):
- **Hard rate limit: 2 req/sec** (503 if exceeded). Best-effort target: **≤1 req/sec sustained**.
- **Non-empty, descriptive User-Agent required on every request.** Never impersonate a browser
  UA. Format used here: `e621Desktop/{version} (by {username} on {host})`, falling back to
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
  lib.rs          plugin/window/command wiring, Mica backdrop setup

src/
  models/         TS interfaces mirroring src-tauri/src/models.rs (post.ts, user.ts, site.ts)
  api/client.ts   typed wrappers around invoke("...") - the only place that calls Tauri commands
  state/          Zustand: settingsStore.ts (persisted via tauri-plugin-store JSON file),
                  accountStore.ts (credentials, loaded from Windows Credential Manager)
  queries/        TanStack Query: usePostsQuery.ts (keyset pagination + blacklist-aware page
                  skipping - see doc comment), usePostMutations.ts (vote/favorite, patches
                  postCache.ts so grid + viewer update instantly), useTagAutocomplete.ts
  lib/            blacklist.ts (port of the Android app's blacklist matching logic - keep in
                  sync if that logic ever changes; also owns visiblePosts(), the single
                  filtered-list function shared by PostGrid and PostViewer so click-to-open
                  indices always agree), tagCategoryColors.ts (autocomplete dropdown text
                  color), tagCategoryStyle.ts (TagChip pill bg/fg per category - mirrors the
                  Android app's TagChip exactly), color.ts, queryClient.ts
  components/
    shell/AppShell.tsx        top bar: title, SearchBar, site toggle, thumbnail-size slider
    SearchBar/SearchBar.tsx   tag-chip input + live category-colored autocomplete
    PostGrid/                 react-virtuoso VirtuosoGrid, resizable columns, caution-stripe
                               for blacklisted-but-shown posts
    PostViewer/                full-screen overlay: ZoomableImage (wheel-zoom/pan) or
                               VideoPlayer (custom loop/speed/mute controls) + TagsPanel/TagChip
                               (colored pill chips grouped by category, matching the reference
                               Android app's look exactly - click opens a menu: Search / Add to
                               search / Exclude / Add to blacklist) + InfoPanel (click-to-copy)
    Settings/                  full-screen overlay: SiteAccountCard (per-site username/API key,
                               saves via accountStore -> Windows Credential Manager),
                               BlacklistSection (textarea + import-from-account/push-to-account
                               via e621Api.getCurrentUser/updateBlacklist), SettingsPanel (the
                               rest inline: ratings/adult-mode, accent color, video defaults,
                               download folder via @tauri-apps/plugin-dialog's `open()`)
  App.tsx         wires everything: search state, viewer/settings open-close, blacklist actions
```

Data flow for a post list: `usePostsQuery` → raw `Post[]` (unfiltered, so the blacklist
disable-toggle can show hidden posts again without refetching) → `visiblePosts()`
(`lib/blacklist.ts`) filters for display → same filtered array is passed to **both** `PostGrid`
and `PostViewer` so click-to-open indices line up exactly.

## Progress

- [x] **M1** Scaffold & toolchain (Rust installed via winget, Tauri+React+Vite+Tailwind v4, git
      initialized, Mica window backdrop)
- [x] **M2** Networking layer (Rust API commands, rate limiter, credentials, TS models/client)
- [x] **M3** Post grid + search (virtualized grid, tag autocomplete, keyset pagination,
      blacklist filtering + disable toggle, thumbnail resize) — verified against live e621 API
- [x] **M4** Post viewer (zoom/pan images, video player, vote/favorite, tag actions, info
      panel, keyboard nav ←/→/Esc) — verified live: open/navigate/data-fetch all confirmed
      working against the real API, including video autoplay and the tag chip action menu
- [x] **Tag chips redesign** TagsPanel/TagChip rebuilt as category-colored pills matching the
      Android app's TagChip exactly (see `lib/tagCategoryStyle.ts`), click opens a menu (Search
      / Add to search / Exclude / Add to blacklist) instead of the old hover-button list rows
- [x] **M5** Settings (account fields + credential save/load via `tauri-plugin-dialog` for the
      folder picker, ratings/adult-mode, blacklist editor with import/push, accent color,
      thumbnail size + video defaults) — compiles clean (`tsc`/`cargo check`), not yet run live
      (see memory: feedback_no_manual_app_testing - user tests it themselves now)
- [ ] **M6** Favorites screen (reuse PostGrid) + downloads (Rust command to save original file)
- [ ] **M7** Polish pass (site toggle end-to-end re-search, connection health indicator,
      empty/error states, keyboard shortcuts)

**Deferred to a later phase, not started:** comments, Dmail/messages, forum, user profiles,
saved searches, encrypted backup/restore, on-disk image cache management UI, update checker.

## Running it

**The user runs/tests the app themselves — don't launch it or drive the GUI to verify changes**
(see memory: feedback_no_manual_app_testing). Verify with static checks only:

```
cd "D:\Documents\Applications\e621 Desktop"
npx tsc --noEmit             # frontend type-check
cd src-tauri && cargo check  # Rust compile-check (fast after first build)
```

If the user asks you to run it yourself: `npm run tauri dev` starts Vite + `cargo run`, opens a
live window titled "e621 Desktop".

Rust and cargo were installed via winget mid-session — if `rustc`/`cargo` aren't on `PATH` in a
fresh shell, refresh from the User+Machine PATH env vars (a plain new terminal should already
have it via the registry-level PATH update, this was only needed because the same PowerShell
session that ran the installer doesn't auto-refresh its own PATH).

First `cargo` build pulls ~450 crates and takes 1-2 min; after that, incremental builds are
seconds.

## Known follow-ups / things to watch

- Vote/favorite buttons are wired (`usePostMutations.ts`) but will 401 until M5 (Settings) lands
  and an account is actually signed in - not yet exercised against a real account.
- `tagCategoryColors.ts` (simple text-color map, used only by SearchBar's autocomplete dropdown)
  and `tagCategoryStyle.ts` (full chip bg/fg + header color, used by TagChip) are two separate
  files with two different color choices for the same categories - intentional for now
  (`tagCategoryStyle.ts` matches the Android app's TagChip exactly, including its choice to
  visually merge general/lore/meta into one neutral style; `tagCategoryColors.ts` predates that
  and gives lore/meta their own distinct hues since the autocomplete list has no such reference
  to match). Worth reconciling into one source of truth if this bugs anyone.
- No automated tests exist yet; verification has been `tsc --noEmit` + `cargo check`, plus one
  round of live manual testing earlier in the project (see conversation
  history for confirmed working screenshots of the grid/autocomplete).
