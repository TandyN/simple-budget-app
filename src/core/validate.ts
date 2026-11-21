import type {
  Activity,
  ActivityPatch,
  ActivitySource,
  ActivityType,
  BudgetBackup,
  EncryptedBudgetBackup,
  NewActivity,
  NewRule,
  RecurringRule,
  RulePatch,
  RuleType,
  Schedule,
} from "./types";

/** Hard 10 MB byte ceiling (`10 * 1024 * 1024` bytes) for untrusted JSON backup payloads. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** Maximum number of records allowed in `rules` or `activities` arrays within a `BudgetBackup`. */
export const MAX_BACKUP_ARRAY_LENGTH = 100_000;

/** Maximum character length for `id` and `deviceId` fields. */
export const MAX_ID_LENGTH = 64;

/** Maximum character length for `importBatchId`, `externalTxnId`, and `sourceAccountId` fields. */
export const MAX_PROVENANCE_ID_LENGTH = 128;

/** Maximum character length for `RecurringRule.name` and individual `Activity.tags` items. */
export const MAX_NAME_OR_TAG_LENGTH = 120;

/** Maximum number of tags on a single `Activity`. */
export const MAX_TAGS_COUNT = 20;

/** Maximum character length for `Activity.memo`. */
export const MAX_MEMO_LENGTH = 1000;

/** OWASP PBKDF2-HMAC-SHA256 minimum iteration count for Phase 6 encrypted backup envelopes. */
export const MIN_PBKDF2_ITERATIONS = 600_000;

/** CWE-400 CPU DoS upper bound for PBKDF2-HMAC-SHA256 iterations in Phase 6 encrypted backups. */
export const MAX_PBKDF2_ITERATIONS = 5_000_000;

const MAX_DECIMAL_AMOUNT = Number.MAX_SAFE_INTEGER / 100;
const SUB_CENT_TOLERANCE = 1e-6;

const ISO_UTC_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

const PERIOD_RE = /^(\d{4})-(\d{2})$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const SCHEDULE_KEYS = new Set(["cadence", "dayOfMonth"]);

const RECURRING_RULE_KEYS = new Set([
  "id",
  "name",
  "type",
  "amountCents",
  "currency",
  "schedule",
  "active",
  "lastPostPeriod",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deviceId",
]);

const NEW_RULE_KEYS = new Set([
  "name",
  "type",
  "amountCents",
  "currency",
  "schedule",
  "active",
]);

const RULE_PATCH_KEYS = new Set([
  "name",
  "type",
  "amountCents",
  "schedule",
  "active",
]);

const ACTIVITY_KEYS = new Set([
  "id",
  "type",
  "amountCents",
  "currency",
  "dateTime",
  "tags",
  "source",
  "sourceRuleId",
  "period",
  "importBatchId",
  "externalTxnId",
  "sourceAccountId",
  "memo",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deviceId",
]);

const NEW_ACTIVITY_KEYS = new Set([
  "type",
  "amountCents",
  "currency",
  "dateTime",
  "tags",
  "memo",
]);

const ACTIVITY_PATCH_KEYS = new Set([
  "type",
  "amountCents",
  "dateTime",
  "tags",
  "memo",
]);

const BACKUP_ROOT_KEYS = new Set([
  "schemaVersion",
  "exportedAt",
  "rules",
  "activities",
]);

const ENCRYPTED_BACKUP_ROOT_KEYS = new Set([
  "schemaVersion",
  "enc",
  "ciphertext",
]);

const ENCRYPTED_BACKUP_ENC_KEYS = new Set(["alg", "kdf", "iter", "salt", "iv"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively inspects a value and throws if any object contains
 * `__proto__`, `constructor`, or `prototype` as an own property at any depth.
 */
export function assertNoPrototypePollution(
  value: unknown,
  path = "payload",
): void {
  if (typeof value !== "object" || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoPrototypePollution(value[i], `${path}[${i}]`);
    }
    return;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
      throw new Error(
        `Invalid ${path}: forbidden prototype-pollution key "${key}"`,
      );
    }
    assertNoPrototypePollution(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}

function assertAllowedPlainObject(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new Error(`Invalid ${label}: expected a plain object`);
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
      throw new Error(
        `Invalid ${label}: forbidden prototype-pollution key "${key}"`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`Invalid ${label}: unexpected property "${key}"`);
    }
  }

  return value;
}

/**
 * Validates that `amountCents` is a strictly positive safe integer (`1..Number.MAX_SAFE_INTEGER`).
 */
export function validateAmountCents(
  amountCents: unknown,
  fieldName = "amountCents",
): number {
  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error(
      `Invalid ${fieldName}: must be a positive safe integer in minor units (cents)`,
    );
  }
  return amountCents;
}

/**
 * Boundary conversion from a human decimal unit (e.g. `12.34`) to integer cents (`1234`).
 *
 * Enforces `Number.isFinite(decimal) && decimal > 0 && decimal <= Number.MAX_SAFE_INTEGER / 100 &&
 * Number.isInteger(Math.round(decimal * 100))` and rejects sub-cent fractions (e.g. `12.345`).
 */
export function toCents(decimal: number): number {
  const scaled = decimal * 100;
  const rounded = Math.round(scaled);

  if (
    typeof decimal !== "number" ||
    !Number.isFinite(decimal) ||
    decimal <= 0 ||
    decimal > MAX_DECIMAL_AMOUNT ||
    !Number.isInteger(rounded) ||
    Math.abs(scaled - rounded) > SUB_CENT_TOLERANCE
  ) {
    throw new Error(
      "Invalid decimal amount: must be a positive finite number with at most 2 decimal places within safe-integer cent bounds",
    );
  }

  return validateAmountCents(rounded);
}

/**
 * Boundary conversion from integer cents (`1234`) to a decimal unit (`12.34`).
 */
export function fromCents(cents: number): number {
  const validCents = validateAmountCents(cents, "cents");
  return validCents / 100;
}

/**
 * Validates an ISO-8601 UTC timestamp string (`YYYY-MM-DDTHH:mm:ss(.sss)Z`) with a real calendar date.
 */
export function validateIsoUtcTimestamp(
  value: unknown,
  fieldName = "timestamp",
): string {
  if (typeof value !== "string") {
    throw new Error(
      `Invalid ${fieldName}: must be an ISO-8601 UTC timestamp string`,
    );
  }

  const match = ISO_UTC_TIMESTAMP_RE.exec(value);
  if (!match) {
    throw new Error(
      `Invalid ${fieldName}: must match YYYY-MM-DDTHH:mm:ss(.sss)Z`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

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
      `Invalid ${fieldName}: out-of-range calendar or clock component`,
    );
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    throw new Error(
      `Invalid ${fieldName}: day ${day} does not exist in month ${match[1]}-${match[2]}`,
    );
  }

  return value;
}

/**
 * Validates a `"YYYY-MM"` period string with `01 <= MM <= 12`.
 */
export function validatePeriod(value: unknown, fieldName = "period"): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}: must be a YYYY-MM string`);
  }

  const match = PERIOD_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid ${fieldName}: must match YYYY-MM`);
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid ${fieldName}: month must be between 01 and 12`);
  }

  return value;
}

/**
 * Validates a 3-letter uppercase ISO-4217 currency code (e.g. `"USD"`).
 */
export function validateCurrency(
  value: unknown,
  fieldName = "currency",
): string {
  if (typeof value !== "string" || !CURRENCY_RE.test(value)) {
    throw new Error(
      `Invalid ${fieldName}: must be a 3-letter uppercase ISO-4217 code (e.g. "USD")`,
    );
  }
  return value;
}

/**
 * Validates a bounded string field. When `requireNonEmpty` is true (default),
 * rejects empty or whitespace-only strings.
 */
export function validateBoundedString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  requireNonEmpty = true,
): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}: must be a string`);
  }
  if (requireNonEmpty && value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(
      `Invalid ${fieldName}: length must be <= ${maxLength} characters`,
    );
  }
  return value;
}

/**
 * Validates a non-empty identifier (`id` or `deviceId`, `<= 64` chars).
 */
export function validateId(value: unknown, fieldName = "id"): string {
  return validateBoundedString(value, fieldName, MAX_ID_LENGTH, true);
}

/**
 * Validates an optional provenance identifier (`importBatchId`, `externalTxnId`, `sourceAccountId`, `<= 128` chars).
 */
export function validateProvenanceId(
  value: unknown,
  fieldName: string,
): string {
  return validateBoundedString(
    value,
    fieldName,
    MAX_PROVENANCE_ID_LENGTH,
    true,
  );
}

/**
 * Validates `RecurringRule.name` (non-empty string `<= 120` chars).
 */
export function validateRuleName(value: unknown, fieldName = "name"): string {
  return validateBoundedString(value, fieldName, MAX_NAME_OR_TAG_LENGTH, true);
}

/**
 * Validates `Activity.tags` (`<= 20` items, each non-empty `<= 120` chars).
 */
export function validateTags(value: unknown, fieldName = "tags"): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${fieldName}: must be an array of strings`);
  }
  if (value.length > MAX_TAGS_COUNT) {
    throw new Error(
      `Invalid ${fieldName}: must contain <= ${MAX_TAGS_COUNT} tags`,
    );
  }

  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    out.push(
      validateBoundedString(
        value[i],
        `${fieldName}[${i}]`,
        MAX_NAME_OR_TAG_LENGTH,
        true,
      ),
    );
  }
  return out;
}

/**
 * Validates `Activity.memo` (`<= 1000` chars).
 */
export function validateMemo(value: unknown, fieldName = "memo"): string {
  return validateBoundedString(value, fieldName, MAX_MEMO_LENGTH, false);
}

/**
 * Validates `RuleType` (`"income" | "expense"`).
 */
export function validateRuleType(value: unknown, fieldName = "type"): RuleType {
  if (value !== "income" && value !== "expense") {
    throw new Error(`Invalid ${fieldName}: must be "income" or "expense"`);
  }
  return value;
}

/**
 * Validates `ActivityType` (`"income" | "expense" | "deposit"`).
 */
export function validateActivityType(
  value: unknown,
  fieldName = "type",
): ActivityType {
  if (value !== "income" && value !== "expense" && value !== "deposit") {
    throw new Error(
      `Invalid ${fieldName}: must be "income", "expense", or "deposit"`,
    );
  }
  return value;
}

/**
 * Validates `ActivitySource` (`"manual" | "recurring" | "file-import" | "bank-sync"`).
 */
export function validateActivitySource(
  value: unknown,
  fieldName = "source",
): ActivitySource {
  if (
    value !== "manual" &&
    value !== "recurring" &&
    value !== "file-import" &&
    value !== "bank-sync"
  ) {
    throw new Error(
      `Invalid ${fieldName}: must be "manual", "recurring", "file-import", or "bank-sync"`,
    );
  }
  return value;
}

/**
 * Validates a `Schedule` object (`cadence === "monthly"` and integer `dayOfMonth` in `1..31`).
 */
export function validateSchedule(
  value: unknown,
  fieldName = "schedule",
): Schedule {
  const obj = assertAllowedPlainObject(value, SCHEDULE_KEYS, fieldName);

  if (obj.cadence !== "monthly") {
    throw new Error(`Invalid ${fieldName}.cadence: must be "monthly"`);
  }

  const dayOfMonth = obj.dayOfMonth;
  if (
    typeof dayOfMonth !== "number" ||
    !Number.isSafeInteger(dayOfMonth) ||
    dayOfMonth < 1 ||
    dayOfMonth > 31
  ) {
    throw new Error(
      `Invalid ${fieldName}.dayOfMonth: must be an integer between 1 and 31`,
    );
  }

  return {
    cadence: "monthly",
    dayOfMonth,
  };
}

/**
 * Validates a full `RecurringRule` entity and returns a clean plain object copy.
 */
export function validateRecurringRule(
  value: unknown,
  label = "RecurringRule",
): RecurringRule {
  const obj = assertAllowedPlainObject(value, RECURRING_RULE_KEYS, label);

  const id = validateId(obj.id, `${label}.id`);
  const name = validateRuleName(obj.name, `${label}.name`);
  const type = validateRuleType(obj.type, `${label}.type`);
  const amountCents = validateAmountCents(
    obj.amountCents,
    `${label}.amountCents`,
  );
  const currency = validateCurrency(obj.currency, `${label}.currency`);
  const schedule = validateSchedule(obj.schedule, `${label}.schedule`);

  if (typeof obj.active !== "boolean") {
    throw new Error(`Invalid ${label}.active: must be a boolean`);
  }

  let lastPostPeriod: string | null;
  if (obj.lastPostPeriod === null) {
    lastPostPeriod = null;
  } else if (obj.lastPostPeriod !== undefined) {
    lastPostPeriod = validatePeriod(
      obj.lastPostPeriod,
      `${label}.lastPostPeriod`,
    );
  } else {
    throw new Error(
      `Invalid ${label}.lastPostPeriod: must be a YYYY-MM string or null`,
    );
  }

  const createdAt = validateIsoUtcTimestamp(
    obj.createdAt,
    `${label}.createdAt`,
  );
  const updatedAt = validateIsoUtcTimestamp(
    obj.updatedAt,
    `${label}.updatedAt`,
  );

  const rule: RecurringRule = {
    id,
    name,
    type,
    amountCents,
    currency,
    schedule,
    active: obj.active,
    lastPostPeriod,
    createdAt,
    updatedAt,
  };

  if (obj.deletedAt !== undefined) {
    rule.deletedAt = validateIsoUtcTimestamp(
      obj.deletedAt,
      `${label}.deletedAt`,
    );
  }
  if (obj.deviceId !== undefined) {
    rule.deviceId = validateId(obj.deviceId, `${label}.deviceId`);
  }

  return rule;
}

/**
 * Validates a `NewRule` creation input and returns a clean plain object copy.
 */
export function validateNewRule(value: unknown, label = "NewRule"): NewRule {
  const obj = assertAllowedPlainObject(value, NEW_RULE_KEYS, label);

  const name = validateRuleName(obj.name, `${label}.name`);
  const type = validateRuleType(obj.type, `${label}.type`);
  const amountCents = validateAmountCents(
    obj.amountCents,
    `${label}.amountCents`,
  );

  const out: NewRule = {
    name,
    type,
    amountCents,
  };

  if (obj.currency !== undefined) {
    out.currency = validateCurrency(obj.currency, `${label}.currency`);
  }
  if (obj.schedule !== undefined) {
    out.schedule = validateSchedule(obj.schedule, `${label}.schedule`);
  }
  if (obj.active !== undefined) {
    if (typeof obj.active !== "boolean") {
      throw new Error(`Invalid ${label}.active: must be a boolean`);
    }
    out.active = obj.active;
  }

  return out;
}

/**
 * Validates a `RulePatch` partial update payload (user-editable fields only).
 */
export function validateRulePatch(
  value: unknown,
  label = "RulePatch",
): RulePatch {
  const obj = assertAllowedPlainObject(value, RULE_PATCH_KEYS, label);
  const out: RulePatch = {};

  if (obj.name !== undefined) {
    out.name = validateRuleName(obj.name, `${label}.name`);
  }
  if (obj.type !== undefined) {
    out.type = validateRuleType(obj.type, `${label}.type`);
  }
  if (obj.amountCents !== undefined) {
    out.amountCents = validateAmountCents(
      obj.amountCents,
      `${label}.amountCents`,
    );
  }
  if (obj.schedule !== undefined) {
    out.schedule = validateSchedule(obj.schedule, `${label}.schedule`);
  }
  if (obj.active !== undefined) {
    if (typeof obj.active !== "boolean") {
      throw new Error(`Invalid ${label}.active: must be a boolean`);
    }
    out.active = obj.active;
  }

  return out;
}

/**
 * Validates a full `Activity` entity and returns a clean plain object copy.
 */
export function validateActivity(value: unknown, label = "Activity"): Activity {
  const obj = assertAllowedPlainObject(value, ACTIVITY_KEYS, label);

  const id = validateId(obj.id, `${label}.id`);
  const type = validateActivityType(obj.type, `${label}.type`);
  const amountCents = validateAmountCents(
    obj.amountCents,
    `${label}.amountCents`,
  );
  const currency = validateCurrency(obj.currency, `${label}.currency`);
  const dateTime = validateIsoUtcTimestamp(obj.dateTime, `${label}.dateTime`);
  const tags = validateTags(obj.tags, `${label}.tags`);
  const source = validateActivitySource(obj.source, `${label}.source`);
  const createdAt = validateIsoUtcTimestamp(
    obj.createdAt,
    `${label}.createdAt`,
  );
  const updatedAt = validateIsoUtcTimestamp(
    obj.updatedAt,
    `${label}.updatedAt`,
  );

  const activity: Activity = {
    id,
    type,
    amountCents,
    currency,
    dateTime,
    tags,
    source,
    createdAt,
    updatedAt,
  };

  if (source === "recurring") {
    if (obj.sourceRuleId === undefined) {
      throw new Error(
        `Invalid ${label}.sourceRuleId: required when source === "recurring"`,
      );
    }
    if (obj.period === undefined) {
      throw new Error(
        `Invalid ${label}.period: required when source === "recurring"`,
      );
    }
  }

  if (obj.sourceRuleId !== undefined) {
    activity.sourceRuleId = validateId(
      obj.sourceRuleId,
      `${label}.sourceRuleId`,
    );
  }
  if (obj.period !== undefined) {
    activity.period = validatePeriod(obj.period, `${label}.period`);
  }
  if (obj.importBatchId !== undefined) {
    activity.importBatchId = validateProvenanceId(
      obj.importBatchId,
      `${label}.importBatchId`,
    );
  }
  if (obj.externalTxnId !== undefined) {
    activity.externalTxnId = validateProvenanceId(
      obj.externalTxnId,
      `${label}.externalTxnId`,
    );
  }
  if (obj.sourceAccountId !== undefined) {
    activity.sourceAccountId = validateProvenanceId(
      obj.sourceAccountId,
      `${label}.sourceAccountId`,
    );
  }
  if (obj.memo !== undefined) {
    activity.memo = validateMemo(obj.memo, `${label}.memo`);
  }
  if (obj.deletedAt !== undefined) {
    activity.deletedAt = validateIsoUtcTimestamp(
      obj.deletedAt,
      `${label}.deletedAt`,
    );
  }
  if (obj.deviceId !== undefined) {
    activity.deviceId = validateId(obj.deviceId, `${label}.deviceId`);
  }

  return activity;
}

/**
 * Validates a `NewActivity` creation input and returns a clean plain object copy.
 */
export function validateNewActivity(
  value: unknown,
  label = "NewActivity",
): NewActivity {
  const obj = assertAllowedPlainObject(value, NEW_ACTIVITY_KEYS, label);

  const type = validateActivityType(obj.type, `${label}.type`);
  const amountCents = validateAmountCents(
    obj.amountCents,
    `${label}.amountCents`,
  );

  const out: NewActivity = {
    type,
    amountCents,
  };

  if (obj.currency !== undefined) {
    out.currency = validateCurrency(obj.currency, `${label}.currency`);
  }
  if (obj.dateTime !== undefined) {
    out.dateTime = validateIsoUtcTimestamp(obj.dateTime, `${label}.dateTime`);
  }
  if (obj.tags !== undefined) {
    out.tags = validateTags(obj.tags, `${label}.tags`);
  }
  if (obj.memo !== undefined) {
    out.memo = validateMemo(obj.memo, `${label}.memo`);
  }

  return out;
}

/**
 * Validates an `ActivityPatch` partial update payload (user-editable fields only).
 */
export function validateActivityPatch(
  value: unknown,
  label = "ActivityPatch",
): ActivityPatch {
  const obj = assertAllowedPlainObject(value, ACTIVITY_PATCH_KEYS, label);
  const out: ActivityPatch = {};

  if (obj.type !== undefined) {
    out.type = validateActivityType(obj.type, `${label}.type`);
  }
  if (obj.amountCents !== undefined) {
    out.amountCents = validateAmountCents(
      obj.amountCents,
      `${label}.amountCents`,
    );
  }
  if (obj.dateTime !== undefined) {
    out.dateTime = validateIsoUtcTimestamp(obj.dateTime, `${label}.dateTime`);
  }
  if (obj.tags !== undefined) {
    out.tags = validateTags(obj.tags, `${label}.tags`);
  }
  if (obj.memo !== undefined) {
    out.memo = validateMemo(obj.memo, `${label}.memo`);
  }

  return out;
}

/**
 * Hardened validator for untrusted `BudgetBackup` JSON strings (`project-plan/data-model.md`).
 *
 * 1. Enforces the 10 MB hard byte ceiling (`<= 10,485,760` bytes) BEFORE calling `JSON.parse`.
 * 2. Rejects `__proto__`, `constructor`, or `prototype` keys at any nesting depth via `JSON.parse` reviver
 *    and recursive own-property inspection.
 * 3. Validates top-level `schemaVersion === 1`, ISO-8601 UTC `exportedAt`, and `<= 100_000` array bounds.
 * 4. Validates every `RecurringRule` and `Activity`, rejects duplicate IDs within `rules` or `activities`,
 *    and enforces single-currency consistency across all records.
 */
export function validateBackupPayload(rawJson: string): BudgetBackup {
  if (typeof rawJson !== "string") {
    throw new Error("Invalid backup payload: rawJson must be a JSON string");
  }

  const byteLength = new TextEncoder().encode(rawJson).byteLength;
  if (byteLength > MAX_BACKUP_BYTES) {
    throw new Error(
      `Invalid backup payload: size ${byteLength} bytes exceeds 10 MB ceiling (${MAX_BACKUP_BYTES} bytes)`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson, (key, val) => {
      if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
        throw new Error(`Forbidden prototype-pollution key "${key}"`);
      }
      return val;
    });
  } catch (err) {
    throw new Error(`Invalid backup payload JSON: ${(err as Error).message}`);
  }

  assertNoPrototypePollution(parsed, "backup");

  const root = assertAllowedPlainObject(parsed, BACKUP_ROOT_KEYS, "backup");

  if (root.schemaVersion !== 1) {
    throw new Error(
      `Invalid backup.schemaVersion: expected 1, got ${String(root.schemaVersion)}`,
    );
  }

  const exportedAt = validateIsoUtcTimestamp(
    root.exportedAt,
    "backup.exportedAt",
  );

  if (!Array.isArray(root.rules)) {
    throw new Error("Invalid backup.rules: must be an array");
  }
  if (root.rules.length > MAX_BACKUP_ARRAY_LENGTH) {
    throw new Error(
      `Invalid backup.rules: length ${root.rules.length} exceeds cap (${MAX_BACKUP_ARRAY_LENGTH})`,
    );
  }

  if (!Array.isArray(root.activities)) {
    throw new Error("Invalid backup.activities: must be an array");
  }
  if (root.activities.length > MAX_BACKUP_ARRAY_LENGTH) {
    throw new Error(
      `Invalid backup.activities: length ${root.activities.length} exceeds cap (${MAX_BACKUP_ARRAY_LENGTH})`,
    );
  }

  const ruleIds = new Set<string>();
  const rules: RecurringRule[] = [];
  let expectedCurrency: string | null = null;

  for (let i = 0; i < root.rules.length; i += 1) {
    const rule = validateRecurringRule(root.rules[i], `backup.rules[${i}]`);
    if (ruleIds.has(rule.id)) {
      throw new Error(
        `Invalid backup.rules[${i}]: duplicate rule id "${rule.id}"`,
      );
    }
    ruleIds.add(rule.id);

    if (expectedCurrency === null) {
      expectedCurrency = rule.currency;
    } else if (rule.currency !== expectedCurrency) {
      throw new Error(
        `Invalid backup.rules[${i}].currency: mixed currencies not allowed (expected "${expectedCurrency}", got "${rule.currency}")`,
      );
    }

    rules.push(rule);
  }

  const activityIds = new Set<string>();
  const activities: Activity[] = [];

  for (let i = 0; i < root.activities.length; i += 1) {
    const activity = validateActivity(
      root.activities[i],
      `backup.activities[${i}]`,
    );
    if (activityIds.has(activity.id)) {
      throw new Error(
        `Invalid backup.activities[${i}]: duplicate activity id "${activity.id}"`,
      );
    }
    activityIds.add(activity.id);

    if (expectedCurrency === null) {
      expectedCurrency = activity.currency;
    } else if (activity.currency !== expectedCurrency) {
      throw new Error(
        `Invalid backup.activities[${i}].currency: mixed currencies not allowed (expected "${expectedCurrency}", got "${activity.currency}")`,
      );
    }

    activities.push(activity);
  }

  return {
    schemaVersion: 1,
    exportedAt,
    rules,
    activities,
  };
}

/**
 * Validates the Phase 6 `EncryptedBudgetBackup` envelope header before running WebCrypto PBKDF2
 * (`project-plan/data-model.md` → Post-MVP Encrypted Backup Envelope).
 *
 * Enforces `enc.alg === "AES-256-GCM"`, `enc.kdf === "PBKDF2-HMAC-SHA256"`, and integer
 * `enc.iter` in `[600_000, 5_000_000]` to prevent CWE-400 CPU resource exhaustion.
 */
export function validateEncryptedBackupEnvelope(
  value: unknown,
  label = "EncryptedBudgetBackup",
): EncryptedBudgetBackup {
  assertNoPrototypePollution(value, label);
  const root = assertAllowedPlainObject(
    value,
    ENCRYPTED_BACKUP_ROOT_KEYS,
    label,
  );

  if (root.schemaVersion !== 1) {
    throw new Error(
      `Invalid ${label}.schemaVersion: expected 1, got ${String(root.schemaVersion)}`,
    );
  }

  const enc = assertAllowedPlainObject(
    root.enc,
    ENCRYPTED_BACKUP_ENC_KEYS,
    `${label}.enc`,
  );

  if (enc.alg !== "AES-256-GCM") {
    throw new Error(`Invalid ${label}.enc.alg: must be "AES-256-GCM"`);
  }
  if (enc.kdf !== "PBKDF2-HMAC-SHA256") {
    throw new Error(`Invalid ${label}.enc.kdf: must be "PBKDF2-HMAC-SHA256"`);
  }

  const iter = enc.iter;
  if (
    typeof iter !== "number" ||
    !Number.isSafeInteger(iter) ||
    iter < MIN_PBKDF2_ITERATIONS ||
    iter > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error(
      `Invalid ${label}.enc.iter: must be an integer between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`,
    );
  }

  const salt = validateBoundedString(enc.salt, `${label}.enc.salt`, 256, true);
  const iv = validateBoundedString(enc.iv, `${label}.enc.iv`, 256, true);
  const ciphertext = validateBoundedString(
    root.ciphertext,
    `${label}.ciphertext`,
    MAX_BACKUP_BYTES,
    true,
  );

  return {
    schemaVersion: 1,
    enc: {
      alg: "AES-256-GCM",
      kdf: "PBKDF2-HMAC-SHA256",
      iter,
      salt,
      iv,
    },
    ciphertext,
  };
}
