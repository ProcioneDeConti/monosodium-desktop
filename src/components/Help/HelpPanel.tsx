import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Ban,
  BookOpen,
  Columns2,
  Download,
  Gamepad2,
  Image as ImageIcon,
  Keyboard,
  LayoutGrid,
  Library,
  LifeBuoy,
  Lightbulb,
  MousePointerClick,
  Palette,
  PawPrint,
  Play,
  Scan,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { IconButton } from "../ui/IconButton";

interface HelpPanelProps {
  onClose: () => void;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-black/15 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-medium dark:border-white/20 dark:bg-white/[0.08]">
      {children}
    </kbd>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed opacity-85">{children}</p>;
}

function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 text-sm leading-relaxed opacity-85 marker:text-[rgb(var(--accent))]">
      {children}
    </ul>
  );
}

/** Numbered steps with accent-colored number badges. */
function Steps({ children }: { children: ReactNode }) {
  return (
    <ol
      className="space-y-2 text-sm leading-relaxed opacity-85 [counter-reset:step]
                 [&>li]:relative [&>li]:pl-8 [&>li]:[counter-increment:step]
                 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-0.5 [&>li]:before:flex
                 [&>li]:before:h-5 [&>li]:before:w-5 [&>li]:before:items-center [&>li]:before:justify-center
                 [&>li]:before:rounded-full [&>li]:before:bg-[rgb(var(--accent))]/15 [&>li]:before:text-[11px]
                 [&>li]:before:font-bold [&>li]:before:text-[rgb(var(--accent))] [&>li]:before:content-[counter(step)]"
    >
      {children}
    </ol>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[var(--radius-md)] border border-[rgb(var(--accent))]/25 bg-[rgb(var(--accent))]/[0.07] px-3 py-2.5 text-sm leading-relaxed">
      <Lightbulb size={15} className="mt-0.5 shrink-0 text-[rgb(var(--accent))]" />
      <div className="opacity-90">{children}</div>
    </div>
  );
}

function Game({ name, how }: { name: string; how: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-black/10 bg-black/[0.02] px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-0.5 text-xs leading-relaxed opacity-70">{how}</div>
    </div>
  );
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
          Monosodium Desktop is a browser for <B>e621</B> and its sister site <B>e6AI</B>. You can
          browse, search, read pools and the forum, and view posts without an account.
        </P>
        <P>
          To vote, favorite, comment, send messages, upload, or use post sets, add your API key
          under <B>Menu → Settings → Account</B>. Each site has its own login. Switch the active
          site from the <B>Account menu</B>.
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
          into a chip, and a chip's ✕ removes it. The dropdown autocompletes tags as you type and
          shows your <B>recent searches</B> when the box is empty.
        </P>
        <UL>
          <li>
            <B>Exclude</B> a tag with a leading dash: <Kbd>-rating:explicit</Kbd>.
          </li>
          <li>
            <B>Metatags</B> autocomplete their values too: <Kbd>rating:</Kbd>, <Kbd>order:score</Kbd>,{" "}
            <Kbd>type:png</Kbd>, <Kbd>score:&gt;100</Kbd>, <Kbd>user:</Kbd>, <Kbd>pool:</Kbd>,{" "}
            <Kbd>fav:me</Kbd>, <Kbd>date:today</Kbd>.
          </li>
          <li>
            The <B>sliders button</B> next to the search box opens the <B>advanced search
            builder</B>. It's a form for ratings, sort order, minimum score or favorites, date range
            and file type that writes the metatags for you, and it can read an existing query back
            into the form.
          </li>
          <li>
            <B>Menu → Open post IDs…</B> takes pasted post IDs or URLs in any format and opens them
            all in one grid.
          </li>
          <li>
            <B>Refresh</B> re-fetches the current search. Re-running an <Kbd>order:random</Kbd>{" "}
            search, or using <B>Random posts</B> in the Menu, gives a new random set.
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
      <P>
        By default only <B>safe</B>-rated posts are shown. To see more, enable <B>adult mode</B> in{" "}
        <B>Settings</B> and choose which ratings (safe, questionable, explicit) you want. Every search
        uses that choice automatically.
      </P>
    ),
  },
  {
    id: "blacklist",
    title: "Blacklist",
    icon: Ban,
    body: (
      <>
        <P>
          Edit your blacklist in <B>Settings</B>, one rule per line. Tags on the same line must all
          match (<B>AND</B>). A post is hidden if any line matches (<B>OR</B>).{" "}
          <Kbd>rating:explicit</Kbd> works as a tag here.
        </P>
        <UL>
          <li>That section can import from or push to your e621 account, and <B>Sort A–Z</B> tidies the list.</li>
          <li>
            The <B>blacklist tester</B> at the bottom of that section takes a post ID or URL. It shows,
            line by line, whether your blacklist (including unsaved edits) would hide that post and why.
          </li>
          <li>
            <B>View menu → Show blacklisted posts</B> shows hidden posts again, marked with a
            yellow caution stripe.
          </li>
          <li>A post's tag menu can add that tag straight to the blacklist.</li>
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
          Posts load into a masonry grid, and more load as you scroll. The slider in the{" "}
          <B>View menu</B> sets tile size. <B>Layout</B> in the same menu switches between masonry
          and a uniform grid of square-cropped tiles.
        </P>
        <UL>
          <li>Hover a thumbnail for quick <B>favorite</B>, <B>upvote</B> and <B>download</B> buttons.</li>
          <li>Click a thumbnail to open the full viewer.</li>
          <li>
            <B>Seen posts</B>: posts you've opened are dimmed until you hover them. To hide them
            instead, use <B>View menu → Hide seen posts</B>. To turn tracking off, go to{" "}
            <B>Settings → Seen posts</B>.
          </li>
          <li>
            When a search finds nothing, you'll see suggestions: possible typos, rare tags, buttons
            to drop a term, and which blacklist line hid the results.
          </li>
          <li>
            Your own <Kbd>fav:me</Kbd> page lists posts in the order <B>you favorited them</B>, the
            same as e621's Favorites page.
          </li>
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
          Turn on the <B>Select</B> button, or <Kbd>Ctrl</Kbd>/<Kbd>Shift</Kbd>-click a thumbnail.
          Click posts to select them, and <Kbd>Shift</Kbd>-click to select a range.
        </P>
        <UL>
          <li>The bar at the bottom can <B>Favorite</B>, <B>Unfavorite</B>, <B>Add to set</B>, add to a <B>Collection</B> or <B>Download</B> the whole selection.</li>
          <li>
            <B>Unfavorite</B> (click twice to confirm) is the quick way to clean up your favorites.
            On your own <Kbd>fav:</Kbd> page, removed posts leave the grid right away.
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
          <Kbd>←</Kbd> / <Kbd>→</Kbd> move between posts, and <Kbd>Esc</Kbd> closes. Use the wheel or
          double-click to zoom an image, and drag to pan. Videos have a control bar for seeking,
          play/pause, loop, speed and volume.
        </P>
        <UL>
          <li>The toolbar has vote, favorite, download, report, <B>add to set</B>, <B>add to collection</B>, <B>pop out</B> (opens the post in its own window) and <B>fullscreen</B> (<Kbd>F11</Kbd>).</li>
          <li>The sidebar has three tabs: <B>Tags</B>, <B>Comments</B> and <B>History</B> (every tag and rating edit the post has had). Click a tag for search, add, exclude, blacklist, <B>Related tags</B>, <B>Wiki page</B>, or for artist tags the <B>Artist page</B>.</li>
          <li>Translation and annotation <B>notes</B> appear as boxes over the image. Click one to read it.</li>
          <li>The Info panel links the post's <B>parent and children</B> and any <B>pools</B> it's in.</li>
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
          Choose <B>Artist page</B> from an artist tag's menu in the viewer. It shows the artist's
          other names, their links (active and dead), any <B>do-not-post</B> notice, and shortcuts
          to their posts.
        </P>
        <P>
          <B>Menu → Wiki</B>, or <B>Wiki page</B> from any tag's menu, opens the wiki browser. It
          shows the tag's wiki article, post count, <B>aliases</B>, <B>implications</B> and the tags
          it's often used with. Click any of them to look that tag up.
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
          <B>Menu → Collections</B> holds your own private post lists. They're stored on this
          device only, so they don't need an e621 account and nothing is sent to the site.
        </P>
        <UL>
          <li>Each collection has a <B>title</B> and an optional <B>category</B> that groups it in the list.</li>
          <li>Add posts with the viewer's <B>collection</B> button or from the multi-select bar.</li>
          <li>
            Give a collection an <B>auto-download folder</B>, and every post you add to it from
            then on is downloaded there automatically.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "upload",
    title: "Uploading",
    icon: Upload,
    body: (
      <>
        <P>
          <B>Account menu → Upload</B> (e621 only, signed in). It checks your upload against e621's
          rules <B>before</B> anything is sent. The checklist on the right turns green line by line,
          and <B>Upload</B> stays locked until every required line passes.
        </P>
        <Steps>
          <li>
            <B>Pick the file</B>: click the drop zone, drop a file anywhere on the window, or paste
            a <B>direct URL</B> and press Fetch.
          </li>
          <li>
            <B>Duplicates</B>: if an identical file is already on e621, the upload is blocked. Then
            e621's image matcher (IQDB) looks for <B>visually similar</B> posts. That's only a
            warning, and <B>Set parent</B> links your upload to one of them.
          </li>
          <li>
            <B>Tags</B>: you need an <B>artist</B> tag (or <Kbd>unknown_artist</Kbd>) and at least{" "}
            <B>10 General tags that no other tag you entered implies</B>.
          </li>
          <li>
            <B>Do Not Post</B>: every artist is checked against e621's DNP list. A match blocks the
            upload.
          </li>
          <li>
            <B>Rating</B>: you must pick one. There's no default.
          </li>
          <li>
            <B>Source</B>: optional but strongly recommended. Link the artist's original post.
          </li>
        </Steps>
        <Tip>
          Only <B>General</B>-category tags count toward the 10. Artist, contributor, character,
          species, copyright, lore, meta and invalid tags don't. Implied tags don't either:{" "}
          <Kbd>forest</Kbd> implies <Kbd>tree</Kbd>, which implies <Kbd>plant</Kbd>, so with all
          three entered only <Kbd>forest</Kbd> counts. Faded chips are implied tags. Dashed chips
          are tags that don't exist on e621 yet, so check the spelling.
        </Tip>
      </>
    ),
  },
  {
    id: "games",
    title: "Games",
    icon: Gamepad2,
    body: (
      <>
        <P>
          <B>Menu → Games</B>. Most games use real posts, so your rating settings and blacklist
          apply. Your best scores are saved on this device.
        </P>
        <div className="grid gap-2 sm:grid-cols-2">
          <Game name="Tagdle" how="Two tags. Pick the one with more posts. A daily puzzle plus an endless mode." />
          <Game name="Score Sniffer" how="Does the next post have a higher score (or more favorites)? Guess higher or lower and keep the streak going." />
          <Game name="Whodunnit" how="Who drew it? Pick the artist from four names, ten posts per round." />
          <Game name="Who's That Floof?!" how="Name the species while the image un-blurs. Faster answers score more." />
          <Game name="Enhance!" how="Starts zoomed way in. Every wrong guess pulls the camera back." />
          <Game name="Horny Jail or Sunday School" how="A blurred post and its tags. Call it safe, questionable or explicit." />
          <Game name="Tag Hopper" how="Get from one tag to another by hopping through tags that share posts. Daily plus endless." />
          <Game name="Sus" how="Three posts share a tag and one doesn't. Spot the impostor." />
          <Game name="Time Machine" how="Guess the upload year. The closer you are, the more points." />
          <Game name="Tag Bingo" how="Claim posts that match squares on your card - a post fills every square it fits. Finish a line in as few posts as you can." />
        </div>
      </>
    ),
  },
  {
    id: "gus",
    title: "Gus the raccoon",
    icon: PawPrint,
    body: (
      <>
        <P>
          Gus is the app's mascot. He reacts to what you do: searches, votes, favorites, games and
          your dashboard. He's a scripted character, not an AI chatbot. Choose how often he
          appears and how much he talks in <B>Settings → Appearance</B>.
        </P>
        <UL>
          <li>
            <B>Pocket Gus</B> (Games): feed him, groom him and clean his room. He gets hungry even
            while the app is closed.
          </li>
          <li>
            <B>Talk to Gus</B> (Games): chat with him. He remembers you, and he can find posts if
            you ask.
          </li>
          <li>Use <B>Share with Gus</B> on a post to get his take on it.</li>
          <li>Click Gus to pet him, or drag him to move him to another corner.</li>
        </UL>

        <h3 className="mt-1 text-sm font-semibold">Turning him off</h3>
        <UL>
          <li>
            <B>For now:</B> <B>right-click Gus</B> to hide him until you restart the app. An{" "}
            <B>Undo</B> button appears for a few seconds. After that, you can bring him back with{" "}
            <B>Restore</B> in <B>Settings → Appearance</B>.
          </li>
          <li>
            <B>For good:</B> set <B>Settings → Appearance → Mascot</B> to <B>Off</B>. He stops
            appearing and reacting everywhere. Pocket Gus and Talk to Gus stay in Games if you
            open them yourself.
          </li>
        </UL>

        <h3 className="mt-1 text-sm font-semibold">His settings (Settings → Appearance)</h3>
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-black/10 text-sm dark:border-white/10">
          {[
            ["Mascot: Companion", "Sits in a corner of the grid, reacting as you go."],
            ["Mascot: Cameos", "Pops in briefly when something happens, then leaves."],
            ["Mascot: Off", "No Gus anywhere."],
            ["Talkativeness: Never", "He still reacts, but never says a word."],
            ["Talkativeness: Sometimes", "A line now and then, at most one every few minutes."],
            ["Talkativeness: Chatty", "Most reactions get a line, with short breaks in between."],
            ["Talkativeness: Always", "Every reaction with something to say gets a line."],
            ["Let Gus get cheeky", "Adds flirtier lines. Only shown when explicit posts are enabled."],
            ["Restore", "Brings him back after you hid him with a right-click."],
          ].map(([k, v], i) => (
            <div key={k} className={`flex gap-3 px-3 py-2 ${i % 2 ? "bg-black/[0.02] dark:bg-white/[0.03]" : ""}`}>
              <span className="w-48 shrink-0 font-semibold">{k}</span>
              <span className="opacity-75">{v}</span>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "slideshow",
    title: "Slideshow",
    icon: Play,
    body: (
      <P>
        Start one from <B>View menu → Slideshow</B>, which has interval, transition and shuffle
        settings, or from the ▶ button in the viewer. <Kbd>Space</Kbd> pauses. The arrow keys and
        on-screen controls still work while it runs.
      </P>
    ),
  },
  {
    id: "tabs",
    title: "Search tabs",
    icon: Columns2,
    body: (
      <>
        <P>Keep several searches open at once and switch between them. Each tab keeps its results loaded.</P>
        <UL>
          <li><Kbd>Ctrl</Kbd>+<Kbd>T</Kbd> new tab · <Kbd>Ctrl</Kbd>+<Kbd>W</Kbd> close · <Kbd>Ctrl</Kbd>+<Kbd>Tab</Kbd> next tab · <Kbd>Ctrl</Kbd>+<Kbd>1</Kbd>–<Kbd>9</Kbd> jump to a tab.</li>
          <li>The tab strip appears once you have two or more tabs.</li>
        </UL>
      </>
    ),
  },
  {
    id: "places",
    title: "Places (the Menu)",
    icon: SlidersHorizontal,
    body: (
      <UL>
        <li><B>Popular</B>: e621's most-favorited posts by day, week or month.</li>
        <li>
          <B>For you</B> (signed in): suggested posts ranked against your taste, built from your{" "}
          <B>Recent 960</B> or <B>All</B> favorites (plus your up/downvotes). Type any username to
          suggest posts for someone else from their public favorites, or use{" "}
          <B>Suggest posts for…</B> on a profile. <B>Suggest more</B> (or scrolling) keeps going.
          The profile is saved for a week; the refresh button rebuilds it.
        </li>
        <li>
          <B>Dashboard</B>: your usage stats (time in app, posts viewed, data used, API calls, an
          activity heat-map) and a breakdown of your favorites. It can also analyze another user's
          favorites by name or ID. Each analysis can be exported as a <B>“wrapped” share card</B>,
          either one image or a multi-slide story, with an SFW toggle (PNG or PDF). Everything is
          stored only on this device. Turn recording off or reset it in the Dashboard's{" "}
          <B>Manage</B> section.
        </li>
        <li><B>Games</B>: see “Games” above.</li>
        <li><B>About</B>: version, credits and the tech stack.</li>
        <li><B>Wiki</B>: the tag wiki browser (see “Artists &amp; the wiki”).</li>
        <li><B>Saved searches</B>: your named search shortcuts.</li>
        <li><B>Collections</B>: your private post lists, stored on this device.</li>
        <li><B>Sets</B> (Account menu): your post sets on e621. Add posts from the viewer or the multi-select bar.</li>
        <li><B>Forum</B>: browse topics, <B>search</B> posts, and reply. Reading doesn't need an account.</li>
        <li><B>Messages</B> (Account menu): your e621 private messages. Select rows or open a message to <B>delete</B> it.</li>
        <li><B>Upload</B> (Account menu, e621 only): see “Uploading”.</li>
      </UL>
    ),
  },
  {
    id: "downloads",
    title: "Downloads",
    icon: Download,
    body: (
      <P>
        Every download goes into the <B>Downloads</B> queue (Menu): single posts, multi-select
        downloads, and posts added to a collection that has an auto-download folder. You can retry
        failed items, and <B>Show in folder</B> opens the file's location. Set the default folder
        in <B>Settings</B>.
      </P>
    ),
  },
  {
    id: "reverse",
    title: "Reverse image search",
    icon: Scan,
    body: (
      <P>
        <B>Drag an image file onto the window</B> to look it up on SauceNAO. This needs a free
        SauceNAO API key, added in <B>Settings</B>. While the uploader is open, a dropped file goes
        to the uploader instead.
      </P>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    icon: SettingsIcon,
    body: (
      <UL>
        <li><B>Account</B>: username and API key for each site.</li>
        <li><B>Blacklist</B>: the blacklist editor, with import/push, sort and the tester.</li>
        <li><B>Appearance</B>: <B>theme</B> (System / Light / Dark), accent color, thumbnail size, and how often <B>Gus</B> appears and talks.</li>
        <li><B>Seen posts</B>: dim, hide or off, and clear the list of posts you've opened.</li>
        <li><B>Video</B>: default loop, playback speed and autoplay.</li>
        <li>
          <B>Favorites &amp; voting</B>: <B>Upvote posts when I favorite them</B>. This only works
          one way: unfavoriting keeps the upvote, and upvoting never adds a favorite.
        </li>
        <li><B>Cache</B>: size limit for saved images, and a button to clear them (takes effect next launch).</li>
        <li><B>Encryption</B>: optionally protect local data with a password.</li>
        <li><B>Backup &amp; Restore</B>: export or import an encrypted copy of your settings.</li>
        <li><B>Updates</B>: check GitHub for a newer version.</li>
      </UL>
    ),
  },
  {
    id: "desktop",
    title: "Tray, hotkey & shortcuts",
    icon: Keyboard,
    body: (
      <UL>
        <li>Closing the window <B>hides it to the system tray</B>. Use the tray icon's <B>Quit</B> to exit.</li>
        <li><Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>E</Kbd> shows or hides the window, even when another app has focus.</li>
        <li>While the window is hidden, you'll get a notification for new messages or forum activity.</li>
        <li>Press <Kbd>?</Kbd> any time for the full list of keyboard shortcuts.</li>
        <li>
          With the optional <B>browser extension</B>, e621 and e6AI links you open in your browser
          open in the matching screen here. Pages the app doesn't have stay in the browser.
        </li>
      </UL>
    ),
  },
];

/** `Help` in the Menu opens this - a scrollable guide of section cards with a contents rail that
 *  tracks the section being read. Plain local state, not part of the nav stack (same as the
 *  keyboard cheatsheet). */
export function HelpPanel({ onClose }: HelpPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // Highlight whichever section is nearest the top of the reading pane.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace(/^help-/, ""));
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  function jumpTo(id: string) {
    setActive(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed inset-0 z-[65] flex flex-col animate-[fade-in_150ms_ease-out] bg-[rgb(var(--lt-surface))] dark:bg-[rgb(var(--dk-surface))]">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <BookOpen size={16} className="text-[rgb(var(--accent))]" />
        <h1 className="text-sm font-semibold">Help</h1>
        <IconButton onClick={onClose} title="Close (Esc)" className="ml-auto">
          <X size={18} />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-60 shrink-0 overflow-y-auto border-r border-black/10 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.02] md:block">
          <div className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide opacity-45">Contents</div>
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => {
              const on = s.id === active;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(s.id)}
                    className={`flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                      on
                        ? "bg-[rgb(var(--accent))]/15 font-semibold text-[rgb(var(--accent))]"
                        : "opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    }`}
                  >
                    <s.icon size={14} className={`shrink-0 ${on ? "" : "opacity-60"}`} />
                    <span className="truncate">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <header className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">How to use Monosodium</h2>
              <p className="mt-1.5 text-sm leading-relaxed opacity-60">
                A quick tour of what's here and how to use it. Everything below can also be reached
                from the menus on the top bar. Press <Kbd>?</Kbd> for keyboard shortcuts.
              </p>
            </header>
            <div className="flex flex-col gap-5">
              {SECTIONS.map((s) => (
                <section
                  key={s.id}
                  id={`help-${s.id}`}
                  ref={(el) => {
                    sectionRefs.current[s.id] = el;
                  }}
                  className="scroll-mt-6 rounded-[var(--radius-md)] border border-black/10 bg-white/60 p-5 shadow-sm
                             dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <h2 className="mb-3 flex items-center gap-2.5 text-base font-bold">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]/15">
                      <s.icon size={15} className="text-[rgb(var(--accent))]" />
                    </span>
                    {s.title}
                  </h2>
                  <div className="flex flex-col gap-3">{s.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
