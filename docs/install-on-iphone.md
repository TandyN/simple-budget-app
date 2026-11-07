# Installing on your iPhone (Native iOS App via TestFlight / App Store + Web Preview)

## Why the Native iOS App (`ios/`)?

In a browser or Home Screen PWA, iOS stores data inside WebKit's origin container — which means if a user goes to **iOS Settings → Safari → Clear History and Website Data**, iOS can wipe the browser's storage.

By shipping **Simple Budget** as a **Native iOS App (`ios/`)** via **TestFlight / App Store**:

1. **Safari Cache Clearing Cannot Touch Your Data:** Your budget database is saved by native Swift code ([`ios/SimpleBudget/BudgetViewController.swift`](../ios/SimpleBudget/BudgetViewController.swift)) directly into iOS `Application Support` (with an automatic backup copy). Wiping Safari's cache/history has **zero effect** on the app.
2. **100% Embedded Offline Binary:** All HTML/JS/CSS assets are compiled into the `.ipa` bundle and served locally via a custom `WKURLSchemeHandler` (`simplebudget://app/`).
3. **Built & Deployed Automatically from Linux (No Mac Required):** Because this repository is **public** on GitHub, GitHub Actions provides **unlimited free `macos-15` (macOS + Xcode) runner minutes** that compile the Xcode project, sign the `.ipa`, and upload it straight to **TestFlight / App Store Connect** on every release tag (`v*`).

---

## Automated Native iOS Deployment Setup (Apple Developer Program)

Once you enroll in the **Apple Developer Program (\$99/year)** at https://developer.apple.com/programs/:

### 1. Create the App in App Store Connect (One-Time)

1. Sign in to **App Store Connect** (`https://appstoreconnect.apple.com/`) → **Apps** → **+** → **New App**.
2. Choose **iOS**, Name: **Simple Budget**, Bundle ID: **`io.github.tandyn.simplebudget`** (matches [`ios/project.yml`](../ios/project.yml)).

### 2. Create an App Store Connect API Key (One-Time)

1. Go to **App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys**.
2. Generate a key with **App Manager** (or **Admin**) access and download the `.p8` file.
3. Note your **Key ID**, **Issuer ID**, and your 10-character **Apple Team ID** (from `developer.apple.com/account`).

### 3. Add the 4 Secrets to GitHub (`TandyN/simple-budget-app`)

In your repository on GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name                    | Value                                                                |
| ------------------------------ | -------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                | Your 10-character Apple Developer Team ID                            |
| `APP_STORE_CONNECT_API_KEY_ID` | Your App Store Connect API Key ID                                    |
| `APP_STORE_CONNECT_ISSUER_ID`  | Your App Store Connect API Issuer ID (UUID)                          |
| `APP_STORE_CONNECT_API_KEY_P8` | The full text contents of your downloaded `AuthKey_<KEY_ID>.p8` file |

### 4. How Every Release Ships Automatically

Whenever an agent (or you) ships a release (`v0.2.0`, `v0.3.0`, …, `v1.0.0`):

1. `scripts/build-ios.sh` (invoked by the `ios-testflight` job in `.github/workflows/ci.yml` on `macos-15`) builds the production React bundle, embeds it into `ios/`, generates the Xcode project with `xcodegen`, archives and signs the `.ipa`, and uploads it to **TestFlight** via `xcrun altool`.
2. On your iPhone Duo, install Apple's free **TestFlight** app from the App Store — every new release automatically appears in TestFlight (or auto-updates on your phone)!
3. When you are ready to publish or sell the app on the public **App Store**, you simply select the TestFlight build in App Store Connect and click **Submit for Review**.

---

## Live Web Preview (Available Anytime Without TestFlight)

While developing on Linux or before your Apple Developer account is active, every release also deploys to **https://tandyn.github.io/simple-budget-app/** so you can preview layouts immediately on your phone.

## Backups & Data Safety (built in T09)

- **Silent Background Auto-Backup (Zero Taps, Zero Popups):** Every budget change silently writes both a primary and backup database file in native iOS `Application Support` (plus `IndexedDB`, Origin Private File System, and `localStorage`), and freezes a `pre-update` snapshot before any new app version runs.
- **Manual Export Backup:** In Settings → Data, tap **Export backup** anytime to save `simple-budget-backup-YYYY-MM-DD.json` (planned until T09) via the iOS share sheet (_Save to Files_). That screen shows when you last exported a backup, and the app never nags you with automatic popup messages.
- **Restore:** On any new phone or fresh install, go to Settings → Data → **Import backup** and pick your latest exported JSON file.
