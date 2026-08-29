# Monosodium Desktop

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
      Pictures/Videos/Monosodium Desktop, or the folder set in Settings)
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
      site ("e621" / "e6AI", accent-colored) instead of a static string, matching the reference
      app's `SiteBadge` (the label's exact text later changed with the app's rename to Monosodium
      Desktop - see that entry near the end of this list; the site-aware behavior itself hasn't).
      Settings also greets you with a random "{greeting}," atop
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

- [x] **Slideshow** Desktop-only, no reference-app equivalent. `AppShell`'s new Play button opens
      a popover (interval seconds + fade/slide/zoom/none transition, defaults persisted in
      `settingsStore`) and starts `PostViewer` auto-advancing through the current search's visible
      posts from post 1. `PostViewer` also gets its own start/stop toggle (so slideshow mode can
      be entered from whatever post is already open, not just the beginning), a pause/resume
      (Space), live interval/transition controls, and a countdown progress bar, all in a bottom
      control bar shown only while active (`lib/slideshow.ts` has the shared constants/types).
      Media re-keys on `post.id` so the configured transition (new `slideshow-slide`/
      `slideshow-zoom`/`slideshow-countdown` keyframes in `index.css`, reusing the existing
      `fade-in`) replays every advance; running out of posts (and no more pages) auto-stops
      instead of idling on the last one. Not yet live-tested - the fade/slide/zoom transitions and
      mixed image/video slideshows (a video gets the same fixed interval as everything else,
      rather than waiting for it to finish) are the parts most worth checking by hand.
- [x] **Phase 2: Comments** View/post/vote on a post's comment thread, reached via a new
      Tags/Comments tab switcher above `TagsPanel` in `PostViewer`'s sidebar (comment count shown
      in the tab label from `post.comment_count`). Backend: `Comment`/`CreateCommentRequest`
      models plus `get_comments`/`create_comment`/`vote_comment` Tauri commands in
      `api.rs`/`models.rs`, the latter reusing the existing `VoteRequest`/`VoteResponse` shapes
      since e621 shares one voting controller across posts and comments. `useCommentsQuery.ts`
      does a single unpaginated fetch per post (matching the reference app's
      `PostActionsRepository.fetchComments` - posts rarely have enough comments to need cursor
      pagination) and drops `is_hidden` (moderator-hidden) comments client-side, same as there;
      `useCommentMutations.ts` patches that cache directly on post/vote (and bumps the shared post
      cache's `comment_count` after posting), mirroring `usePostMutations.ts`'s pattern.
      **Diverges from the reference app on purpose** (chosen over matching it exactly): comment
      voting exists here even though the reference app has none (e621's API supports it
      identically to post votes); the input is proactively disabled with a "Sign in (Settings) to
      comment" tooltip when signed out, matching this app's own vote/favorite-button convention,
      rather than the reference app's laissez-faire "always show it, fail server-side" approach.
      Not yet live-tested - viewing an existing post's comments, posting one, and voting all still
      need a real signed-in pass.
- [x] **Phase 2: Comments, round 2 - DText, edit/delete/reply/report, avatars** Closes out every
      simplification the first Comments pass above left open.
      - **DText app-wide**: `lib/dtext.ts` is a from-scratch TS port of the reference app's
        `data/dtext/DText.kt` parser (same AST shape: blocks of paragraph/heading/code/quote/list,
        each holding spoiler-delimited segments of inline text/styled/link/mention nodes) and
        deliberately matches its documented scope, not full DText - no tables, `[color]`, or
        `>>123` post references (`[section]` was later added on top of that scope - see the
        Dmail/messages entry below). `components/ui/DText.tsx` renders the AST: nested
        `[quote]`, monospace `[code]`, `[list]`/`[*]`, tap-to-reveal `[spoiler]` (blurred until
        clicked), `[b]/[i]/[u]/[s]/[sup]/[sub]/[tn]`, named `"label":url` and `[[wiki]]` links
        (relative URLs resolved against `SITE_WEB_BASE_URL`) opened via `openUrl`, bare URLs, and
        styled (non-interactive, matching the reference app) `@mentions`. Now used app-wide, not
        just comments: `ProfilePanel`'s about/artist-info text, and a new Description section in
        `InfoPanel` for `post.description` (the reference app itself skips DText there - a
        deliberate improvement over it, not a divergence to flag as risky).
      - **Edit/delete**: `update_comment`/`delete_comment` Tauri commands (PATCH/DELETE
        `comments/:id.json`) - no prior art for these in the reference app (it has none), so the
        `{comment: {body}}` PATCH wrapping follows this API's own established convention
        (`CreateCommentRequest`) rather than a confirmed source. **Confidence caveat**: `update`'s
        success path assumes the PATCH response body is the updated `Comment` JSON, same as
        `create`/`vote`; if e621 actually returns an empty body, an edit that succeeded
        server-side would still show as a failure in the UI until the comments panel is reopened
        (a real signed-in edit is the way to confirm this one way or the other). Edit/delete only
        show for comments whose `creator_id` matches the signed-in account's own id (from
        `users/me.json`) - moderator-level permissions to edit/delete anyone's comment aren't
        modeled.
      - **Reply**: e621 comments have no server-side threading (confirmed: no `parent_id` in the
        reference app's model, and its own forum-reply feature is flat too), so this is a
        client-side DText `[quote]` insertion into the compose box (`{username} said:` + the
        original body), same convention the real e621 website's own "Reply" link uses - not a
        pattern that existed anywhere in the reference app already.
      - **Report**: `report_comment` posts to e621ng's shared ticket system
        (`tickets.json`, `{ticket: {disp_id, qtype: "comment", reason}}`). **Lowest-confidence
        piece of this pass** - the reference app has zero reporting code anywhere (grepped for
        "ticket", no matches), so this shape is inferred from the Danbooru-family API convention
        generally, not verified against this codebase or a live call. Worth a real report
        submission (or at least watching the network response) before trusting it.
      - **Avatars**: `queries/useAvatarUrl.ts`'s `useAvatarUrl` (site, avatarId → image url) is
        `ProfilePanel`'s original hook, extracted so it's shared; `useUserAvatarUrl` (site,
        userId) adds the first hop (`users/:id.json` → `avatar_id`) for comments, which only carry
        `creator_id`. Both hops are plain React Query hooks keyed by id, so - unlike the reference
        app's own bespoke `AvatarRepository` (a hand-rolled `ConcurrentHashMap` cache, two
        sequential per-user network calls with no batching) - repeat commenters and any user
        already viewed via `ProfilePanel` cost at most one round trip each, shared across every
        caller, for free from React Query's own cache. New `components/ui/Avatar.tsx` (circular,
        person-glyph fallback) replaces `ProfilePanel`'s inline avatar markup and is now shared
        with `CommentRow`. **Known simplification**: doesn't replicate the reference app's
        permanently-hidden-post safety check (it re-verifies an avatar's source post isn't a
        hidden post before showing its thumbnail) - a very old/deleted avatar could show a broken
        image here instead of silently falling back.
      - New `components/PostViewer/CommentRow.tsx` carries all of this per-comment (previously
        inlined in `CommentsPanel.tsx`): avatar, DText body or edit textarea, vote arrows, and
        reply/edit/delete/report controls, each gated the same way as the rest of this app's
        write actions (disabled + "Sign in (Settings) to …" tooltip when signed out).
      - Not yet live-tested, same as round 1 - this pass adds more surface (edit, delete, report,
        DText rendering of real comment/profile/description content, avatar lookups) that all
        still needs a real signed-in pass to confirm against the live API.
- [x] **Phase 2: Dmail/messages** `MessagesPanel` (reached via a new shell Mail button, gated on
      being signed in same as Favorites/Profile) - inbox list, detail view, and compose (new or
      reply). Backend: `Dmail`/`CreateDmailRequest` models plus `get_dmails`/`get_dmail`/
      `create_dmail` Tauri commands in `api.rs`/`models.rs`; `unread_dmail_count`/`has_mail` were
      already on `UserProfile` (added earlier for Profile's own use, never surfaced in the UI
      until now) so no model changes were needed there. Inbox pagination reuses the same `b<id>`
      keyset-cursor convention as `usePostsQuery.ts`, without its blacklist-hop logic (an inbox
      has nothing to filter) - see `useDmailsQuery.ts`. **Diverges from the reference app on
      purpose**: the reference's `folder` query param (inbox vs. sent) exists in its API service
      but the app itself never actually passes a non-default value anywhere, so this port skips
      modeling `folder` at all rather than building a switch nobody asked for - same scope as
      what's actually reachable in the reference app, not a cut corner.
      - **Detail = read receipt**: e621 marks a dmail read as a side effect of `GET
        dmails/:id.json`, same as the reference app documents. `MessageDetail`'s effect patches
        the cached inbox row (`markDmailReadInCache`, mirroring `postCache.ts`'s
        `updatePostInCache` pattern) and invalidates the signed-in account's profile query, so
        both the inbox row and the shell's unread badge (`AppShell`'s new Mail button, sourced
        from `App.tsx`'s own `useUserProfileQuery(site, "me", ..., 60_000)` - the `60_000` is a
        new optional `refetchInterval` param on that hook, opt-in so it doesn't start polling
        ProfilePanel's/CommentsPanel's existing "me" lookups) update immediately instead of
        waiting for the next 60s poll.
      - **Reply**: like comments, e621 dmails have no server-side threading, so this is a
        prefilled compose (recipient locked, subject `Re: <original title>`) rather than a
        real reply - same convention `MessageComposeScreen`'s `toEditable` flag already
        establishes in the reference app, just ported field-for-field instead of invented here.
      - **Body renders as DText** (`components/ui/DText.tsx`, already shared by comments/
        profile text/post descriptions), reusing `useUserAvatarUrl` for the sender's avatar in
        both the inbox row (`DmailRow.tsx`) and detail view.
      - Not yet live-tested - sending a dmail, confirming the unread badge/read-receipt flow
        against a real second account, and DText rendering of a real message body all still need
        a signed-in pass (ideally with two accounts, so a sent message can be read back).
- [x] **Fixed live: `[section]` unsupported by DText, showing as literal brackets** Found via a
      real moderator feedback-record dmail (`TheGreatWolfgang created a neutral record for your
      account...`), which e621 wraps in `[section=Title]...[/section]` to quote the relevant Code
      of Conduct passage - the exact case the DText port's own scope note called out as
      unsupported (matching the reference app, which doesn't handle it either). Real dmails/
      feedback records use it often enough that the reference app's gap was worth closing here
      rather than porting it as-is: `lib/dtext.ts`'s `splitBlockTags` (renamed from
      `splitQuoteCode`, now generalized to a third region kind) recognizes `[section]`,
      `[section=Title]`, `[section,expanded]`, and `[section=Title,expanded]`, nests and depth-
      tracks the same way `[quote]` already did (just matched by tag *prefix* via a small
      `matchFrom` regex-search helper, since `[section]`'s opening form is variable-length unlike
      `[quote]`'s fixed string). `components/ui/DText.tsx`'s new `SectionBlock` renders it as a
      collapsible region - collapsed by default, or open if the source used `,expanded` -
      matching the click-to-reveal spirit `[spoiler]` already established here, with a
      chevron-icon toggle rather than the emoji-glyph one this app's own visual-refresh pass
      already moved away from elsewhere. (The same message's bare `* item` list lines, written
      without a `[list]` wrapper, render as plain paragraph text starting with a literal `*` -
      confirmed against the reference app's own `DText.kt`, which requires the same explicit
      `[list]` wrapper and treats a bare `*` line the same way, so that part is working as
      designed, not a second instance of this bug.)

- [x] **On-disk image cache management** `Settings > Cache` (`components/Settings/CacheSection.tsx`)
      shows current usage, a size-limit slider (100MB-4000MB step 50, or Unlimited - same bounds/
      slider-index scheme as the reference app's `ImageCacheLimits.kt`, see `lib/cacheLimits.ts`),
      and a Clear Cache button. **Architecturally different from the reference app on purpose**:
      the reference app's Coil disk cache is same-process and self-managed, so a `.clear()` call
      or an `ImageLoader` rebuild takes effect immediately. This app has no cache of its own -
      per the critical-constraint section above, every thumbnail/sample/full image/video loads
      directly in the webview, so what's actually being managed here is WebView2's own cache,
      owned by an external browser process (`msedgewebview2.exe`) that holds file locks on it for
      as long as the app runs. `src-tauri/src/cache.rs` handles this: `bootstrap()` runs at the
      very top of `run()`, before the webview (and so that locking process) exists - the only
      point a plain filesystem operation on the cache directory is safe. It pins WebView2's user
      data folder to a known path (`WEBVIEW2_USER_DATA_FOLDER`) so the cache is somewhere this
      module can find and measure it, applies a pending-clear marker file left by
      `request_cache_clear` (`fs::remove_dir_all`), and, if a limit was persisted by
      `set_cache_limit_mb`, passes `--disk-cache-size=<bytes>` via WebView2's own
      `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` bootstrap env var (both are documented WebView2
      Runtime Loader env vars, not anything Tauri-specific). Net effect: both the size limit and
      Clear Cache take effect on the *next launch*, not live - the UI says so, and Clear Cache
      offers a one-click Restart Now (`tauri-plugin-process`'s `relaunch()`) rather than leaving
      the user to close and reopen the app manually. Not yet live-tested - the actual size-limit
      enforcement and a real clear-then-restart cycle both still need a hands-on pass (`tsc`/
      `cargo check` alone can't confirm WebView2 honors either env var as expected).
- [x] **Renamed to Monosodium Desktop** The app's branding - window title, package/crate names,
      bundle identifier, User-Agent, credits footer, default download folder, cache app-data
      folder - changed from "e621 Desktop" to "Monosodium Desktop", pairing it with the reference
      Android app's own codename (`MonosodiumPDC`). Split across three distinct pieces of UI,
      each intentionally different now: the shell's top-left button (next to the search bar)
      shows just the bare active site name ("e621" / "e6AI", unchanged behavior - click to reset
      to the default search); the OS window title bar shows "Monosodium Desktop - e621" /
      "Monosodium Desktop - e6AI", kept in sync with the active site by a new effect in
      `AppShell.tsx` calling `getCurrentWindow().setTitle(...)` (needed a new
      `core:window:allow-set-title` capability - the narrowest permission for it, not the whole
      `core:window:default` bundle); and Settings' credits footer/the User-Agent sent to e621
      just say "Monosodium Desktop" outright. **Deliberately not touched**: the bundle identifier
      change (`com.e621desktop.app` -> `com.monosodiumdesktop.app`, also updated in
      `credentials.rs`'s `KEYRING_SERVICE`) was explicitly requested despite orphaning whatever
      settings/credentials were already saved locally under the old identifier - a fresh start,
      not a migration, since Windows Credential Manager entries and `tauri-plugin-store`'s
      settings.json are both keyed off it. The GitHub repo itself
      (`ProcioneDeConti/e621-desktop` -> `ProcioneDeConti/monosodium-desktop`, via `gh repo
      rename`) was renamed too, on explicit follow-up instruction - the local `origin` remote and
      README's clone instructions were updated to match (`gh repo rename` renames the repo
      server-side but doesn't touch a local clone's remote URL itself).

- [x] **Update checker** `Settings > Updates` (`components/Settings/UpdateSection.tsx`) - a manual
      "Check for updates" button (never automatic, matching the reference app's own reasoning:
      GitHub's unauthenticated API is rate limited 60/hour *per IP*, not per install, and many
      users could share one IP), showing an "Update available: vX.Y.Z" link (opens the GitHub
      release page) or "You're up to date", plus GitHub's remaining-rate-limit count when the
      response includes it. `src-tauri/src/update_check.rs` hits
      `api.github.com/repos/ProcioneDeConti/monosodium-desktop/releases/latest` directly via
      `state.http` - wholly separate from `api.rs`'s rate-limited/Basic-Auth `request()` helper,
      since GitHub is a completely different host with its own unrelated quota (same "wholly
      separate" rationale the reference app's own `GitHubClient` doc comment gives). **Checks
      this app's own repo, not the reference Android app's** (`ProcioneDeConti/MonosodiumPDC`,
      what the Kotlin `UpdateCheckRepository` this was ported from actually points at) - a
      desktop build has to compare itself against desktop releases, not the Android app's. Also
      simplified relative to the reference app: no local rate-limit estimate fallback for when
      GitHub's `X-RateLimit-*` headers are absent (rare edge case), and rate-limit info isn't
      surfaced on a failed check specifically (only on success) - both traded off for a plain
      `Result<T, String>` return matching every other command in this codebase, rather than a
      Kotlin-style always-on separate rate-limit `StateFlow`. Not yet live-tested - a real v1.0.0
      release already exists at the target repo, so a check right now should correctly report
      "up to date" (this app's own version has since moved past it), but the "update available"
      path itself still needs a newer release actually published to confirm end to end.

- [x] **Encrypted backup/restore** `Settings > Backup & Restore` (`components/Settings/BackupSection.tsx`)
      exports/imports a portable JSON snapshot of settings plus both sites' credentials
      (`lib/backup.ts`'s `buildBackup`/`applyBackup`) - optionally AES-256-GCM-encrypted, keyed by
      a PBKDF2-HMAC-SHA256 (210,000 iterations, OWASP's 2023-current minimum) stretch of a
      user-chosen password. This is a straight port of the reference app's
      `SettingsBackupManager`/`BackupCrypto` - same envelope shape (`{version, encrypted, salt?,
      iv?, payload}`, payload base64), same crypto parameters, same UX (export: encrypt checkbox
      + password/confirm-password with a plain-text warning when unchecked; import: password
      prompt that retries in place on a wrong one rather than re-picking the file) - except for
      **where the shape lives**: the reference app's `SettingsBackup` is a fixed Kotlin struct
      mirroring its own `UserSettings` one-for-one; porting that field-for-field into a Rust
      struct here would mean maintaining the same field list twice (once in
      `state/settingsStore.ts`, which already owns it, and again in Rust). Instead
      `src-tauri/src/backup.rs` knows nothing about *what* it's encrypting - `export_backup`/
      `import_backup`/`is_backup_encrypted` take a path and an opaque plaintext JSON string (or
      return one), doing only the envelope framing, crypto, and file I/O; `lib/backup.ts` is the
      only place that knows the actual field list, matching this codebase's existing boundary
      (Rust does things TS categorically can't - rate-limited API calls, Credential Manager,
      filesystem access - TS owns application/domain shapes). **Deliberately excluded**: the
      reference app's cloud-backup toggle (Android's system-level Auto Backup opt-out, via a
      dedicated `BackupAgent` - no Windows equivalent to hook into) and saved searches
      (`state/savedSearchesStore.ts` - the reference app's own `SettingsBackup` doesn't cover its
      `SavedSearchStore` either, so this matches that existing boundary, not a new one). Not yet
      live-tested - export/import round-tripping (with and without a password, including the
      wrong-password retry-in-place path) all still need a hands-on pass.

- [x] **EULA** A first-launch gate (`components/Eula/EulaScreen.tsx`, wired in at the very top of
      `App.tsx` - replaces the entire app, not just its content area, until agreed) plus a
      read-only re-display from `Settings > Legal` (`EulaReadOnlyDialog.tsx`). Not something
      CLAUDE.md's own Progress list had queued - the user asked for it directly, "exactly as it
      is in the Android app," so this is a literal port rather than an adapted one: `assets/
      eula.txt` is the reference app's own `res/raw/eula.txt` copied verbatim (same legal text,
      "mobile application" phrasing and all - deliberately not reworded for desktop, since the
      instruction was fidelity to the source, not a rewrite), and `lib/eula.ts`'s `eulaHash`
      reimplements Java/Kotlin's exact `String.hashCode()` algorithm (`Math.imul` for the correct
      32-bit signed overflow) rather than using any JS-native hash, so a locally-computed
      fingerprint matches what the Kotlin `text.hashCode().toString()` this replaces would
      produce for the same text. `eulaAcceptedHash` lives in `state/settingsStore.ts` (persisted,
      and now included in `lib/backup.ts`'s backup shape too, matching the reference app's own
      `SettingsBackup.eulaAcceptedHash` - restoring a backup shouldn't re-prompt an already-agreed
      user) and gates `App.tsx`'s render: mismatched or absent shows `EulaScreen` (scroll to the
      bottom to enable Agree; Disagree shows an error and calls `@tauri-apps/plugin-process`'s
      `exit()` after 3 seconds, same as the reference app's `finishAffinity()`), matching shows
      the normal app. **Deliberately excluded**: the reference app's "What's New" dialog and
      `lastSeenVersionCode` tracking, which live in the same `MainActivity`/`SettingsViewModel`
      files as the EULA gate but are a separate changelog feature the user didn't ask for - only
      the EULA gate itself was ported. Not yet live-tested - the disagree-then-exit path and a
      restored-backup's `eulaAcceptedHash` correctly skipping the gate both still need a hands-on
      pass.
- [x] **Forum** `ForumPanel` (topics list with sticky-pin/lock icons, a topic detail view, and a
      reply composer) - the last item on Phase 2's original list. Backend: `ForumTopic`/
      `ForumPost`/`CreateForumPostRequest` models plus `get_forum_topics`/`get_forum_topic`/
      `get_forum_posts`/`create_forum_post` Tauri commands in `api.rs`/`models.rs`, all through
      the existing rate-limited `request()` helper. **Browsing is public** (no site credentials
      required, unlike Messages) - only the reply composer is gated on being signed in, matching
      the reference app's own `ForumViewModel` comment ("Browsing is public - no e621 account
      required, unlike Messages"). **No topic creation**: e621's own API surface this was ported
      from (`E621ApiService.kt`) only exposes reading topics and replying to an existing one
      (`POST forum_posts.json`) - there's no `POST forum_topics.json` anywhere in the reference
      app, so this app doesn't invent one either. The shell's new Forum button (a `MessagesSquare`
      icon, always enabled) shows a plain notification dot - not a count - sourced from the same
      `forum_notification_dot` field on `UserProfile` that already existed (added earlier
      alongside `unread_dmail_count`, unused until now), reusing `App.tsx`'s existing polled
      "me" profile query rather than a second one.
      - **Found and fixed before it shipped**: `TopicDetail`'s "sync the header title once the
        full topic loads" effect initially called its `onTitleChange` prop directly from
        `ForumPanel`'s render body (an inline arrow function recreated every render) - since
        calling it updates `ForumPanel`'s own state, that recreates the same inline callback,
        which the effect's dependency array picks up as "changed," re-firing it immediately: a
        tight infinite render loop. Fixed by giving `ForumPanel` a `useCallback`-stabilized
        `updateTopicTitle` (also short-circuiting via `Object.is`-safe state-updater when the
        title's already current) instead of a fresh closure per render - caught via review before
        ever running the app, not via a live crash.
      - Not yet live-tested - topic browsing, opening a topic, replying (including against a
        locked topic and while signed out), and the forum notification dot all still need a
        hands-on pass.

Phase 2 (everything queued above, plus the EULA gate) is done. What follows is a further batch
the user asked to brainstorm and then build sequentially, on top of that completed scope - not
part of any original milestone list, so each entry below explains its own motivation rather than
checking off a pre-existing item.

- [x] **Phase 3: Pools** `PoolPanel` (full-screen overlay reusing the existing `PostGrid`/
      `PostViewer` components, fed a fixed, non-paginated post list instead of an infinite one) -
      neither this app nor the reference Android app has ever made pools browsable before: the
      reference app's `PostDetailScreen` only prints a post's pool ids as plain, non-interactive
      text (`#123, #456`); `pools: number[]` sat on this app's own `Post` model, unused, since
      M2. `InfoPanel`'s new Pools row turns those into clickable chips instead. Backend:
      `Pool` model + `get_pool` Tauri command (`GET pools/<id>.json`, public/no auth) in
      `api.rs`/`models.rs`. **The pool's actual sequence has to be assembled client-side**:
      e621 has no "fetch these posts, in this order" endpoint, so `usePoolPostsQuery`
      (`queries/usePoolQuery.ts`) fetches the pool's posts via an `id:1,2,3,...` tag search (whose
      own result order isn't a documented guarantee) and re-sorts the response against
      `pool.post_ids`, which the pool endpoint does guarantee is authoritative - a pool larger
      than e621's 320-post-per-request cap only shows its first 320, a known limitation rather
      than a paginated fetch of an otherwise-fixed, already-small list. Opening a pool from a post
      that's itself in another pool stacks a second `PoolPanel` on top via plain component
      recursion - arbitrary depth for free, no dedicated navigation stack needed. **Live-verified**
      (confirmed by the user) - a real pool fetches and browses correctly.
- [x] **Phase 3: Post notes** Translation/annotation boxes overlaid on the image in `PostViewer`
      (`ZoomableImage.tsx`'s new `NoteOverlay`) - like Pools, neither app has ever surfaced these
      before; `has_notes` sat unused on `Post` since M2. Backend: `PostNote` model + a
      `get_post_notes` command (`GET notes.json?search[post_id]=<id>`, public) in `api.rs`/
      `models.rs` - **view-only**, no note creation/editing (a real write feature with its own
      drag-to-create/resize-handle complexity that wasn't part of what was asked for). Field
      names were inferred from the general Danbooru-family note schema (same caveat
      `CreateTicketRequest` carries) - **confirmed correct live**, a real noted post's boxes
      rendered and revealed their text properly.
      - **Positioning is measured, not computed**: a note's `x`/`y`/`width`/`height` are pixel
        coordinates against the post's *original* full-size image, but `ZoomableImage` displays
        whatever resolution actually loaded, scaled to fit and further transformed by its own
        wheel-zoom/drag-pan state. Rather than duplicating that transform math to place overlays,
        `ZoomableImage` reads the `<img>` element's own `getBoundingClientRect()` (which already
        reflects the applied CSS transform - the browser did the math) via a `useLayoutEffect`
        keyed on `[loaded, scale, offset]`, then scales each note's coordinates by
        `renderedWidth / imageWidth` - correct regardless of zoom/pan/`object-contain` fitting,
        with no risk of the overlay math silently drifting out of sync with a future change to
        the zoom/pan implementation.
      - Numbered boxes (yellow outline, matching e621's own site convention) are click-to-reveal,
        same spirit as `DText`'s `[spoiler]` tap-to-reveal, showing the note's DText-rendered body
        in a small popover beneath the box.
      - **Live-verified** - overlay alignment confirmed correct on a real noted post; the
        `getBoundingClientRect()`-based positioning approach (rather than duplicating
        `ZoomableImage`'s own zoom/pan transform math) paid off exactly as intended.
- [x] **Phase 3: Post reporting** A Flag button in `PostViewer`'s toolbar (`ReportPostButton.tsx`,
      a popover form - same outside-click/Escape convention as `AppShell`'s slideshow menu)
      files a moderation ticket against a post. Comments already had this (`CommentRow.tsx`,
      from the Comments round-2 pass); posts didn't. Backend is a two-line addition: `report_post`
      in `api.rs` reuses the exact same `CreateTicketRequest`/`tickets.json` machinery
      `report_comment` already established, just `qtype: "post"` - inherits that struct's own
      confidence caveat (field names inferred from the Danbooru-family ticket convention, not
      independently verified). `usePostMutations.ts` gained a plain fire-and-forget `report`
      mutation alongside vote/favorite/unfavorite, no cache patch needed. **Unverified, assumed
      working** - the user can't/won't submit a real report right now (understandably, filing a
      moderation ticket isn't something to do just to test it) and asked to leave it as-is;
      revisit if it turns out not to work, same caveat `report_comment` already carries.
- [x] **Phase 3: Inline wiki previews** `[[wiki]]` links used to just open the browser, same as
      any other DText link - clicking one now opens a click-to-preview popover instead
      (`DText.tsx`'s new `WikiLink`), showing the target page's own DText-rendered body inline
      (recursing back into `<DText>` itself), with "No wiki page found"/"Open in browser"
      fallbacks. Backend: `WikiPage` model + `get_wiki_page` (`GET wiki_pages.json?
      search[title]=<title>&limit=1`, public) in `api.rs`/`models.rs`, returning `None` rather
      than an error for a nonexistent title (a broken link target, not a failure).
      **`lib/dtext.ts` gained a distinct `wiki` node type**: previously `[[page]]` parsed into
      the exact same generic `{type: "link", ...}` node as a plain `"label":url`, with no way to
      tell them apart downstream - fine when both just opened a URL, but fetching page content
      needs the raw title, not just a resolved URL, so this had to become its own variant.
      Threading that through required adding a `site` parameter to every one of `DText.tsx`'s
      internal `Block`/`Segment`/`Inline`/`StyledInline` render functions (previously none of
      them needed it - links carried a pre-resolved absolute URL from parse time, mentions/
      styling don't touch the network at all) - the widest-reaching, most mechanical change in
      this batch, but the more contained `useWikiPageQuery(site, page, open)` only fetches once
      the popover is actually opened, not eagerly for every wiki link in a block of text. Not yet
      live-tested - a real `[[wiki]]` link's preview (both hit and miss) and the recursive DText
      rendering of a real wiki page body still need a hands-on pass.
- [x] **Phase 3: Global hotkey, system tray, and native notifications** Three desktop-native
      pieces built together since they share one `lib.rs` window-visibility change: `Ctrl+Shift+E`
      (`tauri-plugin-global-shortcut`) toggles the main window's visibility from anywhere, even
      without focus - the desktop answer to "just switch apps" on mobile, which needs no such
      thing. A tray icon (`tauri::tray::TrayIconBuilder`, Tauri core's own `tray-icon` cargo
      feature - not a separate plugin) gets a "Show Monosodium Desktop"/"Quit" menu and toggles
      the window on a left-click. **Closing the window now hides it to the tray instead of
      quitting** (`window.on_window_event` intercepts `WindowEvent::CloseRequested` and calls
      `api.prevent_close()`) - confirmed directly with the user before building it, since it's a
      real behavior change from every prior milestone: the app now keeps running in the
      background until "Quit" from the tray menu, which is also *why* notifications are worth
      having (a fully-quit app can't notify). Native notifications (`tauri-plugin-notification`,
      `lib/notifications.ts`) fire for new dmail/forum activity, reusing `App.tsx`'s existing
      60s-polled "me" profile query rather than a dedicated one - gated on `document.hasFocus()`
      being false, so a user already looking at the app doesn't get a redundant popup on top of
      the shell's own badges. **The tray icon/menu, the `Ctrl+Shift+E` global hotkey, and
      close-to-tray are all live-verified** (confirmed by the user). **The notification path is
      unverified but assumed working** - the user couldn't test it directly (no easy way to
      trigger real dmail/forum activity on demand) and asked to leave it as-is rather than block
      on it; flag it here if it ever turns out not to fire.
- [x] **Phase 3: Pop a post into its own window** `PostViewer`'s new `AppWindow` toolbar button
      opens the current post in a standalone OS window (`@tauri-apps/api/webviewWindow`'s
      `WebviewWindow`, no new Tauri command needed - created straight from JS) - multi-window
      isn't a mobile concept at all, so there's nothing to port here, only to design fresh.
      **This app has no client-side router anywhere** (`App.tsx` has always rendered one
      unconditional tree), so the popped-out window can't be given a "route" - instead it loads
      the same `index.html` with `?post=<id>&site=<site>` in the URL, and `main.tsx` branches on
      those params at the one shared entry point: present, render the new minimal
      `PostWindow.tsx`; absent, render `App` exactly as before. Needed a new
      `core:webview:allow-create-webview-window` capability, and widening
      `capabilities/default.json`'s `windows` match from `["main"]` to `["main", "post-*"]` -
      window labels are `post-<id>-<timestamp>`, so every popped-out window gets its own
      capability grant (Tauri locks an unmatched window label to zero permissions by default).
      **Known, accepted limitation**: a separate window is a separate webview process with its
      own `QueryClient` instance entirely - `PostWindow` does its own minimal boot
      (settings/credentials, no saved searches) rather than sharing `App.tsx`'s, and a vote/
      favorite made in the popped-out window won't live-update the main window's grid/viewer the
      way two panels *within* the same window already do (`postCache.ts`) until that window's own
      query happens to revalidate - real cross-window state sync would need Tauri's event system
      to broadcast mutations between windows, well beyond this feature's scope. Tag actions that
      would normally start a new search in the main grid instead open that search on the real
      e621 website in the OS browser, since there's no grid to run it in here and no reliable way
      to know whether a main window is even still open; opening a post's uploader profile or a
      pool similarly opens the real website rather than an in-app panel. **Live-verified**
      (confirmed by the user) - popping a window out and its own boot sequence both work; the
      tag-action browser fallbacks specifically haven't come up yet.
- [x] **Phase 3: Drag-and-drop reverse image search (SauceNAO)** The last of the brainstormed
      batch. Dragging a local image file onto the window (`App.tsx`'s `onDragDropEvent` listener,
      filtered to image extensions) opens `ReverseSearchPanel`, showing SauceNAO matches
      (thumbnail, similarity %, and every source URL it returned) - desktop-native, no
      counterpart in the reference app since drag-and-drop isn't a mobile interaction at all.
      **Uses Tauri's own native drag-drop event, not the browser's HTML5 File API on purpose**:
      Tauri's version hands over local file system *paths* directly, so `src-tauri/src/
      saucenao.rs`'s `reverse_image_search` command can read the file and build the multipart
      upload entirely server-side - no need to read file bytes in JS and ship them across the IPC
      bridge as a serialized byte array. Wholly separate from `api.rs`'s e621/e6AI `request()`
      helper, same "different host, different unrelated rate limit" reasoning as the update
      checker and the ticket-report endpoints. **Confidence caveat**: SauceNAO's JSON response
      shape varies its `data` object by which index matched (booru vs. Pixiv vs. Twitter, ...) -
      deserialized loosely via `serde_json::Value`, pulling only the handful of broadly-common
      fields (`similarity`, `thumbnail`, `title`, `ext_urls`) rather than a struct this app has no
      way to enumerate exhaustively; not independently verified against a live response.
      **The API key choice was confirmed with the user directly** (SauceNAO over e621's own
      built-in IQDB search) before building this, since it means requiring your own API key
      rather than a keyless, e621-only alternative. The key itself goes through Windows
      Credential Manager (`credentials.rs`'s new `save`/`load`/`delete_saucenao_key`,
      `state/saucenaoStore.ts`), same treatment as e621/e6AI credentials - not the plain
      settings.json store. **Originally excluded from `lib/backup.ts`'s snapshot** on the
      reasoning that it's "a third-party secret, not an e621 one" - reversed on direct user
      feedback that a settings backup should just cover everything, e621/e6AI credentials
      included it too, so this shouldn't be different. Now part of the snapshot the same way.

      **Fixed live - "works without a key at a lower rate limit" was wrong; a key is mandatory**:
      the user reported "SauceNao search failed" right after this shipped. Rather than guess,
      curled `search.php` directly (no key, a throwaway 1x1 PNG) and got back HTTP 200 with
      `{"header":{"status":-1,"message":"The anonymous account type does not permit API
      usage."}}` - SauceNAO rejects anonymous API requests outright, it was never just a lower
      rate limit without one. Two real bugs followed from that wrong assumption: (1)
      `reverse_image_search` only checked HTTP status, so this 200-with-embedded-error response
      deserialized straight past it into a silently empty result list (`RawResponse.results`
      defaulted via `#[serde(default)]`) instead of surfacing the real message - fixed by parsing
      the top-level `header.status`/`message` and erroring out when `status < 0`; (2) the command
      now fails fast client-side with "SauceNAO requires an API key - add one in Settings" when
      none is configured, rather than round-tripping a request guaranteed to be rejected -
      `ReverseSearchPanel` checks for a key up front and shows that state immediately (with an
      "Add key in Settings" button) instead of ever showing a loading spinner for it. Settings'
      own copy and `state/saucenaoStore.ts`'s doc comment were both corrected to match. Still not
      live-tested with an actual key - a real SauceNAO response actually matching the loosely-
      typed result extraction (`similarity`/`thumbnail`/`title`/`ext_urls`) is the remaining
      unverified piece, now that the anonymous-request path is confirmed and handled correctly.

All eleven items from the user's brainstormed post-Phase-2 list are now done.

- [x] **Fixed live: every error message in the app was silently replaced by a generic fallback**
      Found via a dmail send that showed "Failed to send." no matter what actually went wrong.
      Root cause: `@tauri-apps/api`'s `invoke()` rejects with a **plain string** when a Rust
      command returns `Err(String)` (confirmed against the installed package - there's no `Error`
      wrapper), but every error-display site in this app was written as `(error as
      Error)?.message ?? "fallback"` or `e instanceof Error ? e.message : "fallback"` - both
      patterns that only work on a real `Error` object, so both *always* fell through to the
      generic fallback for the overwhelming majority of this app's own errors (any Tauri command
      failure), discarding the real backend message every time. This wasn't a one-off - it was in
      **15 call sites across 9 files**: `App.tsx`, `AppShell.tsx`, `ForumPanel.tsx` (×2),
      `MessagesPanel.tsx` (×3), `ProfilePanel.tsx`, `ReverseSearchPanel.tsx`, `UpdateSection.tsx`,
      `BackupSection.tsx` (×3), `BlacklistSection.tsx` (×2). Fixed with one shared
      `lib/errors.ts`'s `errorMessage(error, fallback?)` - handles a raw string, a real `Error`,
      or anything else - used at every one of those sites instead of the ad-hoc pattern each had
      independently reinvented. Worth remembering for any future error-display code in this app:
      a Tauri command's error is a string, not an `Error` - never write `(e as Error)?.message`
      against one.
- [x] **Fixed live (in progress): `create_dmail` reported failure on a request that actually
      succeeded server-side** Multi-step live investigation, confirmed independently of the error-
      message bug above - a test dmail (to the user's own account, which works fine on the real
      website - self-messaging isn't disallowed) was visible in the inbox on e621's own site every
      single time, even when this app reported failure. That ruled out both of the first two
      theories in order: (1) `CreateDmailFields.respond_to_id` serializing as an explicit `null`
      instead of being omitted for a fresh message (still fixed regardless -
      `#[serde(skip_serializing_if = "Option::is_none")]` - it was the only optional field in any
      write payload here to serialize that way, and is more correct either way) - didn't fix it;
      (2) a `Dmail`-shape mismatch in the response body - ruled out once the *actual* error surfaced
      (thanks to the error-message-bug fix above finally showing real text): `e621 API error 406
      Not Acceptable` with an HTML "Unexpected Error" body, meaning `ensure_success` was rejecting
      the response by HTTP status before parsing ever ran, not a JSON shape problem at all.
      **Root cause**: `request()` (the shared helper every command goes through) never sent an
      `Accept` header - `reqwest`'s `.json(&payload)` only sets the *request* body's
      `Content-Type`, never a response-format `Accept`, so every command here relied solely on the
      `.json` URL suffix for Rails to resolve the response format. That's apparently not reliable
      for every route: `POST dmails.json` returned a 406 (`ActionController::UnknownFormat`'s
      standard Rails→406 mapping) even on a request e621 fully processed and saved. Fixed at the
      shared `request()` helper - every request through it now explicitly sends `Accept:
      application/json` - not special-cased to dmails, since correct REST clients should declare
      this regardless, and any other write endpoint could plausibly have had the same latent
      gap without yet being hit. `create_dmail` still has its temporary raw-body-on-parse-failure
      diagnostic in place for one more confirming test before reverting to the plain
      `.json::<Dmail>()` every other command uses.

- [x] **Portable exe + local-only storage** Two related changes, done together since both are
      about running with zero footprint outside the app's own folder. `npm run dist` (`npm run
      tauri build` + `npm run build:portable`) now also copies the raw, un-bundled
      `src-tauri/target/release/monosodium-desktop.exe` into `dist-portable/` alongside the
      existing NSIS/MSI installers - it already ran standalone with no install step (WebView2
      links directly into the binary, no companion DLLs, and Windows 11 ships the runtime by
      default), so this is just packaging what already worked, not new capability.
      **All of this app's local state moved from AppData/Windows Credential Manager into a
      `data/` folder next to the exe** (`src-tauri/src/paths.rs`'s `data_root()`), so the portable
      exe (or any install) leaves nothing else on the system - settings.json/saved-searches.json
      (`tauri-plugin-store`, redirected via a new `get_data_dir` command since the plugin always
      resolves its own path argument against Tauri's AppData dir unless given an absolute one),
      the WebView2 cache (`cache.rs`, previously its own separate `%LOCALAPPDATA%\Monosodium
      Desktop` location), and account/SauceNAO credentials (`credentials.rs`, previously three
      separate Windows Credential Manager entries via the `keyring` crate, now removed as a
      dependency entirely). `data_root()` falls back to the old `%LOCALAPPDATA%` location only if
      the exe's own folder isn't writable - the one realistic case being a per-machine MSI install
      under Program Files without elevation.
      **Credentials are now one AES-256-GCM-encrypted file** (`credentials.dat`, reusing
      `backup.rs`'s existing envelope crypto - factored out into `crypto.rs` so both modules share
      one implementation) instead of individual Credential Manager entries. There's no password-
      prompt UX for this file (Credential Manager never needed one either, being implicitly bound
      to the logged-in Windows user), so the encryption key is derived from `%COMPUTERNAME%`/
      `%USERNAME%` instead of a typed password. **Known, accepted tradeoff**: this is weaker than
      Credential Manager's DPAPI-backed protection - anyone who can read this file *and* run code
      as the same Windows user on the same machine can reproduce the key - and, unlike AppData
      (auto user-scoped by Windows), a shared machine with multiple Windows users who can all
      reach the exe's folder no longer gets that isolation for free. Traded off deliberately for
      the storage-stays-with-the-exe requirement; a decryption failure (wrong machine/user, or a
      corrupted file) is treated as "nothing saved" rather than a hard error, matching the old
      backend's `NoEntry` behavior. Not yet live-tested - a real portable copy moved between
      folders/machines, and the Program-Files-fallback path specifically, still need a hands-on
      pass.

- [x] **Password-based local encryption (Settings > Encryption)** Follow-up to the storage-
      relocation entry above: an optional, off-by-default way to protect settings.json/
      saved-searches.json/credentials.dat with a password the user chooses, instead of only the
      machine+Windows-user-derived key credentials.dat already fell back to. `src-tauri/src/
      vault.rs` owns this - a `.vault_check` file (an AES-GCM-encrypted known plaintext) marks
      whether it's on at all, and holds the salt the real data key is derived from
      (`crypto::derive_key`) once a submitted password decrypts it successfully. The derived key
      lives only in memory (`vault.rs`'s `MASTER_KEY`) for the life of the process - every launch
      with protection on starts locked again, by design.
      - **`tauri-plugin-store`'s encryption hook, not a hand-rolled store**: the plugin exposes
        `StoreBuilder::serialize`/`.deserialize`, so settings.json/saved-searches.json stay on
        the exact same `@tauri-apps/plugin-store` JS API the rest of the app already uses (zero
        changes needed in settingsStore.ts/savedSearchesStore.ts beyond the earlier storage-
        relocation entry) - only how the bytes on disk look changes. The catch: those hook types
        are bare `fn` pointers with no closure captures, so the derived key can't be threaded in
        directly - it's read from `MASTER_KEY` inside the hook functions instead, which is the
        one reason that global exists.
      - **Verify-before-register, not trust-and-see**: `StoreBuilder::build()` swallows a failed
        initial load internally (`let _ = store_inner.load()`), so registering the encrypted
        store with a wrong key wouldn't surface an error - it would silently look like an empty
        store, and the next autosave would overwrite the real encrypted file with that empty
        state. `unlock_vault` avoids this by verifying the password against `.vault_check` first
        (which is what confirms the derived key is correct) and only then calling
        `StoreBuilder::build()` with that already-known-good key.
      - **Enable/disable restart immediately, not "restart now" like Cache's**: turning this on
        or off re-encrypts (or decrypts) settings.json/saved-searches.json/credentials.dat in
        place via direct file I/O, bypassing this session's already-open store resources
        entirely - those were registered with the *old* hooks before the toggle ran, and would
        keep autosaving in the old format over the just-migrated file if left alive even briefly.
        `EncryptionSection.tsx` calls `relaunch()` right after the Rust command succeeds, with no
        intermediate button, closing that window instead of leaving it open like Cache's deferred
        restart.
      - **`credentials.rs` didn't need new plumbing** - `machine_secret()` (the string its
        existing AES-256-GCM envelope, shared via `crypto.rs`, is encrypted under) now checks
        `vault::current_key()` first and only falls back to the machine+Windows-user derivation
        when that's `None`. Enabling/disabling just calls the existing `read_all`/`write_all`
        around the moment `current_key()` changes, so credentials.dat re-encrypts under whichever
        secret is now active with no format change.
      - **`UnlockScreen.tsx`** (App.tsx, gating even earlier than the EULA screen - nothing in
        settingsStore/savedSearchesStore can load until this resolves) includes the "forgot
        password" path the user asked for directly: a "Reset everything" option that deletes
        settings.json/saved-searches.json/credentials.dat/`.vault_check` and starts fresh, same
        as a first launch - there's no password recovery with this kind of at-rest encryption, so
        that's the only way forward. Deliberately leaves the WebView2 cache alone, unrelated to
        what a forgotten password actually blocks.
      - Not yet live-tested - enabling, restarting into the unlock screen, a wrong password's
        error/retry, disabling, and the reset-everything path all still need a hands-on pass.
      - **Fixed live, found during the first real test**: "Enable & restart" appeared to crash
        (a `Chrome_WidgetWin_0` window-class-unregister error in the console) and left the app in
        an inconsistent state - `.vault_check` present (so the app thought protection was on) but
        settings.json/saved-searches.json still plaintext underneath. Root cause:
        `tauri-plugin-store` has its own `RunEvent::Exit` handler that unconditionally re-saves
        *every currently-open store* through whatever hooks it was registered with - it fired
        during `relaunch()`'s teardown, milliseconds after `enable_password_encryption` had
        correctly written the encrypted files via direct `std::fs` I/O, and silently overwrote
        them again through this session's still-open, still-plaintext store handles from before
        the toggle ran. Not a crash at all - the log line was just that same window teardown.
        Fixed with `vault.rs`'s new `detach_live_stores` - closes both store resources
        (`StoreBuilder::new(app, path).build()` finds the existing one; `.close_resource()`
        removes it from the exit handler's reach) as the very first thing both
        `enable_password_encryption` and `disable_password_encryption` do, before any file
        writes. Recovered the affected install by hand: settings/blacklist were never actually
        touched by the bug and came through intact; `credentials.dat` had been correctly
        re-encrypted under the new password before the crash-that-wasn't, so it was orphaned once
        `.vault_check` was removed to revert - the user re-entered their e621/e6AI/SauceNAO
        credentials once as the actual cost of this bug.
- [x] **Fixed: Backup & Restore wasn't actually backing up everything** Found via direct user
      report ("I don't believe the settings backup backed up my SauceNao key"), then audited for
      more of the same rather than fixing just that one field. Two real gaps: (1) the SauceNAO key
      was *deliberately* excluded from `lib/backup.ts`'s snapshot on originally-reasonable-sounding
      grounds ("a third-party secret, not an e621 one") - reversed, since that's not the bar a user
      backing up "their settings" is measuring against; it's now included the same way e621/e6AI
      credentials already were. (2) Settings > Cache's size limit lives entirely outside
      `settingsStore.ts` (its own file, owned by `cache.rs`, never went through
      `tauri-plugin-store` at all) so it was never in scope for the backup snapshot to begin with -
      added via a real round trip (`e621Api.getCacheInfo()`/`setCacheLimitMb()`), which is why
      `buildBackup()` had to become `async` (every other field comes from synchronous, already-
      in-memory Zustand state). `cacheLimitMb` is `number | null` where `null` (Unlimited) is a
      real, meaningful value - restoring checks the field's *presence*
      (`"cacheLimitMb" in backup`), not truthiness, so an old backup made before this field
      existed doesn't get misread as "explicitly set to Unlimited." Every other
      `settingsStore.ts`-persisted field (including accent color and thumbnail size, the two the
      user asked about by name) was already covered - audited field-by-field against
      `SettingsBackup` to confirm nothing else was silently missing before calling this done.
- [x] **Global back stack + fixed: blacklisting the open post blanked the app** Two changes from
      one user report ("if you're in a post and blacklist a tag that post contains, the app
      sometimes blanks out" + "add a back button that goes back to the screen before").
      - **The blank-out**: `PostViewer` called `usePostNotesQuery(site, post.id, post.has_notes)`
        with no guard, but blacklisting a tag the open post matches shrinks `shownPosts`
        (`visiblePosts()`) one render before the parent can react, so `shownPosts[index]` was
        `undefined` and `post.id` threw before the existing `if (!post) return null` (which sits
        after the hooks, as Rules of Hooks require). Fixed three ways: `post` is now typed
        `Post | undefined` and the notes hook takes `post?.id ?? 0` / `post?.has_notes ?? false`;
        `App.tsx` (and `PoolPanel`, which has the same nested-viewer setup) gained a clamp effect
        that pulls `viewerIndex` back to the last still-visible post - or closes the viewer - when
        the list shrinks past it.
      - **Back stack**: the app has no router - every "screen" is a full-screen `z-50` overlay
        toggled by a field in `App.tsx`, layered over the search grid. Those fields are now one
        `NavState` snapshot object plus a `navHistory: NavState[]` stack. `navigate(patch)` pushes
        the current screen and moves to a new one; `replaceNav(patch)` changes the current screen
        in place *without* a history entry (viewer paging via the arrow keys / chevrons / slideshow
        auto-advance, and the clamp effect above, all use this so Back isn't spammed); `goBack()`
        pops. Every overlay's close (X) button and the viewer's Esc now call `goBack` - with linear
        navigation that's identical to the old "close just this panel" behaviour, but it also
        restores the previous *search* when a tag action or a profile Posts/Favorites shortcut
        (`runNewSearch`) swapped it out. Affordances: a new `ArrowLeft` `IconButton` at the left of
        `AppShell`'s header (shown only when `canGoBack`; the header is the one surface the overlays
        don't cover), plus global `Alt+←`, the mouse's dedicated back button (`mouseup` button 3),
        and `Backspace` when not typing into a field - all wired in `App.tsx`. History is capped at
        50 entries. **Out of scope**: nested navigation *inside* a panel (`PoolPanel`'s own viewer,
        `MessagesPanel`'s detail view, `ForumPanel`'s topic view, `ProfilePanel`'s tabs) keeps its
        own local close - the stack is App-level screens only, matching what the user's example
        described. Not yet live-tested.
- [x] **Browser-opened index.html shows a notice instead of a blank page** `npm run tauri dev`
      prints the Vite dev-server URL; opening it in a real browser rendered nothing (every screen
      gates on a Tauri `invoke()` with no backend there - `App.tsx`'s `getVaultStatus()` never
      resolves, so `vaultLocked` stays `null` and the component returns `null`). `main.tsx` now
      checks `isTauri()` from `@tauri-apps/api/core` and renders `components/BrowserNotice.tsx` ("This
      page intentionally blank…") when false, ahead of the existing `?post=` / `<App>` branch.

- [x] **Performance / RAM pass** No behaviour change - static-check only, as usual. Grid: `PostGrid`
      was re-running `visiblePosts()` (which re-tokenises every loaded post's tags into a `Set`)
      on *every* scroll render; it's now `useMemo`'d, scroll events are coalesced to one
      `setScrollTop` per `requestAnimationFrame`, the `useMasonry` render fn is a stable
      `useCallback` (a fresh one each pass defeats masonic's per-cell `React.memo`), and
      `PostThumbnail` is wrapped in `memo`. `lib/blacklist.ts`'s `postTagSet` now memoises per
      post via a `WeakMap` (post objects are stable while in the Query cache), so the blacklist
      passes across grid + viewer stop rebuilding the same sets. `App.tsx`'s tag-category cache
      effect walks only newly-appended posts instead of re-scanning the whole accumulated list
      each page, and its `onPostClick` is `useCallback`-stable. React Query `gcTime` dropped
      5min→2min and `refetchOnReconnect` off, so a superseded search's accumulated infinite-scroll
      pages (the heaviest thing in memory) are released sooner. Rust: `[profile.release]` added
      (`opt-level="s"`, `lto`, `codegen-units=1`, `strip`) for a smaller binary; the shared
      `reqwest::Client` gets a bounded idle pool + connect timeout, and API JSON calls a 30s
      per-request timeout (downloads deliberately uncapped). Vite `build.target` → `esnext` (the
      only runtime is evergreen WebView2, nothing to down-level) + `sourcemap`/compressed-size
      reporting off.

Below this line is a further batch the user asked to brainstorm and then build sequentially,
picking a specific order: Popular browser, random/shuffle, grid hover quick-actions, parent/child
relationships, post sets, related tags, multi-select + bulk actions, download queue, tabs, true
fullscreen, recent search history, keyboard cheatsheet, metatag value autocomplete.

- [x] **Phase 4: Popular posts browser** `PopularPanel` - a full-screen overlay (shell `TrendingUp`
      button, `nav.popularOpen`) for e621's own `/explore/posts/popular` ranking, which neither
      app has surfaced before. Backend: `get_popular_posts` command (`GET popular.json?date=&scale=`,
      public, no auth) reusing the existing `PostsResponse` shape - the ranked set for a period is
      server-ordered and bounded, so it's fed to `PostGrid`/`PostViewer` as a fixed non-paginated
      list exactly like `PoolPanel` does (`usePopularPostsQuery`). Header has a Day/Week/Month
      segmented control and prev/next period steppers (`lib/popular.ts` owns the date math; the
      "next" stepper disables once the selected period is the current one, and a "Now" shortcut
      appears when it isn't). Nested pool-open recursion and the blacklist-shrink viewer-index
      clamp are copied from `PoolPanel`. Bumped to 1.14.12.
- [x] **Phase 4: Random post / shuffle** Two pieces. A shell `Shuffle` button next to Refresh runs
      the *current* search with `order:random` mixed in (`lib/searchQuery.ts`'s `withRandomOrder`
      drops any existing `order:*` token first). And a persisted `slideshowShuffle` setting
      (`settingsStore` + `lib/slideshow.ts` default, in the `lib/backup.ts` snapshot too) - when
      on, the slideshow auto-advance jumps to a random other post instead of `index + 1` (and
      pulls the next page when it lands near the end, so shuffle never runs out); toggled from
      both the `AppShell` slideshow popover and a `Shuffle` button in `PostViewer`'s slideshow
      control bar. `PostViewer`'s advance logic is now one `advanceSlideshow` `useCallback`
      covering shuffle / sequential / auto-stop. Bumped to 1.14.13.
      - **Follow-up (1.14.18)**: re-running the search that's already showing (nothing else open)
        now refetches instead of no-op'ing on the unchanged query key - so the Shuffle button, or
        re-submitting `order:random` in the search bar, actually re-rolls (e621 re-randomises per
        request). `runNewSearch` short-circuits to `refresh()` when `normalizeQuery(query)` matches
        the active one and no overlay is open; `usePostsQuery` also uses `staleTime: 0` whenever
        the tags contain `order:random`, so navigating back to a shuffled search re-rolls too.
- [x] **Phase 4: Grid hover quick-actions** `PostThumbnail` gets a hover cluster (top-left, opposite
      the media badge) - favourite, upvote, download - each swallowing the click so it doesn't
      also open the viewer. Wired inside `PostGrid` itself (now takes a `site` prop) rather than
      threaded through its three callers: it reads `isAuthenticated`/`downloadDir` and
      `usePostMutations` and passes stable callbacks down (favourite/vote need auth, so the
      cluster shows Download only when signed out). Favourite/vote reuse `usePostMutations`'
      `postCache` patching, so the thumbnail's own heart/score/star update instantly; download
      reuses `download_post_file` and shows a transient check/✗ on the button. Bumped to 1.14.14.
- [x] **Phase 4: Parent/child relationships** Added the `relationships` object
      (`parent_id`/`has_children`/`has_active_children`/`children`) to the `Post` model
      (`models.rs` + `models/post.ts`, `#[serde(default)]` so it's always present) - it was on the
      e621 JSON all along, never modelled. `InfoPanel` gets a Relationships row: a "Parent #X" chip
      searches `~id:X ~parent:X` (the parent plus all its siblings), a "N children" chip searches
      `parent:<id>`. The reference app only ever printed parent ids as plain text. Bumped to 1.14.15.
- [x] **Phase 4: Post sets** e621's user-curated post collections (`post_sets.json`) - never surfaced
      by either app. Backend: `PostSet` model + `get_post_sets`/`get_post_set`/`create_post_set`/
      `add_posts_to_set`/`remove_posts_from_set` commands. **Verified against e621ng source** (1.14.20)
      - `PostSetsController` + `PostSet` model + `routes.rb`: `{add,remove}_posts` are `POST
      /post_sets/:id/{add,remove}_posts` reading a top-level `post_ids` array
      (`params.extract!(:post_ids).permit(post_ids: []).require(:post_ids)`; an empty array is
      rejected, so the commands no-op on empty); `create` permits `post_set[name/shortname/
      description/is_public]`; `index` search params `name/shortname/creator_id/creator_name`; the
      model has no `api_attributes` whitelist so all columns (incl. the `post_ids` PG array) are in
      the JSON. Shortname: 3-50 `[a-z0-9_]` with at least one letter/underscore (`isValidShortname`
      now matches). Frontend: `SetsPanel`
      (shell `SquareStack` button, gated on sign-in like Favorites) lists your sets, creates one
      (name → `deriveShortname`), and opens a set into a `PostGrid`/`PostViewer` view (`SetGridView`,
      same fixed-list pattern as `PoolPanel`/`PopularPanel`, `usePostSetPostsQuery` re-sorts by
      `post_ids`). `PostViewer` gained an optional `extraToolbarActions: (post) => ReactNode`
      render-prop, used here for a "remove from set" button. `AddToSetButton` (popover in the
      viewer toolbar, next to Report) adds the current post to a set or makes a new one inline -
      uses the shared `users/me.json` query for the creator id and `usePostSetMutations`.
      `slideshowShuffle` and `relationships` (prior two entries) plus this are all not yet
      live-tested. Bumped to 1.14.16.
- [x] **Phase 4: Related tags** e621's `related_tag.json` (powers its search sidebar's "related
      tags"), never surfaced by either app. Backend `get_related_tags` parses defensively
      (`parse_related_tags`) - the response shape has changed across e621ng versions (keyed-by-query
      `[name, category]` pairs vs. a `related_tags` array of `{tag: {...}}` objects), so it
      normalises whatever came back into `RelatedTag { name, category }` rather than deserializing a
      fixed struct. `TagChip`'s menu gets a "Related tags" item (`Network` icon) opening
      `RelatedTagsPanel` - a modal over the viewer listing the related tags as category-coloured
      chips, each with search / add-to-search / exclude actions. `models/user.ts` gained
      `numericTagCategory` (extracted from `tagSuggestionCategory`) for the colour mapping.
      Bumped to 1.14.17.
      - **Fixed live (1.14.19)**: returned "No related tags found" for everything. Two bugs, both
        from guessing the API instead of checking e621ng source: (1) the param is
        `search[query]`, not a bare `query` (`RelatedTagsController#show` reads
        `params[:search][:query]`); (2) the current response is a **bare top-level array** of
        `{ name, category_id }`, which fell through every branch of `parse_related_tags` (and the
        object path looked for `category`, not `category_id`). Parser now handles the bare array
        + `category_id` first. Also: `related_tag.json` is `member_only`, so the panel now shows
        "Sign in to see related tags" when logged out instead of firing a doomed request.
- [x] **Phase 4: Multi-select grid + bulk actions** No new e621 endpoints. `PostThumbnail`/`PostGrid`
      gained optional selection props: `selectionActive` shows a checkbox instead of the hover
      cluster and makes a click toggle-select; a ctrl/cmd/shift-click always toggles (shift =
      range from the last click) and enters selection mode. Wired only into `App`'s main grid (not
      Pool/Popular/Sets for now). `App` owns `selectionActive`/`selectedIds` + `SelectionBar` (a
      floating bar): Select-all, Clear, and bulk **Favorite** (sequential `mutateAsync` so the
      rate limiter paces it, with `N/total` progress), **Add to set** (`SetPickerDialog` - one
      `add_posts` call for the whole array), **Download** (enqueues to the new
      `state/downloadsStore.ts`). Escape or the shell `CheckSquare` toggle exits; a new search
      clears the selection. `downloadsStore` is a session-only queue (concurrency 2, background
      `pump()`) that feeds the download queue panel (next entry). Bumped to 1.14.21.
- [x] **Viewer chevron position** The next-post chevron sat at the far right edge of the window,
      over the sidebar; both prev/next chevrons now live inside the media pane, so "next" bumps
      against the left edge of the info/tags panel. Bumped to 1.14.22.
- [x] **Phase 4: Download queue panel** `DownloadsPanel` (shell `Download` button with a pending-count
      badge, `nav.downloadsOpen`) over `state/downloadsStore.ts`. Per-job rows: queued/active
      (spinner)/done/error, with retry (error), remove, and "show in folder" (`revealItemInDir`
      from `@tauri-apps/plugin-opener` - already covered by `opener:default`, no capability change).
      Clear-finished / clear-all. **Every download now routes through the queue**: bulk "download
      selected" (opens the panel), the `PostThumbnail` hover button, and the `PostViewer` toolbar
      button (its old inline saving/saved/error state collapsed to a transient "queued" tick).
      No new e621 endpoints - all of this is `download_post_file` (the CDN) plus local state.
      Bumped to 1.14.23.
- [x] **Phase 4: True fullscreen** `lib/useFullscreen.ts` - OS-level `getCurrentWindow().setFullscreen()`
      (not the browser Fullscreen API; a Tauri window isn't in a fullscreen-capable document),
      re-syncing via `onResized` so an OS-side exit is reflected. **F11** toggles it from anywhere
      (`App`), plus a `Maximize`/`Minimize` button in `PostViewer`'s toolbar. Needed
      `core:window:allow-set-fullscreen` + `core:window:allow-is-fullscreen` capabilities (the
      narrowest, matching the existing `allow-set-title` precedent). Bumped to 1.14.24.
- [x] **Phase 4: Recent search history** `state/searchHistoryStore.ts` - auto-recorded, most-recent-
      first, deduped, capped at 25, its own `search-history.json` (`tauri-plugin-store`), same
      pattern as `savedSearchesStore` and (like it) deliberately out of the backup snapshot.
      `App`'s `runNewSearch` records every non-blank query. `SearchBar` shows a "Recent" dropdown
      (up to 8, current search filtered out) when the input is focused and empty - each entry
      runs the search or can be individually removed; a "Clear" wipes the list. Distinct from
      Saved Searches (deliberate, named, never auto-pruned). Bumped to 1.14.25.
- [x] **Phase 4: Keyboard cheatsheet** `?` (when not typing) toggles `KeyboardCheatsheet` - a modal
      grouping every shortcut in the app (Global / Post viewer / Grid), collected from the various
      keydown handlers. Plain local `App` state, not part of the nav stack. Bumped to 1.14.26.
- [x] **Phase 4: Metatag value autocomplete** Previously anything with a `:` suppressed autocomplete
      entirely. `lib/metatags.ts` defines the operators + their completion behaviour: static enums
      from e621's cheatsheet (`rating:`/`order:`/`sort:`/`type:`/`filetype:`/`status:`/`locked:`/
      `parent:none`), `user`-family (`user:`/`fav:`/`favoritedby:`/`approver:`/`commenter:`/
      `noter:`/`voter:`) and `pool:` fetched live, and syntax hints for the comparison/date ones
      (`score:`/`date:`/`filesize:`/...). Backend: `autocomplete_users` (`users.json?
      search[name_matches]=<prefix>*`) and `autocomplete_pools` (`pools.json?search[name_matches]`,
      auto-wildcarded) - both **verified against e621ng's `User`/`Pool` `SearchMethods`**.
      `queries/useMetatagValues.ts` resolves enums synchronously and debounces the fetched ones;
      `SearchBar` shows them in the dropdown (mutually exclusive with tag autocomplete / recent
      searches) with shared arrow/Enter nav, committing `prefix:value` (keeping any leading `-`)
      as a chip. Bumped to 1.14.27.
- [x] **Phase 4: Search tabs** Browser-style parallel searches, a lightweight layer over the
      single-search model rather than N grid instances: `SearchTab { id, query }` (session-only,
      not persisted, not in the nav back-stack). `nav.activeQuery` stays the one source of truth;
      a sync effect writes it back into the active tab, so tag actions / Back / shuffle keep the
      tab's stored query current. Switching a tab = `replaceNav({...INITIAL_NAV, activeQuery})`
      (+ clears nav history, since per-tab history isn't modelled) so the one `PostGrid` re-points
      - React Query's cache (`usePostsQuery` `gcTime` raised to 10 min) serves the other tab's
      already-paged results, though scroll resets to top. `TabBar` (shell, shown only at 2+ tabs)
      + a `Columns2` shell button + `Ctrl+T`/`Ctrl+W`/`Ctrl+Tab`/`Ctrl+1..9`. Bumped to 1.14.28.

- [x] **Top-bar declutter into 3 menus** The header had ~15 controls; the user asked to keep only
      Refresh + Select on the bar and fold the rest into menus. New shared `components/ui/Menu.tsx`
      (`Menu`/`MenuItem`/`MenuSeparator`/`MenuLabel`/`MenuRow`, outside-click/Escape/`MenuCloseContext`
      auto-close - replaces the hand-rolled popover pattern). Bar is now:
      `[Back?] [home] [Search] [Refresh] [Select] [View ▾] [Menu ▾] [Account ▾]`.
      - **View** (`SlidersHorizontal`): thumbnail-size slider, "Show blacklisted posts" toggle
        (moved out of the loose row above the grid), New tab, Fullscreen, and the full Slideshow
        section (interval/transition/shuffle/Start - the old `AppShell` popover, inlined).
      - **Menu** (hamburger): Popular, Saved searches, Forum (dot), Downloads (count), Random posts,
        ───, Keyboard shortcuts, Settings. Trigger shows an accent dot when forum-unread or a
        download is active.
      - **Account** (avatar via `useAvatarUrl`, or `User` glyph signed-out; mail dot): Profile,
        Your favorites, Your sets, Messages (count), ───, Switch to {other site}, and a
        non-interactive connection-health status line (absorbs the old site-toggle button + its
        health dot). Signed-out: a single "Sign in (Settings)" item + the site switch.
      Bumped to 1.14.29. View-menu icon later changed to `Eye` (1.14.30).
- [x] **Profile redesign + Help page** (1.14.31)
      - `ProfilePanel` reworked: an accent-gradient hero banner with a 112px avatar punched out
        over its lower edge, larger name + level pill, a `Joined · #id` meta line and an "Open on
        {site}" external link. "Posts" / "Favorites" are now `BigAction` cards (accent icon
        circle, hint line, chevron); the stats grid gained a per-tile lucide icon; feedback is a
        3-up tile row. Same props/data (`useUserProfileQuery` + `useAvatarUrl`), no new fields.
      - `components/Help/HelpPanel.tsx` - a full-screen guide (Menu → Help, plain local state
        like the cheatsheet, `Esc` to close) with a `md:` sticky section list on the left and 14
        prose sections (getting started, searching, ratings, blacklist, grid, multi-select,
        viewer, slideshow, tabs, places, downloads, reverse search, settings, tray/hotkey).
        Section-list clicks `scrollIntoView` the matching `<section>` ref.
      - **(1.14.32)** Profile avatar is now an aspect-preserving squircle (`rounded-[24px]`, `h/w-auto`
        + `max-h-[104px]/max-w-[168px]`, so a non-square e621 avatar shows uncropped) keeping its
        `border-4 border-[rgb(var(--accent))]`. The hero banner is **adaptive** - `lib/dominantColor.ts`
        samples the avatar's most-prevalent colour (discounting near-white/black) and washes it
        across the banner, falling back to the accent gradient. The e621 CDN sends
        `Access-Control-Allow-Origin: https://e621.net` (not `*`), so a canvas read of the plain
        `<img>` taints - a new `downloads::fetch_image_data_url` command (CDN image → `data:` URL,
        4 MB cap) makes the bytes same-origin so the canvas can read them.

This finishes the user's brainstormed post-Phase-3 batch (Popular, random/shuffle, grid hover
quick-actions, parent/child, post sets, related tags, multi-select + bulk, download queue, true
fullscreen, recent search history, keyboard cheatsheet, metatag autocomplete, tabs). None
live-tested beyond what the user has confirmed inline (adding to sets works; shuffle reshuffle
and related-tags fixes verified via e621ng source).

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
