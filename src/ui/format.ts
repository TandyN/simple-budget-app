/**
 * Budget UI display formatting and input-boundary helpers (`src/ui/format.ts`).
 *
 * Zero production dependencies (`project-plan/dependency-strategy.md`): uses
 * only built-in Web-platform `Intl` / `Date` APIs and canonical validators from
 * `src/core/validate.ts`.
 *
 * Integer-cent money boundary (`project-plan/data-model.md`):
 * - `formatCents` converts canonical integer cents (positive, zero, or negative)
 *   to a localized currency string strictly at the display boundary via
 *   `Intl.NumberFormat` without performing floating-point business math.
 * - `formatCentsForInput` formats canonical integer cents as a fixed 2-decimal
 *   input string using exact integer arithmetic (`%` + exact division) so large
 *   safe-integer cent values never suffer float64 precision loss.
 * - `parseDecimalInputToCents` validates user decimal text input and delegates
 *   to `toCents` in `src/core/validate.ts` so `Number.MAX_SAFE_INTEGER / 100`
 *   bounds and sub-cent rejections stay canonical.
 */

import {
  toCents,
  validateCurrency,
  validateIsoUtcTimestamp,
} from "../core/validate";

const POSITIVE_DECIMAL_INPUT_RE = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const DATETIME_LOCAL_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Formats an integer-cent amount (positive, zero, or negative — e.g. negative
 * Available Funds) as a localized currency string at the display boundary via
 * `Intl.NumberFormat`.
 *
 * @param amountCents signed safe integer in minor units (cents)
 * @param currency 3-letter uppercase ISO-4217 currency code (default `"USD"`)
 * @param locale optional BCP 47 locale tag passed to `Intl.NumberFormat`
 */
export function formatCents(
  amountCents: number,
  currency = "USD",
  locale?: string,
): string {
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents)) {
    throw new Error(
      "Invalid amountCents: must be a safe integer in minor units (cents)",
    );
  }
  const validCurrency = validateCurrency(currency, "currency");
  const normalizedUnits = amountCents === 0 ? 0 : amountCents / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: validCurrency,
  }).format(normalizedUnits);
}

/**
 * Formats an integer-cent amount as a fixed 2-decimal input string
 * (e.g. `1234` -> `"12.34"`, `-50` -> `"-0.50"`) using exact integer
 * arithmetic (`%` and exact multiple-of-100 division) to avoid float64
 * precision loss for large safe-integer cent values.
 *
 * @param amountCents signed safe integer in minor units (cents)
 */
export function formatCentsForInput(amountCents: number): string {
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents)) {
    throw new Error(
      "Invalid amountCents: must be a safe integer in minor units (cents)",
    );
  }
  const abs = Math.abs(amountCents);
  const remainder = abs % 100;
  const whole = (abs - remainder) / 100;
  const frac = String(remainder).padStart(2, "0");
  return `${amountCents < 0 ? "-" : ""}${whole}.${frac}`;
}

/**
 * Parses a user-entered positive decimal string (e.g. `"12.34"`, `"5"`, `".50"`)
 * into canonical integer cents.
 *
 * Rejects empty strings, negative or signed values, non-numeric text,
 * scientific notation, and values with more than 2 fractional digits, then
 * delegates to `toCents` from `src/core/validate.ts` to enforce positivity and
 * the `Number.MAX_SAFE_INTEGER / 100` upper bound.
 */
export function parseDecimalInputToCents(raw: string): number {
  const trimmed = raw.trim();
  if (!POSITIVE_DECIMAL_INPUT_RE.test(trimmed)) {
    throw new Error(
      "Invalid amount: enter a positive number with at most 2 decimal places",
    );
  }

  return toCents(Number(trimmed));
}

/**
 * Formats a stored ISO-8601 UTC `dateTime` string in the user's local timezone
 * via `Intl.DateTimeFormat` without mutating the stored UTC instant.
 *
 * @param isoUtc canonical ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ss(.sss)Z`)
 * @param locale optional BCP 47 locale tag passed to `Intl.DateTimeFormat`
 */
export function formatLocalDateTime(isoUtc: string, locale?: string): string {
  const validIso = validateIsoUtcTimestamp(isoUtc, "dateTime");
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(validIso));
}

/**
 * Converts a stored ISO-8601 UTC timestamp into a local-time
 * `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`).
 */
export function toDateTimeLocalInputValue(isoUtc: string): string {
  const validIso = validateIsoUtcTimestamp(isoUtc, "dateTime");
  const date = new Date(validIso);

  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Converts a local-time `<input type="datetime-local">` value
 * (`YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss`) into a canonical ISO-8601 UTC
 * timestamp string (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
export function fromDateTimeLocalInputValue(localValue: string): string {
  const trimmed = localValue.trim();
  const match = DATETIME_LOCAL_INPUT_RE.exec(trimmed);
  if (!match) {
    throw new Error("Invalid local date/time: must match YYYY-MM-DDTHH:mm");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(
      "Invalid local date/time: out-of-range calendar or clock component",
    );
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    throw new Error(
      `Invalid local date/time: day ${day} does not exist in month ${match[1]}-${match[2]}`,
    );
  }

  const localDate = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    !Number.isFinite(localDate.getTime()) ||
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    throw new Error("Invalid local date/time: unable to resolve calendar date");
  }

  return localDate.toISOString();
}

/**
 * Parses comma-separated free-form tags: trims whitespace, drops empty entries,
 * and deduplicates preserving first-seen order.
 */
export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

/**
 * Formats an array of tags into a clean comma-separated input string, trimming
 * whitespace, dropping empty entries, and deduplicating preserving order.
 */
export function formatTagsInput(tags: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out.join(", ");
}
