import type { Activity } from "./types";

/**
 * Pure Available Funds derivation (derived aggregate; not persisted state).
 *
 * `Available Funds = sum(income + deposit) - sum(expense)` in **integer cents**.
 *
 * - Zero floating-point arithmetic or rounding: all operands and the result
 *   are integers in the safe-integer domain (`amountCents` per `data-model.md`).
 * - Soft-deleted (`deletedAt !== undefined`) activities are excluded,
 *   matching the `alreadyPosted` guard in `src/core/engine.ts` so a
 *   user-deleted activity never re-enters the derived balance.
 * - Returns `0` for an empty activity list and returns a **negative** number
 *   when expenses exceed income + deposits (never clamped).
 *
 * Portability boundary (`project-plan/portability.md`): pure TypeScript, no
 * imports from `src/storage/`, no browser DOM globals, no Node globals.
 */
export function computeAvailableFunds(activities: readonly Activity[]): number {
  let availableCents = 0;
  for (const a of activities) {
    if (a.deletedAt !== undefined) {
      continue;
    }
    if (a.type === "expense") {
      availableCents -= a.amountCents;
    } else {
      // `income` or `deposit` counts as money in (deposit alongside income).
      availableCents += a.amountCents;
    }
  }
  return availableCents;
}
