// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { el, replaceChildren, setAttrs, text } from "./dom";

/**
 * Node-tree assertions for the `src/ui/` safe-DOM helpers.
 *
 * These tests run in the `happy-dom` environment (a devDependency, dev/test
 * time only — `project-plan/dependency-strategy.md`: dev deps are build/test
 * time only and never shipped; `dependencies` stays `{}`). The assertions
 * verify the resulting node tree directly: element tag, attributes, text
 * content, and children order — so they prove the helpers build the DOM
 * exclusively via `document.createElement` / `document.createTextNode` /
 * `element.setAttribute` / `element.replaceChildren` (the safe-DOM API set in
 * `project-plan/frontend.md → DOM XSS Ban (Safe DOM APIs Only)`).
 */

describe("text", () => {
  it("creates a Text node carrying the literal string", () => {
    const node = text("hello");
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node).toBeInstanceOf(Text);
    expect(node.data).toBe("hello");
    expect(node.textContent).toBe("hello");
  });

  it("keeps an HTML/script payload as inert literal text (never parses markup)", () => {
    const payload = "<img src=x onerror=alert(1)><b>bold</b>";
    const node = text(payload);
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    // Stored verbatim as text — no child nodes are created for the payload.
    expect(node.data).toBe(payload);
    expect(node.childNodes).toHaveLength(0);
  });

  it("preserves whitespace and empty strings", () => {
    expect(text("   ").data).toBe("   ");
    expect(text("").data).toBe("");
  });
});

describe("setAttrs", () => {
  it("applies attribute name/value pairs via setAttribute", () => {
    const node = el("section");
    setAttrs(node, {
      id: "panel-budget",
      class: "panel",
      "aria-label": "Budget panel",
      "data-count": "3",
    });
    expect(node.getAttribute("id")).toBe("panel-budget");
    expect(node.getAttribute("class")).toBe("panel");
    expect(node.getAttribute("aria-label")).toBe("Budget panel");
    expect(node.getAttribute("data-count")).toBe("3");
    expect(node.hasAttribute("id")).toBe(true);
    expect(node.hasAttribute("aria-label")).toBe(true);
  });

  it("removes an attribute when its value is null", () => {
    const node = el("button", { "aria-hidden": "true", disabled: "true" });
    expect(node.hasAttribute("aria-hidden")).toBe(true);
    expect(node.hasAttribute("disabled")).toBe(true);

    setAttrs(node, { "aria-hidden": null, disabled: null });
    expect(node.hasAttribute("aria-hidden")).toBe(false);
    expect(node.hasAttribute("disabled")).toBe(false);
  });

  it("overwrites an existing attribute value", () => {
    const node = el("li", { class: "a b" });
    setAttrs(node, { class: "c" });
    expect(node.getAttribute("class")).toBe("c");
  });

  it("returns the element for chaining", () => {
    const node = el("div");
    expect(setAttrs(node, { id: "x" })).toBe(node);
  });

  it("handles an empty attribute map as a no-op", () => {
    const node = el("div");
    setAttrs(node, {});
    expect(Object.keys(node.getAttributeNames())).toHaveLength(0);
  });
});

describe("replaceChildren", () => {
  it("replaces all existing children with the given nodes in order", () => {
    const host = el("ul", undefined, [el("li"), el("li")]);
    expect(host.children).toHaveLength(2);

    const a = el("li", undefined, [text("a")]);
    const b = el("li", undefined, [text("b")]);
    replaceChildren(host, a, b);

    expect(host.children).toHaveLength(2);
    expect(host.children[0]).toBe(a);
    expect(host.children[1]).toBe(b);
    expect(Array.from(host.children).map((child) => child.textContent)).toEqual(
      ["a", "b"],
    );
  });

  it("clears the parent when called with no children", () => {
    const host = el("ul", undefined, [el("li"), el("li"), el("li")]);
    expect(host.children).toHaveLength(3);
    replaceChildren(host);
    expect(host.children).toHaveLength(0);
  });

  it("drops null children (conditional children compose cleanly)", () => {
    const host = el("p");
    const maybe: Element | null = el("em", undefined, [text("em")]);
    const absent: Element | null = null;

    replaceChildren(host, maybe, absent, text("end"));
    expect(host.children).toHaveLength(1);
    expect(host.childNodes).toHaveLength(2);
    expect(host.childNodes[0]).toBe(maybe);
    expect(Array.from(host.childNodes, (c) => c.textContent)).toEqual([
      "em",
      "end",
    ]);
  });

  it("returns the parent for chaining", () => {
    const host = el("div");
    expect(replaceChildren(host)).toBe(host);
  });
});

describe("el", () => {
  it("creates an element with the requested tag, unattached", () => {
    const node = el("article");
    expect(node).toBeInstanceOf(Element);
    expect(node.tagName).toBe("ARTICLE");
    expect(node.nodeName).toBe("ARTICLE");
    expect(node.parentNode).toBeNull();
    expect(node.childElementCount).toBe(0);
  });

  it("builds an element with attributes and a text child", () => {
    const node = el("li", { id: "row-1", class: "item" }, [
      text("Hello, world"),
    ]);

    expect(node.tagName).toBe("LI");
    expect(node.getAttribute("id")).toBe("row-1");
    expect(node.getAttribute("class")).toBe("item");
    expect(node.childNodes).toHaveLength(1);
    expect(node.childNodes[0]).toBeInstanceOf(Text);
    // textContent reflects the single text child.
    expect(node.textContent).toBe("Hello, world");
  });

  it("preserves children order (text and element children mixed)", () => {
    const node = el("p", { "aria-live": "polite" }, [
      text("Balance: "),
      el("strong", undefined, [text("42")]),
      text(" USD"),
    ]);

    expect(node.getAttribute("aria-live")).toBe("polite");
    expect(node.childNodes).toHaveLength(3);
    expect(Array.from(node.childNodes, (child) => child.textContent)).toEqual([
      "Balance: ",
      "42",
      " USD",
    ]);
    expect(node.childNodes[1]).toBeInstanceOf(HTMLElement);
    // The whole composed text renders in order.
    expect(node.textContent).toBe("Balance: 42 USD");
  });

  it("nests composable trees", () => {
    const item = el("li", { "data-id": "2" }, [
      el("span", { class: "label" }, [text("Groceries")]),
      el("span", { class: "amount" }, [text("-1200")]),
    ]);
    const list = el("ul", { id: "recent" }, [item, el("li"), el("li")]);

    expect(list.id).toBe("recent");
    expect(list.children).toHaveLength(3);
    expect(list.children[0]).toBe(item);
    expect(item.children).toHaveLength(2);
    expect(Array.from(item.children, (child) => child.textContent)).toEqual([
      "Groceries",
      "-1200",
    ]);
    expect(item.querySelector(".label")).not.toBeNull();
    expect(item.querySelector(".amount")).not.toBeNull();
  });

  it("renders user-controlled strings as inert text, never markup", () => {
    const memo = "<img src=x onerror=alert(1)>";
    const node = el("div", { "data-memo": memo }, [text(memo)]);

    // Attribute value is stored literally.
    expect(node.getAttribute("data-memo")).toBe(memo);
    // Text child is a single inert text node — no <img> element is parsed.
    expect(node.childElementCount).toBe(0);
    expect(node.textContent).toBe(memo);
    expect(node.querySelector("img")).toBeNull();
  });

  it("omits attributes and children when their arguments are not passed", () => {
    const node = el("section");
    expect(node.getAttributeNames()).toHaveLength(0);
    expect(node.childNodes).toHaveLength(0);
  });

  it("drops null children passed to el", () => {
    const child = el("i");
    const node = el("div", undefined, [child, null, text("x")]);
    expect(node.childNodes).toHaveLength(2);
    expect(node.childNodes[0]).toBe(child);
    expect(node.textContent).toBe("x");
  });
});
