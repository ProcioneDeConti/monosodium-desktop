# Monosodium Desktop v2 — "Many Sources" aggregator plan

Status: **approved plan** (written 2026-11-20, against v1.28.1 / commit 14f6c2a). Nothing
here is implemented yet. All decisions are settled; see §14.

---

## 0. TL;DR

- v2 turns Monosodium from "an e621 client with a site toggle" into **a furry art browser
  with many sources**. Each source plugs in through one Rust trait-like boundary and one
  normalized frontend model. The grid, viewer, blacklist, collections, downloads and
  wallpaper work on any source. e621-only features (pools, wiki, forum, dmail, upload,
  sets, Tagdle) stay e621-only and are hidden when another source is active.
- **e6AI is gone** (offline 2026-11-13). The `E6ai` variant is removed. Its natural successor
  **Floofgens.net** (an e621ng fork run by former e6AI mods) slots into the *existing*
  e621 code path almost for free, so it ships first.
- Sources, in rough order of effort and risk:

  | Source | Access | Effort | Risk | Notes |
  |---|---|---|---|---|
  | **Floofgens** | e621ng JSON API (same as e621) | XS | Low (site is new) | Same code path as e621 |
  | **Weasyl** | Official JSON API + API key | S | Low | No search endpoint in the API; search is an HTML page |
  | **Inkbunny** | Official JSON API (sid) | S | Low | Real search, ratings, pools. Recovery already has a sid client |
  | **Furbooru** | Philomena JSON API | S | Low | Booru-style tags, closest to e621 |
  | **Fur Affinity** | **No API.** HTML scraping, cookie session | L | **High** | Breaks when FA changes markup; adult content needs login |
  | **Kemono (kemono.cr)** | Unofficial JSON API | M | **High** (blocking) | In, gated on a Cloudflare spike. Creator-centric, multi-file posts, no tags |
  | **U-18Chan** | **No API.** HTML scraping, Cloudflare | L | **High** | Threads, not posts. Needs its own "board" view |

- The milestone order is: sunset e6AI + add Floofgens → refactor to sources with **no
  behavior change** → Weasyl (first non-e621 source) → the rest → mixed feed / following →
  2.0.0. Each milestone ships on its own (1.29, 1.30, … then 2.0.0-beta.N).

---

## 1. Goals & non-goals

**Goals**
1. Browse, search, view, download and collect from several furry art sites in one app, with
   one consistent look.
2. Turn each source on or off. Pick one source, or a **mixed feed** that merges several.
3. Keep e621 a first-class source. Nothing that works today should get worse.
4. Make sources easy to add. A new site should be about one Rust module, one TS normalizer,
   and one capabilities entry.
5. Keep the app's current ethos: honest client identification, polite rate limits,
   credentials stored in Windows Credential Manager or encrypted, no API keys sent to CDNs.

**Non-goals (for v2.0)**
- Uploading anywhere other than e621. The uploader stays e621-only.
- Full social features on every site (FA notes, Weasyl journals/shouts, chan posting). Read
  first, writes only where the site has a real API for them.
- Bypassing anti-bot protection: no TLS fingerprint spoofing, no automatic Cloudflare
  challenge solving, no browser User-Agent impersonation. If a site blocks honest clients,
  the source shows "blocked — open in browser" (see §6.4).
- Discord, Patreon or Fanbox *directly*. Kemono covers those, if we keep it at all (§9.6).

---

## 2. What changes conceptually

| v1 concept | v2 concept |
|---|---|
| `Site = "e621" \| "e6ai"`, both e621ng | `SourceId` = many sites, each with its own API style |
| `Post` (e621 JSON 1:1) everywhere (60 TS files import it) | `Item`, a normalized model with `item.native` holding the original (e621 `Post` stays intact inside) |
| Tag query language = e621's | Each source declares its **query dialect**; the search bar adapts and each adapter translates |
| Site toggle in the header | **Source switcher**: single source, or a "Mix" of several |
| One rate limiter per e621ng host | `SourcePolicy` per source (rate, burst, writes, UA, cookies, referer) |
| Blacklist = e621 tag expressions | Same engine, run over normalized tags + `author:` / `source:` / `title:` pseudo-tags |
| Favorites = e621 favorites | Remote favorites where the site has them, **plus** local Collections (already exist) for everything |
| Viewer shows one file | Viewer shows **1..N files** (Kemono posts and chan threads have many) |

---

## 3. Architecture

### 3.1 Rust: `src-tauri/src/sources/`

```
src-tauri/src/
  sources/
    mod.rs            SourceId enum, dispatch (match on SourceId), shared types
    policy.rs         SourcePolicy + keyed rate limiters (replaces rate_limit.rs's fixed fields)
    http.rs           request() generalized: policy-driven UA, auth, cookies, referer, retries,
                      429/503 backoff, per-source metrics (feeds the existing API metrics fold)
    html.rs           shared scraping helpers built on the `scraper` crate (replaces source_fetch's
                      hand-rolled attr()/tags() for new code; source_fetch can migrate later)
    media_proxy.rs    `msmedia://` custom URI scheme, for sources whose CDN needs a Referer/cookie
    e621ng/           e621 + Floofgens (the current api.rs, moved; host from SourceId)
    weasyl.rs
    inkbunny.rs
    furbooru.rs
    furaffinity/      mod.rs, parse_search.rs, parse_view.rs, parse_gallery.rs, fixtures/
    kemono.rs
    u18chan/          mod.rs, parse_catalog.rs, parse_thread.rs, fixtures/
  api.rs              shrinks to e621-only commands (pools, wiki, forum, dmail, sets, notes...)
```

**Dispatch:** an enum plus `match`, not `dyn Trait`. Async trait objects are awkward in Rust,
and the set of sources is known at compile time. Each source module exposes the same free
functions:

```rust
// sources/mod.rs
#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SourceId { E621, Floofgens, Weasyl, Inkbunny, Furbooru, Furaffinity, Kemono, U18chan }

#[tauri::command]
pub async fn source_search(state: State<'_, AppState>, source: SourceId, q: SearchRequest)
    -> Result<ItemPage, SourceError> {
    match source {
        SourceId::E621 | SourceId::Floofgens => e621ng::search(&state, source, q).await,
        SourceId::Weasyl => weasyl::search(&state, q).await,
        SourceId::Furaffinity => furaffinity::search(&state, q).await,
        // ...
    }
}
// likewise: source_get_item, source_autocomplete, source_get_user, source_user_gallery,
// source_favorite, source_vote, source_health, source_capabilities
```

**Who normalizes, Rust or TS?** Rust. Each adapter returns `RawItem` JSON that already has
the normalized shape (§4), with `native: serde_json::Value` carrying the site's original
object. Reasons: (a) scrapers must run in Rust anyway, (b) one IPC shape for all sources,
(c) parsing can be unit-tested with `cargo test` against saved fixtures. The e621ng adapter
also fills `native` with the full `Post`, so e621-only UI keeps working unchanged.

**`SourceError`** is structured, not a string, so the UI can react properly:

```rust
pub enum SourceError {
    RateLimited { retry_after_ms: u64 },
    AuthRequired { reason: String },        // e.g. FA adult search without a session
    Blocked { status: u16 },                // Cloudflare/DDoS-Guard challenge page detected
    LayoutChanged { parser: &'static str }, // HTTP 200, but the scraper found nothing it expected
    NotFound, Network(String), Other(String),
}
```

`LayoutChanged` matters most. It turns "FA silently shows zero results" into a clear banner:
"Fur Affinity's page layout changed. Update Monosodium, or open in browser."

### 3.2 Request policy (generalizing `rate_limit.rs`)

```rust
pub struct SourcePolicy {
    pub read_rps: u32, pub read_burst: u32,
    pub write_per_min: Option<u32>,
    pub user_agent: UaStyle,          // Honest(format) always, see below
    pub auth: AuthKind,               // None | BasicApiKey | HeaderApiKey(&str) | Sid | Cookie(host)
    pub referer: Option<&'static str>,
    pub max_concurrency: usize,       // scrapers = 1
}
```

Proposed defaults. All are conservative, and none rely on a published limit unless one is
noted:

| Source | Read | Burst | Writes | Rationale |
|---|---|---|---|---|
| e621 / Floofgens | 1/s | 2 | 50/min | Unchanged. Documented e621 rules; Floofgens inherits e621ng's limiter |
| Weasyl | 1/s | 2 | 20/min | Official API, no published limit; same courtesy as e621 |
| Inkbunny | 1/s | 2 | 20/min | Same |
| Furbooru | 1/s | 2 | — | Philomena asks for politeness |
| Fur Affinity | **1 per 2 s** | 1 | 10/min | HTML pages are heavier. FA historically cracks down on bots, so stay well under human browsing speed |
| Kemono | 1 per 2 s | 1 | — | Known to 403/time out under load |
| U-18Chan | 1 per 2 s | 1 | — | Small site behind Cloudflare |

**User-Agent:** keep the honest format on **every** source:
`MonosodiumDesktop/{version} (by {username} on {host})`, plus a contact/repo URL. This is the
project's rule, not just e621's. If a site rejects it (§6.4), we report `Blocked`; we don't
switch to a browser UA.

**Mixed feed + limits:** limiters are per source, so a 4-source mix makes up to 4 parallel
requests/s overall but stays within each site's limit. The mix planner (§7.2) prefetches
lazily so a scroll doesn't fan out into a burst.

### 3.3 Media loading

Today media loads straight into the webview via `<img src>` pointing at the CDN. Keep that
as the default wherever it works (e621, Floofgens, Weasyl, Inkbunny, Furbooru, FA's
`d.furaffinity.net` in most cases, Kemono files). For hosts that need a Referer or a session
cookie (FA mature/adult files when logged in, U-18Chan behind Cloudflare), add a **Rust media
proxy** on a custom scheme:

- `msmedia://{source}/{base64url(original_url)}`, registered via
  `register_asynchronous_uri_scheme_protocol`.
- Validates that the host belongs to an allowlist for that source (reuse `check_url` /
  `is_public_ip` from `source_fetch.rs`, so the proxy can't become an SSRF tool).
- Attaches only that source's cookie and Referer. Streams the bytes and passes `Range`
  through for video.
- Optional disk cache under the existing cache dir, counted by the Cache settings card.

The adapter decides per URL whether to return a direct URL or an `msmedia://` URL, so the
frontend never needs to know.

### 3.4 Credentials

Generalize `credentials.rs` from "username + API key per site" to a per-source credential:

```rust
enum Credential {
    ApiKey { username: String, key: String },     // e621, Floofgens, Furbooru
    HeaderKey { key: String },                    // Weasyl (X-Weasyl-API-Key)
    Password { username: String, secret: String },// Inkbunny -> sid at runtime, sid not persisted
    Session { cookies: Vec<(String,String)> },    // FA, Kemono (optional); via source_login.rs window
}
```

- `source_login.rs` already does an isolated WebView2 sign-in window for FA (built for
  recovery). **Promote it** into the general sign-in path for FA and Kemono. Recovery and
  browsing then share one FA session. Keep the existing "no IPC, throwaway profile, cookie
  only sent to its own host" rules.
- Backup format: bump to v3. Credentials become a `{ [sourceId]: Credential }` map.
  On restore, map the old `e621*` fields across and **drop `e6ai*`** (see §10).

### 3.5 Frontend layout

```
src/
  models/
    source.ts         SourceId, SOURCE_META (name, color, icon, web base), capabilities type
    item.ts           Item, MediaFile, ItemTag, ItemAuthor, Rating3, helpers (replaces post.ts helpers)
    post.ts           unchanged e621 Post (now "native" for e621ng sources)
  sources/
    capabilities.ts   static per-source capability table (§5)
    dialects/         query dialect parsers/translators per source (§6)
    e621ng.ts         e621-only extras: itemAsPost(), pools/wiki hooks wiring
  api/client.ts       + sourceApi.search/getItem/... (still the only file that calls invoke)
  queries/
    useItemsQuery.ts  generalizes usePostsQuery (cursor opaque string, per-source hop logic)
    useMixedFeed.ts   merges N useItemsQuery streams (§7.2)
```

---

## 4. The normalized `Item` model

```ts
export type Rating3 = "general" | "mature" | "adult";          // s/q/e map onto these
export type MediaKind = "image" | "animated" | "video" | "audio" | "text" | "flash" | "archive" | "other";

export interface MediaFile {
  kind: MediaKind;
  url: string | null;            // full file (direct or msmedia://)
  sampleUrl?: string | null;     // large preview
  thumbUrl: string | null;       // grid thumbnail
  width?: number; height?: number;
  mime?: string; ext?: string; size?: number; md5?: string | null;
  durationSec?: number | null;
  name?: string;                 // kemono attachment file name, FA story filename
  alternates?: Record<string, { url: string; width: number; height: number }>; // video encodes
}

export interface ItemTag { name: string; category?: TagCategory | "keyword" }

export interface ItemAuthor {
  id: string; name: string; displayName?: string;
  avatarUrl?: string | null; profileUrl: string;
}

export interface Item {
  key: string;                   // `${source}:${id}` - globally unique, used by collections/seen/stats
  source: SourceId;
  id: string;                    // FA "54321", kemono "patreon/123/456", chan "b/1234#5678"
  pageUrl: string;               // canonical web URL (Open in browser, copy link)
  title?: string;
  description?: { format: "dtext" | "html" | "bbcode" | "markdown" | "plain"; body: string };
  authors: ItemAuthor[];         // FA/Weasyl: 1. e621: artist tags. Chan: "Anonymous"
  createdAt: string | null;
  rating: Rating3 | null;        // null = site has no ratings (treat per §8.3)
  media: MediaFile[];            // >= 1 normally; 0 for text-only kemono posts
  tags: ItemTag[];
  stats?: { score?: number; up?: number; down?: number; favs?: number; views?: number; comments?: number };
  viewer?: { favorited?: boolean; vote?: -1 | 0 | 1 };
  sourceUrls?: string[];         // e621 "sources", FA none, kemono "embed"
  flags?: { deleted?: boolean; pending?: boolean };
  threadContext?: { board: string; threadId: string; replyCount: number }; // U-18Chan
  native: unknown;               // e621 Post / FA parsed page / raw API object
}
```

Design notes:
- **`key` is the identity everywhere.** Collections, seen-tracking, stats and the recovery
  queue key on `number` e621 ids today. Migrate them to `key` (`"e621:12345"`), and migrate
  existing data on first launch (§10).
- **`media[]` is always an array**, even for single-file sites. The viewer's "N files" strip
  just doesn't render when there's one. This avoids a second code path.
- **Text/audio/flash items** (FA stories and music, Weasyl literary, Kemono text posts) get
  a styled "card" thumbnail in the grid (title, first lines, a format glyph) instead of a
  broken image. Flash is shown as "Flash: open in browser" with the thumbnail.
- `aspectRatio(item)` uses `media[0]` dims, falling back to the thumb's dims, then 1. FA
  search results have no dimensions, so use the thumbnail's (§9.4).
- `itemAsPost(item)` (e621ng only) returns `item.native as Post` for the e621-only panels.
  The 60 `Post` importers migrate in a fixed order (§11, M1) and don't all need to change at
  once.

---

## 5. Capabilities

Every UI decision reads a static capability table. Nothing should hard-code
`source === "furaffinity"`.

```ts
export interface SourceCapabilities {
  query: { dialect: "e621" | "philomena" | "inkbunny" | "fa" | "weasyl" | "kemono" | "none";
           booleanTags: boolean; negation: boolean; autocomplete: boolean; };
  sorts: SortOption[];                         // shown in the sort dropdown
  ratings: { filterable: boolean; levels: Rating3[]; adultNeedsLogin: boolean };
  auth: "none" | "apiKey" | "headerKey" | "password" | "session";
  remote: { favorite: boolean; vote: boolean; comment: "read" | "write" | false;
            follow: boolean; feed: boolean };  // feed = "watched artists' new uploads"
  pagination: "keyset" | "page" | "offset" | "cursor";
  multiFile: boolean; tagged: boolean; userPages: boolean; threads: boolean;
  e621Extras: boolean;                         // pools, wiki, forum, dmail, sets, notes, versions
}
```

| | e621/Floof | Weasyl | Inkbunny | Furbooru | FA | Kemono | U-18Chan |
|---|---|---|---|---|---|---|---|
| Tag search | full boolean | tags (API: no search; HTML search) | keywords + filters | full boolean | keywords (`@keywords`, `\|`, `-`) | text only | none (catalog) |
| Autocomplete | ✓ | — | ✓ (keyword suggest) | ✓ | — | creator names | — |
| Ratings | s/q/e | G/M/E | G/M/A | s/q/e (+more) | G/M/A | none | per-board |
| Remote fav | ✓ | ✓ | ✓ | ✓ | ✓ (session) | creator fav (session) | — |
| Vote | ✓ | — | — | ✓ | — | — | — |
| Comments | r/w | read | read | read | read | read | thread replies |
| Watch feed | — (artist tags) | ✓ | ✓ | ✓ (watched tags) | ✓ | ✓ (fav creators) | — |
| Multi-file | — | — | ✓ (submission pages) | — | — | ✓ | ✓ (thread) |
| e621 extras | ✓ | — | — | — | — | — | — |

(Unchecked cells are "not in v2.0", not necessarily "the site can't". Verify every row
against the live site during that source's milestone.)

---

## 6. Search & query dialects

### 6.1 One search bar, many dialects
The SearchBar keeps its tag-chip UI. What changes per source:
- **Placeholder and help** come from the dialect ("Tags: `wolf -human rating:s`" vs
  "Keywords: `wolf | fox -human`").
- **Chip colors** use tag categories where the source has them. Sources without categories
  use the neutral style. `tagCategoryStyle.ts` stays the single source of truth.
- **Metatags** (`order:`, `rating:`, `user:`, `fav:`) are parsed *once* into a structured
  `SearchRequest`, and each adapter translates that:

```ts
interface SearchRequest {
  terms: { text: string; negated: boolean; or?: boolean }[];   // free tags/keywords
  rating?: Rating3[];                    // from rating:, or the global rating filter
  author?: string;                       // user:/artist:
  favoritesOf?: string;                  // fav:
  order?: "new" | "score" | "favs" | "views" | "random" | "relevance";
  raw?: string;                          // passthrough: "advanced" mode sends the query untouched
  cursor?: string | null;
}
```

- Each dialect declares what it can't express. Example: FA has no `order:favs`, and Kemono
  has no tags. The search bar shows a quiet inline hint ("Fur Affinity can't sort by
  favourites; using relevance") instead of failing silently.
- **Advanced mode** toggle per source: send `raw` untouched for power users who know the
  site's own syntax.

### 6.2 Mixed-mode search
In Mix mode the same query goes to every enabled source, translated per dialect. Sources that
can't express a term (e.g. a tag query to U-18Chan) are **skipped for that query**, shown as
greyed chips in the source strip: "U-18Chan: not searchable".

### 6.3 Autocomplete
`useTagAutocomplete` becomes per-source. In Mix mode, autocomplete uses e621's tag database
(the richest vocabulary) and labels it "suggestions from e621". It's a vocabulary aid, not a
promise that the other sites use the same tags.

### 6.4 Being blocked
Scrapers detect a challenge page (Cloudflare/DDoS-Guard markers, or a 403/503 with
`cf-mitigated`) and return `Blocked`. UI: the source chip turns amber; the grid shows "U-18Chan
is blocking automated access right now" with **Open in browser** and **Try again later**. Do
not auto-retry in a loop. Back off exponentially per source (max 15 min).

---

## 7. UI / UX design

### 7.1 Source switcher (replaces the e621/e6AI toggle)
- Header pill: `[● e621 ▾]`. Click opens a popover:
  - **Single source** list. Each row: brand-tinted dot, name, health dot (reuse
    `useHealthCheck` per source), account badge (signed in / guest / "adult needs login").
  - **Mix** section: checkboxes per source, plus saved mixes ("Art sites" = FA+Weasyl+IB,
    "Boorus" = e621+Furbooru+Floofgens).
- Keyboard: `Ctrl+1..9` switches source, `Ctrl+0` toggles Mix. Add these to the
  KeyboardCheatsheet.
- Window title: `Monosodium Desktop – Fur Affinity` / `– Mix (3)`.
- **Source accent color** tints the active pill, the grid-cell source badge and the viewer's
  info header. This replaces the current e621/e6AI accent swap. Keep the colors subtle and in
  line with the existing theme, not each site's full branding. Draw our own simple glyphs per
  source; don't use the sites' logos.

### 7.2 Mixed feed
- `useMixedFeed(sources, request)` runs one `useItemsQuery` per source and **merges them by
  `createdAt` desc** (a k-way merge over the heads of each stream). It only asks a source for
  more when that source's head is the next item to place. This keeps requests proportional to
  what's on screen.
- Sort modes in Mix: **Newest** (true merge) and **Interleave** (round-robin, for sources
  without dates or with very different upload volumes). Score sorts are disabled in Mix
  because the scales aren't comparable.
- **Cross-posting dedup** (optional, off by default at first):
  1. Exact: same `md5` (rare across sites, cheap).
  2. Link: e621 `sources` URL points at the FA/Weasyl item → fold together, prefer the
     e621 copy for tags and the original site for the file. The e621 source URLs make this
     surprisingly effective.
  3. Perceptual: dHash of thumbnails computed in Rust (we already have the `image` crate),
     Hamming ≤ 6, same author name. Collapsed duplicates show a "Also on: FA · e621" chip.
- Grid cell: small source glyph in a corner (setting: always / Mix only / never).

### 7.3 Grid
- Unchanged masonry. New cell variants: **text card** (story/journal-ish), **audio card**
  (waveform-ish pattern + duration), **multi-file badge** ("1/12"), **thread cell** for
  U-18Chan (OP image + reply count + subject).
- Blacklisted-but-shown caution stripe stays and applies to every source.

### 7.4 Viewer
- **File strip** along the bottom for `media.length > 1`. `←/→` moves between items,
  `Shift+←/→` (or `[`/`]`) moves between files in an item. Kemono archives (zip/rar) are
  listed as downloadable, never extracted automatically.
- **Description renderer** per format:
  - `dtext` → existing `lib/dtext.ts`.
  - `html` (FA, Weasyl, Kemono, chan) → **sanitize with DOMPurify** using a strict allowlist
    (no scripts, styles, iframes, forms, event handlers or `javascript:` URLs; images only from
    that source's allowlisted hosts). All links open in the system browser via
    `tauri-plugin-opener`. This is a security boundary: scraped HTML is untrusted input.
  - `bbcode` → small converter, then the same sanitizer.
- Info panel rows come from `Item`. The e621-only rows (pools, parent/children, notes,
  versions, approver) render only when `capabilities.e621Extras`.
- Actions bar is capability-driven: Fav (remote) / Add to collection (local, always) /
  Vote / Download / Set as wallpaper / Open in browser / Copy link / **Find on e621**
  (reverse lookup via md5 or the existing SauceNAO/IQDB flow).

### 7.5 Artists & "Following"
This is where an aggregator beats a set of separate clients.
- **Artist identity**: an `ArtistLink { id, displayName, accounts: {source, handle}[] }`
  stored locally. It's seeded automatically from **e621 artist entries' URL lists**, which
  already map e621 artist tags to FA/Weasyl/Inkbunny/etc. profile URLs; the app's
  `get_artist` command already fetches these. Users can add or remove links by hand.
- **Artist page** (extends the existing `components/Artist/`): one header, tabs per linked
  account, plus an "All" tab that's a mix scoped to that artist.
- **Following feed**: one timeline of new uploads from everyone you follow on every
  signed-in source (FA watches, Weasyl follows, IB watches, Kemono favourite creators, e621
  followed artist tags), plus **local follows** for sources without accounts. Show a
  "new since last visit" divider (reuse `seenStore`). Optional native notification for new
  uploads from starred artists (reuse `lib/notifications.ts`), polled gently in the
  background (≤ 1 request per source per 10 minutes).

### 7.6 Settings: new "Sources" category
- One card per source: enable toggle, account (sign in / API key / session window),
  **rating ceiling** for that source, default sort, "load full-size in viewer" vs sample,
  advanced-mode toggle, and a read-only line showing its rate policy ("1 request / 2 s").
- **Source health log** card: last error per source, `LayoutChanged` notices, and a "Copy
  diagnostics" button (no cookies or keys in the copy), to make bug reports easy.
- Global: default landing source / mix, mixed-feed dedup level, source badge visibility.

### 7.7 Onboarding (first v2 launch)
A short sheet: "Monosodium now browses more than e621." Tiles to enable sources (all off
except e621 by default), a note that e6AI is gone with an offer to enable Floofgens, and a
one-time notice that settings were migrated. It reuses the EULA gate's sheet styling, and the
EULA itself gets a v2 revision that covers third-party sites (§13).

---

## 8. Cross-cutting features

### 8.1 Blacklist
- The engine (`lib/blacklist.ts`, kept in sync with the Android app) stays. The input changes
  from `Post` tags to a **flattened tag set per Item**: normalized tags, plus pseudo-tags
  the engine already supports in spirit: `rating:x`, `user:` → `author:name`, plus new
  `source:fa`, `type:video|text|audio`, `title:word` (tokens from the title, for untagged
  sources).
- Blacklist editor gets **scopes**: Global (applies everywhere), and per source. The e621
  section keeps auto-sync with the e621 account (three-way merge unchanged). Other scopes
  are local-only.
- Untagged sources (Kemono, U-18Chan) filter by author, title words and rating only. The
  editor says so.

### 8.2 Ratings
- One global rating filter (G/M/A chips) applied by every adapter, either server-side when
  the site supports it or client-side otherwise. Per-source ceilings in Settings override it
  downward.
- **Unrated sources** (Kemono, U-18Chan boards): a per-source "treat as" setting, defaulting
  to **adult**. So with an SFW ceiling these sources are simply unavailable, never leaking
  through. This matches the app's existing safe-by-default posture.

### 8.3 Collections, downloads, wallpaper, seen, stats
- **Collections** (already local): store `key`s, cache a minimal `Item` snapshot (title,
  thumb, author, pageUrl) so a collection still renders if the source is offline or the item
  is deleted. Auto-download folder works per item regardless of source.
- **Downloads**: `download_post_file` → `download_item_file(item, fileIndex)`. Filename
  template gains `{source}`, `{author}`, `{title}`, `{fileIndex}`. Default template:
  `{source}_{author}_{id}.{ext}`. Kemono multi-file posts download as a folder.
- **Wallpaper**: any `image` media works. Rotation sources can be a saved mix.
- **Seen / stats / Wrapped**: `perSite` → `perSource` map with dynamic keys. Wrapped gets a
  "your sources" slide (share of time per source), using the existing per-site share slide
  layout.
- **Recovery** (deleted e621 posts): unchanged, but it **shares the adapters**. Recovery's
  FA/Weasyl/Inkbunny resolvers in `source_fetch.rs` and the new browse adapters should call the
  same parsing code (`sources/furaffinity/parse_view.rs`), so one FA layout fix repairs both.

### 8.4 Deep links & the browser extension
- `lib/deepLink.ts` learns FA (`/view/{id}`, `/user/{name}`, `/gallery/{name}`), Weasyl
  (`/~user/submissions/{id}`), Inkbunny (`s/{id}`), Furbooru (`/images/{id}`), Kemono
  (`/{service}/user/{id}/post/{pid}`), U-18Chan (board/thread) and Floofgens (same paths as
  e621).
- `browser-extension/` adds those URL patterns ("Open in Monosodium"), with a version bump
  and a re-sign of the Firefox XPI.

### 8.5 For You, Games, Gus, Dashboard
- **For You** and **Games** (Tagdle etc.): **e621-only, decided (§14 Q6).** They always
  use e621 data whatever source is active, so they stay reachable from every source. No
  Mix version of For You.
- **Gus**: new reaction lines for source switching, Mix mode and "blocked" states, following
  the existing mascot-reactions plan's conventions.
- **Dashboard**: per-source health and usage tiles.

---

## 9. Per-source design notes

> Every endpoint and selector below must be re-verified against the live site at the start
> of its milestone. Unofficial APIs and scraped markup change without notice, and some
> details here come from third-party tools rather than official docs.

### 9.1 e621 (unchanged) and Floofgens (new)
- Floofgens is an e621ng fork that already uses the new posts API format. Add
  `SourceId::Floofgens` to the e621ng adapter with its own host, credential and limiter.
  Every e621 feature works for free, including e621-only panels (gate per feature if
  Floofgens disables any, e.g. forum or dmail).
- Its hostnames and CDN host need confirming at implementation time. Verify a production
  release exists before enabling it by default.
- Floofgens is AI-generated content (like e6AI was), so off by default; the user enables it.

### 9.2 Weasyl
- Official API: `GET /api/whoami`, `/api/submissions/frontpage` (`since`, `count` ≤ 100),
  `/api/users/{login}/gallery` (`nextid`/`backid` paging, folder filter),
  `/api/submissions/{id}/view`, `/api/users/{login}/view`, `/api/messages/submissions`
  (feed), `/api/messages/summary`. Auth header `X-Weasyl-API-Key` (user-generated in
  Weasyl settings → API keys).
- **Search isn't in the API.** Options: (a) parse the `/search` HTML results page (small,
  stable markup), or (b) launch Weasyl as "front page + artists + feed" only, with search
  added later. Recommend (a) behind the same `LayoutChanged` guard.
- Ratings: General / Mature / Explicit → Rating3. Submissions include literary and
  multimedia; map their `subtype` to `MediaKind`.

### 9.3 Inkbunny
- Official JSON API (`api_login.php` → `sid`, `api_search.php` with keyword/artist/type/
  rating filters and a result-set id for paging, `api_submissions.php` for details including
  multi-page files). Guest sid is supported. `source_fetch.rs` already does sid login for
  recovery, so reuse it.
- Ratings G/M/A, honoring the account's rating preferences (the API respects them; set via
  `api_userrating.php` for guests).
- High value, low effort: a big furry art site with a real API. Strongly recommended.

### 9.4 Fur Affinity
- **No public API.** Scrape HTML: `/search/` (POST form; supports `@keywords`, `|`, `-`,
  ordering by relevance/date/popularity, rating and type filters), `/gallery/{user}/{page}`,
  `/scraps/{user}`, `/favorites/{user}`, `/view/{id}/`, `/user/{name}/`, `/msg/submissions/`
  (watch feed, session only).
- **Layout**: FA has "classic" and "modern" themes, and logged-in markup follows the
  account's theme setting. FAExport's docs note it can only parse classic. Detect which
  layout we received and **support modern first** (the default for new accounts), plus
  classic if cheap. Fixture-test both.
- **Session**: Mature/Adult content needs a logged-in session with the account's own
  content filter set to allow it. Reuse the `source_login.rs` window and cookies (`a`, `b`).
  Show "Adult results need a signed-in FA account with mature content enabled in FA's own
  settings" when results look filtered.
- Search results give a thumbnail (`t.furaffinity.net/{id}@{size}-{ts}.jpg`) but not the full
  file URL or dimensions. The full file needs a `/view/` fetch, so **the viewer fetches the
  view page lazily on open**, never per grid cell. Grid aspect ratio comes from the thumbnail
  (larger thumbnail size variants exist; pick one that suits the column width).
- Tags: FA "keywords" become tags with category `"keyword"`. Species/gender fields on the view
  page become tags with categories `species`/`general`.
- **Read-only in v2.0 (§14 Q5).** No favourite/watch writes, which also keeps us clear of
  FA's history of cracking down on automated "watchbots". The session is used only for
  reading (adult content, the watch feed). Users favourite/watch via "Open on FA".
- Parser home: `sources/furaffinity/parse_*.rs` with HTML fixtures in `fixtures/` and
  `cargo test` coverage. Recovery's `parse_furaffinity` moves here.

### 9.5 Furbooru
- Philomena engine (same as Derpibooru): `/api/v1/json/search/images?q=...&sf=&sd=&page=&per_page=`,
  tag autocomplete, image detail, key-based auth for favorites/votes and the user's filter.
- Philomena has **server-side filters** (the user's saved filter). Expose "Use my Furbooru
  filter" or "Everything + Monosodium blacklist".
- Closest to e621 in feel, so it makes an easy Mix partner.

### 9.6 Kemono (kemono.cr)
- **Decision (2026-11-20): in, if Cloudflare/DDoS-Guard lets honest requests through.**
  Same go/no-go spike as U-18Chan (**M6.0**): from Rust, with our honest User-Agent and no
  browser impersonation, can we reliably get (1) creator posts, (2) a single post, (3) a
  search page, and (4) thumbnails/files, over a few sessions on different days? If those
  are mostly challenged or 403'd, Kemono is shelved and shown as `Blocked` (§6.4) rather
  than worked around. Like every non-e621 source, it's off by default.
- Background for the record: Kemono mirrors paywalled creator content (Patreon, Fanbox,
  SubscribeStar…). That's why it isn't in the default Mix and why its Settings card links
  to the creator's original page/paywall in the viewer ("Support this creator").
- **API (unofficial, changes without notice):** base `https://kemono.cr/api/v1`. Creator posts
  `/{service}/user/{creator_id}/posts?o={offset}` (fixed page size, ~50), single post
  `/{service}/user/{creator_id}/post/{post_id}` (now includes revisions), creator profile, a
  text search over recent posts (`/posts?q=&o=`), and the full creator index (very large, so
  fetch rarely and cache on disk with ETag/If-Modified-Since). Files served from `/data/...`
  on the main or numbered file hosts; thumbnails from a separate thumbnail host. Third-party
  tools report 403s and timeouts under load (likely DDoS-Guard/Cloudflare) and occasional
  header quirks. Verify current behaviour against gallery-dl's extractor at implementation
  time.
- **Model fit:** creator-centric, untagged, multi-file (images + attachments), text-heavy
  HTML bodies. `Item.media[]` = images first, attachments after. Grid thumbnail = first image,
  or a text card.
- **Browsing UX:** search here means creator search. The landing view is "Favourite
  creators" (local follows, or the account's favourites with a session) and "Recent".
- Pagination is offset-based. Blacklist-hop logic must be bounded the same way `MAX_HOPS` is.

### 9.7 U-18Chan
- **No API**, behind Cloudflare. Imageboard structure: boards → catalog → threads → replies
  with images. Anonymous, mostly unrated per post (boards are themed).
- It doesn't fit "search results", so it gets a **Boards mode** instead of the post grid:
  board list → **catalog grid** (thread cells: OP image, subject, reply/image counts) →
  **thread view**, a split layout: left, reply list with inline thumbnails and quote links;
  right, the viewer. Plus a "gallery" toggle that turns the thread's images into a normal
  masonry grid feeding the normal viewer (most useful for art dumps).
- **Watched threads**: local list, gently polled (≤ 1 request per thread per 2 minutes, max
  10 watched) with a "new replies" badge. Threads 404 when pruned, so show "archived" and
  keep the cached images we already showed.
- Probably needs the media proxy for Referer/Cloudflare reasons. If honest-UA requests are
  challenged, this source simply shows `Blocked` (§6.4). It may turn out to be infeasible
  without a browser-in-the-loop approach. A **spike** decides this before any UI is built
  (M7.0).
- Read-only. No posting.

### 9.8 Other candidates (not committed; easy later wins)
- **Itaku**: has a JSON API (recovery already resolves it).
- **SoFurry**: scraping; recovery already parses it.
- **Bluesky** art feeds/custom feeds: open AT Protocol API, good for "Following".
- **Gelbooru/rule34-style dapi boorus**: recovery already queries these by md5. Read-only
  search is trivial, but content quality and scope vary; probably skip.

---

## 10. Migration (v1 → v2)

Run once on first v2 launch, idempotent, with a backup copy of every store file written
first (`*.v1.bak`):

1. **Settings**: `site: "e621" | "e6ai"` → `activeSource`. `"e6ai"` → `"e621"`, plus a
   one-time notice "e6AI has shut down. Enable Floofgens?" (§7.7).
2. **Credentials**: e621 entries move to the new keyed format. e6AI credentials are **not
   reused for Floofgens** (separate site, separate accounts). Offer "Delete stored e6AI
   API key" (default yes), then remove it from Credential Manager.
3. **Blacklist sync base** per site → per source. Drop e6ai's.
4. **Collections / seen / recovery queue / stats**: numeric ids → `"e621:<id>"` keys.
   e6AI items already in collections become `"e6ai:<id>"` tombstones: listed as
   "From e6AI (site closed)" with whatever thumbnail is cached, removable in bulk.
5. **Stats**: `perSite.e6ai` keeps its history under a frozen "e6AI (closed)" label in
   Wrapped/Dashboard.
6. **Backups**: v3 writer. The v1/v2 reader stays for restore, with the same mapping.
7. **Deep links / extension**: e6ai.net links show "e6AI has shut down" instead of erroring.
8. Remove the e6AI code paths (`Site::E6ai`, limiter fields, `SITE_*` entries, title-bar swap,
   deep-link patterns, Tagdle/games references, Gus lines). There are about 40 frontend
   references across 23 files plus the Rust side.

---

## 11. Milestones

Each milestone ends with `tsc --noEmit`, `npm test`, `cargo check`/`cargo test` green, a
PROGRESS.md entry, a release, and an issue per fix (per the existing workflow). Versions
follow the project's rule: features = minor, fixes = patch, with the major bump at the end.

| # | Milestone | Ships as | Key deliverables |
|---|---|---|---|
| **M0** | **e6AI sunset + Floofgens** | 1.29.0 | Migration steps 1–8 for e6AI; `SourceId` with E621 + Floofgens on the existing e621ng path; header toggle shows e621/Floofgens. Small, user-visible, and tests the rename. |
| **M1** | **Source abstraction, zero behavior change** | 1.30.0 | `sources/` Rust module + dispatch; `SourcePolicy` limiters; structured `SourceError`; `Item` model + e621ng normalizer; `useItemsQuery`; grid/viewer/blacklist/collections/downloads/wallpaper/seen/stats moved to `Item`/`key`; capability table; e621-only panels via `itemAsPost`. **Acceptance: e621 behaves exactly as in 1.28.** |
| **M2** | **Weasyl** | 1.31.0 | First non-e621ng adapter; header-key credential; HTML search page parser + fixtures; description sanitizer (DOMPurify) + HTML renderer; text/audio grid cards; Sources settings category; source switcher popover. |
| **M3** | **Inkbunny + Furbooru** | 1.32.0 | Two API sources; password→sid credential; Philomena filter option; shared recovery code for IB. |
| **M4** | **Fur Affinity** | 1.33.0 | Scraper (modern + classic detection), session sign-in promoted from recovery, lazy view fetch, keyword dialect, watch feed, media proxy (first user), `LayoutChanged` banner + health log. Recovery switched to shared parsers. |
| **M5** | **Mix + Following + Artists** | 1.34.0 | `useMixedFeed` k-way merge, saved mixes, dedup levels 1–2 (perceptual later), artist identity linking seeded from e621 artist URLs, unified Following timeline, notifications. |
| **M6** | **Kemono** | 1.35.0 | **M6.0 spike** (go/no-go on Cloudflare/DDoS-Guard with an honest client), then: multi-file viewer strip, creator index cache, favourite-creators landing view, folder downloads, "Support this creator" link. |
| **M7** | **U-18Chan** | 1.36.0 | **M7.0 spike** (go/no-go on Cloudflare), then Boards mode: catalog, thread split view, gallery toggle, watched threads. |
| **M8** | **v2.0.0** | 2.0.0-beta.1…N → 2.0.0 | Onboarding sheet, EULA v2, README/wiki/About rewrite with the subtitle "The furry content aggregator", Wrapped "your sources", Gus lines, deep links + extension, dedup level 3, polish pass, full regression checklist. |

If you'd rather ship v2.0.0 as one big drop: M1–M8 can stay on a `v2` branch with
`2.0.0-alpha.N` pre-releases, and only M0 goes to master as 1.29.0. Recommendation: **ship
incrementally.** The refactor in M1 is the riskiest part, and live use on 1.30 will find
regressions faster than one big bang.

### 11.1 M1 migration order for the 60 `Post` importers
1. `models/item.ts` + `itemAsPost`; `useItemsQuery` wrapping today's `usePostsQuery` logic.
2. `lib/blacklist.ts` → flattened tag set input (keep the old signature as a thin wrapper
   until everything moves; the Vitest suite must pass unchanged).
3. `PostGrid` → `ItemGrid`, then `PostViewer` (media/InfoPanel/actions).
4. `postCache.ts` / `usePostMutations.ts` → keyed by `Item.key`.
5. Stores: collections, seen, recovery queue, stats (with migration).
6. Downloads, wallpaper, slideshow, export cards.
7. Leave the e621-only panels (pools, wiki, sets, notes, versions, forum, upload, games, For
   You) on `Post` via `itemAsPost`. They don't need to migrate.

---

## 12. Testing strategy

- **Rust parser fixtures**: saved HTML/JSON responses per source and page type
  (`sources/*/fixtures/`), including logged-in vs guest, modern vs classic FA, empty results,
  a challenge page, and a "layout changed" page. `cargo test` asserts the parsed `RawItem`s.
  Fixtures are scrubbed of usernames and cookies before commit.
- **Adapter contract tests**: one shared test runs every adapter's fixtures through
  invariants: non-empty `key`, `key` unique within a page, `pageUrl` on the source's host,
  `media[*].url` either on the source's allowlisted hosts or `msmedia://`, a rating that's
  valid for the source, and no description HTML containing `<script`.
- **Vitest**: dialect translators (table-driven: query in → per-source request out),
  mixed-feed merge (ordering, lazy fetching, exhaustion of one stream), dedup, blacklist
  over normalized tags, migration functions (v1 store snapshots in → v2 out).
- **Security tests**: sanitizer test corpus (XSS payloads, `javascript:` links, inline
  handlers, SVG tricks), and media-proxy host allowlist and private-IP rejection.
- **Live smoke script** `npm run sources:smoke`: hits each enabled source once (search +
  one item) with the honest UA and prints pass/fail. **For you to run.** Per project rules,
  I don't drive the app or GUI to verify. Useful right before each release, and whenever a
  scraper is suspected broken.

---

## 13. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scraped markup changes (FA, Weasyl search, U-18Chan) | Source breaks overnight | `LayoutChanged` detection, fixture tests, isolated parser files, quick patch releases; the source degrades on its own without hurting others |
| Anti-bot blocking (Cloudflare/DDoS-Guard) | Source unusable | Honest `Blocked` state + Open in browser; M7.0 spike before investing in U-18Chan; no evasion |
| Site ToS / staff objection to automated clients | Account bans, reputational harm | Conservative rate limits, honest UA with a contact URL, user-initiated writes only (none on FA), no background scraping beyond gentle feed polling. No advance contact; respond promptly if a site's staff reach out (§14 Q9) |
| Kemono legality/ethics | Redistribution of paid content | Decided (§14 Q3): off by default, out of the default Mix, "Support this creator" link to the original |
| Untrusted HTML from scraped sites | XSS in a webview that has Tauri IPC | DOMPurify strict allowlist, no `dangerouslySetInnerHTML` without the sanitizer, CSP stays strict; review against capabilities in `capabilities/default.json` |
| Media proxy abuse | SSRF / local network access | Per-source host allowlist + `is_public_ip` check, GET only, size caps (reuse `MAX_MEDIA_BYTES`) |
| M1 refactor regressions in e621 | Core features break | Zero-behavior-change milestone, `itemAsPost` escape hatch, migration backups, existing Vitest suite as a gate |
| Scope creep (social features, uploads) | v2 never ships | Non-goals in §1; read-first everywhere |
| Rate limits make Mix feel slow | Slow first page | Per-source parallelism; show the first source's results immediately and merge in the rest as they arrive (stable positions: only append below the fold) |
| EULA / content policy | Third-party content now shown | EULA v2 covering third-party sites, re-acceptance on first v2 launch |

---

## 14. Decisions (all settled 2026-11-20)

1. **Extra sources:** **Inkbunny and Furbooru are in** (M3). **e926 never.** It's already
   covered by the app's existing adult-mode toggle on e621.
2. **Floofgens:** **in**, off by default, enabled once the site has a stable public release
   (M0).
3. **Kemono:** **in, gated on the M6.0 Cloudflare spike** (§9.6). Off by default like every
   other non-e621 source; not in the default Mix.
4. **Release style:** **step by step**: 1.29 → 1.36, then 2.0.0-beta.N → 2.0.0.
5. **FA writes:** **FA is read-only in v2.0.** No favourite/watch from the app; the viewer's
   "Open on FA" link covers it. Could be revisited after 2.0.
6. **Games / For You:** **e621-only.** They always use e621 data whatever source is active.
   No Mix version of For You.
7. **Branding:** keep **"Monosodium Desktop"**, with the subtitle **"The furry content
   aggregator"** (README, wiki, About panel, installer/store description, onboarding sheet).
8. **Android parity:** **the Android app stays e621-only.** The desktop app diverges for good,
   with one constraint: the *e621* blacklist scope keeps the exact syntax the Android app
   uses, because both sync the same e621 account blacklist (three-way merge). Global and
   per-source scopes are desktop-only and can use the new pseudo-tags freely.
9. **Contacting site staff:** **ship and respond if asked.** No advance notice to site admins.
   The honest User-Agent includes the repo URL, so admins can find and contact us.
10. **Smaller calls (accepted as recommended):** FA parser targets the **modern** layout first,
    classic only if cheap. Mix dedup defaults to **exact md5 + e621 source-link folding**;
    perceptual (looks-alike) matching is opt-in.

---

## 15. Sources consulted (2026-11-20)

- e6AI closure: [Flayrah](https://www.flayrah.com/9659/ai-generated-imageboard-e6ai-announces-closure),
  [WikiFur](https://en.wikifur.com/wiki/E6AI), [Wikipedia: e621](https://en.wikipedia.org/wiki/E621_(website))
- Floofgens: [DRLaDRLa/floofgens (e621ng fork)](https://github.com/DRLaDRLa/floofgens),
  [reFloofgens userscript](https://github.com/BlackShuck89/refloofgens)
- Weasyl API: [Weasyl HTTP API 1.2](https://projects.weasyl.com/weasylapi/),
  [routing table](https://projects.weasyl.com/weasylapi/http-routingtable),
  [weasyl-apidocs](https://github.com/Weasyl/weasyl-apidocs/blob/master/source/index.rst),
  [pyweasyl docs](https://github.com/rechner/pyweasyl/blob/master/docs/index.md)
- Fur Affinity (no API): [FAExport](https://github.com/Deer-Spangle/faexport),
  [faapi](https://pypi.org/project/faapi/),
  [Flayrah: FA watchbot crackdown](https://www.flayrah.com/5689/fur-affinity-cracks-down-watchbot-accounts)
- Kemono: [gallery-dl kemono issue (revisions)](https://github.com/mikf/gallery-dl/issues/8894),
  [KToolBox API failure issue](https://github.com/Ljzd-PRO/KToolBox/issues/382),
  [Kemono-Downloader 403 issue](https://github.com/Yuvi9587/Kemono-Downloader/issues/166),
  [RSSHub domain migration](https://github.com/DIYgod/RSSHub/commit/83b08fb2),
  [kumono crate](https://docs.rs/crate/kumono/0.59.0/source/src/api.rs)
- U-18Chan: [urlscan (Cloudflare)](https://urlscan.io/result/89984100-efb2-4d50-b545-5526e5ca5f7d),
  [community Flutter client](https://github.com/ServOKio/U-18Chan)
