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
- **Scope: core browsing first, Phase 2 in progress.** User profiles and saved searches have
  landed (see Progress). Comments, Dmail/messages, forum, encrypted backup/restore, on-disk image
  cache management, and the update checker are still explicitly deferred — not built yet, not
  stubbed.

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
  downloads.rs    download_post_file - fetches a post's CDN URL and writes it to disk
                  (Pictures/Videos/"e621 Desktop" by default, or the Settings-configured folder)
  lib.rs          plugin/window/command wiring, Mica backdrop setup

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
  App.tsx         wires everything: search state, viewer/settings/profile/saved-searches
                  open-close, blacklist actions
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
- [x] **M6** Favorites (no separate screen needed - e621 favorites are just `posts.json?tags=
      fav:<username>`, confirmed from the reference app's own FavoritesViewModel comment, so a
      "♥ Favorites" shell button just runs that as a normal search through the existing
      grid/viewer) + downloads (`downloads.rs`'s `download_post_file` fetches the same CDN URL
      the webview shows and saves it via a download button in the viewer header; defaults to
      Pictures/Videos/e621 Desktop, or the folder set in Settings)
- [x] **M7** Polish pass — site toggle already re-searched end-to-end for free (site is part of
      `usePostsQuery`'s query key); added a green/amber/red connection health dot on the site
      button (`queries/useHealthCheck.ts`, polls `health_check` every 60s), a Retry button on
      the error state, and a `/` shortcut to focus the search box from anywhere (skipped when
      already typing in an input/textarea/contenteditable)

**Phase 1 (core browsing) is complete and has passed one live human test pass** (see memory:
feedback_no_manual_app_testing - the user tests it themselves, not Claude).

- [x] **Visual refresh** Replaced every emoji/glyph icon (♥ ⚙ × ▲ ▼ ‹ › ⏸ ▶ 🔇 🔊 ↻ ⭳ ✓ 🔍 ⊘)
      with `lucide-react` across the shell, grid, viewer, tag chip menu, video player, search
      bar, and settings; introduced shared `components/ui/` chrome (`IconButton`, `Button`,
      `Section`) to de-duplicate the button/card treatment that had been hand-copied per file;
      added subtle entrance transitions on overlays and the tag-chip menu (`fade-in`/`scale-in`
      keyframes in `index.css`). The Mica-backdrop translucency constraint (`index.css`'s
      body/#root comment) is untouched - only already-opaque overlay layers got surface treatment.
- [x] **Tag color reconciliation** Deleted `lib/tagCategoryColors.ts`; `SearchBar`'s autocomplete
      now reads color from `tagCategoryStyle.ts` too, so the dropdown and the viewer's tag chips
      agree on every category.
- [x] **Phase 2: User Profiles** `ProfilePanel` (avatar, level badge, join date, stats, feedback,
      about/artist-info, Posts/Favorites shortcuts) for both the signed-in account (shell
      "Profile" button) and any post's uploader (`InfoPanel`'s new Uploader row). Backend reused
      the `get_current_user`/`get_user` commands and `UserProfile` model that already existed
      (only used by blacklist import/push before this) - extended the struct with the remaining
      public fields (`models.rs` + `models/user.ts`), no new Tauri commands needed.
- [x] **Masonry post grid** Replaced the even CSS-grid layout (`react-virtuoso`, square
      thumbnails) with a Pinterest-style virtualized masonry grid (`masonic`) - cells keep each
      post's real aspect ratio instead of being cropped to a square, packed into whichever
      column is shortest, matching the reference Android app's `LazyVerticalStaggeredGrid` look.
      **Live-verified**, including the resize-observer-driven re-layout on window resize and the
      thumbnail-size slider (the part that couldn't be checked with `tsc`/`cargo check` alone) -
      confirmed working, no further changes needed here.
- [x] **Site-aware title + welcome greeting** The shell's top-left label now shows the active
      site ("e621 Desktop" / "e6AI Desktop", accent-colored) instead of a static string, matching
      the reference app's `SiteBadge`. Settings also greets you with a random "{greeting}," atop
      the panel, re-rolled every time it's opened - `lib/greetings.ts` ports the reference app's
      `res/raw/hello.txt` list (hello in ~90 languages, plus its two joke entries) verbatim; the
      signed-in username underneath is clickable, opening your own profile, mirroring the
      drawer's greeting header exactly.
- [x] **Grid info dock** `PostThumbnail`'s hover-only score/favorite overlay plus separate
      rating/video badges are replaced with the reference app's always-visible `InfoDock` bar
      (rating chip anchors the left edge, filetype the right, "Score: N" and a gold favorite
      star between - `lib/formatCount.ts` ports its K/M count formatting) and a single small
      movie-icon badge for any animated/video post, dropping the old duration text to match the
      reference app's simplified treatment exactly.
- [x] **Refresh button + title as home** A dedicated refresh `IconButton` next to the search bar
      calls `usePostsQuery`'s new `refresh()` (spins while `isRefetching`) instead of a plain
      `refetch()` - mirrors the reference app's pull-to-refresh by discarding every page beyond
      the first before refetching, rather than re-validating a potentially long scroll history;
      the error state's Retry button now uses the same `refresh()`. The shell's site-aware title
      is now a button that always calls `onSearch("")`, resetting to the default (tagless)
      search regardless of the current query - both live in `AppShell.tsx`/`App.tsx`. Also
      restored the video-duration text next to the movie-icon badge on animated/video thumbnails
      (`PostThumbnail.tsx`) alongside the icon, after the info-dock rework had dropped it.

      **Found and fixed live**: the refresh button initially blanked the whole app - `refresh()`
      shrinking the posts array (discarding all but page 1) crashed `masonic`, which assumes
      `items` only ever grows or gets wholesale-replaced, never shrinks out from under an
      existing positioner (see `PostGrid.tsx`'s `resetNonce` ref - a same-render length check,
      the same "ref as previous-render memory" pattern `usePositioner` itself uses internally -
      that resets the positioner and scrolls back to top whenever `visible.length` drops).

      **A second live-found bug** in the same pass: `App.tsx`'s `effectiveTags` memo depended on
      `ratingTagFilter` (a stable function reference from the settings store - it never changes
      identity, since it reads live state via `get()` internally rather than through its own
      changing props/args), not on the `adultModeEnabled`/`enabledRatings` values that function
      actually reads. Toggling a rating in Settings silently kept querying under the *old* filter
      until `activeQuery` happened to change for an unrelated reason - fixed by subscribing to
      those two values directly in `App.tsx` and adding them to the memo's deps. Worth remembering
      if another derived value ever wraps a store-provided function like this: the function
      reference is not a valid proxy for "the things it reads."
- [x] **Loading indicators** New `components/ui/Spinner.tsx` (used in App.tsx's/ProfilePanel's
      initial-load states) and `TopProgressBar.tsx` (a slim indeterminate bar under the shell
      header - `AppShell`'s new `isLoadingPosts` prop, true while the posts query is
      loading/refetching/paginating). `PostThumbnail` now shows a shimmer skeleton and fades its
      image in on load instead of popping in abruptly; `ZoomableImage` and `VideoPlayer` got the
      same treatment (a centered spinner until the full image/video is ready).

      **Found and fixed live - thumbnail flicker on scroll**: the shimmer/fade-in above initially
      replayed every time a thumbnail scrolled back into view, because `masonic` unmounts cells
      that scroll past its overscan window and remounts them on the way back, resetting the
      per-component `loaded` state each time even though the browser already had the image
      cached. Fixed with a module-level `Set` of already-loaded thumbnail URLs
      (`loadedThumbUrls` in `PostThumbnail.tsx`) that survives remounts, so a URL only ever
      shows the skeleton/fade the first time it's displayed.

      **A second live-found bug**: blacklisting a tag that every result in the current search
      matched, then re-enabling "Show blacklisted posts," left the grid permanently blank.
      `PostGrid`'s empty state was a separate early `return` that skipped rendering the
      scrollable container div entirely; the `ResizeObserver` that measures it is attached once,
      on mount, via an empty-deps effect, so if the container was ever absent when that effect
      ran (or got replaced by a new DOM node later), it silently stopped reporting size forever -
      width stuck at 0, and `{size.width > 0 && grid}` never rendered again even once posts
      became visible. Fixed by keeping the container permanently mounted and rendering the empty
      state *inside* it instead of replacing it.
- [x] **Category-colored search chips** SearchBar's committed-tag chips now use the same
      `tagCategoryStyle.ts` fill/text colors as TagChip and the autocomplete dropdown, instead of
      flat neutral pills - an excluded (`-tag`) chip keeps its category color but gets a red
      outline on top, rather than the color being replaced outright (matching how TagChip already
      layers its blacklist-match outline over the category fill). A committed tag is just a
      string with no category attached, unlike a suggestion or a post's own tags, so
      `lib/tagCategoryCache.ts` is a session-only best-effort `Map` populated opportunistically
      from data already being fetched (autocomplete suggestions in `SearchBar.tsx`, loaded posts'
      tags in `App.tsx`) - a tag neither source has seen yet just renders neutral. Meta search
      operators (`rating:`, `user:`, `order:`, ...) are deliberately excluded from lookup, since
      they aren't real tags and have no category.
- [x] **Phase 2: Saved Searches** `SavedSearchesPanel` + `state/savedSearchesStore.ts`, ported
      from the reference app's `SavedSearchStore`/`SavedSearchesScreen` field-for-field: e621 has
      no server-side saved-search feature, so entries (`{id, label, query, createdAt}`) are
      local-only, stored as one JSON array in their own `tauri-plugin-store` file. Create and
      delete only - no rename, no reorder, no duplicate-name check, no delete confirmation,
      matching the reference app exactly (see its `SavedSearch.kt`/`SavedSearchStore.kt` doc
      comments and `SavedSearchesViewModel`, which guard the same way: blank label or query is a
      silent no-op). Reachable from a new shell button (works with no account, unlike
      Favorites/Profile) next to Favorites.
- [x] **Fixed: meta search operators got silently replaced by a tag suggestion** Typing
      `score:>1500` (or any `rating:`/`id:`/`user:`/`order:`/... operator) triggered a live
      autocomplete fetch same as a plain tag, and pressing Enter auto-selected whatever e621
      loosely returned for that garbage query instead of using the literal typed text - so the
      search silently ran against the wrong tag entirely. `useTagAutocomplete` now skips fetching
      whenever the prefix contains `:` (e621 tags themselves never do), and `SearchBar`'s Enter
      handler double-checks the same thing against the live (non-debounced) draft, since the
      dropdown's suggestions lag the debounce by up to 200ms.
- [x] **The "cooter" easter egg** Ported from the reference app's `PostGridScreen.kt`/
      `EasterEggDialog` verbatim: typing "cooter" into the search bar (live, or as a finalized
      token - it can never become a real search chip) opens `EasterEggDialog.tsx`, showing
      `assets/egg.png` (copied from the reference app's `res/raw/egg.png`) over an infinitely
      scrolling ROYGBIV background (`.rainbow-scroll` in `index.css`, same stripe colors as the
      reference app's `RainbowStripeColors`) with the caption "Ah ah ah! You DID say the magic
      word". Typing a close-but-incomplete prefix (4+ characters, matching the reference app's
      thresholds) shows an "Almost there…" tease in place of the real autocomplete dropdown,
      without ever revealing the word itself.

**Deferred to a later phase, not started:** comments, Dmail/messages, forum, encrypted
backup/restore, on-disk image cache management UI, update checker.

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

- No automated tests exist yet; verification has been `tsc --noEmit` + `cargo check`, plus
  extensive live manual testing throughout the project (grid/autocomplete, and - confirmed with
  a real signed-in account - voting and favoriting via `usePostMutations.ts`).
