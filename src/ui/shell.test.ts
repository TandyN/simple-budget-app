// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { type ConfirmDialog, renderShell, type ShellHandle } from "./shell";

/**
 * Behavior tests for the accessible 3-tab shell (`src/ui/shell.ts`).
 *
 * Runs in the `happy-dom` environment (a devDependency, dev/test time only —
 * `project-plan/dependency-strategy.md`: dev deps never ship; `dependencies`
 * stays `{}`). Verifies the WCAG 2.2 AA shell contract from
 * `project-plan/frontend.md → Semantic HTML & WCAG 2.2 AA Accessibility`:
 * correct ARIA tab/tabpanel wiring, roving `tabindex`, arrow-key navigation,
 * and the native `<dialog>` confirmation helper with focus return.
 */

let container: HTMLElement;
let shell: ShellHandle;
let dialog: ConfirmDialog;

function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  shell = renderShell(container);
  // Confirm backwards compatibility with the Phase 4A `ConfirmDialog` contract.
  dialog = shell;
}

afterEach(() => {
  container?.remove();
  if (dialog.dialog.open) {
    dialog.close();
  }
});

describe("renderShell", () => {
  it("creates a <nav role=tablist> with exactly 3 <button role=tab> controls", () => {
    render();
    const tablist = container.querySelector('nav[role="tablist"]');
    expect(tablist).not.toBeNull();

    const tabs = container.querySelectorAll('button[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(Array.from(tabs).map((t) => t.textContent)).toEqual([
      "Budget",
      "Insights",
      "Settings",
    ]);
  });

  it("pairs every tab with its panel via aria-controls / aria-labelledby", () => {
    render();
    for (const tabId of ["tab-budget", "tab-insights", "tab-settings"]) {
      const tab = container.querySelector(`#${tabId}`) as HTMLButtonElement;
      const panelId = tab.getAttribute("aria-controls");
      expect(panelId).not.toBeNull();
      const panel = container.querySelector(`#${panelId}`) as HTMLElement;
      expect(panel.getAttribute("role")).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe(tabId);
      // No two IDs may collide: panel ids are distinct from tab ids.
      expect(panel.id).not.toBe(tab.id);
    }
  });

  it("selects Budget by default: aria-selected=true, tabindex=0, panel visible", () => {
    render();
    const budget = container.querySelector("#tab-budget") as HTMLButtonElement;
    const insights = container.querySelector(
      "#tab-insights",
    ) as HTMLButtonElement;
    const settings = container.querySelector(
      "#tab-settings",
    ) as HTMLButtonElement;

    expect(budget.getAttribute("aria-selected")).toBe("true");
    expect(budget.tabIndex).toBe(0);
    expect(
      (container.querySelector("#panel-budget") as HTMLElement).hidden,
    ).toBe(false);

    expect(insights.getAttribute("aria-selected")).toBe("false");
    expect(insights.tabIndex).toBe(-1);
    expect(settings.getAttribute("aria-selected")).toBe("false");
    expect(settings.tabIndex).toBe(-1);
    expect(
      (container.querySelector("#panel-insights") as HTMLElement).hidden,
    ).toBe(true);
    expect(
      (container.querySelector("#panel-settings") as HTMLElement).hidden,
    ).toBe(true);
  });

  it("clicking a tab moves aria-selected / tabindex and shows its panel", () => {
    render();
    (
      container.querySelector("#tab-insights") as HTMLButtonElement
    ).dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(
      (
        container.querySelector("#tab-insights") as HTMLButtonElement
      ).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      (container.querySelector("#tab-insights") as HTMLButtonElement).tabIndex,
    ).toBe(0);
    expect(
      (container.querySelector("#panel-insights") as HTMLElement).hidden,
    ).toBe(false);

    expect(
      (
        container.querySelector("#tab-budget") as HTMLButtonElement
      ).getAttribute("aria-selected"),
    ).toBe("false");
    expect(
      (container.querySelector("#tab-budget") as HTMLButtonElement).tabIndex,
    ).toBe(-1);
    expect(
      (container.querySelector("#panel-budget") as HTMLElement).hidden,
    ).toBe(true);
  });

  it("ArrowRight from tab 1 selects tab 2 and moves focus (wrapping ArrowLeft)", () => {
    render();
    const tablist = container.querySelector("nav[role=tablist]") as HTMLElement;

    tablist.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(
      (
        container.querySelector("#tab-insights") as HTMLButtonElement
      ).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.activeElement?.id).toBe("tab-insights");

    // Wrapping: ArrowLeft from the first tab lands on the last tab.
    tablist.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    tablist.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(
      (
        container.querySelector("#tab-settings") as HTMLButtonElement
      ).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.activeElement?.id).toBe("tab-settings");
  });

  it("opens the native <dialog> via showModal() and the close event returns focus to the invoking tab", () => {
    render();
    const dialogEl = dialog.dialog;
    expect(dialogEl).toBeInstanceOf(HTMLDialogElement);
    expect(dialogEl.open).toBe(false);

    // Open from the default (Budget) tab.
    dialog.open();
    expect(dialogEl.open).toBe(true);

    // Close it; the native `close` event must restore focus to the invoking tab.
    dialog.close();
    expect(dialogEl.open).toBe(false);
    expect(document.activeElement?.id).toBe("tab-budget");
  });

  it("gives every interactive element a >= 44x44 CSS px hit target", () => {
    render();
    const controls = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
      ...dialog.dialog.querySelectorAll<HTMLButtonElement>("button"),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const control of controls) {
      const minWidth = parseFloat(control.style.minWidth);
      const minHeight = parseFloat(control.style.minHeight);
      expect(minWidth).toBeGreaterThanOrEqual(44);
      expect(minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("exposes direct panel handles for budget, insights, and settings", () => {
    render();
    expect(shell.panels.budget).toBe(container.querySelector("#panel-budget"));
    expect(shell.panels.insights).toBe(
      container.querySelector("#panel-insights"),
    );
    expect(shell.panels.settings).toBe(
      container.querySelector("#panel-settings"),
    );
  });

  it("confirm() resolves true on Confirm click, renders safe text, and restores focus to invoker", async () => {
    render();
    const invoker = document.createElement("button");
    invoker.id = "delete-btn";
    shell.panels.budget.appendChild(invoker);
    invoker.focus();

    const payload = '<img src=x onerror="alert(1)">';
    const promise = shell.confirm({
      title: `Delete ${payload}`,
      message: `Remove ${payload}?`,
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      invoker,
    });

    expect(shell.dialog.open).toBe(true);
    expect(
      shell.dialog.querySelector(".confirm-dialog-title")?.textContent,
    ).toBe(`Delete ${payload}`);
    expect(
      shell.dialog.querySelector(".confirm-dialog-message")?.textContent,
    ).toBe(`Remove ${payload}?`);
    expect(shell.dialog.querySelector("img")).toBeNull();

    const confirmBtn = shell.dialog.querySelector(
      ".confirm-dialog-confirm",
    ) as HTMLButtonElement;
    const cancelBtn = shell.dialog.querySelector(
      ".confirm-dialog-cancel",
    ) as HTMLButtonElement;
    expect(confirmBtn.textContent).toBe("Delete");
    expect(cancelBtn.textContent).toBe("Keep");

    confirmBtn.click();
    await expect(promise).resolves.toBe(true);
    expect(shell.dialog.open).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });

  it("confirm() resolves false on Cancel click and resets default button labels", async () => {
    render();
    const first = shell.confirm({
      title: "Custom",
      message: "Custom msg",
      confirmLabel: "Yes",
      cancelLabel: "No",
    });
    (
      shell.dialog.querySelector(".confirm-dialog-cancel") as HTMLButtonElement
    ).click();
    await expect(first).resolves.toBe(false);
    expect(document.activeElement?.id).toBe("tab-budget");

    // Next call omits custom labels; defaults must be restored.
    const second = shell.confirm({
      title: "Default labels",
      message: "Proceed?",
    });
    expect(
      shell.dialog.querySelector(".confirm-dialog-confirm")?.textContent,
    ).toBe("Confirm");
    expect(
      shell.dialog.querySelector(".confirm-dialog-cancel")?.textContent,
    ).toBe("Cancel");
    (
      shell.dialog.querySelector(".confirm-dialog-cancel") as HTMLButtonElement
    ).click();
    await expect(second).resolves.toBe(false);
  });

  it("confirm() resolves false on Escape / native close and falls back to active tab when invoker is omitted", async () => {
    render();
    (
      container.querySelector("#tab-settings") as HTMLButtonElement
    ).dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const promise = shell.confirm({
      title: "Discard changes",
      message: "Unsaved changes will be lost.",
    });
    expect(shell.dialog.open).toBe(true);

    // Native Escape closes the modal dialog, firing `close`.
    shell.dialog.close();
    await expect(promise).resolves.toBe(false);
    expect(document.activeElement?.id).toBe("tab-settings");
  });

  it("confirm() settles any prior pending confirmation as false if re-invoked while open", async () => {
    render();
    const first = shell.confirm({
      title: "First",
      message: "First prompt",
    });
    const second = shell.confirm({
      title: "Second",
      message: "Second prompt",
    });

    await expect(first).resolves.toBe(false);
    expect(shell.dialog.open).toBe(true);
    expect(
      shell.dialog.querySelector(".confirm-dialog-title")?.textContent,
    ).toBe("Second");

    (
      shell.dialog.querySelector(".confirm-dialog-confirm") as HTMLButtonElement
    ).click();
    await expect(second).resolves.toBe(true);
  });

  it("confirm() ignores stale async close events dispatched while the dialog is still open", async () => {
    render();
    const invoker = document.createElement("button");
    invoker.id = "stale-close-invoker";
    shell.panels.budget.appendChild(invoker);
    invoker.focus();

    let settled = false;
    const promise = shell
      .confirm({
        title: "Active prompt",
        message: "Still open",
        invoker,
      })
      .then((value) => {
        settled = true;
        return value;
      });

    expect(shell.dialog.open).toBe(true);
    const confirmBtn = shell.dialog.querySelector(
      ".confirm-dialog-confirm",
    ) as HTMLButtonElement;
    confirmBtn.focus();
    expect(document.activeElement).toBe(confirmBtn);

    // Simulate a queued `close` event from a prior `dialog.close()` firing on
    // a later macrotask while the re-opened dialog is still open.
    shell.dialog.dispatchEvent(new Event("close"));
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(shell.dialog.open).toBe(true);
    expect(document.activeElement).toBe(confirmBtn);

    confirmBtn.click();
    await expect(promise).resolves.toBe(true);
    expect(settled).toBe(true);
    expect(shell.dialog.open).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });
});
