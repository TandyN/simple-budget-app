/**
 * simple-budget-app — public API entry point.
 * Placeholder module; will be replaced by the domain core (task #111).
 */

export interface Money {
  /** Amount in integer cents. */
  amountCents: number;
  /** ISO-4217 currency code (e.g. "USD"). */
  currency: string;
}

export interface Activity {
  id: string;
  type: "income" | "expense";
  amount: Money;
  timestamp: string; // ISO-8601 UTC
  tags: string[];
}

/** Create a budget API instance (placeholder). */
export function createBudgetApi() {
  return {
    version: "0.1.0",
  };
}
