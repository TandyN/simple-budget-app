# T04 — Design system & responsive app shell

**Depends on:** T01 — **Milestone:** Foundation

## Goal

The sleek, minimalist look and the folded/unfolded layouts, built once as tokens, layout primitives and base
components — plus dev tools to see every device size at once on Linux and to inspect the real phone.

## Read first

`docs/design.md` (all of it), `docs/developer-setup.md` §3–4, Apple HIG (layout, typography) for reference.

## Scope

**In:** Tailwind v4 + tokens, light/dark, safe areas, `useLayoutMode`, `AppShell`, hinge-aware `TwoPane`, hash routing
(`#/`, `#/insights`, `#/settings`) with placeholder screens, base components, device wall, `?debug=layout` overlay,
`?debug=console` (dev/preview only), `index.html` meta for iOS.
**Out:** real screen content (T05+), PWA manifest/icons (T10).

## Steps

1. Tailwind CSS v4 via the Vite plugin; tokens from `docs/design.md` in `src/ui/theme/tokens.css` as CSS variables mapped
   into Tailwind's `@theme`. Dark mode via `prefers-color-scheme`.
2. `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `theme-color` for light
   and dark, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` = `black-translucent`, title "Simple Budget".
   Disable double-tap zoom on controls (`touch-action: manipulation`), keep pinch-zoom for accessibility.
3. `src/ui/layout/`: `useLayoutMode()` (`compact` < 600 px ≤ `expanded`, via `matchMedia`), `AppShell` (safe areas, `100dvh`),
   `TwoPane` (50/50 grid with the gutter centered on the hinge; progressive enhancement with
   `@media (horizontal-viewport-segments: 2)` + `env(viewport-segment-*)`).
4. Routing with `wouter` + hash location. Header: month title placeholder, Insights and Settings icon buttons (lucide).
5. `src/ui/components/`: `Button` (primary/secondary/quiet), `IconButton`, `AmountText` (tabular, `−`/`+`, color by sign, accessible label
   like "minus forty dollars"), `MoneyField` (`inputmode="decimal"`, uses `parseMoneyInput` once T02 exists — stub OK until then),
   `TextField`, `SegmentedControl`, `ListRow`, `Sheet` (vaul drawer in compact, centered dialog in expanded), `Toast` (with action, e.g. Undo),
   `EmptyState`. All keyboard- and VoiceOver-accessible, ≥ 44 pt targets.
6. Dev tools:
   - `dev/devices.html` (dev server only, excluded from the production build): iframes of the app at every profile in
     `config/devices.ts`, labelled, with a dark-mode toggle.
   - `?debug=layout` overlay: CSS viewport w×h, `devicePixelRatio`, layout mode, safe-area insets, standalone yes/no, viewport segments.
   - `?debug=console`: lazy-load an in-app console (e.g. eruda) only in dev/preview builds; never in the deployed bundle.
7. Visual check of the shell in the device wall and in screenshots at both Duo sizes (light + dark).

## Behaviors to prove

- `when folded, the app uses a single column with the action bar at the bottom`
- `when unfolded, the app shows two panes split at the hinge with nothing crossing the center line`
- `the layout switches when the screen is unfolded without losing what you were doing` (resize viewport mid-session)
- `the header lets you reach Insights and Settings and come back`
- `content stays clear of the notch and home indicator (safe areas are respected)`
- `amounts are read aloud with their sign` (accessible name of `AmountText`)
- `the debug layout overlay shows the screen size when ?debug=layout is in the address`

## Acceptance criteria

- [ ] Light and dark screenshots of the shell at Duo folded and unfolded look calm, aligned and uncluttered (agent attaches paths in the report).
- [ ] No horizontal scrolling at any profile.
- [ ] axe (via `@axe-core/playwright`) reports no violations on the shell.
- [ ] The device wall works with hot reload; it is not present in `dist/`.
- [ ] `pnpm verify` passes.

## Docs to update

`docs/design.md` (final tokens/components), `docs/developer-setup.md` (device wall, debug flags), `AGENTS.md` (`src/ui/`, `dev/` rows),
`docs/testing.md` (any driver additions).

## Completion notes

_Filled in by the agent when done._

