/**
 * Insights tab view controller (`src/ui/insightsTab.ts`).
 *
 * Implements the Insights tab surface (`project-plan/frontend.md` →
 * `#search--insights-reqs-4--9`):
 * - Filter controls (all with programmatic `<label for="...">` and
 *   `>= 44x44 CSS px` hit targets):
 *   - Period date range (`since` / `until` mapped to ISO-8601 UTC bounds)
 *   - Tag selector populated from available tags + "All tags"
 *   - Activity type selector (`all` | `income` | `expense` | `deposit`)
 *   - Optional case-insensitive keyword filter matching `memo` or `tags`
 *   - Clear / Reset filters button (`type="button"`)
 *   - Form submission prevented (`event.preventDefault()`) for CSP
 *     `form-action 'none'` compliance.
 * - Summary totals (`aria-live="polite"`, `aria-atomic="true"`, tabular
 *   numerals) for the current filtered selection.
 * - Tag Rollup breakdown via `budget.summarizeByTag(matchedActivities)`.
 * - Period Rollup breakdown via `summarizeByPeriod(matchedActivities)`
 *   (`src/core/insights.ts`), honoring `Activity.period` for
 *   `source === "recurring"` (OQ-2).
 * - Matching Activities list with local-timezone formatting
 *   (`formatLocalDateTime`), tag chips, and distinct accessible empty states
 *   (no activities recorded yet vs. no activities match current filters).
 * - `refreshSeq` stale-render guard to prevent out-of-order async updates.
 *
 * Built exclusively with `./dom` safe DOM helpers (`el`, `text`, `setAttrs`,
 * `replaceChildren`) so all user-controlled strings render strictly as inert
 * text nodes. Zero production dependencies.
 */

import type { BudgetApi } from "../budgetApi";
import { type PeriodSummary, summarizeByPeriod } from "../core/insights";
import type {
  Activity,
  ActivityFilter,
  ActivityType,
  TagSummary,
} from "../core/types";
import { el, replaceChildren, setAttrs, text } from "./dom";
import { formatCents, formatLocalDateTime } from "./format";

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Options accepted by `mountInsightsTab`. */
export interface MountInsightsTabOptions {
  /** Target container element (e.g. `#panel-insights`). */
  readonly container: HTMLElement;
  /** Public `BudgetApi` instance. */
  readonly budget: BudgetApi;
}

/** Controller returned by `mountInsightsTab`. */
export interface InsightsTabController {
  /** Re-queries activities, tag rollups, and period rollups from `BudgetApi` and updates the DOM. */
  refresh(): Promise<void>;
}

function isActivityType(value: string): value is ActivityType {
  return value === "income" || value === "expense" || value === "deposit";
}

function labelForType(type: ActivityType): string {
  switch (type) {
    case "expense":
      return "Expense";
    case "income":
      return "Income";
    case "deposit":
      return "Deposit";
  }
}

function labelForSource(source: Activity["source"]): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "recurring":
      return "Recurring";
    case "file-import":
      return "Imported";
    case "bank-sync":
      return "Synced";
  }
}

function compareActivitiesNewestFirst(a: Activity, b: Activity): number {
  const dtDiff = Date.parse(b.dateTime) - Date.parse(a.dateTime);
  if (dtDiff !== 0) {
    return dtDiff;
  }
  const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return b.id.localeCompare(a.id);
}

/**
 * Parses a `YYYY-MM-DD` `<input type="date">` string into UTC calendar parts,
 * rejecting out-of-range calendar dates (e.g. `2026-02-30`).
 */
function parseDateInputParts(
  raw: string,
): { year: number; month: number; day: number } | null {
  const trimmed = raw.trim();
  const match = DATE_INPUT_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    !Number.isFinite(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Converts a `YYYY-MM-DD` start date to an inclusive ISO-8601 UTC lower bound
 * (`YYYY-MM-DDT00:00:00.000Z`).
 */
function dateInputToUtcSince(raw: string): string {
  const parts = parseDateInputParts(raw);
  if (parts === null) {
    throw new Error("Invalid start date: enter a valid YYYY-MM-DD date.");
  }
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0),
  ).toISOString();
}

/**
 * Converts a `YYYY-MM-DD` inclusive end date to an exclusive ISO-8601 UTC upper
 * bound (start of the next UTC calendar day: `YYYY-MM-(DD+1)T00:00:00.000Z`),
 * matching `searchActivities`'s `a.dateTime < until` contract.
 */
function dateInputToUtcUntil(raw: string): string {
  const parts = parseDateInputParts(raw);
  if (parts === null) {
    throw new Error("Invalid end date: enter a valid YYYY-MM-DD date.");
  }
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0, 0),
  ).toISOString();
}

function matchesKeyword(
  activity: Activity,
  normalizedKeyword: string,
): boolean {
  if (normalizedKeyword.length === 0) {
    return true;
  }
  if (activity.memo?.toLowerCase().includes(normalizedKeyword)) {
    return true;
  }
  return activity.tags.some((tag) =>
    tag.toLowerCase().includes(normalizedKeyword),
  );
}

function createField(
  labelText: string,
  inputId: string,
  control: HTMLElement,
): HTMLElement {
  const label = el("label", { for: inputId, class: "insights-label" }, [
    text(labelText),
  ]);
  return el("div", { class: "insights-field" }, [
    label,
    control,
  ]) as HTMLElement;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return "Unable to load insights right now. Please try again.";
}

/**
 * Mounts the Insights tab UI into `options.container` and returns an
 * `InsightsTabController` whose `refresh()` method re-queries `BudgetApi`
 * and updates all rollups and matching activities.
 */
export function mountInsightsTab(
  options: MountInsightsTabOptions,
): InsightsTabController {
  const { container, budget } = options;

  // ---------------------------------------------------------------------------
  // 1. Filter Controls Form (CSP form-action 'none' compliant)
  // ---------------------------------------------------------------------------
  const sinceInput = el("input", {
    id: "insights-filter-since",
    name: "since",
    type: "date",
    class: "insights-input",
  }) as HTMLInputElement;

  const untilInput = el("input", {
    id: "insights-filter-until",
    name: "until",
    type: "date",
    class: "insights-input",
  }) as HTMLInputElement;

  const tagSelect = el(
    "select",
    {
      id: "insights-filter-tag",
      name: "tag",
      class: "insights-input insights-select",
    },
    [el("option", { value: "" }, [text("All tags")])],
  ) as HTMLSelectElement;

  const typeSelect = el(
    "select",
    {
      id: "insights-filter-type",
      name: "type",
      class: "insights-input insights-select",
    },
    [
      el("option", { value: "" }, [text("All types")]),
      el("option", { value: "income" }, [text("Income")]),
      el("option", { value: "expense" }, [text("Expense")]),
      el("option", { value: "deposit" }, [text("Deposit")]),
    ],
  ) as HTMLSelectElement;

  const keywordInput = el("input", {
    id: "insights-filter-keyword",
    name: "keyword",
    type: "search",
    autocomplete: "off",
    placeholder: "Search memo or tags",
    class: "insights-input",
  }) as HTMLInputElement;

  const filterErrorEl = el("div", {
    id: "insights-filter-error",
    class: "insights-form-error",
    role: "alert",
    "aria-live": "assertive",
    hidden: "true",
  }) as HTMLElement;

  const resetBtn = el(
    "button",
    {
      id: "insights-filter-reset",
      type: "button",
      class: "insights-btn insights-btn-secondary",
    },
    [text("Reset Filters")],
  ) as HTMLButtonElement;

  const filterForm = el(
    "form",
    {
      class: "insights-filter-form",
      novalidate: "true",
    },
    [
      el("div", { class: "insights-form-row" }, [
        createField("From date", "insights-filter-since", sinceInput),
        createField("To date", "insights-filter-until", untilInput),
      ]),
      el("div", { class: "insights-form-row" }, [
        createField("Tag", "insights-filter-tag", tagSelect),
        createField("Type", "insights-filter-type", typeSelect),
      ]),
      createField("Keyword", "insights-filter-keyword", keywordInput),
      filterErrorEl,
      el("div", { class: "insights-form-actions" }, [resetBtn]),
    ],
  ) as HTMLFormElement;

  const filtersSection = el(
    "section",
    {
      class: "insights-card insights-filters",
      "aria-labelledby": "insights-filters-heading",
    },
    [
      el(
        "h2",
        { id: "insights-filters-heading", class: "insights-section-title" },
        [text("Filters")],
      ),
      filterForm,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 2. Summary Totals Region
  // ---------------------------------------------------------------------------
  const summaryInEl = el(
    "dd",
    {
      id: "insights-summary-in",
      class: "insights-stat-value insights-money-in",
    },
    [text(formatCents(0))],
  ) as HTMLElement;

  const summaryOutEl = el(
    "dd",
    {
      id: "insights-summary-out",
      class: "insights-stat-value insights-money-out",
    },
    [text(formatCents(0))],
  ) as HTMLElement;

  const summaryNetEl = el(
    "dd",
    { id: "insights-summary-net", class: "insights-stat-value" },
    [text(formatCents(0))],
  ) as HTMLElement;

  const summaryCountEl = el(
    "p",
    { id: "insights-summary-count", class: "insights-summary-count" },
    [text("0 matching activities")],
  ) as HTMLElement;

  const summarySection = el(
    "section",
    {
      class: "insights-card insights-summary",
      "aria-labelledby": "insights-summary-heading",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
    [
      el("div", { class: "insights-section-header" }, [
        el(
          "h2",
          { id: "insights-summary-heading", class: "insights-section-title" },
          [text("Summary")],
        ),
        summaryCountEl,
      ]),
      el("dl", { class: "insights-stats-grid" }, [
        el("div", { class: "insights-stat-item" }, [
          el("dt", { class: "insights-stat-label" }, [text("Money In")]),
          summaryInEl,
        ]),
        el("div", { class: "insights-stat-item" }, [
          el("dt", { class: "insights-stat-label" }, [text("Money Out")]),
          summaryOutEl,
        ]),
        el("div", { class: "insights-stat-item" }, [
          el("dt", { class: "insights-stat-label" }, [text("Net")]),
          summaryNetEl,
        ]),
      ]),
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 3. Tag Rollups Section (`budget.summarizeByTag`)
  // ---------------------------------------------------------------------------
  const tagRollupEmptyEl = el("p", { class: "insights-empty-note" }, [
    text("No tag rollups to display."),
  ]) as HTMLElement;

  const tagRollupListEl = el("ul", {
    id: "insights-tag-rollups",
    class: "insights-rollup-list",
    hidden: "true",
  }) as HTMLUListElement;

  const tagRollupSection = el(
    "section",
    {
      class: "insights-card insights-tag-section",
      "aria-labelledby": "insights-tag-rollups-heading",
    },
    [
      el(
        "h2",
        {
          id: "insights-tag-rollups-heading",
          class: "insights-section-title",
        },
        [text("By Tag")],
      ),
      tagRollupEmptyEl,
      tagRollupListEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 4. Period Rollups Section (`summarizeByPeriod`, OQ-2 recurring attribution)
  // ---------------------------------------------------------------------------
  const periodRollupEmptyEl = el("p", { class: "insights-empty-note" }, [
    text("No period rollups to display."),
  ]) as HTMLElement;

  const periodRollupListEl = el("ul", {
    id: "insights-period-rollups",
    class: "insights-period-list",
    hidden: "true",
  }) as HTMLUListElement;

  const periodRollupSection = el(
    "section",
    {
      class: "insights-card insights-period-section",
      "aria-labelledby": "insights-period-rollups-heading",
    },
    [
      el(
        "h2",
        {
          id: "insights-period-rollups-heading",
          class: "insights-section-title",
        },
        [text("By Period")],
      ),
      periodRollupEmptyEl,
      periodRollupListEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 5. Matching Activities List & Distinct Empty States
  // ---------------------------------------------------------------------------
  const emptyStateEl = el("p", {
    id: "insights-empty-state",
    class: "insights-empty-state",
  }) as HTMLElement;

  const activityListEl = el("ul", {
    id: "insights-activity-list",
    class: "insights-activity-list",
    hidden: "true",
  }) as HTMLUListElement;

  const activitiesSection = el(
    "section",
    {
      class: "insights-card insights-activities-section",
      "aria-labelledby": "insights-activities-heading",
    },
    [
      el(
        "h2",
        {
          id: "insights-activities-heading",
          class: "insights-section-title",
        },
        [text("Matching Activities")],
      ),
      emptyStateEl,
      activityListEl,
    ],
  ) as HTMLElement;

  // ---------------------------------------------------------------------------
  // 6. Error Helpers
  // ---------------------------------------------------------------------------
  function clearFilterError(): void {
    replaceChildren(filterErrorEl);
    setAttrs(filterErrorEl, { hidden: "true" });
    setAttrs(sinceInput, { "aria-invalid": null, "aria-describedby": null });
    setAttrs(untilInput, { "aria-invalid": null, "aria-describedby": null });
  }

  function showFilterError(
    message: string,
    invalidControl?: HTMLElement,
  ): void {
    replaceChildren(filterErrorEl, text(message));
    setAttrs(filterErrorEl, { hidden: null });
    if (invalidControl !== undefined) {
      setAttrs(invalidControl, {
        "aria-invalid": "true",
        "aria-describedby": filterErrorEl.id,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Rendering Helpers (100% safe DOM via ./dom)
  // ---------------------------------------------------------------------------
  function renderTagRollupItem(
    summary: TagSummary,
    currency: string,
  ): HTMLLIElement {
    const netCents = summary.totalInCents - summary.totalOutCents;
    return el(
      "li",
      {
        class: "insights-rollup-item",
        "data-tag": summary.tag,
      },
      [
        el("span", { class: "insights-rollup-name" }, [text(summary.tag)]),
        el("div", { class: "insights-rollup-figures" }, [
          el("span", { class: "insights-figure insights-money-in" }, [
            text(`In: ${formatCents(summary.totalInCents, currency)}`),
          ]),
          el("span", { class: "insights-figure insights-money-out" }, [
            text(`Out: ${formatCents(summary.totalOutCents, currency)}`),
          ]),
          el(
            "span",
            {
              class:
                netCents < 0
                  ? "insights-figure insights-net-negative"
                  : "insights-figure",
            },
            [text(`Net: ${formatCents(netCents, currency)}`)],
          ),
        ]),
      ],
    ) as HTMLLIElement;
  }

  function renderPeriodRollupItem(
    summary: PeriodSummary,
    currency: string,
  ): HTMLLIElement {
    const netCents = summary.totalInCents - summary.totalOutCents;

    const headerRow = el("div", { class: "insights-period-header" }, [
      el("h3", { class: "insights-period-label" }, [text(summary.period)]),
      el("div", { class: "insights-rollup-figures" }, [
        el("span", { class: "insights-figure insights-money-in" }, [
          text(`In: ${formatCents(summary.totalInCents, currency)}`),
        ]),
        el("span", { class: "insights-figure insights-money-out" }, [
          text(`Out: ${formatCents(summary.totalOutCents, currency)}`),
        ]),
        el(
          "span",
          {
            class:
              netCents < 0
                ? "insights-figure insights-net-negative"
                : "insights-figure",
          },
          [text(`Net: ${formatCents(netCents, currency)}`)],
        ),
      ]),
    ]);

    const periodTagsEl =
      summary.tags.length > 0
        ? el(
            "ul",
            {
              class: "insights-period-tags",
              "aria-label": `Tags in ${summary.period}`,
            },
            summary.tags.map((tagItem) =>
              el("li", { class: "insights-period-tag-row" }, [
                el("span", { class: "insights-period-tag-name" }, [
                  text(tagItem.tag),
                ]),
                el("span", { class: "insights-period-tag-amounts" }, [
                  text(
                    `In ${formatCents(tagItem.totalInCents, currency)} · Out ${formatCents(tagItem.totalOutCents, currency)}`,
                  ),
                ]),
              ]),
            ),
          )
        : null;

    return el(
      "li",
      {
        class: "insights-period-item",
        "data-period": summary.period,
      },
      [headerRow, periodTagsEl],
    ) as HTMLLIElement;
  }

  function renderActivityItem(activity: Activity): HTMLLIElement {
    const signedCents =
      activity.type === "expense"
        ? -activity.amountCents
        : activity.amountCents;
    const formattedAmount = formatCents(signedCents, activity.currency);
    const formattedDate = formatLocalDateTime(activity.dateTime);

    const badges = el("div", { class: "insights-activity-badges" }, [
      el("span", { class: `insights-badge insights-badge--${activity.type}` }, [
        text(labelForType(activity.type)),
      ]),
      el(
        "span",
        { class: `insights-badge insights-badge--source-${activity.source}` },
        [text(labelForSource(activity.source))],
      ),
    ]);

    const amountEl = el(
      "span",
      {
        class: `insights-activity-amount insights-activity-amount--${activity.type}`,
      },
      [text(formattedAmount)],
    );

    const topRow = el("div", { class: "insights-activity-top" }, [
      badges,
      amountEl,
    ]);

    const timeEl = el(
      "time",
      {
        class: "insights-activity-time",
        datetime: activity.dateTime,
      },
      [text(formattedDate)],
    );

    const memoEl =
      activity.memo !== undefined && activity.memo.trim().length > 0
        ? el("p", { class: "insights-activity-memo" }, [text(activity.memo)])
        : null;

    const tagsEl =
      activity.tags.length > 0
        ? el(
            "ul",
            { class: "insights-tag-list", "aria-label": "Tags" },
            activity.tags.map((tag) =>
              el("li", { class: "insights-tag-chip" }, [text(tag)]),
            ),
          )
        : null;

    return el(
      "li",
      {
        class: "insights-activity-item",
        "data-activity-id": activity.id,
      },
      [topRow, timeEl, memoEl, tagsEl],
    ) as HTMLLIElement;
  }

  function updateTagOptions(allActivities: readonly Activity[]): void {
    const previousSelection = tagSelect.value;
    const tagSet = new Set<string>();
    for (const activity of allActivities) {
      if (activity.deletedAt !== undefined) {
        continue;
      }
      for (const tag of activity.tags) {
        tagSet.add(tag);
      }
    }
    const sortedTags = [...tagSet].sort((a, b) => a.localeCompare(b));
    const options = [
      el("option", { value: "" }, [text("All tags")]),
      ...sortedTags.map((tag) => el("option", { value: tag }, [text(tag)])),
    ];
    replaceChildren(tagSelect, ...options);

    if (previousSelection !== "" && tagSet.has(previousSelection)) {
      tagSelect.value = previousSelection;
    } else {
      tagSelect.value = "";
    }
  }

  function updateSummaryTotals(
    matched: readonly Activity[],
    currency: string,
  ): void {
    let totalInCents = 0;
    let totalOutCents = 0;
    for (const activity of matched) {
      if (activity.type === "expense") {
        totalOutCents += activity.amountCents;
      } else {
        totalInCents += activity.amountCents;
      }
    }
    const netCents = totalInCents - totalOutCents;

    replaceChildren(summaryInEl, text(formatCents(totalInCents, currency)));
    replaceChildren(summaryOutEl, text(formatCents(totalOutCents, currency)));
    replaceChildren(summaryNetEl, text(formatCents(netCents, currency)));
    setAttrs(summaryNetEl, {
      class:
        netCents < 0
          ? "insights-stat-value insights-net-negative"
          : "insights-stat-value",
    });

    const countLabel =
      matched.length === 1
        ? "1 matching activity"
        : `${matched.length} matching activities`;
    replaceChildren(summaryCountEl, text(countLabel));
  }

  // ---------------------------------------------------------------------------
  // 8. Refresh Pipeline with Stale-Render Guard (`refreshSeq`)
  // ---------------------------------------------------------------------------
  let refreshSeq = 0;

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;
    clearFilterError();

    let allActivities: Activity[];
    try {
      allActivities = await budget.listActivities();
    } catch (err) {
      if (seq !== refreshSeq) {
        return;
      }
      showFilterError(extractErrorMessage(err));
      return;
    }

    if (seq !== refreshSeq) {
      return;
    }

    const activeAll = allActivities.filter((a) => a.deletedAt === undefined);
    updateTagOptions(activeAll);

    // Build BudgetApi ActivityFilter from current controls
    const filter: ActivityFilter = {};
    const rawSince = sinceInput.value.trim();
    const rawUntil = untilInput.value.trim();

    if (rawSince.length > 0) {
      try {
        filter.since = dateInputToUtcSince(rawSince);
      } catch (err) {
        showFilterError(extractErrorMessage(err), sinceInput);
        return;
      }
    }

    if (rawUntil.length > 0) {
      try {
        filter.until = dateInputToUtcUntil(rawUntil);
      } catch (err) {
        showFilterError(extractErrorMessage(err), untilInput);
        return;
      }
    }

    if (
      filter.since !== undefined &&
      filter.until !== undefined &&
      rawSince > rawUntil
    ) {
      showFilterError("Start date must be on or before end date.", sinceInput);
      return;
    }

    if (tagSelect.value.length > 0) {
      filter.tag = tagSelect.value;
    }

    if (isActivityType(typeSelect.value)) {
      filter.type = typeSelect.value;
    }

    let searchResults: Activity[];
    try {
      searchResults = await budget.searchActivities(filter);
    } catch (err) {
      if (seq !== refreshSeq) {
        return;
      }
      showFilterError(extractErrorMessage(err));
      return;
    }

    if (seq !== refreshSeq) {
      return;
    }

    const normalizedKeyword = keywordInput.value.trim().toLowerCase();
    const matched = searchResults.filter(
      (a) => a.deletedAt === undefined && matchesKeyword(a, normalizedKeyword),
    );

    let tagSummaries: TagSummary[];
    try {
      tagSummaries = await budget.summarizeByTag(matched);
    } catch (err) {
      if (seq !== refreshSeq) {
        return;
      }
      showFilterError(extractErrorMessage(err));
      return;
    }

    if (seq !== refreshSeq) {
      return;
    }

    const periodSummaries = summarizeByPeriod(matched);
    const currency = matched[0]?.currency ?? activeAll[0]?.currency ?? "USD";

    // Update summary totals
    updateSummaryTotals(matched, currency);

    // Update Tag Rollups
    if (tagSummaries.length === 0) {
      replaceChildren(tagRollupListEl);
      setAttrs(tagRollupListEl, { hidden: "true" });
      const tagEmptyMsg =
        activeAll.length === 0
          ? "No activities recorded yet."
          : matched.length === 0
            ? "No tag rollups match the current filters."
            : "No tagged activities in the current selection.";
      replaceChildren(tagRollupEmptyEl, text(tagEmptyMsg));
      setAttrs(tagRollupEmptyEl, { hidden: null });
    } else {
      replaceChildren(
        tagRollupListEl,
        ...tagSummaries.map((s) => renderTagRollupItem(s, currency)),
      );
      setAttrs(tagRollupListEl, { hidden: null });
      setAttrs(tagRollupEmptyEl, { hidden: "true" });
    }

    // Update Period Rollups
    if (periodSummaries.length === 0) {
      replaceChildren(periodRollupListEl);
      setAttrs(periodRollupListEl, { hidden: "true" });
      const periodEmptyMsg =
        activeAll.length === 0
          ? "No activities recorded yet."
          : "No period rollups match the current filters.";
      replaceChildren(periodRollupEmptyEl, text(periodEmptyMsg));
      setAttrs(periodRollupEmptyEl, { hidden: null });
    } else {
      replaceChildren(
        periodRollupListEl,
        ...periodSummaries.map((s) => renderPeriodRollupItem(s, currency)),
      );
      setAttrs(periodRollupListEl, { hidden: null });
      setAttrs(periodRollupEmptyEl, { hidden: "true" });
    }

    // Update Matching Activities list & distinct empty states
    if (matched.length === 0) {
      replaceChildren(activityListEl);
      setAttrs(activityListEl, { hidden: "true" });
      const emptyMsg =
        activeAll.length === 0
          ? "No activities recorded yet. Add transactions on the Budget tab to see spending insights."
          : "No activities match your current filters. Try adjusting or resetting the filters.";
      replaceChildren(emptyStateEl, text(emptyMsg));
      setAttrs(emptyStateEl, {
        hidden: null,
        "data-empty-kind": activeAll.length === 0 ? "no-data" : "no-matches",
      });
    } else {
      const sorted = [...matched].sort(compareActivitiesNewestFirst);
      replaceChildren(activityListEl, ...sorted.map(renderActivityItem));
      setAttrs(activityListEl, { hidden: null });
      setAttrs(emptyStateEl, { hidden: "true", "data-empty-kind": null });
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Event Listeners
  // ---------------------------------------------------------------------------
  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void refresh();
  });

  sinceInput.addEventListener("change", () => {
    void refresh();
  });

  untilInput.addEventListener("change", () => {
    void refresh();
  });

  tagSelect.addEventListener("change", () => {
    void refresh();
  });

  typeSelect.addEventListener("change", () => {
    void refresh();
  });

  keywordInput.addEventListener("input", () => {
    void refresh();
  });

  resetBtn.addEventListener("click", () => {
    sinceInput.value = "";
    untilInput.value = "";
    tagSelect.value = "";
    typeSelect.value = "";
    keywordInput.value = "";
    clearFilterError();
    void refresh();
  });

  // ---------------------------------------------------------------------------
  // 10. Mount Dual-State Layout into `#panel-insights`
  // ---------------------------------------------------------------------------
  const controlsPane = el("div", { class: "insights-controls-pane" }, [
    filtersSection,
    summarySection,
    tagRollupSection,
  ]);

  const resultsPane = el("div", { class: "insights-results-pane" }, [
    periodRollupSection,
    activitiesSection,
  ]);

  const layout = el("div", { class: "insights-layout" }, [
    controlsPane,
    resultsPane,
  ]);

  replaceChildren(container, layout);

  return {
    refresh,
  };
}
