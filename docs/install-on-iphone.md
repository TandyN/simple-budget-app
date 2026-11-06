# Installing on your iPhone (free, permanently)

## Short answer

Host the app as a static website (free on GitHub Pages) and **Add it to your Home Screen** from Safari.
It then opens full-screen like a native app, works offline, and stores data only on your phone.
No Apple Developer account, no TestFlight, no 7-day expiry.

## Why not TestFlight or sideloading?

| Option                                                          | Cost      | Catch                                                                                                                    |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| **PWA via Add to Home Screen** ✅                               | Free      | None that matter here. No widgets/haptics.                                                                               |
| TestFlight                                                      | \$99/year | Requires the paid Apple Developer Program and a native build (Xcode on a Mac or cloud macOS).                            |
| App Store                                                       | \$99/year | Same as TestFlight, plus App Review.                                                                                     |
| Free Apple ID sideload (Xcode, AltStore, SideStore, Sideloadly) | Free      | App **expires every 7 days**, max 3 apps, needs a native `.ipa` built on a Mac. Unacceptable for a budget you depend on. |

If you ever want the App Store, Capacitor can wrap this same app into a native shell later (see `docs/architecture.md`, ADR-1).

## One-time hosting setup (already live!)

1. Repository: **`TandyN/simple-budget-app`** (`https://github.com/TandyN/simple-budget-app`).
   - **Public repo:** Both GitHub Pages hosting and GitHub Actions standard Linux runners are **100% free with unlimited minutes**. Your _data_ is never in the repo or on the host — only the app's code.
2. Live deployment happens automatically via `pnpm release:deploy` (`scripts/deploy.sh`), which publishes the verified build to the `gh-pages` branch and serves it at **https://tandyn.github.io/simple-budget-app/**.

> ⚠️ **Pick the URL once and keep it.** Your data is tied to the exact address (origin). If the address
> ever changes, the app at the new address starts empty. If you must move: export a backup at the old
> address, install the new one, import the backup.

## Installing on the iPhone Duo

1. Open **Safari** and go to https://tandyn.github.io/simple-budget-app/
2. Tap **Share** → **Add to Home Screen**. Keep **Open as Web App** on. Tap **Add**.
3. Open **Simple Budget from the Home Screen icon** and do the first-run setup **there**.
   (Safari tabs and the Home Screen app keep separate data; Safari tabs can also have data cleared after 7 days of non-use. The installed app is exempt.)
4. Optional but recommended: open the app once with `?debug=layout` added to the URL in Safari to confirm
   the screen sizes, and tell the agent the numbers so `config/devices.ts` (planned) matches your phone exactly.

## Updates

When a new version is deployed, the app shows **"Update available — Reload"**. It never reloads on its own,
so you can't lose a half-typed expense.

## Backups & Auto-Backup to iCloud (built in T09)

- **Automatic Local Mirror & Pre-Update Snapshot:** Every budget change automatically saves a mirror copy in your phone's Origin Private File System and `localStorage`, and freezes a `pre-update` snapshot before any new app version runs.
- **1-Tap Auto-Backup to iCloud Drive:** Whenever a new version installs or a new month opens, a **"Save Auto-Backup to iCloud"** banner lets you save `simple-budget-backup-YYYY-MM-DD.json` (planned until T09) to **iCloud Drive** in a single tap via the native iOS share sheet (or anytime under Settings → Data → **Export backup**).
- **Zero-Tap iOS Shortcuts Automation:** In iPhone's **Shortcuts** app → **Automation** → **New Automation** → **App** (_Simple Budget → Is Closed → Run Immediately_), open `#auto-backup` to automatically save timestamped backups to **iCloud Drive** every time you close the app.
- **Restore:** On any new phone or fresh install, go to Settings → Data → **Import backup** and pick your latest iCloud Drive JSON file.
