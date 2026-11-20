import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXACT_SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types sw-register",
];

const ALLOWED_EXTERNAL_URLS = new Set([
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/XML/1998/namespace",
]);

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".otf",
  ".png",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
]);

const BANNED_XSS_PATTERNS = [
  {
    name: "HTML-parsing DOM sink",
    regex: /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/g,
  },
  {
    name: "document.write/writeln sink",
    regex: /\bdocument\.(write|writeln)\s*\(/g,
  },
  {
    name: "eval() sink",
    regex: /\beval\s*\(/g,
  },
  {
    name: "new Function sink",
    regex: /\bnew\s+Function\b/g,
  },
];

const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;
const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/g;

/**
 * Recursively collects all file paths under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

/**
 * Returns the 1-based line number for a character offset in `text`.
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * Formats a path relative to `rootDir` using POSIX slashes for stable output.
 * @param {string} rootDir
 * @param {string} filePath
 * @returns {string}
 */
function relPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

/**
 * Gate 1: Zero production dependencies, exact devDependencies, and zero @capacitor/* imports in src/.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function checkDependenciesAndCapacitor(rootDir) {
  const failures = [];
  const pkgPath = path.join(rootDir, "package.json");

  if (!existsSync(pkgPath)) {
    return ["Gate 1 (package.json): missing package.json"];
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const prodDeps = Object.keys(pkg.dependencies ?? {});
  if (prodDeps.length > 0) {
    failures.push(
      `Gate 1 (package.json): dependencies must be empty (zero-prod-dep), found: ${prodDeps.join(", ")}`,
    );
  }

  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    if (typeof version !== "string" || !EXACT_SEMVER_RE.test(version)) {
      failures.push(
        `Gate 1 (package.json): devDependency "${name}" must use an exact version without range prefixes, found "${String(version)}"`,
      );
    }
  }

  const srcDir = path.join(rootDir, "src");
  if (!existsSync(srcDir)) {
    failures.push("Gate 1 (src/): missing src/ directory");
    return failures;
  }

  for (const filePath of walkFiles(srcDir)) {
    const content = readFileSync(filePath, "utf8");
    const capRegex = /@capacitor\//g;
    for (const match of content.matchAll(capRegex)) {
      const line = lineNumberAt(content, match.index ?? 0);
      failures.push(
        `Gate 1 (${relPath(rootDir, filePath)}:${line}): forbidden @capacitor/* reference in src/`,
      );
    }
  }

  return failures;
}

/**
 * Extracts all <meta ...> tags and parses their attributes into lowercase key/value maps.
 * @param {string} html
 * @returns {Array<Record<string, string>>}
 */
function extractMetaTags(html) {
  const metas = [];
  const tagRe = /<meta\b([^>]*?)\/?>/gi;
  const attrRe =
    /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const tagMatch of html.matchAll(tagRe)) {
    const attrs = {};
    const attrSource = tagMatch[1] ?? "";
    for (const attrMatch of attrSource.matchAll(attrRe)) {
      const key = (attrMatch[1] ?? "").toLowerCase();
      const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      attrs[key] = value;
    }
    metas.push(attrs);
  }
  return metas;
}

/**
 * Gate 2: Strict CSP, Trusted Types, Referrer meta, and absence of frame-ancestors in dist/index.html.
 * Note: Phase 4D dist/sw.js manifest verification is intentionally omitted/no-op in Phases 1–4C
 * per project-plan/testing.md step 4b.2.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function checkDistHtmlSecurityHeaders(rootDir) {
  const failures = [];
  const indexHtmlPath = path.join(rootDir, "dist", "index.html");

  if (!existsSync(indexHtmlPath)) {
    return [
      "Gate 2 (dist/index.html): missing dist/index.html (run `pnpm run build` first)",
    ];
  }

  const html = readFileSync(indexHtmlPath, "utf8");
  const metas = extractMetaTags(html);

  const cspMeta = metas.find(
    (m) => (m["http-equiv"] ?? "").toLowerCase() === "content-security-policy",
  );

  if (!cspMeta?.content) {
    failures.push(
      'Gate 2 (dist/index.html): missing <meta http-equiv="Content-Security-Policy" content="...">',
    );
  } else {
    const directives = new Set(
      cspMeta.content
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    );

    for (const required of REQUIRED_CSP_DIRECTIVES) {
      if (!directives.has(required)) {
        failures.push(
          `Gate 2 (dist/index.html): CSP <meta> missing required directive "${required}"`,
        );
      }
    }
  }

  if (/frame-ancestors/i.test(html)) {
    failures.push(
      'Gate 2 (dist/index.html): forbidden "frame-ancestors" found in dist/index.html (<meta> CSP must omit frame-ancestors)',
    );
  }

  const referrerMeta = metas.find(
    (m) =>
      (m.name ?? "").toLowerCase() === "referrer" &&
      (m.content ?? "").trim().toLowerCase() === "no-referrer",
  );
  if (!referrerMeta) {
    failures.push(
      'Gate 2 (dist/index.html): missing <meta name="referrer" content="no-referrer">',
    );
  }

  return failures;
}

/**
 * Gate 3: Zero external http:// or https:// URLs in dist/ outside W3C XML namespace allowlist.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function checkDistExternalUrls(rootDir) {
  const failures = [];
  const distDir = path.join(rootDir, "dist");

  if (!existsSync(distDir)) {
    return [
      "Gate 3 (dist/): missing dist/ directory (run `pnpm run build` first)",
    ];
  }

  const files = walkFiles(distDir);
  if (files.length === 0) {
    return ["Gate 3 (dist/): dist/ directory is empty"];
  }

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(URL_RE)) {
      const url = match[0];
      if (!ALLOWED_EXTERNAL_URLS.has(url)) {
        const line = lineNumberAt(content, match.index ?? 0);
        failures.push(
          `Gate 3 (${relPath(rootDir, filePath)}:${line}): disallowed external URL "${url}"`,
        );
      }
    }
  }

  return failures;
}

/**
 * Gate 4: Zero banned DOM XSS / code-evaluation sinks in non-test src/ files.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function checkSourceXssSinks(rootDir) {
  const failures = [];
  const srcDir = path.join(rootDir, "src");

  if (!existsSync(srcDir)) {
    return ["Gate 4 (src/): missing src/ directory"];
  }

  for (const filePath of walkFiles(srcDir)) {
    if (TEST_FILE_RE.test(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const rule of BANNED_XSS_PATTERNS) {
      for (const match of content.matchAll(rule.regex)) {
        const line = lineNumberAt(content, match.index ?? 0);
        failures.push(
          `Gate 4 (${relPath(rootDir, filePath)}:${line}): banned ${rule.name} "${match[0]}"`,
        );
      }
    }
  }

  return failures;
}

/**
 * Runs all 4 post-build security & privacy gates against `rootDir`.
 * @param {string} rootDir
 * @returns {{ ok: boolean; results: Array<{ name: string; failures: string[] }> }}
 */
export function runAllGates(rootDir) {
  const results = [
    {
      name: "Gate 1: Zero prod deps, exact devDependencies & zero @capacitor/* in src/",
      failures: checkDependenciesAndCapacitor(rootDir),
    },
    {
      name: "Gate 2: Strict CSP, Trusted Types & Referrer meta in dist/index.html",
      failures: checkDistHtmlSecurityHeaders(rootDir),
    },
    {
      name: "Gate 3: Zero external http(s):// URLs in dist/",
      failures: checkDistExternalUrls(rootDir),
    },
    {
      name: "Gate 4: Zero banned DOM XSS / eval sinks in src/",
      failures: checkSourceXssSinks(rootDir),
    },
  ];

  const ok = results.every((r) => r.failures.length === 0);
  return { ok, results };
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const { ok, results } = runAllGates(rootDir);

  for (const result of results) {
    if (result.failures.length === 0) {
      console.log(`[PASS] ${result.name}`);
    } else {
      console.error(`[FAIL] ${result.name}`);
      for (const failure of result.failures) {
        console.error(`  - ${failure}`);
      }
    }
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}
