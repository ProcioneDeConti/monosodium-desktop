import { useEffect, useRef, type ReactNode } from "react";
import {
  Ban,
  BookOpen,
  Columns2,
  Download,
  Image as ImageIcon,
  Keyboard,
  LayoutGrid,
  Library,
  LifeBuoy,
  MousePointerClick,
  Palette,
  Play,
  Scan,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { IconButton } from "../ui/IconButton";

interface HelpPanelProps {
  onClose: () => void;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-black/15 bg-black/[0.04] px-1.5 py-0.5 text-[11px] font-medium dark:border-white/20 dark:bg-white/[0.08]">
      {children}
    </kbd>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed opacity-80">{children}</p>;
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed opacity-80 marker:opacity-40">{children}</ul>;
}

const B = ({ children }: { children: ReactNode }) => <span className="font-semibold opacity-100">{children}</span>;

interface HelpSection {
  id: string;
  title: string;
  icon: typeof Search;
  body: ReactNode;
}

const SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Getting started",
    icon: LifeBuoy,
    body: (
      <>
        <P>
          Monosodium Desktop is a browser for <B>e621</B> and its sister site <B>e6AI</B>. Browsing,
          searching, pools, the forum and post viewing all work without an account.
        </P>
        <P>
          To vote, favorite, comment, send messages, or use post sets, add your API key under{" "}
          <B>Menu → Settings → Account</B> (each site has its own login). Switch the active site from
          the <B>Account menu</B>.
        </P>
      </>
    ),
  },
  {
    id: "search",
    title: "Searching",
    icon: Search,
    body: (
      <>
        <P>
          Type tags into the search box. <Kbd>Space</Kbd> or <Kbd>Enter</Kbd> turns the current word
          into a chip; click a chip's ✕ to drop it. The dropdown autocompletes tags as you type, and
          shows your <B>recent searches</B> when the box is empty.
        </P>
        <UL>
          <li>
            <B>Exclude</B> a tag with a leading dash: <Kbd>-rating:explicit</Kbd>.
          </li>
          <li>
            <B>Metatags</B> get value completion too: <Kbd>rating:</Kbd>, <Kbd>order:score</Kbd>,{" "}
            <Kbd>type:png</Kbd>, <Kbd>score:&gt;100</Kbd>, <Kbd>user:</Kbd>, <Kbd>pool:</Kbd>,{" "}
            <Kbd>fav:me</Kbd>, <Kbd>date:today</Kbd>.
          </li>
          <li>
            The <B>sliders button</B> next to the search box opens the <B>advanced search
            builder</B> — a form for ratings, sort order, minimum score / favorites, a date range
            and file type that writes the metatags for you (and reads an existing query back into
            the form).
          </li>
          <li>
            <B>Menu → Open post IDs…</B> takes a pasted blob of post IDs or URLs in any format and
            opens them all as one grid.
          </li>
          <li>
            The <B>Refresh</B> button re-fetches the current search. Re-running an{" "}
            <Kbd>order:random</Kbd> search (or the <B>Random posts</B> item in the Menu) re-rolls it.
          </li>
          <li>
            Save a search you'll come back to via <B>Menu → Saved searches</B>.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "ratings",
    title: "Ratings & adult content",
    icon: ShieldAlert,
    body: (
      <>
        <P>
          By default only <B>safe</B>-rated posts are shown. In <B>Settings</B>, enable{" "}
          <B>adult mode</B> and choose which ratings (safe / questionable / explicit) you want. The
          choice is applied to every search automatically.
        </P>
      </>
    ),
  },
  {
    id: "blacklist",
    title: "Blacklist",
    icon: Ban,
    body: (
      <>
        <P>
          Edit your blacklist in <B>Settings</B> — one rule per line. Spaces within a line mean{" "}
          <B>AND</B>; separate lines are <B>OR</B>. <Kbd>rating:explicit</Kbd> works as a pseudo-tag.
        </P>
        <UL>
          <li>Import from / push to your e621 account with the buttons in that section, or <B>Sort A–Z</B> to tidy the list.</li>
          <li>
            The <B>blacklist tester</B> at the bottom of that section takes a post ID or URL and
            shows, line by line, whether your (unsaved) blacklist would hide it and why.
          </li>
          <li>
            <B>View menu → Show blacklisted posts</B> reveals hidden posts again, marked with a
            yellow caution stripe.
          </li>
          <li>From a post's tag menu you can add a tag straight to the blacklist.</li>
        </UL>
      </>
    ),
  },
  {
    id: "grid",
    title: "The results grid",
    icon: LayoutGrid,
    body: (
      <>
        <P>
          Posts load into a Pinterest-style masonry grid and page in as you scroll. Set the tile
          size with the slider in the <B>View menu</B>.
        </P>
        <UL>
          <li>Hover a thumbnail for quick <B>favorite</B>, <B>upvote</B> and <B>download</B> buttons.</li>
          <li>Click a thumbnail to open the full viewer.</li>
        </UL>
      </>
    ),
  },
  {
    id: "select",
    title: "Multi-select & bulk actions",
    icon: MousePointerClick,
    body: (
      <>
        <P>
          Turn on the <B>Select</B> button (or <Kbd>Ctrl</Kbd>/<Kbd>Shift</Kbd>-click a thumbnail).
          Click posts to select them; <Kbd>Shift</Kbd>-click for a range.
        </P>
        <UL>
          <li>The bar at the bottom does <B>Favorite</B>, <B>Unfavorite</B>, <B>Add to set</B>, <B>Collection</B> and <B>Download</B> for the whole selection.</li>
          <li>
            <B>Unfavorite</B> (two clicks to confirm) is the quick way to tidy your favourites — on
            your own <Kbd>fav:</Kbd> page the removed posts drop out of the grid straight away.
          </li>
          <li><Kbd>Esc</Kbd> or the ✕ leaves select mode.</li>
        </UL>
      </>
    ),
  },
  {
    id: "viewer",
    title: "Post viewer",
    icon: ImageIcon,
    body: (
      <>
        <P>
          <Kbd>←</Kbd> / <Kbd>→</Kbd> move between posts, <Kbd>Esc</Kbd> closes. Wheel or
          double-click to zoom an image, drag to pan. Videos have loop / speed / mute controls.
        </P>
        <UL>
          <li>Toolbar: vote, favorite, download, report, <B>add to set</B>, <B>add to collection</B>, <B>pop out</B> to its own window, and <B>fullscreen</B> (<Kbd>F11</Kbd>).</li>
          <li>The sidebar switches between <B>Tags</B>, <B>Comments</B> and <B>History</B> (every tag / rating edit the post has had). Click a tag for actions — search, add, exclude, blacklist, <B>Related tags</B>, <B>Wiki page</B>, or (for artist tags) the <B>Artist page</B>.</li>
          <li>Translation / annotation <B>notes</B> appear as boxes over the image — click one to read it.</li>
          <li>The Info panel links a post's <B>parent / children</B> and any <B>pools</B> it belongs to.</li>
        </UL>
      </>
    ),
  },
  {
    id: "artists-wiki",
    title: "Artists & the wiki",
    icon: Palette,
    body: (
      <>
        <P>
          Click an <B>artist tag</B> in the viewer (tag menu → <B>Artist page</B>) for a panel with
          the artist's other names, their links (active and dead), any <B>do-not-post</B> notice,
          and shortcuts to their posts.
        </P>
        <P>
          <B>Menu → Wiki</B> (or <B>Wiki page</B> from any tag menu) opens the wiki browser: the
          tag's wiki article, its post count, and its <B>aliases</B>, <B>implications</B> and
          frequently-seen-with tags — click any of those to walk the tree.
        </P>
      </>
    ),
  },
  {
    id: "collections",
    title: "Collections",
    icon: Library,
    body: (
      <>
        <P>
          <B>Menu → Collections</B> holds your own private, on-device post lists — no e621 account
          needed, nothing sent to the site.
        </P>
        <UL>
          <li>Each collection has a <B>title</B> and an optional <B>category</B> that groups it in the list.</li>
          <li>Add posts from the viewer's <B>collection</B> toolbar button or the multi-select bar.</li>
          <li>
            Give a collection an <B>auto-download folder</B> and every post you add to it from then
            on is queued for download there automatically.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "slideshow",
    title: "Slideshow",
    icon: Play,
    body: (
      <>
        <P>
          Start one from <B>View menu → Slideshow</B> (with interval, transition and shuffle
          settings) or the ▶ button inside the viewer. <Kbd>Space</Kbd> pauses; the arrow keys and
          the on-screen controls still work while it runs.
        </P>
      </>
    ),
  },
  {
    id: "tabs",
    title: "Search tabs",
    icon: Columns2,
    body: (
      <>
        <P>Keep several searches open at once and flip between them — results stay loaded.</P>
        <UL>
          <li><Kbd>Ctrl</Kbd>+<Kbd>T</Kbd> new tab · <Kbd>Ctrl</Kbd>+<Kbd>W</Kbd> close · <Kbd>Ctrl</Kbd>+<Kbd>Tab</Kbd> cycle · <Kbd>Ctrl</Kbd>+<Kbd>1</Kbd>–<Kbd>9</Kbd> jump.</li>
          <li>The tab strip appears once you have two or more.</li>
        </UL>
      </>
    ),
  },
  {
    id: "places",
    title: "Places (the Menu)",
    icon: SlidersHorizontal,
    body: (
      <>
        <UL>
          <li><B>Popular</B> — e621's most-favorited posts by day, week or month.</li>
          <li>
            <B>Dashboard</B> — your local usage stats (time in app, posts viewed, data used, API
            calls, activity heat-map) plus a breakdown of your favourites (and any other user's, by
            name or ID). Each analysis can be exported as a <B>shareable card</B> (PNG or PDF).
            Everything is stored only on this device; turn recording off or reset it in the
            Dashboard's <B>Manage</B> section.
          </li>
          <li><B>About</B> — version, credits and the tech stack.</li>
          <li><B>Wiki</B> — the tag wiki browser (see “Artists &amp; the wiki”).</li>
          <li><B>Saved searches</B> — your named search shortcuts.</li>
          <li><B>Collections</B> — your private on-device post lists.</li>
          <li><B>Sets</B> (Account menu) — your e621 server-side post sets; add posts from the viewer or the bulk bar.</li>
          <li><B>Forum</B> — browse topics, <B>search</B> posts, and reply (reading is public).</li>
          <li><B>Messages</B> (Account menu) — your e621 dmail inbox; select rows or open a message to <B>delete</B>.</li>
        </UL>
      </>
    ),
  },
  {
    id: "downloads",
    title: "Downloads",
    icon: Download,
    body: (
      <>
        <P>
          Every download — a single post, a bulk selection, or a post added to a collection with an
          auto-download folder — goes into the <B>Downloads</B> queue (Menu). Failed items can be
          retried, and "Show in folder" opens the file. Set the default destination folder in{" "}
          <B>Settings</B>.
        </P>
      </>
    ),
  },
  {
    id: "reverse",
    title: "Reverse image search",
    icon: Scan,
    body: (
      <>
        <P>
          <B>Drag an image file onto the window</B> to look it up on SauceNAO. This needs a free
          SauceNAO API key, added in <B>Settings</B>.
        </P>
      </>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    icon: SettingsIcon,
    body: (
      <>
        <UL>
          <li><B>Account</B> — per-site username + API key.</li>
          <li><B>Blacklist</B> — editor with import / push, sort, and the tester.</li>
          <li><B>Appearance</B> — <B>theme</B> (System / Light / Dark), accent color, thumbnail size.</li>
          <li><B>Video</B> — loop, playback speed and autoplay defaults.</li>
          <li><B>Cache</B> — on-disk image cache size limit and clear (applies on next launch).</li>
          <li><B>Encryption</B> — optionally protect local data with a password.</li>
          <li><B>Backup &amp; Restore</B> — export / import an encrypted snapshot of your settings.</li>
          <li><B>Updates</B> — check GitHub for a newer version.</li>
        </UL>
      </>
    ),
  },
  {
    id: "desktop",
    title: "Tray, hotkey & shortcuts",
    icon: Keyboard,
    body: (
      <>
        <UL>
          <li>Closing the window <B>hides it to the system tray</B> — use the tray icon's <B>Quit</B> to actually exit.</li>
          <li><Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>E</Kbd> shows / hides the window from anywhere, even when another app is focused.</li>
          <li>You'll get a notification for new dmail or forum activity while the window is hidden.</li>
          <li>Press <Kbd>?</Kbd> any time for the full keyboard-shortcut list.</li>
        </UL>
      </>
    ),
  },
];

/** `Help` in the Menu opens this - a scrollable guide with a section list. Plain local state,
 *  not part of the nav stack (same as the keyboard cheatsheet). */
export function HelpPanel({ onClose }: HelpPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function jumpTo(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed inset-0 z-[65] flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(250,250,250)] dark:bg-[rgb(24,24,24)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 dark:border-white/10 px-4 py-3">
        <BookOpen size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Help</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-black/10 p-3 dark:border-white/10 md:block">
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs
                             opacity-70 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                  <s.icon size={13} className="shrink-0 opacity-60" />
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-6">
            <p className="mb-6 text-sm leading-relaxed opacity-60">
              A quick tour of what's here and how to use it. Everything below is also reachable from
              the menus on the top bar.
            </p>
            <div className="flex flex-col gap-8">
              {SECTIONS.map((s) => (
                <section
                  key={s.id}
                  ref={(el) => {
                    sectionRefs.current[s.id] = el;
                  }}
                  className="scroll-mt-4"
                >
                  <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
                    <s.icon size={16} className="text-[rgb(var(--accent))]" />
                    {s.title}
                  </h2>
                  <div className="flex flex-col gap-2">{s.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
