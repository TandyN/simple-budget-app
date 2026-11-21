import { describe, expect, it } from "vitest";
import { computeAvailableFunds } from "./funds";
import type { Activity } from "./types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    type: "income",
    amountCents: 1000,
    currency: "USD",
    dateTime: "2026-11-01T12:00:00.000Z",
    tags: [],
    source: "manual",
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("computeAvailableFunds", () => {
  it("returns 0 for an empty activity list", () => {
    expect(computeAvailableFunds([])).toBe(0);
  });

  it("sums income-only activities in integer cents", () => {
    expect(
      computeAvailableFunds([
        makeActivity({ id: "a1", type: "income", amountCents: 5000 }),
        makeActivity({ id: "a2", type: "income", amountCents: 2500 }),
      ]),
    ).toBe(7500);
  });

  it("counts deposit as money in (income + deposit)", () => {
    expect(
      computeAvailableFunds([
        makeActivity({ id: "a1", type: "income", amountCents: 1000 }),
        makeActivity({ id: "a2", type: "deposit", amountCents: 400 }),
      ]),
    ).toBe(1400);
  });

  it("subtracts expense-only activities, yielding a negative balance", () => {
    expect(
      computeAvailableFunds([
        makeActivity({ id: "a1", type: "expense", amountCents: 750 }),
        makeActivity({ id: "a2", type: "expense", amountCents: 250 }),
      ]),
    ).toBe(-1000);
  });

  it("handles mixed manual + recurring income/deposit/expense, with recurring counted identically", () => {
    expect(
      computeAvailableFunds([
        makeActivity({
          id: "r1",
          type: "income",
          amountCents: 500_000,
          source: "recurring",
          sourceRuleId: "rule-salary",
          period: "2026-11",
        }),
        makeActivity({
          id: "r2",
          type: "expense",
          amountCents: 200_000,
          source: "recurring",
          sourceRuleId: "rule-rent",
          period: "2026-11",
        }),
        makeActivity({ id: "m1", type: "deposit", amountCents: 1000 }),
        makeActivity({ id: "m2", type: "expense", amountCents: 500 }),
      ]),
    ).toBe(500_000 - 200_000 + 1000 - 500);
  });

  it("treats edits/deletions as derived: a soft-deleted (deletedAt) activity is excluded from the balance", () => {
    expect(
      computeAvailableFunds([
        makeActivity({ id: "a1", type: "income", amountCents: 1000 }),
        makeActivity({
          id: "a2",
          type: "expense",
          amountCents: 2000,
          deletedAt: "2026-11-02T00:00:00.000Z",
        }),
      ]),
    ).toBe(1000);
  });

  it("reflects an edited amount: the new amountCents is what counts (no stale state)", () => {
    const before = makeActivity({ type: "expense", amountCents: 1000 });
    const after: Activity = { ...before, amountCents: 400 };
    expect(computeAvailableFunds([after])).toBe(-400);
  });

  it("returns a negative balance when expenses exceed income + deposits", () => {
    expect(
      computeAvailableFunds([
        makeActivity({ id: "a1", type: "income", amountCents: 100 }),
        makeActivity({ id: "a2", type: "deposit", amountCents: 200 }),
        makeActivity({ id: "a3", type: "expense", amountCents: 500 }),
      ]),
    ).toBe(100 + 200 - 500);
  });

  it("stays in the integer-cent domain with no floating-point artifacts (large safe integers)", () => {
    const big = 9_007_199_254_740_991; // Number.MAX_SAFE_INTEGER
    const result = computeAvailableFunds([
      makeActivity({ id: "a1", type: "income", amountCents: big }),
      makeActivity({ id: "a2", type: "expense", amountCents: 1 }),
    ]);
    expect(Number.isSafeInteger(result)).toBe(true);
    expect(result).toBe(big - 1);
  });
});
