// Pops a post out into its own OS window (main.tsx renders PostWindow for `?post=`). Shared by
// PostViewer's "Open in new window" button and the games' "View post" buttons.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Site } from "../models/site";

export function openPostWindow(postId: number, site: Site): void {
  const label = `post-${postId}-${Date.now()}`;
  new WebviewWindow(label, {
    url: `index.html?post=${postId}&site=${site}`,
    title: `Post #${postId} - Monosodium Desktop`,
    width: 900,
    height: 700,
    // Frameless like the main window - WindowFrame draws the title bar + traffic lights.
    decorations: false,
  });
}
