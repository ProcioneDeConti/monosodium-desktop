// Native OS notifications for dmail/forum activity noticed while the window doesn't have focus
// (checked via document.hasFocus() - if you're already looking at the app, the shell's own
// badges already say so, no need for a redundant popup) - a desktop-native addition with no
// counterpart in the reference Android app.

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

let requestedThisSession = false;

async function ensurePermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  if (requestedThisSession) return false;
  requestedThisSession = true;
  return (await requestPermission()) === "granted";
}

export async function notify(title: string, body: string): Promise<void> {
  if (document.hasFocus()) return;
  if (!(await ensurePermission())) return;
  sendNotification({ title, body });
}
