// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BudgetApi, createBudgetApi } from "../budgetApi";
import type { Activity } from "../core/types";
import { InMemoryAdapter } from "../storage/memory";
import { type InsightsTabController, mountInsightsTab } from "./insightsTab";
import { renderShell, type ShellHandle } from "./shell";

let root: HTMLElement;
let shell: ShellHandle;
let adapter: InMemoryAdapter;
let budget: BudgetApi;
let controller: InsightsTabController;
let idCounter = 0;

async function setup(options?: { now?: () => Date }) {
  idCounter = 0;
  root = document.createElement("div");
  document.body.appendChild(root);
  shell = renderShell(root);

  adapter = new InMemoryAdapter();
  const fixedNow = options?.now ?? (() => new Date("2026-06-15T14:30:00.000Z"));
  budget = createBudgetApi({
    adapter,
    idFactory: () => `id-${++idCounter}`,
    now: fixedNow,
  });
  await budget.init();

  controller = mountInsightsTab({
    container: shell.panels.insights,
    budget,
  });
  await controller.refresh();
}

function dispatchEvent(target: HTMLElement, type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  root?.remove();
  if (shell?.dialog.open) {
    shell.close();
  }
});

describe("mountInsightsTab", () => {
  it("renders accessible filter controls with labels, $0.00 summary, and distinct no-data empty state", async () => {
    await setup();

    const panel = shell.panels.insights;

    // Programmatic <label for="..."> for every filter input/select
    const controlIds = [
      "insights-filter-since",
      "insights-filter-until",
      "insights-filter-tag",
      "insights-filter-type",
      "insights-filter-keyword",
    ];
    for (const id of controlIds) {
      const control = panel.querySelector(`#${id}`);
      const label = panel.querySelector(`label[for="${id}"]`);
      expect(control).not.toBeNull();
      expect(label).not.toBeNull();
      expect(label?.textContent?.trim().length).toBeGreaterThan(0);
    }

    // Form submit prevents default (CSP form-action 'none')
    const form = panel.querySelector(
      "form.insights-filter-form",
    ) as HTMLFormElement;
    const submitEvent = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);
    await flushAsync();

    // Summary totals and aria-live region
    const summarySection = panel.querySelector(
      ".insights-summary",
    ) as HTMLElement;
    expect(summarySection.getAttribute("aria-live")).toBe("polite");
    expect(summarySection.getAttribute("aria-atomic")).toBe("true");
    expect(panel.querySelector("#insights-summary-in")?.textContent).toBe(
      "$0.00",
    );
    expect(panel.querySelector("#insights-summary-out")?.textContent).toBe(
      "$0.00",
    );
    expect(panel.querySelector("#insights-summary-net")?.textContent).toBe(
      "$0.00",
    );
    expect(panel.querySelector("#insights-summary-count")?.textContent).toBe(
      "0 matching activities",
    );

    // Distinct no-data empty state
    const emptyEl = panel.querySelector("#insights-empty-state") as HTMLElement;
    expect(emptyEl.hidden).toBe(false);
    expect(emptyEl.getAttribute("data-empty-kind")).toBe("no-data");
    expect(emptyEl.textContent).toContain("No activities recorded yet");

    const listEl = panel.querySelector(
      "#insights-activity-list",
    ) as HTMLUListElement;
    expect(listEl.hidden).toBe(true);
  });

  it("renders tag rollups, period rollups, summary totals, and matching activities", async () => {
    await setup();

    await budget.addActivity({
      type: "income",
      amountCents: 250000,
      dateTime: "2026-05-01T12:00:00.000Z",
      tags: ["salary", "work"],
      memo: "May paycheck",
    });
    await budget.addActivity({
      type: "expense",
      amountCents: 12050,
      dateTime: "2026-05-10T15:00:00.000Z",
      tags: ["groceries"],
      memo: "Weekly market",
    });
    await budget.addActivity({
      type: "deposit",
      amountCents: 50000,
      dateTime: "2026-06-05T09:00:00.000Z",
      tags: ["savings"],
      memo: "Bonus transfer",
    });

    await controller.refresh();

    const panel = shell.panels.insights;

    // Summary totals: in = 250000 + 50000 = $3,000.00, out = $120.50, net = $2,879.50
    expect(panel.querySelector("#insights-summary-in")?.textContent).toBe(
      "$3,000.00",
    );
    expect(panel.querySelector("#insights-summary-out")?.textContent).toBe(
      "$120.50",
    );
    expect(panel.querySelector("#insights-summary-net")?.textContent).toBe(
      "$2,879.50",
    );
    expect(panel.querySelector("#insights-summary-count")?.textContent).toBe(
      "3 matching activities",
    );

    // Tag select populated with sorted tags + "All tags"
    const tagSelect = panel.querySelector(
      "#insights-filter-tag",
    ) as HTMLSelectElement;
    const tagValues = Array.from(tagSelect.options).map((o) => o.value);
    expect(tagValues).toEqual(["", "groceries", "salary", "savings", "work"]);

    // Tag rollups (alphabetical: groceries, salary, savings, work)
    const tagItems = Array.from(
      panel.querySelectorAll("#insights-tag-rollups > li"),
    );
    expect(tagItems).toHaveLength(4);
    expect(tagItems[0]?.getAttribute("data-tag")).toBe("groceries");
    expect(tagItems[0]?.textContent).toContain("$120.50");
    expect(tagItems[1]?.getAttribute("data-tag")).toBe("salary");
    expect(tagItems[1]?.textContent).toContain("$2,500.00");

    // Period rollups (chronological: 2026-05, 2026-06)
    const periodItems = Array.from(
      panel.querySelectorAll("#insights-period-rollups > li"),
    );
    expect(periodItems).toHaveLength(2);
    expect(periodItems[0]?.getAttribute("data-period")).toBe("2026-05");
    expect(periodItems[0]?.textContent).toContain("$2,500.00");
    expect(periodItems[0]?.textContent).toContain("$120.50");
    expect(periodItems[1]?.getAttribute("data-period")).toBe("2026-06");
    expect(periodItems[1]?.textContent).toContain("$500.00");

    // Matching activities sorted newest-first
    const activityItems = Array.from(
      panel.querySelectorAll("#insights-activity-list > li"),
    );
    expect(activityItems).toHaveLength(3);
    expect(activityItems[0]?.textContent).toContain("Bonus transfer");
    expect(activityItems[1]?.textContent).toContain("Weekly market");
    expect(activityItems[2]?.textContent).toContain("May paycheck");
  });

  it("filters by date range (since/until), tag, type, and case-insensitive keyword, then resets cleanly", async () => {
    await setup();

    await budget.addActivity({
      type: "expense",
      amountCents: 4500,
      dateTime: "2026-04-15T10:00:00.000Z",
      tags: ["food", "coffee"],
      memo: "Morning Espresso",
    });
    await budget.addActivity({
      type: "expense",
      amountCents: 8000,
      dateTime: "2026-05-20T18:00:00.000Z",
      tags: ["food", "dinner"],
      memo: "Bistro Dinner",
    });
    await budget.addActivity({
      type: "income",
      amountCents: 100000,
      dateTime: "2026-05-20T09:00:00.000Z",
      tags: ["freelance"],
      memo: "Client Invoice",
    });

    await controller.refresh();

    const panel = shell.panels.insights;
    const sinceInput = panel.querySelector(
      "#insights-filter-since",
    ) as HTMLInputElement;
    const untilInput = panel.querySelector(
      "#insights-filter-until",
    ) as HTMLInputElement;
    const tagSelect = panel.querySelector(
      "#insights-filter-tag",
    ) as HTMLSelectElement;
    const typeSelect = panel.querySelector(
      "#insights-filter-type",
    ) as HTMLSelectElement;
    const keywordInput = panel.querySelector(
      "#insights-filter-keyword",
    ) as HTMLInputElement;
    const resetBtn = panel.querySelector(
      "#insights-filter-reset",
    ) as HTMLButtonElement;

    // 1. Date range filter (inclusive May 1 - May 31)
    sinceInput.value = "2026-05-01";
    untilInput.value = "2026-05-31";
    dispatchEvent(untilInput, "change");
    await flushAsync();

    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      2,
    );

    // 2. Intersect with type = expense
    typeSelect.value = "expense";
    dispatchEvent(typeSelect, "change");
    await flushAsync();

    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      1,
    );
    expect(
      panel.querySelector("#insights-activity-list > li")?.textContent,
    ).toContain("Bistro Dinner");

    // 3. Intersect with tag = food
    tagSelect.value = "food";
    dispatchEvent(tagSelect, "change");
    await flushAsync();
    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      1,
    );

    // 4. Case-insensitive keyword matching memo
    keywordInput.value = "BISTRO";
    dispatchEvent(keywordInput, "input");
    await flushAsync();
    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      1,
    );

    // 5. Non-matching keyword -> distinct no-matches empty state
    keywordInput.value = "nonexistent-term";
    dispatchEvent(keywordInput, "input");
    await flushAsync();

    const emptyEl = panel.querySelector("#insights-empty-state") as HTMLElement;
    expect(emptyEl.hidden).toBe(false);
    expect(emptyEl.getAttribute("data-empty-kind")).toBe("no-matches");
    expect(emptyEl.textContent).toContain("No activities match");

    // 6. Reset button restores all 3 activities and clears inputs
    expect(resetBtn.type).toBe("button");
    resetBtn.click();
    await flushAsync();

    expect(sinceInput.value).toBe("");
    expect(untilInput.value).toBe("");
    expect(tagSelect.value).toBe("");
    expect(typeSelect.value).toBe("");
    expect(keywordInput.value).toBe("");
    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      3,
    );
  });

  it("shows inline role='alert' error when start date is after end date", async () => {
    await setup();

    const panel = shell.panels.insights;
    const sinceInput = panel.querySelector(
      "#insights-filter-since",
    ) as HTMLInputElement;
    const untilInput = panel.querySelector(
      "#insights-filter-until",
    ) as HTMLInputElement;
    const errorEl = panel.querySelector(
      "#insights-filter-error",
    ) as HTMLElement;

    sinceInput.value = "2026-08-01";
    untilInput.value = "2026-07-01";
    dispatchEvent(untilInput, "change");
    await flushAsync();

    expect(errorEl.hidden).toBe(false);
    expect(errorEl.getAttribute("role")).toBe("alert");
    expect(errorEl.textContent).toContain(
      "Start date must be on or before end date",
    );
    expect(sinceInput.getAttribute("aria-invalid")).toBe("true");

    // Reset clears error
    (
      panel.querySelector("#insights-filter-reset") as HTMLButtonElement
    ).click();
    await flushAsync();
    expect(errorEl.hidden).toBe(true);
    expect(sinceInput.getAttribute("aria-invalid")).toBeNull();
  });

  it("honors Activity.period for recurring items in Period Rollups (OQ-2)", async () => {
    await setup({ now: () => new Date("2026-03-15T12:00:00.000Z") });

    // Create a recurring rule and post 2026-03
    await budget.addRule({
      name: "Monthly Rent",
      type: "expense",
      amountCents: 150000,
      schedule: { cadence: "monthly", dayOfMonth: 1 },
      active: true,
    });
    const { posted } = await budget.runRecurringEngine(
      new Date("2026-03-15T12:00:00.000Z"),
    );
    expect(posted).toHaveLength(1);

    const firstPosted = posted[0];
    expect(firstPosted).toBeDefined();
    if (firstPosted === undefined) {
      return;
    }

    // Edit the recurring activity's dateTime into April (2026-04-02) while its
    // authoritative Activity.period remains "2026-03", and tag it "housing"
    await budget.editActivity(firstPosted.id, {
      dateTime: "2026-04-02T12:00:00.000Z",
      tags: ["housing"],
    });

    // Also add a manual activity in April
    await budget.addActivity({
      type: "expense",
      amountCents: 5000,
      dateTime: "2026-04-10T12:00:00.000Z",
      tags: ["utilities"],
      memo: "Water bill",
    });

    await controller.refresh();

    const panel = shell.panels.insights;
    const periodItems = Array.from(
      panel.querySelectorAll("#insights-period-rollups > li"),
    );
    expect(periodItems).toHaveLength(2);

    // Recurring item attributed to "2026-03" via Activity.period (not "2026-04")
    expect(periodItems[0]?.getAttribute("data-period")).toBe("2026-03");
    expect(periodItems[0]?.textContent).toContain("$1,500.00");
    expect(periodItems[0]?.textContent).toContain("housing");

    // Manual item attributed to "2026-04" via UTC dateTime
    expect(periodItems[1]?.getAttribute("data-period")).toBe("2026-04");
    expect(periodItems[1]?.textContent).toContain("$50.00");
    expect(periodItems[1]?.textContent).toContain("utilities");
  });

  it("renders untagged activities cleanly with a helpful Tag Rollup note", async () => {
    await setup();

    await budget.addActivity({
      type: "expense",
      amountCents: 2500,
      dateTime: "2026-06-10T12:00:00.000Z",
      tags: [],
      memo: "Cash snack",
    });
    await controller.refresh();

    const panel = shell.panels.insights;
    expect(panel.querySelectorAll("#insights-activity-list > li")).toHaveLength(
      1,
    );
    const tagList = panel.querySelector("#insights-tag-rollups") as HTMLElement;
    expect(tagList.hidden).toBe(true);
    expect(
      panel.querySelector(".insights-tag-section .insights-empty-note")
        ?.textContent,
    ).toContain("No tagged activities");
  });

  it("guards against out-of-order async refresh calls via refreshSeq", async () => {
    await setup();

    let resolveFirst!: (value: Activity[]) => void;
    const firstPromise = new Promise<Activity[]>((resolve) => {
      resolveFirst = resolve;
    });

    const staleActivity: Activity = {
      id: "stale-1",
      type: "expense",
      amountCents: 99900,
      currency: "USD",
      dateTime: "2026-01-01T12:00:00.000Z",
      tags: ["stale"],
      memo: "Stale result",
      source: "manual",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };

    const freshActivity: Activity = {
      id: "fresh-1",
      type: "income",
      amountCents: 12300,
      currency: "USD",
      dateTime: "2026-06-01T12:00:00.000Z",
      tags: ["fresh"],
      memo: "Fresh result",
      source: "manual",
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
    };

    const listSpy = vi.spyOn(budget, "listActivities");
    const searchSpy = vi.spyOn(budget, "searchActivities");

    listSpy
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => [freshActivity]);
    searchSpy.mockImplementation(async () => [freshActivity]);

    const r1 = controller.refresh();
    const r2 = controller.refresh();
    await r2;

    // Now resolve the slower, older refresh — must be ignored
    resolveFirst([staleActivity]);
    await r1;

    const panel = shell.panels.insights;
    const items = panel.querySelectorAll("#insights-activity-list > li");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("Fresh result");
    expect(panel.textContent).not.toContain("Stale result");
  });

  it("renders DOM XSS payloads in memo and tags strictly as inert text nodes", async () => {
    await setup();

    const xssMemo = `<img src=x onerror=alert("memo-xss")>`;
    const xssTag = `<script>alert("tag-xss")</script>`;

    await budget.addActivity({
      type: "expense",
      amountCents: 1999,
      dateTime: "2026-06-12T10:00:00.000Z",
      tags: [xssTag],
      memo: xssMemo,
    });
    await controller.refresh();

    const panel = shell.panels.insights;
    expect(panel.querySelectorAll("img")).toHaveLength(0);
    expect(panel.querySelectorAll("script")).toHaveLength(0);
    expect(panel.textContent).toContain(xssMemo);
    expect(panel.textContent).toContain(xssTag);
  });
});
