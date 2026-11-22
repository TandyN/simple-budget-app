import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatCentsForInput,
  formatLocalDateTime,
  formatTagsInput,
  fromDateTimeLocalInputValue,
  parseDecimalInputToCents,
  parseTagsInput,
  toDateTimeLocalInputValue,
} from "./format";

describe("formatCents", () => {
  it("formats positive, zero, and negative integer cents at the display boundary", () => {
    expect(formatCents(1234, "USD", "en-US")).toBe("$12.34");
    expect(formatCents(0, "USD", "en-US")).toBe("$0.00");
    expect(formatCents(-0, "USD", "en-US")).toBe("$0.00");
    expect(formatCents(-5432, "USD", "en-US")).toBe("-$54.32");
    expect(formatCents(123_456_789, "USD", "en-US")).toBe("$1,234,567.89");
  });

  it("defaults currency to USD and supports custom ISO-4217 currencies and locales", () => {
    const expectedUsd = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(10);
    expect(formatCents(1000)).toBe(expectedUsd);

    const expectedEur = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(25.5);
    expect(formatCents(2550, "EUR", "de-DE")).toBe(expectedEur);
  });

  it("rejects non-integer, unsafe-integer, or invalid currency inputs", () => {
    expect(() => formatCents(12.5)).toThrow(/safe integer/i);
    expect(() => formatCents(Number.NaN)).toThrow(/safe integer/i);
    expect(() => formatCents(Number.POSITIVE_INFINITY)).toThrow(
      /safe integer/i,
    );
    expect(() => formatCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe integer/i,
    );
    expect(() => formatCents(100, "usd")).toThrow(/currency/i);
    expect(() => formatCents(100, "US")).toThrow(/currency/i);
  });
});

describe("formatCentsForInput", () => {
  it("formats positive, zero, sub-dollar, and negative integer cents with exact 2 decimals", () => {
    expect(formatCentsForInput(0)).toBe("0.00");
    expect(formatCentsForInput(-0)).toBe("0.00");
    expect(formatCentsForInput(1)).toBe("0.01");
    expect(formatCentsForInput(5)).toBe("0.05");
    expect(formatCentsForInput(50)).toBe("0.50");
    expect(formatCentsForInput(1234)).toBe("12.34");
    expect(formatCentsForInput(-50)).toBe("-0.50");
    expect(formatCentsForInput(-1234)).toBe("-12.34");
  });

  it("preserves exact precision near Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER", () => {
    expect(formatCentsForInput(Number.MAX_SAFE_INTEGER)).toBe(
      "90071992547409.91",
    );
    expect(formatCentsForInput(Number.MAX_SAFE_INTEGER - 1)).toBe(
      "90071992547409.90",
    );
    expect(formatCentsForInput(Number.MIN_SAFE_INTEGER)).toBe(
      "-90071992547409.91",
    );
    expect(
      parseDecimalInputToCents(formatCentsForInput(Number.MAX_SAFE_INTEGER)),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects non-integer or unsafe-integer inputs", () => {
    expect(() => formatCentsForInput(12.5)).toThrow(/safe integer/i);
    expect(() => formatCentsForInput(Number.NaN)).toThrow(/safe integer/i);
    expect(() => formatCentsForInput(Number.POSITIVE_INFINITY)).toThrow(
      /safe integer/i,
    );
    expect(() => formatCentsForInput(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe integer/i,
    );
  });
});

describe("parseDecimalInputToCents", () => {
  it("parses valid positive decimal strings into canonical integer cents", () => {
    expect(parseDecimalInputToCents("5")).toBe(500);
    expect(parseDecimalInputToCents("12.3")).toBe(1230);
    expect(parseDecimalInputToCents("12.34")).toBe(1234);
    expect(parseDecimalInputToCents("0.01")).toBe(1);
    expect(parseDecimalInputToCents("0.50")).toBe(50);
    expect(parseDecimalInputToCents(".5")).toBe(50);
    expect(parseDecimalInputToCents(".05")).toBe(5);
    expect(parseDecimalInputToCents("  42.99  ")).toBe(4299);
    expect(parseDecimalInputToCents("90071992547409.91")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects empty, zero, negative, non-numeric, sub-cent, and overflow inputs", () => {
    const invalidInputs = [
      "",
      "   ",
      "0",
      "0.00",
      "-5",
      "-0.01",
      "+5",
      "12.345",
      "0.001",
      "12.",
      ".",
      "abc",
      "$12.34",
      "1,000.00",
      "1e2",
      "NaN",
      "Infinity",
      "90071992547409.92",
      "999999999999999999",
    ];
    for (const raw of invalidInputs) {
      expect(() => parseDecimalInputToCents(raw)).toThrow();
    }
  });
});

describe("formatLocalDateTime", () => {
  it("renders a UTC timestamp in the local timezone via Intl.DateTimeFormat", () => {
    const iso = "2026-04-15T12:00:00.000Z";
    const expected = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

    expect(formatLocalDateTime(iso, "en-US")).toBe(expected);
    expect(formatLocalDateTime("2026-04-15T12:00:00Z", "en-US")).toBe(expected);
  });

  it("rejects invalid or non-UTC timestamps", () => {
    expect(() => formatLocalDateTime("2026-04-15")).toThrow(/dateTime/i);
    expect(() => formatLocalDateTime("2026-04-15T12:00:00+02:00")).toThrow(
      /dateTime/i,
    );
    expect(() => formatLocalDateTime("2026-02-30T12:00:00Z")).toThrow(
      /dateTime/i,
    );
  });
});

describe("toDateTimeLocalInputValue / fromDateTimeLocalInputValue", () => {
  it("round-trips ISO-8601 UTC timestamps through local datetime-local values", () => {
    const iso = "2026-04-15T14:30:00.000Z";
    const localValue = toDateTimeLocalInputValue(iso);
    expect(localValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocalInputValue(localValue)).toBe(iso);
  });

  it("supports optional seconds and surrounding whitespace in fromDateTimeLocalInputValue", () => {
    const iso = fromDateTimeLocalInputValue("  2026-06-10T09:15:45  ");
    const expected = new Date(2026, 5, 10, 9, 15, 45, 0).toISOString();
    expect(iso).toBe(expected);
  });

  it("rejects invalid UTC input to toDateTimeLocalInputValue", () => {
    expect(() => toDateTimeLocalInputValue("not-a-timestamp")).toThrow(
      /dateTime/i,
    );
  });

  it("rejects malformed or impossible calendar dates in fromDateTimeLocalInputValue", () => {
    const invalidInputs = [
      "",
      "2026-04-15",
      "2026-04-15T14:30:00Z",
      "2026-13-01T10:00",
      "2026-00-01T10:00",
      "2026-04-15T24:00",
      "2026-04-15T10:60",
      "2026-02-29T10:00",
      "2026-04-31T10:00",
    ];
    for (const raw of invalidInputs) {
      expect(() => fromDateTimeLocalInputValue(raw)).toThrow();
    }
  });
});

describe("parseTagsInput / formatTagsInput", () => {
  it("splits comma-separated tags, trims whitespace, drops empty items, and deduplicates preserving order", () => {
    expect(parseTagsInput(" groceries , dining, groceries, , coffee ")).toEqual(
      ["groceries", "dining", "coffee"],
    );
    expect(parseTagsInput(" , ,  ")).toEqual([]);
    expect(parseTagsInput("")).toEqual([]);
    expect(parseTagsInput("Food, food")).toEqual(["Food", "food"]);
  });

  it("formats tag arrays into a clean comma-separated string and round-trips", () => {
    expect(formatTagsInput(["groceries", "dining", "coffee"])).toBe(
      "groceries, dining, coffee",
    );
    expect(formatTagsInput([" a ", "", "b", "a"])).toBe("a, b");
    expect(formatTagsInput([])).toBe("");

    const tags = parseTagsInput("rent, utilities, internet");
    expect(parseTagsInput(formatTagsInput(tags))).toEqual(tags);
  });
});
