import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkDependenciesAndCapacitor,
  checkDistExternalUrls,
  checkDistHtmlSecurityHeaders,
  checkDistServiceWorker,
  checkSourceXssSinks,
  stripHtmlComments,
} from "./verify-build-gates.mjs";
import { generateServiceWorkerSource } from "./vite-sw-plugin";

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types sw-register";
const REAL_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
const REFERRER = '<meta name="referrer" content="no-referrer">';
const FAKE_CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src *">';

const dirs = [];
function distWith(html) {
  const root = mkdtempSync(path.join(tmpdir(), "gates-"));
  dirs.push(root);
  mkdirSync(path.join(root, "dist"));
  writeFileSync(path.join(root, "dist", "index.html"), html);
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("stripHtmlComments", () => {
  it("removes simple comments", () => {
    expect(stripHtmlComments("a<!-- x -->b<!--y-->c")).toBe("abc");
  });
  it("drops the rest after an unterminated comment", () => {
    expect(stripHtmlComments("a<!-- b <meta>")).toBe("a");
  });
  it("does not reassemble nested fragments into a comment", () => {
    const out = stripHtmlComments("<!<!---->-- x -->");
    // Single linear pass: residue is surfaced (not re-scanned) so Gate 2 can fail closed.
    expect(out).toBe("<!-- x -->");
  });
});

describe("Gate 2 comment smuggling", () => {
  it("passes a valid document", () => {
    const root = distWith(`<head>${REAL_META}${REFERRER}</head>`);
    expect(checkDistHtmlSecurityHeaders(root)).toEqual([]);
  });
  it("flags nested comment markers explicitly", () => {
    const root = distWith(
      `<head>${REAL_META}${REFERRER}<!<!---->-- ${FAKE_CSP} --></head>`,
    );
    expect(checkDistHtmlSecurityHeaders(root).join("\n")).toMatch(
      /malformed, nested, or overlapping/,
    );
  });
  it("fails when the only CSP is inside a nested-comment trick", () => {
    const root = distWith(
      `<head>${REFERRER}<!<!---->-- ${REAL_META} --></head>`,
    );
    expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
  });
  it("fails when the only CSP is inside an unterminated comment", () => {
    const root = distWith(`<head>${REFERRER}<!-- ${REAL_META}`);
    expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
  });
  it("fails when the referrer meta is commented out via overlap", () => {
    const root = distWith(
      `<head>${REAL_META}<!<!---->-- ${REFERRER} --></head>`,
    );
    expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
  });
  it("still counts a real duplicate CSP meta next to a fake comment", () => {
    const root = distWith(`<head>${REAL_META}${FAKE_CSP}${REFERRER}</head>`);
    expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
  });
  it("fails on duplicate CSP directives", () => {
    const dup = REAL_META.replace(
      "object-src 'none'",
      "object-src 'none'; object-src 'self'",
    );
    const root = distWith(`<head>${dup}${REFERRER}</head>`);
    expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
  });
});

const FAKE_REFERRER = '<meta name="referrer" content="unsafe-url">';
describe("Gate 2 HTML5 comment-end bypasses", () => {
  const payloads = {
    "<!-->": `<!--> ${FAKE_REFERRER} <!-- -->`,
    "<!--->": `<!---> ${FAKE_REFERRER} <!-- -->`,
    "--!> (a)": `<!-- --!> ${FAKE_REFERRER} -->`,
    "--!> (b)": `<!-- x --!>${FAKE_REFERRER}<!-- y -->`,
    "fake CSP via <!-->": `<!--> ${FAKE_CSP} <!-- -->`,
  };
  for (const [name, payload] of Object.entries(payloads)) {
    it(`fails for ${name}`, () => {
      const root = distWith(`<head>${REAL_META}${REFERRER}${payload}</head>`);
      expect(checkDistHtmlSecurityHeaders(root).length).toBeGreaterThan(0);
    });
  }
});

describe("previously fixed bypasses still fail", () => {
  function projectWith(files) {
    const root = mkdtempSync(path.join(tmpdir(), "gates-"));
    dirs.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return root;
  }

  it("Gate 3 fails on uppercase HTTPS:// URLs", () => {
    const root = projectWith({
      "dist/assets/a.js": 'fetch("HTTPS://evil.example/x")',
    });
    expect(checkDistExternalUrls(root).length).toBeGreaterThan(0);
  });
  for (const [name, code] of Object.entries({
    "(0, eval)(": "(0, eval)('1')",
    "eval?.(": "eval?.('1')",
    "bare Function(": "Function('return 1')()",
  })) {
    it(`Gate 4 fails on ${name}`, () => {
      const root = projectWith({ "src/a.ts": `${code};\n` });
      expect(checkSourceXssSinks(root).length).toBeGreaterThan(0);
    });
  }
  it("Gate 1 fails on optionalDependencies", () => {
    const root = projectWith({
      "package.json": JSON.stringify({
        dependencies: {},
        optionalDependencies: { foo: "1.0.0" },
        devDependencies: {},
      }),
      "src/a.ts": "export {};\n",
    });
    expect(checkDependenciesAndCapacitor(root).join("\n")).toMatch(
      /optionalDependencies/,
    );
  });
});

describe("Gate 5 (Phase 4D dist/sw.js)", () => {
  function rootWithSw(swContent, extraFiles = {}) {
    const root = mkdtempSync(path.join(tmpdir(), "gates-sw-"));
    dirs.push(root);
    mkdirSync(path.join(root, "dist"), { recursive: true });
    if (swContent !== null) {
      writeFileSync(path.join(root, "dist", "sw.js"), swContent);
    }
    for (const [rel, content] of Object.entries(extraFiles)) {
      const full = path.join(root, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return root;
  }

  const validProdSw = generateServiceWorkerSource({
    basePath: "/simple-budget-app/",
    buildHash: "a1b2c3d4e5f6",
    assetPaths: [
      "index.html",
      "assets/index-123.js",
      "manifest.webmanifest",
      "icons/icon-192.png",
    ],
  });

  const validPreviewSw = generateServiceWorkerSource({
    basePath: "/simple-budget-app/pr-999/",
    buildHash: "f6e5d4c3b2a1",
    assetPaths: [
      "index.html",
      "assets/index-123.js",
      "manifest.webmanifest",
      "icons/icon-192.png",
    ],
  });

  it("passes for valid production dist/sw.js", () => {
    const root = rootWithSw(validProdSw);
    expect(checkDistServiceWorker(root)).toEqual([]);
  });

  it("passes for valid PR preview dist/sw.js", () => {
    const root = rootWithSw(validPreviewSw);
    expect(checkDistServiceWorker(root)).toEqual([]);
  });

  it("fails closed when dist/sw.js is missing", () => {
    const root = rootWithSw(null);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(
      /missing dist\/sw\.js/,
    );
  });

  it("fails when a static public/sw.js exists", () => {
    const root = rootWithSw(validProdSw, { "public/sw.js": "// static" });
    expect(checkDistServiceWorker(root).join("\n")).toMatch(
      /static public\/sw\.js is forbidden/,
    );
  });

  it("fails when same-origin guard is removed", () => {
    const broken = validProdSw.replace(
      "if (url.origin !== self.location.origin)",
      "if (false)",
    );
    const root = rootWithSw(broken);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(/same-origin/);
  });

  it("fails when skipWaiting() is called silently inside install", () => {
    const broken = validProdSw.replace(
      'self.addEventListener("install", (event) => {',
      'self.addEventListener("install", (event) => { self.skipWaiting();',
    );
    const root = rootWithSw(broken);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(
      /must not call skipWaiting/,
    );
  });

  it("fails when pr-* sub-path bypass is removed", () => {
    const broken = validProdSw.replace(
      'if (!IS_PR_PREVIEW && url.pathname.startsWith(BASE_URL + "pr-"))',
      "if (false)",
    );
    const root = rootWithSw(broken);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(
      /pr-" sub-path bypass/,
    );
  });

  it("fails when sbapp-pr- cache preservation is removed", () => {
    const broken = validProdSw.replace(
      'return key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-");',
      'return key.startsWith("sbapp-");',
    );
    const root = rootWithSw(broken);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(/sbapp-pr-/);
  });

  it("fails when PRECACHE_URLS omits manifest.webmanifest", () => {
    const broken = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: ["index.html", "assets/index-123.js"],
    });
    const root = rootWithSw(broken);
    expect(checkDistServiceWorker(root).join("\n")).toMatch(
      /manifest\.webmanifest/,
    );
  });
});
