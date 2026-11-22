/**
 * Accessible 3-tab application shell for `simple-budget-app`.
 *
 * `project-plan/frontend.md → Semantic HTML & WCAG 2.2 AA Accessibility`:
 * the shell is a `<nav role="tablist">` with three `<button role="tab">`
 * controls (`Budget`, `Insights`, `Settings`) paired with
 * `<section role="tabpanel">` landmarks, a native `<dialog>` helper for
 * confirmation prompts (built-in focus trapping, backdrop inert handling,
 * `Escape` dismissal — no modal library), roving `tabindex` + arrow-key
 * navigation, and `>= 44×44 CSS px` touch-target semantics on every
 * interactive element.
 *
 * Built **exclusively** through the `./dom` safe-DOM helpers
 * (`el` / `text` / `setAttrs` / `replaceChildren`) — the only DOM API set in
 * use — so no HTML-parsing DOM sinks or dynamic-code-evaluation sinks appear
 * anywhere (`project-plan/frontend.md → DOM XSS Ban (Safe DOM APIs Only)`,
 * enforced by Gate 4 of `scripts/verify-build-gates.mjs`). Zero production
 * dependencies: only built-in Web-platform DOM APIs are used
 * (`project-plan/dependency-strategy.md`).
 *
 * Panels carry **placeholder** content only; the functional Budget/Insights/
 * Settings workflows are deferred to Phases 4B/4C
 * (`project-plan/build-order.md`).
 */

import { el, replaceChildren, setAttrs, text } from "./dom";

/** The three shell tabs, in fixed display order. */
const TABS = ["budget", "insights", "settings"] as const;

type Tab = (typeof TABS)[number];

/**
 * Title-case display label for a tab (`budget` → `Budget`). All labels are
 * static developer-controlled strings, so plain string interpolation is safe.
 */
function labelFor(tab: Tab): string {
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

/**
 * A single interactive control with `>= 44×44 CSS px` hit-target semantics
 * (`project-plan/frontend.md`: `min-height: 2.75rem; min-width: 2.75rem` —
 * the CSS task in #276 carries the full design system; the shell guarantees
 * the WCAG 2.5.8 touch-target floor by construction).
 */
function control(
  tag: string,
  attrs: Record<string, string | null>,
  label: string,
): HTMLElement {
  const node = el(tag, attrs, [text(label)]);
  const style = (node as HTMLElement).style;
  style.minWidth = "44px";
  style.minHeight = "44px";
  return node as HTMLElement;
}

/**
 * The `<dialog>` confirmation helper: a native `<dialog>` with `Confirm`
 * and `Cancel` actions. `open()` shows it modeless-to-modal via
 * `showModal()` (native focus trap + backdrop inert); `close()` returns
 * focus to the invoking tab, satisfying WCAG 2.2 AA focus-return.
 *
 * @param getInvoker the tab element that opened the dialog (the focus
 *   return target on close)
 * @returns the open/close handle
 */
function createConfirmDialog(getInvoker: () => HTMLButtonElement): {
  readonly dialog: HTMLDialogElement;
  open(): void;
  close(): void;
} {
  const dialog = el("dialog", { class: "confirm-dialog" }) as HTMLDialogElement;

  const heading = el("h2", { class: "confirm-dialog-title" }, [
    text("Please confirm"),
  ]);
  const message = el("p", { class: "confirm-dialog-message" }, [
    text("Do you want to continue?"),
  ]);

  const close = (): void => {
    if (!dialog.open) {
      return;
    }
    // The native `close` event (below) restores focus to the invoker.
    dialog.close();
  };

  // Both actions dismiss the dialog and return focus to the invoking tab.
  // Later phases (4B/4C) will differentiate the resolved choice
  // (Confirm vs. Cancel) in their own views.
  const actions = el("div", { class: "confirm-dialog-actions" }, [
    control(
      "button",
      { class: "confirm-dialog-cancel", type: "button" },
      "Cancel",
    ),
    control(
      "button",
      { class: "confirm-dialog-confirm", type: "button" },
      "Confirm",
    ),
  ]);
  (actions as HTMLElement).addEventListener("click", (event) => {
    if (event.target instanceof HTMLButtonElement) {
      close();
    }
  });

  // Native `Escape` dismissal closes the dialog (firing `close`); restore
  // focus to the invoking tab so focus is never stranded in the closed
  // dialog (WCAG 2.2 AA focus return).
  dialog.addEventListener("close", () => {
    getInvoker().focus();
  });

  replaceChildren(dialog, heading, message, actions);

  return {
    dialog,
    open(): void {
      if (!dialog.open) {
        dialog.showModal();
      }
    },
    close,
  };
}

/**
 * Renders the accessible 3-tab shell into `container`.
 *
 * - Builds `<nav role="tablist">` with three `<button role="tab"
 *   aria-selected aria-controls tabindex>` controls, `Budget` selected and
 *   focused by default (roving `tabindex`: selected tab `0`, others `-1`).
 * - Builds three `<section role="tabpanel" id="panel-<tab>"
 *   aria-labelledby="tab-<tab>">` placeholders; only the selected panel is
 *   visible (`hidden` on the rest).
 * - Tab clicks switch panels and update `aria-selected` / `tabindex`.
 * - `ArrowLeft` / `ArrowRight` on the tablist move the selection (wrapping),
 *   per the WAI-ARIA tabs pattern.
 * - Provides a native `<dialog>` confirmation helper (`showModal()` /
 *   `close()` with focus returned to the invoking tab).
 *
 * Every interactive element (tabs and dialog buttons) enforces the
 * `>= 44×44 CSS px` minimum hit target.
 *
 * @param container the element the shell is rendered into (e.g. `#app`)
 * @returns the `ConfirmDialog` handle so later phases can present
 *   confirmation prompts
 */
export function renderShell(container: HTMLElement): ConfirmDialog {
  const tablist = el("nav", { role: "tablist" }) as HTMLElement;
  const panels = {} as Record<Tab, HTMLElement>;
  const tabs = {} as Record<Tab, HTMLButtonElement>;

  for (const tab of TABS) {
    const selected = tab === "budget";
    const tabButton = control(
      "button",
      {
        id: `tab-${tab}`,
        role: "tab",
        type: "button",
        "aria-selected": selected ? "true" : "false",
        "aria-controls": `panel-${tab}`,
        tabindex: selected ? "0" : "-1",
      },
      labelFor(tab),
    ) as HTMLButtonElement;
    tabs[tab] = tabButton;

    const panel = el(
      "section",
      {
        id: `panel-${tab}`,
        role: "tabpanel",
        "aria-labelledby": `tab-${tab}`,
        hidden: selected ? null : "true",
      },
      [text(`${labelFor(tab)} placeholder — content ships in a later phase.`)],
    ) as HTMLElement;
    panels[tab] = panel;
  }

  let activeTab: Tab = "budget";

  const selectTab = (tab: Tab, focus: boolean): void => {
    activeTab = tab;
    for (const other of TABS) {
      const isSelected = other === tab;
      setAttrs(tabs[other], {
        "aria-selected": isSelected ? "true" : "false",
        tabindex: isSelected ? "0" : "-1",
      });
      const hidden = isSelected ? null : "true";
      setAttrs(panels[other], { hidden });
    }
    if (focus) {
      tabs[tab].focus();
    }
  };

  const moveTab = (direction: 1 | -1, focus: boolean): void => {
    const index = TABS.indexOf(activeTab);
    const next = (index + direction + TABS.length) % TABS.length;
    const nextTab = TABS[next] as Tab;
    selectTab(nextTab, focus);
  };

  for (const tab of TABS) {
    tabs[tab].addEventListener("click", () => selectTab(tab, true));
  }

  tablist.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTab(1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTab(-1, true);
    }
  });

  replaceChildren(tablist, ...TABS.map((tab) => tabs[tab]));

  const dialogHelper = createConfirmDialog(() => tabs[activeTab]);

  replaceChildren(
    container,
    tablist,
    ...TABS.map((tab) => panels[tab]),
    dialogHelper.dialog,
  );

  return dialogHelper;
}

/** Handle for the shell's native `<dialog>` confirmation helper. */
export interface ConfirmDialog {
  /** The underlying native `<dialog>` element. */
  readonly dialog: HTMLDialogElement;
  /** Opens the dialog modeally (`showModal()`). */
  open(): void;
  /** Closes the dialog and returns focus to the invoking tab. */
  close(): void;
}
