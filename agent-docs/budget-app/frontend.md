# Budget App — Frontend, Shell & Platform Seam

Tracks what is real in code for the browser/PWA UI layer (`index.html`, `src/main.ts`, `src/env.d.ts`, `src/ui/`, `src/styles/`, `src/platform/`). Design-of-record: [project-plan/frontend.md](../../project-plan/frontend.md) and [project-plan/portability.md](../../project-plan/portability.md).

All files here obey the zero-production-dependency boundary (`dependencies: {}`) and use built-in Web-platform APIs only — no framework runtime, no `@capacitor/*` imports in `src/` (Gate 1), no external URLs in `dist/` (Gate 3), and zero banned DOM XSS / eval sinks (Gate 4).

## 1. Entry Point, CSP Baseline & Clickjacking Guard (`index.html`, `src/main.ts`, `src/env.d.ts`)

- **Strict CSP & privacy meta tags (`index.html`):**
  - `<meta http-equiv="Content-Security-Policy">` enforces `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types sw-register` (omits `frame-ancestors`, which is ignored in `<meta>`).
  - `<meta name="referrer" content="no-referrer">` and `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`.
  - Links `./src/styles/frame.css` and mounts `<div id="app"></div>` + `<script type="module" src="/src/main.ts"></script>`.
- **Clickjacking frame-buster & bootstrap (`src/main.ts`):**
  - Exports dependency-injected `assertNotFramed(win, doc)` (with `FrameGuardWindow` / `FrameGuardDocument`): detects `win.top !== win.self` (treating cross-origin access throws as framed), clears `doc.documentElement.replaceChildren()`, and throws `Error("Framing is not permitted")`; unit-tested in `src/main.test.ts`.
  - In a browser context (`window` and `document` defined), runs `assertNotFramed(window, document)` and mounts `renderShell(app)` into `#app`.
- **Ambient browser/platform globals (`src/env.d.ts`):** declares optional `Window.trustedTypes`, `Window.showSaveFilePicker`, and `Window.Capacitor` (`CapacitorGlobal` / `BackupServicePlugin`) so `src/` stays strictly typed without importing `@capacitor/*`.

## 2. Safe-DOM Helper Layer (`src/ui/dom.ts`)

- **Purpose:** Foundational, framework-free DOM construction layer enforcing the DOM XSS ban by construction (Gate 4 of `scripts/verify-build-gates.mjs`). Uses **exclusively** `document.createElement`, `document.createTextNode`, `element.setAttribute`, `element.removeAttribute`, and `parent.replaceChildren`.
- **Exports (`ElAttrs`, `ElChild`):**
  - `text(value: string): Text` — creates an inert `Text` node (`document.createTextNode`) so user-controlled strings (tags, memos, rule names, imported backup fields) can never be parsed as HTML.
  - `setAttrs(target: Element, attrs: ElAttrs): Element` — sets string attributes via `setAttribute` and removes attributes whose value is `null` via `removeAttribute`.
  - `replaceChildren(parent: ParentNode, ...children: ElChild[]): ParentNode` — drops `null` sentinel children and updates via `parent.replaceChildren(...)` (calling with no children clears `parent`).
  - `el(tag: string, attrs?: ElAttrs, children?: readonly ElChild[]): Element` — builds an unattached element via `document.createElement`, optionally applying `setAttrs` and `replaceChildren`.
- **Tests (`src/ui/dom.test.ts`):** Vitest unit tests (`// @vitest-environment happy-dom`) verifying element creation, attribute toggling/removal, conditional `null` children, and inert rendering of XSS payloads.

## 3. Accessible 3-Tab Application Shell & `<dialog>` Helper (`src/ui/shell.ts`)

- **Exports:** `renderShell(container: HTMLElement): ShellHandle`, `interface ConfirmDialog { readonly dialog: HTMLDialogElement; open(): void; close(): void }`, `interface ConfirmOptions`, `interface ShellPanels`, and `interface ShellHandle extends ConfirmDialog { readonly panels: ShellPanels; confirm(options: ConfirmOptions): Promise<boolean> }`.
- **Markup & WAI-ARIA tabs pattern:** built exclusively via `src/ui/dom.ts`:
  - `<nav role="tablist">` with three `<button role="tab" type="button" id="tab-<tab>" aria-selected aria-controls="panel-<tab>" tabindex>` controls in fixed order (`Budget`, `Insights`, `Settings`; `Budget` active by default).
  - Three paired `<section role="tabpanel" id="panel-<tab>" aria-labelledby="tab-<tab>">` landmarks (`hidden="true"` on inactive panels), exposed directly on `ShellHandle.panels` (`budget`, `insights`, `settings`) so Phase 4B/4C views mount directly into each panel.
  - Roving `tabindex` (`0` on active tab, `-1` on others), click selection, and wrapping `ArrowRight` / `ArrowLeft` keyboard navigation on the tablist.
- **Native `<dialog>` confirmation helper (`dialog.confirm-dialog`):**
  - Opens modally via `dialog.showModal()` (native focus trap, backdrop inertness, `Escape` dismissal) with `Cancel` and `Confirm` buttons.
  - `confirm(options)` updates the heading, message, and optional button labels via safe DOM `text(...)` nodes, opens modally, resolves `true` on Confirm click and `false` on Cancel click or `Escape` dismissal, and restores focus to `options.invoker` (when provided and connected) or the active tab button on close.
  - Preserves full backwards compatibility with `ConfirmDialog` (`dialog`, `open()`, `close()`).
- **Touch-target floor:** every interactive button sets `min-width: 44px; min-height: 44px` by construction in `control()` (mirrored in `src/styles/frame.css`), satisfying WCAG 2.2 AA (`>= 44×44 CSS px`).
- **Tests (`src/ui/shell.test.ts`):** Vitest unit tests (`// @vitest-environment happy-dom`) covering tab selection, roving `tabindex`, wrapping arrow keys, `panels` handles, `<dialog>` modal open/close, promise-based `confirm(...)` resolution/XSS safety/re-invocation, focus return, and `>= 44×44` target sizing.

## 3b. Display Formatting & Input-Boundary Helpers (`src/ui/format.ts`)

- **Purpose:** Zero-dependency display/input boundary helpers using built-in `Intl` / `Date` APIs and canonical validators from `src/core/validate.ts`.
- **Exports:**
  - `formatCents(amountCents, currency = "USD", locale?)`: formats positive, zero, or negative integer cents via `Intl.NumberFormat` strictly at the display boundary (no floating-point business math).
  - `parseDecimalInputToCents(raw)`: trims and validates a positive decimal string (at most 2 fractional digits) and delegates to `toCents` in `src/core/validate.ts` for canonical safe-integer bounds.
  - `formatLocalDateTime(isoUtc, locale?)`: renders a stored ISO-8601 UTC timestamp in the user's local timezone via `Intl.DateTimeFormat` without mutating the UTC instant.
  - `toDateTimeLocalInputValue(isoUtc)` / `fromDateTimeLocalInputValue(localValue)`: round-trips between ISO-8601 UTC timestamps and `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) local values.
  - `parseTagsInput(raw)` / `formatTagsInput(tags)`: splits/joins comma-separated free-form tags with trimming, empty-entry removal, and order-preserving deduplication.
- **Tests (`src/ui/format.test.ts`):** Vitest unit tests covering positive/zero/negative cents, currency/locale formatting, decimal input bounds/rejections, UTC ↔ local datetime round-trips, and tag parsing/formatting.

## 4. iPhone-Duo Dual-State CSS Frame (`src/styles/frame.css`)

- **System font stack & box sizing:** `:root` sets `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (zero remote fonts); `#app, #app *` use `box-sizing: border-box`.
- **Viewport height & zero page scroll:** `html, body` set `height: 100dvh; overflow: hidden; margin: 0` with `@supports (height: 100svh) { html, body { height: 100svh; } }`.
- **Safe-area insets directly on `#app`:** `#app` carries `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` (driven off `#app` directly — no `.shell` or `<main>` wrapper in the rendered DOM).
- **Folded (`< 700px`, incl. `375×667` folded & `390×844` slab):** `#app` is a full-height flex column (`flex-direction: column`); `#app > section[role="tabpanel"]` takes `flex: 1 1 0; min-height: 0; overflow-y: auto` so any content scrolls inside the active panel with zero page-level overflow.
- **Unfolded (`@media (min-width: 700px)`, e.g. `829×1194`):** `#app` switches to a split-pane flex row (`flex-direction: row`) with a fixed `200px` `#app > nav[role="tablist"]` rail (`flex: 0 0 auto; width: 200px`) beside the flexible `#app > section[role="tabpanel"]` pane.
- **Touch targets:** `button { min-width: 44px; min-height: 44px; }`.

## 5. `PlatformServices` Runtime Seam (`src/platform/services.ts`)

- **Exports:** `interface PlatformServices { readonly isNative: boolean; saveBackup(filename: string, json: string): Promise<void>; shareBackup(filename: string, json: string): Promise<void> }` and `createPlatformServices(win?: Window): PlatformServices`.
- **Runtime feature detection (zero `@capacitor/*` imports):** checks `target?.Capacitor?.isNativePlatform?.() === true` (using the injectable `win` or global `window`) against the ambient `Window.Capacitor` declaration in `src/env.d.ts`.
  - **Native Capacitor shell (`isNative === true`):** delegates `saveBackup` and `shareBackup` directly to `window.Capacitor.Plugins.BackupService`.
  - **Web / PWA (`isNative === false`):**
    - `saveBackup`: uses the File System Access API (`window.showSaveFilePicker`) when available, otherwise creates a `Blob` (`application/json`) + temporary `<a download>` via safe DOM APIs (`createElement`, `setAttribute`, `appendChild`, `click`, `remove`) and revokes the object URL (`URL.revokeObjectURL`).
    - `shareBackup`: calls `navigator.share({ files: [new File([json], filename, { type: "application/json" })] })` when `navigator.share` is available; resolves silently on user-cancelled `AbortError`; falls back to `services.saveBackup(filename, json)` when `navigator.share` is absent or rejects with any non-`AbortError` failure (`#281`).
- **Tests (`src/platform/services.test.ts`):** Vitest unit tests (`// @vitest-environment happy-dom`) covering native delegation, file picker, anchor-download fallback, `navigator.share` success, `AbortError` silent cancel, and non-`AbortError` / absent-API fallback to `saveBackup`.

> **Deferred to Phases 4B–4D:** functional Budget / Insights / Settings views wired to `BudgetApi` (`src/index.ts`), base-path-scoped `BroadcastChannel` multi-tab sync, `public/manifest.webmanifest`, and the custom Vite Service Worker plugin (`dist/sw.js`, `{ updateViaCache: "none" }`). See [project-plan/build-order.md](../../project-plan/build-order.md).
