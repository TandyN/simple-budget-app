# Dependency strategy

**Decision (Epic #21 / spike #22):** the backend has **zero production
dependencies** and a small set of **well-maintained, industry-standard dev
dependencies**. This is a hard constraint, not a preference.

## The two rules

1. **Zero production dependencies.** `package.json` `dependencies` is **empty**.
   At runtime the app uses only **Web-platform APIs** that are present in all
   three targets (PWA in a modern browser, iOS WebKit WebView, Android Chromium
   WebView). No runtime npm package is required.
2. **Curated dev dependencies.** The *only* packages we allow are the dev tools
   that make the codebase correct, clean, and testable — and each one must be
   the **current, best-maintained, industry-standard** choice in its category.
   No random / unmaintained / niche packages.

Why: a zero-prod-dep runtime means the app ships **no third-party runtime code**
— fewer supply-chain and licensing risks, a smaller bundle, and no dependency
drift that could diverge the three webview targets. The shared-library model
([portability.md](portability.md)) only works if there is nothing platform- or
runtime-specific to install.

## Zero production dependencies

Every concern the backend needs is covered by a built-in Web API that exists in
**all three targets**. This is the load-bearing fact that makes "zero prod deps"
possible:

| Concern | Built-in API (all 3 targets) | Package it *replaces* (not used) |
| ------- | ---------------------------- | --------------------------------- |
| Storage | **IndexedDB** (WebKit + Chromium) | `idb`, `dexie`, `localforage` |
| Crypto (optional encryption) | **WebCrypto** `crypto.subtle` | `crypto-js`, `node:crypto` |
| ID generation | **`crypto.randomUUID()`** | `uuid` |
| HTTP (if ever) | **`fetch`** | `axios`, `node-fetch` |
| Date / formatting | **`Date`** + **`Intl`** | `date-fns`, `dayjs`, `moment` |
| Scheduling / recurring | **pure TS logic** | `croner`, `rrule` |
| State management | **pure TS logic** | `redux`, `zustand`, `xstate` |
| Validation | **TS types** + runtime checks | `zod`, `yup`, `joi` |

**Result:** `package.json` `dependencies` is empty. Nothing is imported at
runtime that a browser / WebView does not already provide.

> Secure-context note: `crypto.randomUUID()` and `crypto.subtle` require a secure
> context, which all three targets satisfy (GitHub Pages is HTTPS; Capacitor
> serves from `capacitor://localhost` / `http(s)://localhost`). Verify during
> implementation — see
> [storage.md → Secure-context requirement](storage.md#security-properties) and
> [portability.md → Android-specific considerations](portability.md#android-specific-considerations).

## Dev dependencies (the allowed set)

Each is chosen because it is the **current best-practice, well-maintained**
package in its category. All four are actively maintained. None is a runtime /
framework dependency — all are used only at build/test/lint time.

| Area | Recommended | Why (as of plan date) |
| ---- | ----------- | --------------------- |
| Package manager | **pnpm** | strict/flat `node_modules`, fast, disk-efficient; the de-facto TS standard. (npm is the zero-config fallback.) |
| Build / bundler | **Vite** | the current best web build tool; `build.lib` emits the shared bundle; pairs with Vitest. |
| Testing | **Vitest** | the "best" TS test framework today — fast, ESM/TS-native, zero babel config, Vite-compatible, large community. |
| Lint + format | **Biome** | one tool (lint + format), sub-ms (Rust), no plugin config. (ESLint 9 + Prettier is the fallback if a plugin ecosystem is later needed.) |
| Type check | **tsc** | the compiler itself; `tsc --noEmit` runs in CI. |

**The full `devDependencies` set:** `vite`, `vitest`, `@biomejs/biome`,
`typescript`. **No framework runtime deps** — not even React/Vue at runtime,
because the backend is a framework-agnostic library and the PWA/shell UI is
separate work ([portability.md](portability.md)).

## What this buys

- **No runtime third-party code** in the bundle that ships to all three targets.
- **No supply-chain / license drift** in production; the only dependencies are
  build-time tools pinned in `devDependencies`.
- **Consistent behavior** across WebKit (iOS) and Chromium (Android), because
  both implement the same Web APIs the code relies on.
- **A clean, current toolchain** (pnpm / Vite / Vitest / Biome / tsc) that any
  engineer can set up without choosing between competing libraries.

## Guardrails (enforce in CI / review)

- **`dependencies` must stay empty.** A PR that adds a production dependency
  requires an explicit justification and a senior-software-engineer sign-off.
- **Any new dev dependency** must be the current, well-maintained,
  industry-standard choice in its category — "just convenient" is not enough.
- Prefer a **built-in Web API** over a package whenever the API is present in all
  three targets (see the table above).
