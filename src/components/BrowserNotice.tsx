/** Shown when index.html is opened in a plain browser instead of the Tauri webview - e.g. someone
 *  clicks the Vite dev-server link `npm run tauri dev` prints. The real app renders nothing there
 *  (every screen gates on a Tauri `invoke()` that has no backend outside the desktop window), so
 *  this stands in with an explanation rather than a blank page. */
export function BrowserNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(250,250,250)] p-6 text-center text-[rgb(24,24,24)] dark:bg-[rgb(24,24,24)] dark:text-[rgb(240,240,240)]">
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold">This page intentionally blank.</p>
        <p className="text-sm opacity-70">
          If you&rsquo;ve found this, there&rsquo;s nothing here for you. Return to Monosodium
          Desktop for full content.
        </p>
      </div>
    </div>
  );
}
