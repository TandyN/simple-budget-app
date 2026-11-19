# Platform portability

**Decision (spike #6, extended to Android in spike #22 / Story #21):** shape the
backend as a **pure, framework-agnostic TypeScript library** — business logic +
data model + a single **storage-adapter** interface — and consume the *identical*
library from all three targets:

- **PWA** (now) — a browser app hosted on **GitHub Pages**.
- **iOS app** (later) — wrapped with **Capacitor**, which runs the app in
  **WKWebView / WebKit**.
- **Android app** (later) — wrapped with **Capacitor**, which runs the app in the
  **Android System WebView (Chromium)**.

The framework is **Capacitor** (the iOS + Android native shells) wrapping the
existing framework-agnostic TS library; the PWA is the *same bundle* on GitHub
Pages. This is the spike-#6 architecture extended to Android — **one bundle,
three webview targets, no native rewrite.**

The load-bearing fact: **both WebKit (iOS) and Chromium (Android) fully support
IndexedDB and WebCrypto.** So the exact same web bundle (`dist/`) that runs in
the PWA runs unchanged inside *both* native shells — **no fork, no per-platform
build flag, and no `@capacitor/*` imports in the web bundle.** Native-only
capabilities (file save/share where iOS `WKWebView` does not honour
`<a download>`, durable native storage, and optional biometric app lock) are
isolated behind a clean package boundary (`native/` workspace package) and a
tiny runtime `PlatformServices` seam.

## The boundary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONT-END (UI) — identical static web bundle (dist/) across all 3 targets  │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│  │ PWA (zero-prod-dep      │ │ iOS shell (native/      │ │ Android shell (native/  │
│  │ vanilla TS, GH Pages)   │ │ Capacitor / WKWebView)  │ │ Capacitor / Chromium)   │
│  └────────────┬────────────┘ └────────────┬────────────┘ └────────────┬────────────┘
│               │ all three run the SAME dist/ bundle & call BudgetApi  │
│               ▼                           ▼                           ▼
│  ┌─────────────────────────────────────────────────────────────────────────────┐
│  │  BACKEND LIBRARY (framework-agnostic TS)  ◄── THIS PLAN                      │
│  │  • data model (RecurringRule, Activity)                                       │
│  │  • recurring engine (pure logic)                                              │
│  │  • derived Available Funds (pure logic)                                       │
│  │  • CRUD / validation                                                          │
│  │  • StorageAdapter interface (MVP PWA: IndexedDB; store release: durable native)│
│  │  • PlatformServices seam (saveBackup / shareBackup / isNative via runtime     │
│  │    window.Capacitor detection — zero @capacitor/* imports in web bundle)      │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Backend = data + logic + the storage-adapter *interface*.** It knows nothing
  about UI frameworks, the DOM, iOS, or Android. It depends only on the Web platform
  capabilities that **WebKit (iOS) and Chromium (Android)** both provide (IndexedDB,
  WebCrypto, `Date`, `crypto.randomUUID`).
- **Front-end = UI only.** It renders and calls the library's exported API. All
  three targets load the *same* zero-prod-dep static web bundle (`dist/`); native
  shell wrappers live in `native/`.
- **Two thin platform seams:**
  1. **`StorageAdapter`** ([storage.md](storage.md)) — MVP PWA uses `indexeddb.ts`
     across all browsers. Because iOS `WKWebView` and Android `WebView` can evict
     WebView IndexedDB under OS storage pressure, a **durable native store**
     (SQLite `StorageAdapter` or mirrored auto-snapshot to app Documents) is a
     **mandatory release gate (OQ-4)** before the first App Store / Play Store
     submission.
  2. **`PlatformServices`** (below) — runtime feature detection of
     `window.Capacitor` so web code can save/share backups natively without ever
     importing `@capacitor/*`.

## Package boundary & `PlatformServices` seam

To reconcile **zero production dependencies** ([dependency-strategy.md](dependency-strategy.md))
with Capacitor native packaging (`@capacitor/cli`, `@capacitor/core`, native
file/share/storage/biometric plugins), the repository enforces a strict
**two-package workspace boundary**:

1. **Web bundle package (repository root `package.json`):**
   - `dependencies` MUST remain **completely empty (`{}`)**.
   - Source files under `src/` MUST **never import `@capacitor/*`** (enforced in
     CI and code review).
   - `vite build` produces a single, platform-agnostic static bundle in `dist/`.
2. **Native shell package (`native/` workspace package — Phase 6):**
   - Lives in its own isolated `native/` workspace directory with its own
     `native/package.json` and `native/capacitor.config.ts` (`webDir: "../dist"`).
   - `@capacitor/*` and approved native plugins are permitted **only** inside
     `native/package.json`, and remain subject to exact pinning (`save-exact=true`),
     `pnpm install --frozen-lockfile`, `pnpm audit --audit-level=high`, and the
     well-maintained criterion.
3. **Runtime `PlatformServices` interface (in the web bundle):**
   - iOS `WKWebView` does not honour `<a download>` for saving JSON backup files,
     and native shells benefit from OS share sheets. Rather than importing
     Capacitor into `src/` or branching builds per platform, web UI code calls a
     tiny `PlatformServices` interface resolved at runtime via feature detection
     of `window.Capacitor`:

```ts
export interface PlatformServices {
  readonly isNative: boolean;
  saveBackup(filename: string, json: string): Promise<void>;
  shareBackup(filename: string, json: string): Promise<void>;
}
```

- **In the PWA (browser):** `window.Capacitor` is absent (`isNative: false`).
  `saveBackup` triggers a Blob `<a download>` (or File System Access API where
  available); `shareBackup` uses `navigator.share` when supported or falls back
  to `saveBackup`.
- **In iOS / Android Capacitor shells:** `window.Capacitor?.isNativePlatform?.()`
  is `true` (`isNative: true`). `PlatformServices` delegates `saveBackup` and
  `shareBackup` to the native bridge exposed on `window.Capacitor.Plugins`
  (loaded by the `native/` shell, never bundled into `dist/`).
- **Result:** `dist/` is **bit-for-bit identical** across GitHub Pages, iOS, and
  Android — zero `@capacitor/*` imports in the web bundle and no per-platform
  build flags.

## Module layout

```
src/
  core/                 # PURE — no storage, no DOM, no framework. Unit-testable.
    types.ts            #   RecurringRule, Activity, Schedule, BudgetBackup, enums
    engine.ts           #   runRecurringEngine, missingPeriods, alreadyPosted
    funds.ts            #   computeAvailableFunds
    insights.ts         #   searchActivities, summarizeByTag
    validate.ts         #   field validation / invariants, validateBackupPayload
  storage/
    adapter.ts          #   the StorageAdapter interface (open/save/delete/query/replaceAll)
    indexeddb.ts        #   IndexedDB implementation of StorageAdapter (DB_VERSION = 1)
                        #   (shared by iOS WebKit + Android Chromium + PWA browsers)
    memory.ts           #   in-memory implementation (for tests)
  ui/                   # Zero-prod-dep DOM UI views & safe DOM helpers (no innerHTML)
  platform/
    services.ts         #   PlatformServices seam (saveBackup/shareBackup/isNative via window.Capacitor)
  styles/               # Fluid logical-unit + safe-area CSS (folded & unfolded states)
  budgetApi.ts          # the PUBLIC API surface (see below) — the only thing
                        #   the front-end imports
  main.ts               # PWA / WebView application bootstrap entry point
  index.ts              # re-exports budgetApi
native/                 # Isolated workspace package (Phase 6) — own package.json
  package.json          #   @capacitor/* & approved native plugins (exact-pinned, audited)
  capacitor.config.ts   #   webDir: "../dist", navigation/WebView hardening
  ios/                  #   Xcode project, Info.plist, PrivacyInfo.xcprivacy
  android/              #   Gradle project, AndroidManifest.xml, data_extraction_rules.xml
```

**Rule:** `core/` must have **zero** imports from `storage/` and zero imports of
any DOM / framework / Node global. `core/` takes data in (arrays of
`RecurringRule` / `Activity`) and returns data out (the new/updated records to
persist). `budgetApi.ts` is the composition root that wires `core/` to a
`StorageAdapter` implementation.

This layering is what makes the library portable: `core/` is pure and thus runs
anywhere; `storage/` is the only seam; `index.ts` is the door the front-end walks
in through.

## The public API (what the front-end calls)

This is the **interface the backend exposes**. A front-end engineer (PWA, iOS, or
Android) only ever sees these — never the internals of `core/` or `storage/`.

```ts
// Optional filter for listActivities() — the same intersecting predicates as
// ActivitySearchFilter (defined in activity-model.md → insights / search): a
// since / until ISO-8601 date range, an optional tag, and an optional type.
// Omit a predicate to leave it unbounded.
type ActivityFilter = ActivitySearchFilter;

// Everything is async and returns plain data (no framework state).
interface BudgetApi {
  // Lifecycle
  init(): Promise<void>;                    // opens the store; idempotent

  // Recurring rules
  addRule(rule: NewRule): Promise<RecurringRule>;
  editRule(id: string, patch: RulePatch): Promise<RecurringRule>;
  setRuleActive(id: string, active: boolean): Promise<RecurringRule>;
  deleteRule(id: string): Promise<void>;    // does NOT delete posted activities
  listRules(): Promise<RecurringRule[]>;

  // Activities
  addActivity(a: NewActivity): Promise<Activity>;
  editActivity(id: string, patch: ActivityPatch): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;
  listActivities(filter?: ActivityFilter): Promise<Activity[]>;

  // Insights / search (pure, derived — integer cents, plain data)
  searchActivities(filter: ActivitySearchFilter): Promise<Activity[]>;
  summarizeByTag(activities: Activity[]): Promise<TagSummary[]>;

  // Recurring engine
  runRecurringEngine(now?: Date): Promise<{ posted: Activity[] }>;

  // Derived
  getAvailableFunds(): Promise<number>;

  // Local backup export / atomic import
  exportBackup(): Promise<BudgetBackup>;
  importBackup(json: string): Promise<{ rulesCount: number; activitiesCount: number }>;
}
```

- **`NewRule` / `NewActivity`** are the input shapes (without system-managed
  fields like `id`, `createdAt`, `updatedAt`, which the API generates).
- **`ActivityFilter`** (used by `listActivities`) is the **optional** filter for
  listing activities — the same intersecting `since` / `until` / `tag` / `type`
  predicates as **`ActivitySearchFilter`** (see
  [activity-model.md → Insights / search](activity-model.md#insights--search)),
  aliased so the two are the same shape. Pass `undefined` to list all activities
  unbounded; the full `searchActivities` surface is the dedicated insights/search
  entry point.
- **`RulePatch` / `ActivityPatch`** are partial updates — only the user-editable
  fields (enforced by the type, so a UI can't accidentally set `source` or
  `sourceRuleId`).
- **`runRecurringEngine()`** is the single call that makes recurring income /
  expenses "come through" — safe to call on app start, on focus, or on a timer,
  because it is idempotent ([recurring-engine.md](recurring-engine.md)).
- **`getAvailableFunds()`** returns the derived value (integer cents); the UI
  never stores it.
- **`searchActivities(filter)`** / **`summarizeByTag(activities)`** are the
  **insights/search surface**: filter activities by intersecting
  date-range + tag + type, and roll up money in / out by tag. Both are pure and
  derived from the log (integer cents, plain data) — see
  [activity-model.md → Insights / search](activity-model.md#insights--search).
- **`exportBackup()` / `importBackup(json)`** provide local JSON backup export
  and atomic restore. `exportBackup()` returns a versioned `BudgetBackup`
  envelope (`schemaVersion: 1`, `exportedAt`, `rules`, `activities`), while
  `importBackup(json)` validates the untrusted JSON string in `src/core/validate.ts`
  (10 MB ceiling, prototype-pollution key rejection, full schema/invariant checks;
  see [data-model.md](data-model.md#hardened-import-validation-validatebackuppayloadrawjson-string-budgetbackup))
  before atomically replacing all records in a single IndexedDB `readwrite`
  transaction via `StorageAdapter.replaceAll` (see
  [storage.md → Atomic Backup Restoration (`replaceAll`)](storage.md#atomic-backup-restoration-replaceall)).

### Example — PWA / iOS / Android calling the *same* API

```ts
import { createBudgetApi } from "budget-lib"; // the library's public entry

const budget = createBudgetApi({ adapter: new IndexedDbAdapter() });

await budget.init();
await budget.addRule({ name: "Salary", type: "income", amountCents: 500000, // $5,000.00
                        schedule: { cadence: "monthly", dayOfMonth: 1 } });
await budget.runRecurringEngine();                 // posts the due period
const funds = await budget.getAvailableFunds();     // derived, integer cents, always current
const housing = await budget.summarizeByTag(        // insight: where the money went
  await budget.searchActivities({ since: "2026-07-01T00:00:00Z",
                                  until:  "2026-10-01T00:00:00Z",
                                  type: "expense" }));
```

The identical code is the body of all three targets — the PWA, the iOS shell, and
the Android shell. The iOS app is Capacitor wrapping a `WKWebView` (WebKit) that
loads the same bundle; the Android app is Capacitor wrapping the Android System
WebView (Chromium) that loads the *same* bundle. The only platform difference is
the shell, not the logic.

## What this buys

- **One codebase, three targets.** No fork, no "iOS copy" or "Android copy" of the
  logic to keep in sync.
- **Testable core.** `core/` is pure, so the recurring engine and the Available
  Funds derivation are unit-tested with the in-memory adapter — no browser, no
  device.
- **Swappable storage.** The `StorageAdapter` interface means we can swap
  IndexedDB for an encrypted layer or another backend later without touching the
  engine or the front-end.
- **No accidental coupling.** Because `core/` cannot import the DOM or a
  framework, the library is *structurally* portable, not just "we try not to".
- **Single static web bundle, no per-platform build.** `vite build` emits one
  `dist/` (an `index.html`, hashed JS/CSS chunks, and public assets) — the
  **identical artifact** is served on all three targets: GitHub Pages (production
  + per-PR preview), the iOS Capacitor shell in **WKWebView (iOS Safari — primary)**,
  and the Android Capacitor shell in **Chromium (Android Chrome)**. There is **no
  per-platform bundle and no per-platform build flag**: the root web bundle
  package keeps `dependencies: {}` and never imports `@capacitor/*`, while native
  packaging and plugins live in the isolated `native/` workspace package and are
  reached from the web bundle solely via runtime `window.Capacitor` detection in
  `PlatformServices` (and behind `StorageAdapter` for the durable native store).
  This is why the zero-prod-dep stance
  ([dependency-strategy.md](dependency-strategy.md)) is the load-bearing constraint
  that makes the model portable: an empty web-package `dependencies` means the one
  `dist/` bundle has no runtime platform dependency to fork. The same bundle is
  also the artifact whose **base path** is configurable at build time
  ([frontend.md → base path](frontend.md#base-path-configurable-explicit-build-decision))
  — with the per-PR preview deploy flow in
  [testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages) —
  and whose **responsive layout** is driven by the **iPhone-Duo foldable
  dual-state** model (folded = the mobile baseline; unfolded = the enhanced
   one-screen view) — see [frontend.md → responsive viewport](frontend.md#responsive-viewport--iphone-duo-foldable-dual-state-req-2).

## Android-specific considerations

Android is a **third webview target of the same bundle** — the Android System
WebView is Chromium-based, so it implements the same Web platform the rest of the
plan relies on. Compared with iOS (WebKit) and the PWA (any modern browser), the
only differences are:

- **Storage & durability gate (OQ-4):** Chromium fully supports **IndexedDB**, so
  the *same* `indexeddb.ts` adapter works on Android as on iOS for local
  development and WebView testing. Storage is **app-scoped** (private to the app's
  data dir): no shared-storage concerns, no storage permission required. However,
  per Capacitor's Storage guide, Android and iOS can evict WebView IndexedDB under
  OS storage pressure — so a **durable native store** (SQLite-backed
  `StorageAdapter`, or mirrored auto-snapshot to native app Documents, wired from
  the `native/` shell) is a **mandatory release gate (OQ-4)** before the first
  Play Store / App Store release (see
  [storage.md → Why a storage-adapter](storage.md#why-a-storage-adapter)).
- **Android Auto Backup exclusion (OQ-3):** Capacitor's default Android template
  sets `android:allowBackup="true"`, which uploads WebView IndexedDB to Google
  Drive and can restore inconsistent database state. The Android shell MUST set
  `android:allowBackup="false"` and configure `android:dataExtractionRules` to
  exclude both `cloud-backup` and `device-transfer` (see section 3 below).
- **WebCrypto:** fully available in Chromium WebView (`crypto.subtle`).
- **Secure-context nuance:** `crypto.randomUUID()` and `crypto.subtle` require a
  **secure context**. Capacitor serves from `capacitor://localhost` /
  `http(s)://localhost`, which *is* a secure context — but **verify during
  implementation**. (The PWA is HTTPS on GitHub Pages; already fine.)
- **Permissions:** none needed for the MVP (no network, app-scoped webview
  storage). Notifications / deep-links would need native permissions — both are
  out of MVP scope.
- **App lifecycle:** Android kills background processes aggressively (Doze).
  **Non-issue here:** the recurring engine runs **on app-open** (idempotent), not
  on a background timer — no background service required.
- **Deep linking:** Capacitor supports it; not in MVP.

**Net:** Android adds **no new core logic and no web-bundle dependency** — only
(a) the `native/` Capacitor Android shell + durable native store gate (OQ-4),
(b) backup exclusion (`allowBackup="false"` + `dataExtractionRules`), (c) the
secure-context check, and (d) Play Store checklist compliance.

## App Store & Play Store Privacy Compliance ("Data Not Collected")

Because `simple-budget-app` is architected from commit #1 with **local-only IndexedDB persistence**, **zero network egress (`connect-src 'none'`)**, and **zero production dependencies**, the developer can legitimately and truthfully declare **"Data Not Collected"** in Apple App Store Connect and **"No data shared with third parties" / "No data collected"** in Google Play Console.

### 1. Apple App Store Connect — App Privacy ("Data Not Collected") & Backup Posture

- **Qualification under Apple's App Privacy Details specification:**
  - Apple defines *"Collect"* as *"transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time."*
  - All financial records (`RecurringRule`, `Activity`) reside exclusively on-device (IndexedDB for the MVP PWA, durable native store for store releases per OQ-4; see [storage.md](storage.md)). User-initiated JSON backup exports (`budget.exportBackup()`, saved/shared via `PlatformServices`) write strictly to a user-selected local file and never transmit data to any developer or third-party server.
  - At the document boundary, `index.html` enforces a strict Content Security Policy with `connect-src 'none'` and `form-action 'none'` (see [frontend.md → Strict Content Security Policy](frontend.md#1-strict-content-security-policy-indexhtml)), and the web bundle includes **zero third-party SDKs, zero analytics/telemetry, zero crash-reporting frameworks, zero advertising networks, and zero remote fonts/CDNs/icons** (see [dependency-strategy.md](dependency-strategy.md)).
  - **iOS OS backup posture (adopted default, OQ-3):** On iOS, `WKWebView` storage and app Documents data are included in the user's encrypted iCloud / iTunes device backups by default. This behavior is **explicitly accepted** — it is user-controlled OS device backup, not developer or third-party data collection, and does not affect the **"Data Not Collected"** declaration.
  - **iOS export compliance (`Info.plist`):** Set `ITSAppUsesNonExemptEncryption` to `false` (`<key>ITSAppUsesNonExemptEncryption</key><false/>`) in `native/ios/App/App/Info.plist` so App Store Connect does not block each TestFlight/release upload on manual export-compliance questionnaires. *(Re-evaluate if non-exempt custom cryptography is ever added outside standard OS/WebCrypto exemptions.)*
  - **Store declaration:** In App Store Connect → **App Privacy**, select **"No, we do not collect data from this app"**, displaying the **"Data Not Collected"** nutrition label on the App Store listing.

### 2. iOS Required-Reason API Privacy Manifest (`native/ios/App/App/PrivacyInfo.xcprivacy`)

Since May 1, 2024, Apple App Store Connect rejects iOS submissions (`ITMS-91053: Missing API declaration`) if the app bundle — or Capacitor core and any installed native plugins — references a Required-Reason API without an accompanying `PrivacyInfo.xcprivacy` manifest.

- **Derive from actual API usage (do not rely solely on a hard-coded stub):** Before every store submission, run **Xcode → Product → Archive → Generate Privacy Report** on the release archive and verify that `native/ios/App/App/PrivacyInfo.xcprivacy` declares **every** Required-Reason API actually invoked by Capacitor core and all installed native plugins (such as the durable native store, filesystem/share, or biometric lock plugins), rather than assuming only `NSUserDefaults` / `CA92.1` is present.
- **Baseline manifest structure:** At minimum, `PrivacyInfo.xcprivacy` MUST declare `NSPrivacyTracking = false`, `NSPrivacyTrackingDomains = []`, `NSPrivacyCollectedDataTypes = []`, and `NSPrivacyAccessedAPITypes` starting with `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1` — *"Access info from same app, per documentation"*) plus any additional categories surfaced by Xcode's Privacy Report (for example, `NSPrivacyAccessedAPICategoryFileTimestamp` if used by a native filesystem/SQLite plugin):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <!-- Append any additional Required-Reason APIs reported by Xcode "Generate Privacy Report" -->
  </array>
</dict>
</plist>
```

### 3. Google Play Console — Data Safety, Backup Exclusion & Manifest Hygiene

- **Qualification under Google Play's Data Safety policy:**
  - Google Play defines *"Collecting"* as *"transmitting data from your app off a user's device"* and explicitly exempts data that remains strictly on-device or is exported locally under direct user control.
  - Because zero user or device data is transmitted off-device or shared with any third party — and Android Auto Backup is explicitly disabled (below) — the app qualifies for **"No data shared with third parties"** and **"No data collected"** in Google Play Console → **App content → Data safety**.
- **Android backup exclusion (adopted default, OQ-3 — prevents hidden cloud egress):**
  - Capacitor's default Android template ships `android:allowBackup="true"`, which causes Android Auto Backup to silently upload WebView IndexedDB files to the user's Google Drive and restore them onto new devices (hidden off-device upload plus risk of inconsistent database state).
  - `native/android/app/src/main/AndroidManifest.xml` MUST set:
    - `android:allowBackup="false"`
    - `android:fullBackupContent="false"` (for Android 11 / API < 31)
    - `android:dataExtractionRules="@xml/data_extraction_rules"` (for Android 12+ / API >= 31)
  - `native/android/app/src/main/res/xml/data_extraction_rules.xml` MUST explicitly exclude all domains from both `<cloud-backup>` and `<device-transfer>`:
    ```xml
    <?xml version="1.0" encoding="utf-8"?>
    <data-extraction-rules>
      <cloud-backup>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
      </cloud-backup>
      <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
      </device-transfer>
    </data-extraction-rules>
    ```
- **Android manifest permission hygiene (`native/android/app/src/main/AndroidManifest.xml`):**
  - MUST omit the Google Advertising ID permission (`com.google.android.gms.permission.AD_ID`); if any build plugin attempts to merge it transitively, strip it explicitly via `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />`.
  - MUST avoid unnecessary network, contacts, location, or external-storage permissions; the app relies solely on app-scoped storage and standard system file-picker / share intents for local JSON backup import/export.

### 4. Capacitor WebView Runtime Hardening (`native/capacitor.config.ts`)

`capacitor.config.ts` lives inside the isolated **`native/` workspace package** (`native/capacitor.config.ts`) so its `import type { CapacitorConfig } from "@capacitor/cli"` never pollutes the root web package's `package.json`. It points `webDir` at `"../dist"` (the identical static web bundle built at repo root) and reinforces `connect-src 'none'` at the native shell boundary across both iOS (`WKWebView`) and Android (`Chromium` WebView):

- **`webDir: "../dist"`** — packages the exact static web bundle built by the root web package without any per-platform build step.
- **`server: { allowNavigation: [] }`** — blocks the WebView from navigating to any external origin outside the bundled local app origin (`capacitor://localhost` on iOS, `https://localhost` on Android).
- **`android: { allowMixedContent: false, webContentsDebuggingEnabled: false }`** — disables insecure mixed content and disables remote `chrome://inspect` WebView debugging in release builds.
- **`ios: { limitsNavigationsToAppBoundDomains: true }` + required `WKAppBoundDomains` pairing:** Enabling `limitsNavigationsToAppBoundDomains: true` in `capacitor.config.ts` **requires** a matching `WKAppBoundDomains` array in `native/ios/App/App/Info.plist` (e.g. `<key>WKAppBoundDomains</key><array><string>localhost</string></array>`); enabling the Capacitor flag without the `Info.plist` entry breaks or restricts `WKWebView` APIs. Either pair `limitsNavigationsToAppBoundDomains: true` with `WKAppBoundDomains` in `Info.plist` (recommended for defense-in-depth alongside `allowNavigation: []`), **or** omit `limitsNavigationsToAppBoundDomains` cleanly if App-Bound Domains are not used.

```ts
// native/capacitor.config.ts (isolated native/ workspace package)
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.tandyn.simplebudgetapp",
  appName: "Simple Budget",
  webDir: "../dist",
  server: {
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false, // false in release builds
  },
  ios: {
    // Requires matching <key>WKAppBoundDomains</key><array><string>localhost</string></array>
    // in native/ios/App/App/Info.plist; drop this flag if not declaring WKAppBoundDomains.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
```

## Store Submission Checklist (Phase 6)

Before submitting the iOS or Android native shell to Apple App Store Connect or Google Play Console, **every** item below MUST be satisfied:

### Pre-submission technical gates (both stores)

- [ ] **Durable native store (OQ-4 release gate):** Implement a durable native persistence backend behind `StorageAdapter` (SQLite `StorageAdapter` or mirrored auto-snapshot to the app's native Documents directory) so OS WebView storage eviction cannot wipe user financial history (see [storage.md → Why a storage-adapter](storage.md#why-a-storage-adapter)).
- [ ] **Package boundary verified:** Root `package.json` `dependencies` is `{}` and `src/` has zero `@capacitor/*` imports; all native plugins live in `native/package.json` with exact pinning and clean `pnpm audit --audit-level=high`.
- [ ] **Native backup & security polish:** `PlatformServices` native `saveBackup` / `shareBackup` verified on device (especially iOS `WKWebView` where `<a download>` does not work); passphrase-encrypted backup export and optional native biometric app lock implemented prior to store launch (see [storage.md](storage.md)).
- [ ] **Privacy policy URL published:** Host a clear, public **privacy policy** URL (e.g., a static page on GitHub Pages) stating that the app stores all data locally on-device and collects or transmits zero data off-device. Required by **both** Apple App Store Connect and Google Play Console even when declaring "Data Not Collected".

### Apple App Store checklist

- [ ] **App Privacy declaration:** Select **"Data Not Collected"** in App Store Connect → App Privacy.
- [ ] **Privacy policy URL:** Configured in App Store Connect listing metadata.
- [ ] **App Store Review Guideline 4.2 (Minimum Functionality) mitigation & reviewer notes:** Thin WebView wrappers risk Guideline 4.2 rejection. Mitigate by shipping genuine native value (native file save/share via `PlatformServices`, durable native storage, optional Face ID / Touch ID biometric app lock) and supplying concise **App Review Notes** explaining the local-first, zero-network architecture, native capabilities, and step-by-step instructions to test recurring rules, Insights, and backup export/import offline without an account.
- [ ] **`Info.plist` flags:** `ITSAppUsesNonExemptEncryption` set to `false`; `WKAppBoundDomains` declared if `limitsNavigationsToAppBoundDomains: true` is enabled in `native/capacitor.config.ts` (otherwise drop the flag).
- [ ] **`PrivacyInfo.xcprivacy` verified via Xcode Privacy Report:** Generate the Privacy Report on the release `.xcarchive` (`Product → Archive → Generate Privacy Report`) and confirm every Required-Reason API used by Capacitor core and installed plugins is declared.

### Google Play Store checklist

- [ ] **Financial features declaration:** Complete Google Play Console's mandatory **Financial features** declaration (required for personal-finance / budgeting apps — declare local budgeting/expense tracking only, with no lending, banking, crypto, or money transmission).
- [ ] **Privacy policy URL:** Configured in Play Console listing and Data safety section.
- [ ] **Data safety form (including backups):** Declare **"No data shared with third parties"** and **"No data collected"**, accurately reflecting the backup posture (`allowBackup="false"` + `dataExtractionRules` excluding `cloud-backup` and `device-transfer`, so no hidden Google Drive upload occurs).
- [ ] **Android manifest verified:** `android:allowBackup="false"`, `android:fullBackupContent="false"`, `android:dataExtractionRules="@xml/data_extraction_rules"`, `AD_ID` omitted/removed, and no unnecessary permissions.
- [ ] **Closed testing requirement (verify at submission):** Personal Google Play developer accounts created after November 13, 2023 require a **12-tester / 14-day closed test** before production access is granted — **verify current Google Play Console policy at submission time**.

## Resolved MVP defaults

These three design questions have locked-in **MVP defaults** so engineering tasks never block waiting for product-owner sign-off. Alternative approaches are documented as future options.

### A. Client-side encryption, encrypted backups, and app lock — in scope for the MVP or deferred?

- **Recommendation: defer at-rest IndexedDB encryption from the MVP; require
  passphrase-encrypted backup export (and optional native biometric app lock)
  before the first App Store / Play Store release (Phase 6).**
  - **MVP:** "Purely locally and securely" is satisfied for the MVP by on-device
    IndexedDB + **zero network egress (`connect-src 'none'`)** plus the
    pre-import confirm dialog and automatic pre-import safety snapshot (see
    [storage.md](storage.md)).
  - **Pre-store-release gate (post-MVP, Phase 6):** Plaintext JSON exports
    stored in iCloud Drive / Google Drive expose full financial history. Before
    store submission, add **passphrase-encrypted backup export** using WebCrypto
    **AES-256-GCM** (`AES-GCM`) + **PBKDF2-HMAC-SHA256** (`>= 600,000`
    iterations) in the versioned envelope
    `{ schemaVersion, enc: { alg, kdf, iter, salt, iv }, ciphertext }` (see
    [data-model.md → Post-MVP Encrypted Backup Envelope](data-model.md#post-mvp-encrypted-backup-envelope-store-release-gate)),
    paired with an **optional native biometric app lock** (iOS Face ID / Touch ID
    and Android `BiometricPrompt`, native shell only — also strengthens Apple
    Guideline 4.2 compliance).
  - **Deferred future options:** Full at-rest IndexedDB encryption (WebCrypto
    behind `StorageAdapter`) and **E2EE multi-device sync** (user-held key over
    the reserved `deletedAt?` / `deviceId?` tombstone slots; privacy label
    unaffected only if no developer-readable plaintext is ever collected — see
    [data-model.md → Privacy-Label Impact and Sync Tradeoffs](data-model.md#privacy-label-impact-and-sync-tradeoffs))
    remain deferred and require no v1 data-model rewrite.
- **Why it's a decision:** encryption changes the UX (passphrase prompt, key
  recovery if forgotten) and the threat model. Separating MVP plaintext local
  storage from the pre-store encrypted-backup gate keeps the MVP small while
  protecting store users' exported files.
- **MVP status: RESOLVED.** Use the recommended default above for the MVP; do not block implementation tickets on this item.

### B. Is `deposit` a first-class type, or an income-type Activity with a tag?

- **Recommendation: first-class `deposit`** — the user's ask explicitly names
  "deposits" as a manual entry distinct from income, and a first-class type keeps
  the Available Funds and any future analytics unambiguous.
- Current model already treats `deposit` as first-class on `Activity`
  (`type ∈ {income, expense, deposit}`) while *not* allowing it on `RecurringRule`
  (recurring rules are `income | expense` only). See
  [data-model.md](data-model.md) and [activity-model.md](activity-model.md).
- **Alternative:** model a deposit as `type: "income"` + `tags: ["deposit"]`.
  This removes a type value but muddies "money in" (salary) vs. "money in
  (deposit)" in reports.
- **MVP status: RESOLVED.** Use the recommended default above for the MVP; do not block implementation tickets on this item.

### C. Back-fill on re-enable (from the recurring engine)

- Current behavior: **re-enabling a disabled rule back-fills** every due period
  that was skipped, idempotency-guarded (see
  [recurring-engine.md → notes](recurring-engine.md#notes-and-resolved-defaults)).
- **Alternative:** advance `lastPostPeriod` to `now` when a rule is disabled, so
  a re-enabled rule does *not* back-fill (treats skipped periods as forgiven).
- **MVP status: RESOLVED.** Use the recommended default above for the MVP; do not block implementation tickets on this item.

## Mapping the user's ask → portability

| User's ask | Portability answer |
| ---------- | ------------------ |
| "store data purely locally and securely" | on-device IndexedDB, zero network egress (see [storage.md](storage.md)) |
| "download it as a PWA using GitHub Pages" | the library is a plain TS bundle a PWA can import; front-end = PWA UI shell |
| "create an iOS app (developer subscription purchased)" | Capacitor + WKWebView (WebKit) runs the *same* library; only the shell differs |
| "make it compatible for all platforms" (Story #21) | Android is a third webview target — Capacitor + Chromium WebView runs the *same* library; see **Android-specific considerations** above |
| "the same code runs in a PWA now and an iOS/Android app later" | framework-agnostic TS library + storage-adapter seam (this doc) |
| "shouldn't need any additional packages in production" (Story #21) | zero production dependencies — Web-platform APIs only (see [dependency-strategy.md](dependency-strategy.md)) |
| "backend should support … so a front-end can be built on top" | the `BudgetApi` public interface is the contract the front-end implements against |
| "declare Data Not Collected / no data stored or shared off-device" (Story #153) | on-device storage (IndexedDB MVP + OQ-4 durable native store gate) + `connect-src 'none'` + Xcode-derived `PrivacyInfo.xcprivacy` + `ITSAppUsesNonExemptEncryption=false` + Android `allowBackup="false"` / `dataExtractionRules` + Google Play Data Safety ("No data collected / No data shared") + `native/` Capacitor WebView hardening & Store Submission Checklist (this doc) |
