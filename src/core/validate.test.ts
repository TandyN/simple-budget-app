import { describe, expect, it, vi } from "vitest";
import type {
  Activity,
  ActivityFilter,
  ActivityPatch,
  ActivitySearchFilter,
  BudgetBackup,
  EncryptedBudgetBackup,
  NewActivity,
  NewRule,
  RecurringRule,
  RulePatch,
  TagSummary,
} from "./types";
import {
  assertNoPrototypePollution,
  fromCents,
  MAX_BACKUP_ARRAY_LENGTH,
  MAX_BACKUP_BYTES,
  MAX_ID_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_NAME_OR_TAG_LENGTH,
  MAX_PBKDF2_ITERATIONS,
  MAX_PROVENANCE_ID_LENGTH,
  MAX_TAGS_COUNT,
  MIN_PBKDF2_ITERATIONS,
  toCents,
  validateActivity,
  validateActivityPatch,
  validateActivitySource,
  validateActivityType,
  validateAmountCents,
  validateBackupPayload,
  validateBoundedString,
  validateCurrency,
  validateEncryptedBackupEnvelope,
  validateId,
  validateIsoUtcTimestamp,
  validateMemo,
  validateNewActivity,
  validateNewRule,
  validatePeriod,
  validateProvenanceId,
  validateRecurringRule,
  validateRuleName,
  validateRulePatch,
  validateRuleType,
  validateSchedule,
  validateTags,
} from "./validate";

const VALID_RULE: RecurringRule = {
  id: "rule-1",
  name: "Monthly Salary",
  type: "income",
  amountCents: 500_000,
  currency: "USD",
  schedule: {
    cadence: "monthly",
    dayOfMonth: 1,
  },
  active: true,
  lastPostPeriod: null,
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
};

const VALID_MANUAL_ACTIVITY: Activity = {
  id: "act-1",
  type: "expense",
  amountCents: 4250,
  currency: "USD",
  dateTime: "2026-11-05T18:30:00.000Z",
  tags: ["groceries", "food"],
  source: "manual",
  memo: "Weekly market run",
  createdAt: "2026-11-05T18:30:00.000Z",
  updatedAt: "2026-11-05T18:30:00.000Z",
};

const VALID_RECURRING_ACTIVITY: Activity = {
  id: "act-2",
  type: "income",
  amountCents: 500_000,
  currency: "USD",
  dateTime: "2026-11-01T12:00:00.000Z",
  tags: [],
  source: "recurring",
  sourceRuleId: "rule-1",
  period: "2026-11",
  memo: "Auto-posted: Monthly Salary",
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
};

describe("types compile-time contracts", () => {
  it("supports ActivityFilter alias and TagSummary shapes", () => {
    const searchFilter: ActivitySearchFilter = {
      since: "2026-01-01T00:00:00Z",
      until: "2026-12-31T23:59:59Z",
      tag: "groceries",
      type: "expense",
    };
    const listFilter: ActivityFilter = searchFilter;
    const summary: TagSummary = {
      tag: "groceries",
      totalInCents: 0,
      totalOutCents: 4250,
    };

    expect(listFilter.tag).toBe("groceries");
    expect(summary.totalOutCents).toBe(4250);
  });
});

describe("money boundary & integer-cent guards (toCents / fromCents / validateAmountCents)", () => {
  it("converts valid decimal amounts to integer cents and back", () => {
    expect(toCents(0.01)).toBe(1);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(5000)).toBe(500_000);
    expect(toCents(Number.MAX_SAFE_INTEGER / 100)).toBe(
      Number.MAX_SAFE_INTEGER,
    );

    expect(fromCents(1)).toBe(0.01);
    expect(fromCents(1234)).toBe(12.34);
    expect(fromCents(500_000)).toBe(5000);
    expect(fromCents(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER / 100,
    );
  });

  it("rejects 0, negative numbers, NaN, Infinity, sub-cent fractions, and > MAX_SAFE_INTEGER / 100 in toCents", () => {
    expect(() => toCents(0)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(-0)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(-12.34)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(Number.NaN)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(
      /Invalid decimal amount/,
    );
    expect(() => toCents(Number.NEGATIVE_INFINITY)).toThrow(
      /Invalid decimal amount/,
    );
    expect(() => toCents(12.345)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(0.001)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(0.004)).toThrow(/Invalid decimal amount/);
    // Closes the Number.isInteger(1e23) overflow gap from data-model.md
    expect(() => toCents(1e21)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(1e23)).toThrow(/Invalid decimal amount/);
    expect(() => toCents(Number.MAX_SAFE_INTEGER / 100 + 1)).toThrow(
      /Invalid decimal amount/,
    );
    expect(() => toCents("12.34" as unknown as number)).toThrow(
      /Invalid decimal amount/,
    );
  });

  it("validates strictly positive safe-integer amountCents and rejects non-integers or out-of-range values", () => {
    expect(validateAmountCents(1)).toBe(1);
    expect(validateAmountCents(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );

    expect(() => validateAmountCents(0)).toThrow(/Invalid amountCents/);
    expect(() => validateAmountCents(-100)).toThrow(/Invalid amountCents/);
    expect(() => validateAmountCents(12.34)).toThrow(/Invalid amountCents/);
    expect(() => validateAmountCents(Number.NaN)).toThrow(
      /Invalid amountCents/,
    );
    expect(() => validateAmountCents(Number.POSITIVE_INFINITY)).toThrow(
      /Invalid amountCents/,
    );
    expect(() => validateAmountCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /Invalid amountCents/,
    );
    expect(() => validateAmountCents(1e23)).toThrow(/Invalid amountCents/);
    expect(() => validateAmountCents("100")).toThrow(/Invalid amountCents/);
    expect(() => fromCents(0)).toThrow(/Invalid cents/);
    expect(() => fromCents(12.5)).toThrow(/Invalid cents/);
  });
});

describe("timestamp, period, currency, and bounded string/tag validators", () => {
  it("validates ISO-8601 UTC timestamps with real calendar dates", () => {
    expect(validateIsoUtcTimestamp("2026-11-01T12:00:00Z")).toBe(
      "2026-11-01T12:00:00Z",
    );
    expect(validateIsoUtcTimestamp("2026-11-01T12:00:00.000Z")).toBe(
      "2026-11-01T12:00:00.000Z",
    );
    expect(validateIsoUtcTimestamp("2024-02-29T23:59:59.99Z")).toBe(
      "2024-02-29T23:59:59.99Z",
    );

    expect(() => validateIsoUtcTimestamp(123)).toThrow(
      /must be an ISO-8601 UTC timestamp string/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-01")).toThrow(
      /must match YYYY-MM-DDTHH:mm:ss/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-01T12:00:00+00:00")).toThrow(
      /must match YYYY-MM-DDTHH:mm:ss/,
    );
    expect(() => validateIsoUtcTimestamp("2026-00-01T12:00:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-13-01T12:00:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-00T12:00:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-32T12:00:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-01T24:00:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-01T12:60:00Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    expect(() => validateIsoUtcTimestamp("2026-11-01T12:00:60Z")).toThrow(
      /out-of-range calendar or clock component/,
    );
    // Non-leap Feb 29 and Apr 31 calendar checks
    expect(() => validateIsoUtcTimestamp("2026-02-29T12:00:00Z")).toThrow(
      /day 29 does not exist in month 2026-02/,
    );
    expect(() => validateIsoUtcTimestamp("2026-04-31T12:00:00Z")).toThrow(
      /day 31 does not exist in month 2026-04/,
    );
  });

  it("validates YYYY-MM period strings", () => {
    expect(validatePeriod("2026-01")).toBe("2026-01");
    expect(validatePeriod("2026-12")).toBe("2026-12");

    expect(() => validatePeriod(202611)).toThrow(/must be a YYYY-MM string/);
    expect(() => validatePeriod("2026-1")).toThrow(/must match YYYY-MM/);
    expect(() => validatePeriod("2026-00")).toThrow(
      /month must be between 01 and 12/,
    );
    expect(() => validatePeriod("2026-13")).toThrow(
      /month must be between 01 and 12/,
    );
  });

  it("validates 3-letter uppercase ISO-4217 currency codes", () => {
    expect(validateCurrency("USD")).toBe("USD");
    expect(validateCurrency("EUR")).toBe("EUR");

    expect(() => validateCurrency("usd")).toThrow(/3-letter uppercase/);
    expect(() => validateCurrency("US")).toThrow(/3-letter uppercase/);
    expect(() => validateCurrency("USDT")).toThrow(/3-letter uppercase/);
    expect(() => validateCurrency(840)).toThrow(/3-letter uppercase/);
  });

  it("validates bounded strings, IDs, provenance IDs, rule names, tags, and memos", () => {
    expect(validateId("a".repeat(MAX_ID_LENGTH))).toHaveLength(MAX_ID_LENGTH);
    expect(() => validateId("")).toThrow(/non-empty string/);
    expect(() => validateId("   ")).toThrow(/non-empty string/);
    expect(() => validateId("a".repeat(MAX_ID_LENGTH + 1))).toThrow(
      /length must be <= 64/,
    );
    expect(() => validateId(42)).toThrow(/must be a string/);

    expect(
      validateProvenanceId(
        "b".repeat(MAX_PROVENANCE_ID_LENGTH),
        "importBatchId",
      ),
    ).toHaveLength(MAX_PROVENANCE_ID_LENGTH);
    expect(() =>
      validateProvenanceId(
        "b".repeat(MAX_PROVENANCE_ID_LENGTH + 1),
        "importBatchId",
      ),
    ).toThrow(/length must be <= 128/);

    expect(validateRuleName("r".repeat(MAX_NAME_OR_TAG_LENGTH))).toHaveLength(
      MAX_NAME_OR_TAG_LENGTH,
    );
    expect(() =>
      validateRuleName("r".repeat(MAX_NAME_OR_TAG_LENGTH + 1)),
    ).toThrow(/length must be <= 120/);

    expect(validateMemo("")).toBe("");
    expect(validateMemo("m".repeat(MAX_MEMO_LENGTH))).toHaveLength(
      MAX_MEMO_LENGTH,
    );
    expect(() => validateMemo("m".repeat(MAX_MEMO_LENGTH + 1))).toThrow(
      /length must be <= 1000/,
    );

    expect(validateBoundedString("ok", "custom", 10)).toBe("ok");

    const twentyTags = Array.from(
      { length: MAX_TAGS_COUNT },
      (_, i) => `tag-${i}`,
    );
    expect(validateTags(twentyTags)).toEqual(twentyTags);
    expect(() => validateTags("not-array")).toThrow(
      /must be an array of strings/,
    );
    expect(() => validateTags([...twentyTags, "extra"])).toThrow(
      /must contain <= 20 tags/,
    );
    expect(() => validateTags([""])).toThrow(/non-empty string/);
    expect(() =>
      validateTags(["t".repeat(MAX_NAME_OR_TAG_LENGTH + 1)]),
    ).toThrow(/length must be <= 120/);
  });

  it("validates enum and schedule invariants", () => {
    expect(validateRuleType("income")).toBe("income");
    expect(validateRuleType("expense")).toBe("expense");
    expect(() => validateRuleType("deposit")).toThrow(
      /must be "income" or "expense"/,
    );

    expect(validateActivityType("income")).toBe("income");
    expect(validateActivityType("expense")).toBe("expense");
    expect(validateActivityType("deposit")).toBe("deposit");
    expect(() => validateActivityType("transfer")).toThrow(
      /must be "income", "expense", or "deposit"/,
    );

    expect(validateActivitySource("manual")).toBe("manual");
    expect(validateActivitySource("recurring")).toBe("recurring");
    expect(validateActivitySource("file-import")).toBe("file-import");
    expect(validateActivitySource("bank-sync")).toBe("bank-sync");
    expect(() => validateActivitySource("api")).toThrow(
      /must be "manual", "recurring", "file-import", or "bank-sync"/,
    );

    expect(validateSchedule({ cadence: "monthly", dayOfMonth: 1 })).toEqual({
      cadence: "monthly",
      dayOfMonth: 1,
    });
    expect(validateSchedule({ cadence: "monthly", dayOfMonth: 31 })).toEqual({
      cadence: "monthly",
      dayOfMonth: 31,
    });
    expect(() => validateSchedule(null)).toThrow(/expected a plain object/);
    expect(() =>
      validateSchedule({ cadence: "weekly", dayOfMonth: 1 }),
    ).toThrow(/cadence: must be "monthly"/);
    expect(() =>
      validateSchedule({ cadence: "monthly", dayOfMonth: 0 }),
    ).toThrow(/dayOfMonth: must be an integer between 1 and 31/);
    expect(() =>
      validateSchedule({ cadence: "monthly", dayOfMonth: 32 }),
    ).toThrow(/dayOfMonth: must be an integer between 1 and 31/);
    expect(() =>
      validateSchedule({ cadence: "monthly", dayOfMonth: 1.5 }),
    ).toThrow(/dayOfMonth: must be an integer between 1 and 31/);
    expect(() =>
      validateSchedule({ cadence: "monthly", dayOfMonth: 1, extra: true }),
    ).toThrow(/unexpected property "extra"/);
  });
});

describe("entity & input/patch validators (RecurringRule, NewRule, RulePatch, Activity, NewActivity, ActivityPatch)", () => {
  it("validates RecurringRule including non-null lastPostPeriod and optional E2EE sync fields", () => {
    expect(validateRecurringRule(VALID_RULE)).toEqual(VALID_RULE);

    const ruleWithOptionals: RecurringRule = {
      ...VALID_RULE,
      lastPostPeriod: "2026-10",
      deletedAt: "2026-11-15T00:00:00.000Z",
      deviceId: "device-ios-1",
    };
    expect(validateRecurringRule(ruleWithOptionals)).toEqual(ruleWithOptionals);

    // Null-prototype object is also accepted as a plain record
    const nullProtoRule = Object.assign(Object.create(null), VALID_RULE);
    expect(validateRecurringRule(nullProtoRule)).toEqual(VALID_RULE);

    expect(() =>
      validateRecurringRule({ ...VALID_RULE, active: "yes" }),
    ).toThrow(/active: must be a boolean/);
    expect(() =>
      validateRecurringRule({ ...VALID_RULE, lastPostPeriod: undefined }),
    ).toThrow(/lastPostPeriod: must be a YYYY-MM string or null/);
    expect(() =>
      validateRecurringRule({ ...VALID_RULE, lastPostPeriod: "2026-13" }),
    ).toThrow(/lastPostPeriod: month must be between 01 and 12/);
    expect(() =>
      validateRecurringRule({ ...VALID_RULE, deletedAt: "not-a-date" }),
    ).toThrow(/deletedAt/);
    expect(() =>
      validateRecurringRule({ ...VALID_RULE, deviceId: "" }),
    ).toThrow(/deviceId/);
    expect(() =>
      validateRecurringRule({ ...VALID_RULE, unknownField: 123 }),
    ).toThrow(/unexpected property "unknownField"/);
    expect(() => validateRecurringRule([])).toThrow(/expected a plain object/);
    expect(() => validateRecurringRule(new Date())).toThrow(
      /expected a plain object/,
    );
  });

  it("validates NewRule and RulePatch while rejecting system-managed fields", () => {
    const minimalNewRule: NewRule = {
      name: "Rent",
      type: "expense",
      amountCents: 150_000,
    };
    expect(validateNewRule(minimalNewRule)).toEqual(minimalNewRule);

    const fullNewRule: NewRule = {
      ...minimalNewRule,
      currency: "USD",
      schedule: { cadence: "monthly", dayOfMonth: 15 },
      active: false,
    };
    expect(validateNewRule(fullNewRule)).toEqual(fullNewRule);

    expect(() =>
      validateNewRule({ ...minimalNewRule, active: 1 as unknown as boolean }),
    ).toThrow(/active: must be a boolean/);
    expect(() =>
      validateNewRule({ ...minimalNewRule, lastPostPeriod: "2026-11" }),
    ).toThrow(/unexpected property "lastPostPeriod"/);

    const validPatch: RulePatch = {
      name: "Updated Rent",
      type: "expense",
      amountCents: 160_000,
      schedule: { cadence: "monthly", dayOfMonth: 5 },
      active: true,
    };
    expect(validateRulePatch(validPatch)).toEqual(validPatch);
    expect(validateRulePatch({})).toEqual({});

    expect(() =>
      validateRulePatch({ active: "false" as unknown as boolean }),
    ).toThrow(/active: must be a boolean/);
    expect(() =>
      validateRulePatch({ lastPostPeriod: "2026-11" } as unknown as RulePatch),
    ).toThrow(/unexpected property "lastPostPeriod"/);
    expect(() =>
      validateRulePatch({ id: "rule-2" } as unknown as RulePatch),
    ).toThrow(/unexpected property "id"/);
  });

  it("validates Activity including recurring provenance, file-import/bank-sync slots, and E2EE tombstones", () => {
    expect(validateActivity(VALID_MANUAL_ACTIVITY)).toEqual(
      VALID_MANUAL_ACTIVITY,
    );
    expect(validateActivity(VALID_RECURRING_ACTIVITY)).toEqual(
      VALID_RECURRING_ACTIVITY,
    );

    const importedActivity: Activity = {
      ...VALID_MANUAL_ACTIVITY,
      id: "act-import-1",
      source: "file-import",
      importBatchId: "batch-2026-11-20",
      externalTxnId: "fitid-998877",
      sourceAccountId: "acct-checking-1",
      deletedAt: "2026-11-20T15:00:00.000Z",
      deviceId: "device-web-1",
    };
    expect(validateActivity(importedActivity)).toEqual(importedActivity);

    // Recurring activities MUST have sourceRuleId and period
    expect(() =>
      validateActivity({
        ...VALID_RECURRING_ACTIVITY,
        sourceRuleId: undefined,
      }),
    ).toThrow(/sourceRuleId: required when source === "recurring"/);
    expect(() =>
      validateActivity({
        ...VALID_RECURRING_ACTIVITY,
        period: undefined,
      }),
    ).toThrow(/period: required when source === "recurring"/);

    // Malformed optional fields
    expect(() =>
      validateActivity({
        ...VALID_MANUAL_ACTIVITY,
        importBatchId: "",
      }),
    ).toThrow(/importBatchId/);
    expect(() =>
      validateActivity({
        ...VALID_MANUAL_ACTIVITY,
        externalTxnId: "x".repeat(MAX_PROVENANCE_ID_LENGTH + 1),
      }),
    ).toThrow(/externalTxnId/);
    expect(() =>
      validateActivity({
        ...VALID_MANUAL_ACTIVITY,
        sourceAccountId: "   ",
      }),
    ).toThrow(/sourceAccountId/);
    expect(() =>
      validateActivity({
        ...VALID_MANUAL_ACTIVITY,
        deletedAt: "invalid",
      }),
    ).toThrow(/deletedAt/);
    expect(() =>
      validateActivity({
        ...VALID_MANUAL_ACTIVITY,
        deviceId: "d".repeat(MAX_ID_LENGTH + 1),
      }),
    ).toThrow(/deviceId/);
  });

  it("validates NewActivity and ActivityPatch while rejecting provenance and system fields", () => {
    const minimalNewActivity: NewActivity = {
      type: "deposit",
      amountCents: 25_000,
    };
    expect(validateNewActivity(minimalNewActivity)).toEqual(minimalNewActivity);

    const fullNewActivity: NewActivity = {
      type: "expense",
      amountCents: 1999,
      currency: "USD",
      dateTime: "2026-11-10T09:15:00.000Z",
      tags: ["coffee"],
      memo: "Latte",
    };
    expect(validateNewActivity(fullNewActivity)).toEqual(fullNewActivity);

    expect(() =>
      validateNewActivity({ ...minimalNewActivity, source: "manual" }),
    ).toThrow(/unexpected property "source"/);

    const patch: ActivityPatch = {
      type: "income",
      amountCents: 3000,
      dateTime: "2026-11-11T10:00:00.000Z",
      tags: ["refund"],
      memo: "Adjusted",
    };
    expect(validateActivityPatch(patch)).toEqual(patch);
    expect(validateActivityPatch({})).toEqual({});

    expect(() =>
      validateActivityPatch({
        source: "recurring",
      } as unknown as ActivityPatch),
    ).toThrow(/unexpected property "source"/);
    expect(() =>
      validateActivityPatch({
        sourceRuleId: "rule-1",
      } as unknown as ActivityPatch),
    ).toThrow(/unexpected property "sourceRuleId"/);
    expect(() =>
      validateActivityPatch({
        createdAt: "2026-11-01T00:00:00Z",
      } as unknown as ActivityPatch),
    ).toThrow(/unexpected property "createdAt"/);
  });
});

describe("hardened backup payload validator (validateBackupPayload)", () => {
  const validBackup: BudgetBackup = {
    schemaVersion: 1,
    exportedAt: "2026-11-20T12:00:00.000Z",
    rules: [VALID_RULE],
    activities: [VALID_MANUAL_ACTIVITY, VALID_RECURRING_ACTIVITY],
  };

  it("parses and returns a clean validated BudgetBackup on valid JSON", () => {
    const multiRuleBackup: BudgetBackup = {
      ...validBackup,
      rules: [VALID_RULE, { ...VALID_RULE, id: "rule-2", name: "Bonus" }],
    };
    const raw = JSON.stringify(multiRuleBackup);
    const result = validateBackupPayload(raw);
    expect(result).toEqual(multiRuleBackup);
  });

  it("accepts an empty backup with zero rules and zero activities", () => {
    const emptyBackup: BudgetBackup = {
      schemaVersion: 1,
      exportedAt: "2026-11-20T12:00:00.000Z",
      rules: [],
      activities: [],
    };
    expect(validateBackupPayload(JSON.stringify(emptyBackup))).toEqual(
      emptyBackup,
    );
  });

  it("rejects non-string rawJson and malformed JSON syntax", () => {
    expect(() => validateBackupPayload(null as unknown as string)).toThrow(
      /rawJson must be a JSON string/,
    );
    expect(() => validateBackupPayload("{not valid json")).toThrow(
      /Invalid backup payload JSON/,
    );
  });

  it("rejects payloads exceeding the 10 MB hard byte ceiling BEFORE calling JSON.parse", () => {
    const parseSpy = vi.spyOn(JSON, "parse");
    try {
      const oversized = "x".repeat(MAX_BACKUP_BYTES + 1);
      expect(() => validateBackupPayload(oversized)).toThrow(
        /exceeds 10 MB ceiling/,
      );
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("rejects rules or activities arrays exceeding the 100,000 item structural cap", () => {
    // 100,001 tiny elements serialize to ~300 KB (well under 10 MB) but exceed MAX_BACKUP_ARRAY_LENGTH
    const tooManyNulls = new Array(MAX_BACKUP_ARRAY_LENGTH + 1).fill(0);
    const rawRulesOverflow = `{"schemaVersion":1,"exportedAt":"2026-11-20T12:00:00.000Z","rules":${JSON.stringify(tooManyNulls)},"activities":[]}`;
    expect(() => validateBackupPayload(rawRulesOverflow)).toThrow(
      /Invalid backup\.rules: length 100001 exceeds cap \(100000\)/,
    );

    const rawActivitiesOverflow = `{"schemaVersion":1,"exportedAt":"2026-11-20T12:00:00.000Z","rules":[],"activities":${JSON.stringify(tooManyNulls)}}`;
    expect(() => validateBackupPayload(rawActivitiesOverflow)).toThrow(
      /Invalid backup\.activities: length 100001 exceeds cap \(100000\)/,
    );
  });

  it("rejects prototype-pollution keys (__proto__, constructor, prototype) at root and nested levels", () => {
    const rootProto =
      '{"__proto__":{"polluted":true},"schemaVersion":1,"exportedAt":"2026-11-20T12:00:00.000Z","rules":[],"activities":[]}';
    expect(() => validateBackupPayload(rootProto)).toThrow(
      /Forbidden prototype-pollution key "__proto__"/,
    );

    const nestedConstructor = `{"schemaVersion":1,"exportedAt":"2026-11-20T12:00:00.000Z","rules":[{"id":"r1","name":"Salary","type":"income","amountCents":100,"currency":"USD","schedule":{"cadence":"monthly","dayOfMonth":1,"constructor":{"polluted":true}},"active":true,"lastPostPeriod":null,"createdAt":"2026-11-01T12:00:00Z","updatedAt":"2026-11-01T12:00:00Z"}],"activities":[]}`;
    expect(() => validateBackupPayload(nestedConstructor)).toThrow(
      /Forbidden prototype-pollution key "constructor"/,
    );

    const nestedPrototype =
      '{"schemaVersion":1,"exportedAt":"2026-11-20T12:00:00.000Z","rules":[],"activities":[{"prototype":{}}]}';
    expect(() => validateBackupPayload(nestedPrototype)).toThrow(
      /Forbidden prototype-pollution key "prototype"/,
    );

    // Direct recursive check on pre-constructed objects with own __proto__ / constructor / prototype properties
    const poisonedObj = Object.defineProperty({}, "__proto__", {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
    });
    expect(() => assertNoPrototypePollution([poisonedObj])).toThrow(
      /forbidden prototype-pollution key "__proto__"/,
    );
    expect(() =>
      validateRecurringRule(
        Object.defineProperty({ ...VALID_RULE }, "constructor", {
          value: "evil",
          enumerable: true,
        }),
      ),
    ).toThrow(/forbidden prototype-pollution key "constructor"/);
  });

  it("rejects unknown schemaVersion, non-array rules/activities, duplicate IDs, and mixed currencies", () => {
    expect(() =>
      validateBackupPayload(
        JSON.stringify({ ...validBackup, schemaVersion: 2 }),
      ),
    ).toThrow(/schemaVersion: expected 1, got 2/);

    expect(() =>
      validateBackupPayload(
        JSON.stringify({ ...validBackup, rules: "not-an-array" }),
      ),
    ).toThrow(/backup\.rules: must be an array/);

    expect(() =>
      validateBackupPayload(
        JSON.stringify({ ...validBackup, activities: "not-an-array" }),
      ),
    ).toThrow(/backup\.activities: must be an array/);

    // Duplicate rule IDs
    expect(() =>
      validateBackupPayload(
        JSON.stringify({
          ...validBackup,
          rules: [VALID_RULE, { ...VALID_RULE, name: "Duplicate ID" }],
        }),
      ),
    ).toThrow(/duplicate rule id "rule-1"/);

    // Duplicate activity IDs
    expect(() =>
      validateBackupPayload(
        JSON.stringify({
          ...validBackup,
          activities: [
            VALID_MANUAL_ACTIVITY,
            { ...VALID_MANUAL_ACTIVITY, amountCents: 999 },
          ],
        }),
      ),
    ).toThrow(/duplicate activity id "act-1"/);

    // Mixed currencies across rules
    expect(() =>
      validateBackupPayload(
        JSON.stringify({
          ...validBackup,
          rules: [VALID_RULE, { ...VALID_RULE, id: "rule-2", currency: "EUR" }],
        }),
      ),
    ).toThrow(/mixed currencies not allowed \(expected "USD", got "EUR"\)/);

    // Mixed currencies between rules and activities
    expect(() =>
      validateBackupPayload(
        JSON.stringify({
          ...validBackup,
          activities: [{ ...VALID_MANUAL_ACTIVITY, currency: "GBP" }],
        }),
      ),
    ).toThrow(/mixed currencies not allowed \(expected "USD", got "GBP"\)/);

    // Mixed currencies across activities when rules is empty
    expect(() =>
      validateBackupPayload(
        JSON.stringify({
          ...validBackup,
          rules: [],
          activities: [
            VALID_MANUAL_ACTIVITY,
            { ...VALID_MANUAL_ACTIVITY, id: "act-eur", currency: "EUR" },
          ],
        }),
      ),
    ).toThrow(/mixed currencies not allowed \(expected "USD", got "EUR"\)/);
  });
});

describe("Phase 6 EncryptedBudgetBackup header validation (validateEncryptedBackupEnvelope)", () => {
  const validEncrypted: EncryptedBudgetBackup = {
    schemaVersion: 1,
    enc: {
      alg: "AES-256-GCM",
      kdf: "PBKDF2-HMAC-SHA256",
      iter: MIN_PBKDF2_ITERATIONS,
      salt: "dGVzdC1zYWx0LTE2Ynl0ZXM=",
      iv: "dGVzdC1pdi0xMmJ5",
    },
    ciphertext: "Y2lwaGVydGV4dC1wYXlsb2Fk",
  };

  it("accepts a valid EncryptedBudgetBackup envelope with iter within [600_000, 5_000_000]", () => {
    expect(validateEncryptedBackupEnvelope(validEncrypted)).toEqual(
      validEncrypted,
    );
    expect(
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, iter: MAX_PBKDF2_ITERATIONS },
      }).enc.iter,
    ).toBe(MAX_PBKDF2_ITERATIONS);
  });

  it("rejects invalid schemaVersion, alg, kdf, or out-of-range/non-integer PBKDF2 iter", () => {
    expect(() =>
      validateEncryptedBackupEnvelope({ ...validEncrypted, schemaVersion: 2 }),
    ).toThrow(/schemaVersion: expected 1/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, alg: "AES-128-CBC" },
      }),
    ).toThrow(/enc\.alg: must be "AES-256-GCM"/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, kdf: "SHA256" },
      }),
    ).toThrow(/enc\.kdf: must be "PBKDF2-HMAC-SHA256"/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, iter: MIN_PBKDF2_ITERATIONS - 1 },
      }),
    ).toThrow(/enc\.iter: must be an integer between 600000 and 5000000/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, iter: MAX_PBKDF2_ITERATIONS + 1 },
      }),
    ).toThrow(/enc\.iter: must be an integer between 600000 and 5000000/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, iter: 600_000.5 },
      }),
    ).toThrow(/enc\.iter: must be an integer between 600000 and 5000000/);

    expect(() =>
      validateEncryptedBackupEnvelope({
        ...validEncrypted,
        enc: { ...validEncrypted.enc, iter: Number.NaN },
      }),
    ).toThrow(/enc\.iter: must be an integer between 600000 and 5000000/);
  });
});
