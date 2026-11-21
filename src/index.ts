/**
 * Public library entry / door for `simple-budget-app`.
 *
 * `project-plan/portability.md → Module layout`: `index.ts` is the *only*
 * thing a front-end (PWA, iOS, or Android) imports from the library. It
 * re-exports the `createBudgetApi` composition root plus the key public types
 * (`src/core/types.ts`) so a consumer can build against the `BudgetApi`
 * contract and its record shapes without reaching into the internals of
 * `src/core/` or `src/storage/`.
 *
 * **V3 scope (#259):** this file plus the Vite library build (`pnpm run
 * build:lib` → `dist/budgetApi.es.js`) make `createBudgetApi` importable
 * from the built `dist/` output, and `src/budgetApi.dist.test.ts`
 * smoke-round-trips the *built* bundle.
 *
 * Portability boundary (`project-plan/portability.md`): this module only
 * re-exports the public surface; it introduces no new logic, no
 * `src/core/ → src/storage/` imports, and no runtime dependencies
 * (`project-plan/dependency-strategy.md` — zero production dependencies).
 */

export type { BudgetApi, CreateBudgetApiOptions } from "./budgetApi";
export { createBudgetApi } from "./budgetApi";
export type {
  Activity,
  ActivityFilter,
  ActivityPatch,
  BudgetBackup,
  NewActivity,
  NewRule,
  RecurringRule,
  RulePatch,
  TagSummary,
} from "./core/types";
