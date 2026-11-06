# Design

> Status: **target design**. Tokens and components are built in task T04 and refined after that.

## Feel

_Quiet ledger._ Calm, monochrome, lots of air, one big number. The app should feel like a nice paper
notebook that happens to do the math. Nothing blinks, nothing nags, nothing is decorative.

- **One hero number** — the current budget — in a rounded, tabular typeface.
- **Color carries meaning only:** green-ish for money in, soft rose for money out, red only for a
  negative current budget. Everything else is grayscale.
- **Native-feeling:** system font (SF Pro on iPhone), iOS-style sheets, 44 pt minimum tap targets,
  respects Dark Mode, Reduce Motion and larger text.

## Tokens (CSS variables in `src/ui/theme/tokens.css`) (planned until T04)

| Token                     | Light     | Dark      | Use                                       |
| ------------------------- | --------- | --------- | ----------------------------------------- |
| `--color-canvas`          | `#FAFAF9` | `#0B0B0C` | App background                            |
| `--color-surface`         | `#FFFFFF` | `#151517` | Cards, sheets                             |
| `--color-ink`             | `#111111` | `#F4F4F5` | Primary text, hero number                 |
| `--color-ink-muted`       | `#6B6B70` | `#9A9AA2` | Labels, dates, secondary text             |
| `--color-hairline`        | `#E8E6E3` | `#26262A` | Dividers (1 px / 0.5 pt on 3× screens)    |
| `--color-money-in`        | `#1F7A4D` | `#4ADE95` | Income, deposits, positive adjustments    |
| `--color-money-out`       | `#9F3A4E` | `#F08AA0` | Expenses, negative adjustments            |
| `--color-negative-budget` | `#C42B2B` | `#FF6B6B` | Current budget below zero                 |
| `--color-accent`          | `#111111` | `#F4F4F5` | Primary buttons (ink-on-canvas, inverted) |

- **Type:** `font-family: ui-rounded, -apple-system, system-ui, sans-serif` for the hero number;
  `-apple-system, system-ui, sans-serif` elsewhere. All amounts use `font-variant-numeric: tabular-nums`.
- **Scale:** 13 / 15 / 17 (body) / 22 / 34 / 56 (hero) px.
- **Spacing:** 4 px grid. **Radii:** 12 (rows), 20 (cards/sheets), 999 (chips).
- **Motion:** 180 ms ease-out for sheets and number changes; none when `prefers-reduced-motion`.
- **Tag palette:** 8 desaturated hues (sage, sand, slate, clay, plum, sky, moss, stone) auto-assigned.
- **Minus sign:** amounts use the true minus `−` (U+2212), not a hyphen, and an explicit `+` for money in.

## Layouts

Layouts are chosen by **available width**, never by sniffing the device, so any phone works.

| Mode         | When                                                     | Layout                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **compact**  | width < 600 px (iPhone Duo folded, normal phones)        | Single column. Header (month + calendar + settings), hero card, ledger, bottom action bar with **Expense** and **Deposit** in the thumb zone.                                                               |
| **expanded** | width ≥ 600 px (iPhone Duo unfolded, tablets, landscape) | Two panes, split **50/50 so the fold hinge falls in the gutter**. Left: hero + calendar + actions. Right: ledger. Settings and Insights use list → detail across the panes. Sheets become centered dialogs. |

- Uses `env(safe-area-inset-*)` with `viewport-fit=cover`, and `100dvh` (not `100vh`).
- Progressive enhancement: if the browser supports the CSS Viewport Segments API
  (`@media (horizontal-viewport-segments: 2)`), the gutter is aligned to the reported hinge exactly.
- Nothing interactive or textual is placed across the vertical center line in expanded mode.

```text
 iPhone Duo folded (compact)          iPhone Duo unfolded (expanded)
┌─────────────────────────┐         ┌──────────────────┬──────────────────┐
│ November 2026   📅  ⚙︎   │         │ November 2026  ⚙︎ │ Starting point   │
│                         │         │                  │ Carried over  $0 │
│   Current budget        │         │  Current budget  │ Monthly income + │
│   $3,080.00             │         │  $3,080.00       │ Rent           − │
│   ≈ $118/day left       │         │                  │──────────────────│
│─────────────────────────│         │ S M T W T F S    │ Activity         │
│ Starting point        ▾ │         │ 1 2 3 4 5 6 7    │ Groceries   −120 │
│ Activity                │         │ ...calendar...   │ ...              │
│ Groceries      −$120.00 │         │                  │                  │
│                         │         │ [− Expense] [+ Deposit]             │
│ [ − Expense ][ + Deposit ]│       └──────────────────┴──────────────────┘
└─────────────────────────┘                    ↑ hinge in the gutter
```

## Device profiles (`config/devices.ts`)

The single place that lists the screens we design and test for. Playwright projects and the dev
device wall are both generated from it, so **adding a phone = adding one entry**.

| Profile               | CSS viewport (portrait) | DPR   | Notes                                                         |
| --------------------- | ----------------------- | ----- | ------------------------------------------------------------- |
| `iphone-duo-folded`   | 466 × 678               | 3     | 5.4" cover screen, 1398×2034 px. Wide "passport" aspect.      |
| `iphone-duo-unfolded` | 626 × 890               | 3     | 7.6" inner screen, 1878×2670 px. Hinge is vertical at center. |
| `iphone-17`           | 402 × 874               | 3     | A regular tall iPhone, to keep compact mode honest.           |
| `pixel-android`       | 412 × 915               | 2.625 | Android sanity check (Chromium).                              |

> The iPhone Duo numbers come from published specs (physical pixels ÷ 3). The usable viewport in a
> Home Screen app can differ slightly (status bar, Dynamic Island). Task T10 asks the owner to open the
> app's layout overlay (`?debug=layout`) on the real device and correct these numbers if needed.

## Fixing a layout for a specific phone

1. Add or adjust the profile in `config/devices.ts` (planned).
2. Look at it in the device wall (`pnpm dev`, planned, then open `/dev/devices.html`).
3. Prefer fixing the responsive rule (breakpoint, `clamp()`, container query) over a device-specific hack.
4. Journey tests automatically run on the new profile; update screenshot baselines if intended.

## Copy tone

Short, plain, friendly. Use glossary words. Examples: _"Add expense"_, _"Carried over from October"_,
_"When should this change take effect?"_, _"Your data stays on this phone. Export a backup now and then."_
