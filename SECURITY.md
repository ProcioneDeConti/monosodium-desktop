# Security Policy

## Supported versions

Only the **latest release** of Monosodium Desktop receives security fixes. Please update before
reporting, in case the issue is already fixed.

## Reporting a vulnerability

**Please don't report security problems in public issues, discussions, or pull requests.**
Report them privately through either of these:

- **GitHub private vulnerability report:**
  [Report a vulnerability](https://github.com/ProcioneDeConti/monosodium-desktop/security/advisories/new)
  (or the repo's **Security** tab → **Report a vulnerability**). Only the maintainer can see it.
- **Telegram:** message [@ProcioneDeConti](https://t.me/ProcioneDeConti).

Helpful details to include:

- The app version (Settings → Updates) and how it was installed (installer or portable)
- What the issue is and what an attacker could do with it
- Steps to reproduce it, or a proof of concept
- Any relevant logs or screenshots, with your API key and other credentials removed

You should hear back within a few days. Once a fix is released, you'll be credited in the release
notes if you'd like to be.

## Scope

In scope: this app and its browser extension. That includes credential and API key handling,
local data encryption and backups, deep links (`monosodium://`), and the source/URL fetchers.

Out of scope: vulnerabilities in e621 or e6AI themselves. Report those to the site's staff.
