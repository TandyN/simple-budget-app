/**
 * Safe-DOM construction helpers for `src/ui/`.
 *
 * This is the foundational primitive every UI task builds on. It is
 * framework-free, DOM-only, and composable: small generic helpers that build
 * and assemble the DOM **exclusively** through the safe DOM APIs —
 * `document.createElement`, `document.createTextNode`, `node.textContent`,
 * `element.setAttribute`, and `element.replaceChildren`.
 *
 * `project-plan/frontend.md → Security & Privacy Guardrails → 2. DOM XSS Ban
 * (Safe DOM APIs Only)`: with no virtual-DOM framework auto-escaping
 * templates, every view MUST construct and update DOM nodes through those safe
 * APIs only. HTML-parsing DOM sinks and dynamic-code-evaluation sinks are
 * prohibited anywhere in `src/` and are enforced at build time by **Gate 4** of
 * `scripts/verify-build-gates.mjs` (the banned-sink scan). These helpers make
 * the safe API set the *only* way code in this layer can build the DOM, so the
 * guarantee is enforced by construction.
 *
 * **XSS posture:** all user-controlled strings (e.g. `Activity.tags`,
 * `Activity.memo`, `RecurringRule.name`, currency, or any field originating
 * from imported JSON backups) must be rendered via `text(...)` — which uses
 * `document.createTextNode` — or assigned through `textContent`. An arbitrary
 * payload such as `<img src=x onerror=alert(1)>` is therefore stored as inert
 * literal text and can never be parsed as markup.
 *
 * `project-plan/dependency-strategy.md` — zero production dependencies: this
 * module imports no package and uses only built-in Web-platform DOM APIs that
 * exist in all three targets (PWA / iOS WKWebView / Android WebView).
 */

/**
 * A single attribute map: attribute name → value, or `null` to **remove** the
 * attribute (useful for toggling `aria-*`, `disabled`, `hidden`, ...).
 */
export type ElAttrs = Record<string, string | null>;

/**
 * A node a child slot can hold. `null` is the "no child" sentinel (a
 * conventional, null-flavor way to express conditional children that composes
 * with `replaceChildren` / `el` without leaking `undefined` into the tree).
 */
export type ElChild = Node | null;

/**
 * Create a `Text` node from a literal string (via `document.createTextNode`).
 *
 * This is the safe way to place user-controlled text into the DOM: the string
 * becomes an inert text node and is **never** parsed as HTML.
 *
 * @param value the literal text content
 * @returns a new, unattached `Text` node
 */
export function text(value: string): Text {
  return document.createTextNode(value);
}

/**
 * Set a batch of attributes on an element (via `element.setAttribute`), or
 * remove them when the value is `null` (via `element.removeAttribute`).
 *
 * @param target the element to update
 * @param attrs name → value (`null` removes) map
 * @returns the same element, for chaining
 */
export function setAttrs(target: Element, attrs: ElAttrs): Element {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null) {
      target.removeAttribute(name);
    } else {
      target.setAttribute(name, value);
    }
  }
  return target;
}

/**
 * Replace all children of `parent` with the given nodes (via
 * `element.replaceChildren`). Called with no children it **clears** the
 * parent. `null` children are dropped, which makes conditional children
 * composable: `replaceChildren(el, maybeNode, cond ? el("em") : null)`.
 *
 * @param parent the `Element` / `DocumentFragment` to update
 * @param children the new child nodes (`null` entries are ignored)
 * @returns the same parent, for chaining
 */
export function replaceChildren(
  parent: ParentNode,
  ...children: ElChild[]
): ParentNode {
  const nodes = children.filter((child): child is Node => child !== null);
  parent.replaceChildren(...nodes);
  return parent;
}

/**
 * Build an element (via `document.createElement`) with optional attributes and
 * children, returning it unattached.
 *
 * Only safe DOM APIs are used (`document.createElement`, `element.setAttribute`,
 * `element.replaceChildren`, and `text(...)`/`document.createTextNode`).
 *
 * ```ts
 * el(
 *   "li",
 *   { class: "item", "data-id": "1" },
 *   text("Hello"),
 *   el("em", { class: "em" }, text("there")),
 * );
 * ```
 *
 * @param tag the element tag name (e.g. `"section"`, `"button"`)
 * @param attrs optional attribute map (`null` values are ignored for a fresh
 *   element, so they are simply not set)
 * @param children optional child nodes; strings must be wrapped in `text(...)`
 *   and `null` entries are dropped
 * @returns the new, unattached `Element`
 */
export function el(
  tag: string,
  attrs?: ElAttrs,
  children?: readonly ElChild[],
): Element {
  const node = document.createElement(tag);
  if (attrs !== undefined) {
    setAttrs(node, attrs);
  }
  if (children !== undefined) {
    replaceChildren(node, ...children);
  }
  return node;
}
