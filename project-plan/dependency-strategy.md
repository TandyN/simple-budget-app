# Dependency strategy

**Decision (Story #21 / spike #22):** the backend has **zero production
dependencies** and a small set of **well-maintained, industry-standard dev
dependencies**. This is a hard constraint, not a preference.

## The two rules

1. **Zero production dependencies (the hard constraint).** `package.json`
   `dependencies` is **empty**. At runtime the app uses only **Web-platform
   APIs** that are present in all three targets (PWA in a modern browser, iOS
   WebKit WebView, Android Chromium WebView). No runtime npm package is
   required. This is the rule that is never relaxed.
2. **Curated dev dependencies under the well-maintained criterion (the
   governing rule for every dev dependency).** The *only* packages we allow are
   the dev tools that make the codebase correct, clean, and testable — and each
   one must pass the **well-maintained criterion** (below). No random /
   unmaintained / niche packages. This criterion applies to **every** dev
   dependency we install — local tooling *and* the **CI actions** the pipeline
   runs (see [Dev dependencies (the allowed set)](#dev-dependencies-the-allowed-set)
   and [CI actions (the allowed set)](#ci-actions-the-allowed-set)).

> **Zero-prod-dep vs dev-only — the crisp distinction.** `dependencies` is
> **empty**: the runtime loads **no npm package**. `devDependencies` holds a
> small, curated toolchain (build / test / lint / type-check) that is **only
> ever run at build, test, or lint time** and is **never imported or executed
> at runtime**. In other words: production code ships with **zero** third-party
> runtime code; the dev tools are pinned, build-time-only, and leave the bundle.
> CI mirrors this: it installs the dev toolchain to *produce* the build, and
> never installs or ships anything into `dependencies`.

## The well-maintained criterion (the governing rule for any dev dependency)

Before any dev dependency — a **local package** *or* a **CI action** — is added
to the repo, it must satisfy **all three** of the following, and the justification
must be recorded in the PR (signed by the proposing role):

1. **Active & current.** The project's repository is **active** (not archived,
   not stale) and receives **regular releases** (a recent, ongoing release cadence
   as of the plan date), i.e. it is the *current* best-practice tool in its
   category rather than a superseded or frozen one.
2. **First-party or tool-maintainer.** It is maintained by the **tool's own
   maintainer(s)** or the **upstream project owner** (first-party) — not a
   random fork, community copy, or niche shim that outlived its usefulness.
   (For CI actions this means the action is published by the upstream project /
   a first-party GitHub App, not a third-party reimplementation.)
3. **Industry-standard in its category.** It is the recognized default /
   best-practice choice in its category for a TypeScript + web build/test
   pipeline, with a large, active community.

A dev dependency that fails any of the three is **rejected** — "just convenient"
is not enough. This is the rule that guards rule 2 above, and it is applied to
each named entry in the two tables below.

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

Each entry is chosen because it passes the **[well-maintained
criterion](#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)**
(Active & current · First-party / tool-maintainer · Industry-standard). None is
a runtime / framework dependency — all are used **only** at build / test / lint
time and live in **`devDependencies`**.

| Area | Tool (dev dep) | Well-maintained criterion — how it satisfies it (as of plan date) |
| ---- | -------------- | ------------------------------------------------------------------ |
| Package manager | **pnpm** | **Active & current:** actively maintained, frequent releases. **First-party / tool-maintainer:** maintained by the pnpm project. **Industry-standard:** de-facto standard for the TS/Node ecosystem; strict/flat `node_modules`, fast, disk-efficient. (npm is the zero-config fallback.) |
| Build / bundler | **Vite** | **Active & current:** very active repo, regular releases. **First-party / tool-maintainer:** maintained by the Vite core team. **Industry-standard:** the current best-practice web build tool; `build.lib` emits the shared bundle; pairs with Vitest. |
| Testing | **Vitest** | **Active & current:** actively maintained, regular releases. **First-party / tool-maintainer:** maintained by the Vite core team (first-party to Vite). **Industry-standard:** the current best-practice TS test framework — fast, ESM/TS-native, zero babel config, Vite-compatible, large community. |
| E2E / browser testing | **Playwright (`@playwright/test`)** | **Active & current:** very active repo, regular releases. **First-party / tool-maintainer:** maintained by Microsoft (the browser-automation vendor). **Industry-standard:** the current standard for fast, reliable headless browser E2E across Chromium and WebKit. |
| IndexedDB test polyfill | **`fake-indexeddb`** | **Active & current:** maintained with releases; **First-party / tool-maintainer:** maintained by its dedicated author (a stable, single-maintainer project, not a fork); **Industry-standard:** the de-facto in-memory IndexedDB implementation so `src/storage/indexeddb.ts` can be unit-tested in Vitest (Node). *(Category: test-support, not a runtime framework.)* |
| Lint + format | **Biome** | **Active & current:** actively maintained, regular releases. **First-party / tool-maintainer:** maintained by the Biome project (Rust-based, first-party). **Industry-standard:** the current best-practice single lint + format tool (sub-ms, no plugin config). (ESLint 9 + Prettier is the fallback if a plugin ecosystem is later needed.) |
| Type check | **tsc** (TypeScript) | **Active & current:** the TypeScript compiler itself — the most actively maintained project in the JS/TS ecosystem, regular releases. **First-party / tool-maintainer:** maintained by Microsoft (the language owner). **Industry-standard:** `tsc --noEmit` runs in CI. |

**The full `devDependencies` set:** `vite`, `vitest`, `fake-indexeddb`,
`@playwright/test`, `@biomejs/biome`, `typescript`. (Plus **pnpm** as the
package manager, and the **CI actions** below.) **No framework runtime deps** —
`dependencies` (production) MUST remain completely empty.

## CI actions (the allowed set)

The CI actions are **also dev dependencies** — they are installed/invoked by
GitHub Actions at **build / test / deploy time only**, never shipped to a
browser or WebView, and they satisfy the **same well-maintained criterion** as
the local tooling above. They are pinned in the workflow files under
`.github/workflows/` (not `package.json`), and each is a **first-party action**
of the upstream project or a GitHub first-party action.

| Area | Action (version) | Well-maintained criterion — how it satisfies it (as of plan date) |
| ---- | ---------------- | ------------------------------------------------------------------ |
| Checkout code | **`actions/checkout`** v4 | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the canonical way to check out a repo in a workflow. |
| Set up Node.js | **`actions/setup-node`** v4 | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard way to provision Node + the pnpm cache on a runner. |
| Set up pnpm | **`pnpm/action-setup`** v4 | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** maintained by the **pnpm** project (the tool's own maintainer — first-party to pnpm). **Industry-standard:** the canonical way to provision the exact pnpm version in CI. |
| Upload Pages artifact | **`actions/upload-pages-artifact`** v3 | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard pairing with `actions/deploy-pages` for uploading build output. |
| Deploy to GitHub Pages | **`actions/deploy-pages`** v4 | **Active & current:** active, frequent releases. **First-party / tool-maintainer:** GitHub first-party action. **Industry-standard:** the standard way to publish a built site to GitHub Pages (the production + per-PR-preview deploy, see [testing.md → CI deploy & preview](testing.md#ci-deploy--preview-github-pages)). |

**CI-actions note:** the **well-maintained criterion** is what *justifies* these
five as the allowed set; the **zero-prod-dep constraint** is what *limits* them —
none of them is ever loaded at runtime by the app. They only **produce** the
build and **publish** it. Any additional CI action added to a workflow must
pass the same well-maintained criterion before it is allowed.

## What this buys

- **No runtime third-party code** in the bundle that ships to all three targets.
- **No supply-chain / license drift** in production; the only dependencies are
  build-time tools pinned in `devDependencies`.
- **Consistent behavior** across WebKit (iOS) and Chromium (Android), because
  both implement the same Web APIs the code relies on.
- **A clean, current toolchain** (pnpm / Vite / Vitest / Biome / tsc) that any
  engineer can set up without choosing between competing libraries.

## Guardrails (enforce in CI / review)

- **`dependencies` must stay empty (CI-enforced).** CI must **assert that
  `package.json` `dependencies` is empty** (a `pnpm`/`node` check in the pipeline)
  in addition to the human gate: a PR that adds a production dependency requires
  an explicit justification and a senior-software-engineer sign-off.
- **Any new dev dependency — local package *or* CI action — must pass the
  [well-maintained criterion](#the-well-maintained-criterion-the-governing-rule-for-any-dev-dependency)**
  (Active & current · First-party / tool-maintainer · Industry-standard), and the
  PR must record how it satisfies the criterion. "Just convenient" is not enough.
- Prefer a **built-in Web API** over a package whenever the API is present in all
  three targets (see the table above).
- **Dev-only, never runtime.** Dev dependencies (local and CI actions) are
  build/test/lint-time only; they must never be imported or loaded at runtime.
  This keeps the **zero-prod-dep** hard constraint intact and the two rules
  consistent with each other.
