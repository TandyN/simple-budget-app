import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXACT_SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const REQUIRED_CSP_DIRECTIVES = new Map([
  ["default-src", "'self'"],
  ["script-src", "'self'"],
  ["style-src", "'self'"],
  ["img-src", "'self' data:"],
  ["font-src", "'self'"],
  ["connect-src", "'none'"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'none'"],
  ["worker-src", "'self'"],
  ["manifest-src", "'self'"],
  ["require-trusted-types-for", "'script'"],
  ["trusted-types", "sw-register"],
]);

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
    regex: /\beval\s*(?:\?\.\s*)?\(/g,
  },
  {
    name: "indirect eval sink",
    regex: /,\s*eval\s*\)\s*(?:\?\.\s*)?\(/g,
  },
  {
    name: "new Function sink",
    regex: /\bnew\s+Function\b/g,
  },
  {
    name: "Function() sink",
    regex: /\bFunction\s*(?:\?\.\s*)?\(/g,
  },
];

const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;
const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/gi;

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
 * Gate 1: Zero production/optional dependencies, exact devDependencies, and zero @capacitor/* imports in src/.
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

  const optionalDeps = Object.keys(pkg.optionalDependencies ?? {});
  if (optionalDeps.length > 0) {
    failures.push(
      `Gate 1 (package.json): optionalDependencies must be empty (zero-prod-dep), found: ${optionalDeps.join(", ")}`,
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
 * Expects HTML comments to have already been stripped by the caller.
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
 * Remove HTML comments with a single linear left-to-right scan (no regex, so no
 * multi-pass re-assembly of `<!--` fragments is possible). An unterminated
 * `<!--` treats the rest of the document as a comment.
 * @param {string} html
 * @returns {string}
 */
export function stripHtmlComments(html) {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf("<!--", i);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const end = html.indexOf("-->", start + 4);
    if (end === -1) {
      break;
    }
    i = end + 3;
  }
  return out;
}

/**
 * Gate 2: Strict CSP, Trusted Types, Referrer meta, and absence of frame-ancestors in dist/index.html.
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
  // Fail closed on HTML5 comment-end forms this scanner does not model: browsers
  // also end a comment on `<!-->`, `<!--->` and `--!>`, which would let a fake
  // <meta> look commented-out to the gate while being live in the browser.
  for (const form of ["<!-->", "<!--->", "--!>"]) {
    if (html.includes(form)) {
      failures.push(
        `Gate 2 (dist/index.html): forbidden HTML comment form "${form}" (browser comment-end rules differ from scanner)`,
      );
    }
  }
  const htmlWithoutComments = stripHtmlComments(html);
  // Fail closed: if comment markers survive stripping, the markup contains
  // nested/overlapping comment tricks that browsers and this scanner may parse
  // differently, so a <meta> could be hidden from (or smuggled past) this gate.
  if (
    htmlWithoutComments.includes("<!--") ||
    htmlWithoutComments.includes("-->")
  ) {
    failures.push(
      "Gate 2 (dist/index.html): malformed, nested, or overlapping HTML comment markers detected",
    );
  }
  const metas = extractMetaTags(htmlWithoutComments);

  const cspMetas = metas.filter(
    (m) => (m["http-equiv"] ?? "").toLowerCase() === "content-security-policy",
  );

  if (cspMetas.length === 0 || !cspMetas[0]?.content) {
    failures.push(
      'Gate 2 (dist/index.html): missing <meta http-equiv="Content-Security-Policy" content="...">',
    );
  } else {
    if (cspMetas.length > 1) {
      failures.push(
        `Gate 2 (dist/index.html): expected exactly 1 Content-Security-Policy <meta> tag, found ${cspMetas.length}`,
      );
    }

    const seenDirectives = new Map();
    const rawDirectives = cspMetas[0].content
      .split(";")
      .map((d) => d.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    for (const directive of rawDirectives) {
      const spaceIdx = directive.indexOf(" ");
      const name = (
        spaceIdx === -1 ? directive : directive.slice(0, spaceIdx)
      ).toLowerCase();
      const value = spaceIdx === -1 ? "" : directive.slice(spaceIdx + 1);

      if (seenDirectives.has(name)) {
        failures.push(
          `Gate 2 (dist/index.html): duplicate CSP directive "${name}"`,
        );
        continue;
      }

      seenDirectives.set(name, value);

      if (!REQUIRED_CSP_DIRECTIVES.has(name)) {
        failures.push(
          `Gate 2 (dist/index.html): unexpected CSP directive "${directive}"`,
        );
      }
    }

    for (const [name, expectedValue] of REQUIRED_CSP_DIRECTIVES) {
      const actualValue = seenDirectives.get(name);
      if (actualValue === undefined) {
        failures.push(
          `Gate 2 (dist/index.html): CSP <meta> missing required directive "${name} ${expectedValue}"`,
        );
      } else if (actualValue !== expectedValue) {
        failures.push(
          `Gate 2 (dist/index.html): CSP directive "${name}" must be "${expectedValue}", found "${actualValue}"`,
        );
      }
    }
  }

  if (/frame-ancestors/i.test(html)) {
    failures.push(
      'Gate 2 (dist/index.html): forbidden "frame-ancestors" found in dist/index.html (<meta> CSP must omit frame-ancestors)',
    );
  }

  const referrerMetas = metas.filter(
    (m) => (m.name ?? "").toLowerCase() === "referrer",
  );
  if (referrerMetas.length === 0) {
    failures.push(
      'Gate 2 (dist/index.html): missing <meta name="referrer" content="no-referrer">',
    );
  } else {
    if (referrerMetas.length > 1) {
      failures.push(
        `Gate 2 (dist/index.html): expected exactly 1 referrer <meta> tag, found ${referrerMetas.length}`,
      );
    }
    const content = (referrerMetas[0]?.content ?? "").trim().toLowerCase();
    if (content !== "no-referrer") {
      failures.push(
        `Gate 2 (dist/index.html): referrer <meta> content must be "no-referrer", found "${content}"`,
      );
    }
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
 * Extracts the source slice for a top-level `self.addEventListener("<eventName>", ...)` handler.
 * @param {string} source
 * @param {string} eventName
 * @returns {string | null}
 */
function extractSwListenerBlock(source, eventName) {
  const marker = `self.addEventListener("${eventName}"`;
  const start = source.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const next = source.indexOf("self.addEventListener(", start + marker.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

/**
 * Gate 5 (Phase 4D): Custom Vite SW plugin output (dist/sw.js) integrity, base-path scope
 * isolation, non-overlapping cache cleanup, pr-* bypass, same-origin guard, and SKIP_WAITING.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function checkDistServiceWorker(rootDir) {
  const failures = [];
  const staticPublicSw = path.join(rootDir, "public", "sw.js");
  if (existsSync(staticPublicSw)) {
    failures.push(
      "Gate 5 (public/sw.js): static public/sw.js is forbidden; dist/sw.js must be emitted by the custom Vite SW plugin",
    );
  }

  const swPath = path.join(rootDir, "dist", "sw.js");
  if (!existsSync(swPath)) {
    failures.push(
      "Gate 5 (dist/sw.js): missing dist/sw.js (run `pnpm run build` first)",
    );
    return failures;
  }

  const sw = readFileSync(swPath, "utf8");

  const baseUrlMatch = /const\s+BASE_URL\s*=\s*("[^"]*")\s*;/.exec(sw);
  let baseUrl = null;
  if (!baseUrlMatch?.[1]) {
    failures.push("Gate 5 (dist/sw.js): missing embedded BASE_URL constant");
  } else {
    try {
      const parsed = JSON.parse(baseUrlMatch[1]);
      if (
        typeof parsed === "string" &&
        parsed.startsWith("/") &&
        parsed.endsWith("/")
      ) {
        baseUrl = parsed;
      } else {
        failures.push(
          `Gate 5 (dist/sw.js): BASE_URL must start and end with "/", found ${baseUrlMatch[1]}`,
        );
      }
    } catch {
      failures.push("Gate 5 (dist/sw.js): invalid BASE_URL JSON literal");
    }
  }

  const buildHashMatch = /const\s+BUILD_HASH\s*=\s*"([0-9a-f]{8,})"\s*;/.exec(
    sw,
  );
  const buildHash = buildHashMatch?.[1] ?? null;
  if (!buildHash) {
    failures.push(
      "Gate 5 (dist/sw.js): missing or invalid embedded hex BUILD_HASH constant",
    );
  }

  const isPrPreviewMatch = /const\s+IS_PR_PREVIEW\s*=\s*(true|false)\s*;/.exec(
    sw,
  );
  const isPrPreview =
    isPrPreviewMatch?.[1] === "true"
      ? true
      : isPrPreviewMatch?.[1] === "false"
        ? false
        : null;
  if (isPrPreview === null) {
    failures.push(
      "Gate 5 (dist/sw.js): missing embedded IS_PR_PREVIEW boolean constant",
    );
  }

  const activeCacheMatch = /const\s+ACTIVE_CACHE\s*=\s*"([^"]+)"\s*;/.exec(sw);
  const activeCache = activeCacheMatch?.[1] ?? null;
  if (!activeCache) {
    failures.push(
      "Gate 5 (dist/sw.js): missing embedded ACTIVE_CACHE constant",
    );
  } else if (baseUrl && buildHash) {
    const prMatch = /\/pr-(\d+)\/$/.exec(baseUrl);
    if (prMatch?.[1]) {
      const expectedCache = `sbapp-pr-${prMatch[1]}-${buildHash}`;
      if (isPrPreview !== true) {
        failures.push(
          `Gate 5 (dist/sw.js): IS_PR_PREVIEW must be true for preview BASE_URL "${baseUrl}"`,
        );
      }
      if (activeCache !== expectedCache) {
        failures.push(
          `Gate 5 (dist/sw.js): ACTIVE_CACHE must be "${expectedCache}", found "${activeCache}"`,
        );
      }
      const expectedPrefix = `const PR_PREFIX = "sbapp-pr-${prMatch[1]}-";`;
      if (!sw.includes(expectedPrefix)) {
        failures.push(
          `Gate 5 (dist/sw.js): missing preview cache prefix ${expectedPrefix}`,
        );
      }
    } else {
      const expectedCache = `sbapp-${buildHash}`;
      if (isPrPreview !== false) {
        failures.push(
          `Gate 5 (dist/sw.js): IS_PR_PREVIEW must be false for production BASE_URL "${baseUrl}"`,
        );
      }
      if (activeCache !== expectedCache) {
        failures.push(
          `Gate 5 (dist/sw.js): ACTIVE_CACHE must be "${expectedCache}", found "${activeCache}"`,
        );
      }
    }
  }

  const precacheMatch = /const\s+PRECACHE_URLS\s*=\s*(\[[\s\S]*?\])\s*;/.exec(
    sw,
  );
  if (!precacheMatch?.[1]) {
    failures.push(
      "Gate 5 (dist/sw.js): missing embedded PRECACHE_URLS manifest array",
    );
  } else {
    try {
      const urls = JSON.parse(precacheMatch[1]);
      if (!Array.isArray(urls) || urls.length === 0) {
        failures.push(
          "Gate 5 (dist/sw.js): PRECACHE_URLS must be a non-empty array",
        );
      } else {
        const allStrings = urls.every(
          (entry) => typeof entry === "string" && entry.length > 0,
        );
        if (!allStrings) {
          failures.push(
            "Gate 5 (dist/sw.js): PRECACHE_URLS must contain only non-empty strings",
          );
        } else {
          if (!urls.some((u) => u.endsWith("index.html"))) {
            failures.push(
              "Gate 5 (dist/sw.js): PRECACHE_URLS must include index.html",
            );
          }
          if (!urls.some((u) => u.endsWith("manifest.webmanifest"))) {
            failures.push(
              "Gate 5 (dist/sw.js): PRECACHE_URLS must include manifest.webmanifest",
            );
          }
          if (urls.some((u) => u.endsWith("/sw.js") || u === "sw.js")) {
            failures.push(
              "Gate 5 (dist/sw.js): PRECACHE_URLS must exclude sw.js",
            );
          }
          if (urls.some((u) => u.endsWith("budgetApi.es.js"))) {
            failures.push(
              "Gate 5 (dist/sw.js): PRECACHE_URLS must exclude budgetApi.es.js",
            );
          }
          if (baseUrl && urls.some((u) => !u.startsWith(baseUrl))) {
            failures.push(
              `Gate 5 (dist/sw.js): every PRECACHE_URLS entry must be scoped under BASE_URL "${baseUrl}"`,
            );
          }
          if (urls.some((u) => /^https?:\/\//i.test(u))) {
            failures.push(
              "Gate 5 (dist/sw.js): PRECACHE_URLS must not contain external http(s):// URLs",
            );
          }
        }
      }
    } catch {
      failures.push(
        "Gate 5 (dist/sw.js): PRECACHE_URLS is not valid JSON array",
      );
    }
  }

  if (!/url\.origin\s*!==\s*self\.location\.origin/.test(sw)) {
    failures.push(
      "Gate 5 (dist/sw.js): missing strict same-origin guard (url.origin !== self.location.origin)",
    );
  }

  if (
    !sw.includes('key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-")')
  ) {
    failures.push(
      'Gate 5 (dist/sw.js): missing non-overlapping cache cleanup predicate preserving "sbapp-pr-" caches',
    );
  }

  if (!sw.includes('url.pathname.startsWith(BASE_URL + "pr-")')) {
    failures.push(
      'Gate 5 (dist/sw.js): missing production "pr-" sub-path bypass in fetch handler',
    );
  }

  const installBlock = extractSwListenerBlock(sw, "install");
  if (!installBlock) {
    failures.push('Gate 5 (dist/sw.js): missing "install" event listener');
  } else if (/skipWaiting\s*\(/.test(installBlock)) {
    failures.push(
      'Gate 5 (dist/sw.js): "install" listener must not call skipWaiting() silently',
    );
  }

  const messageBlock = extractSwListenerBlock(sw, "message");
  if (!messageBlock) {
    failures.push('Gate 5 (dist/sw.js): missing "message" event listener');
  } else {
    if (!messageBlock.includes("SKIP_WAITING")) {
      failures.push(
        'Gate 5 (dist/sw.js): "message" listener must handle SKIP_WAITING',
      );
    }
    if (!/self\.skipWaiting\s*\(\s*\)/.test(messageBlock)) {
      failures.push(
        'Gate 5 (dist/sw.js): "message" listener must invoke self.skipWaiting()',
      );
    }
  }

  return failures;
}

/**
 * Runs all 5 post-build security & privacy gates against `rootDir`.
 * @param {string} rootDir
 * @returns {{ ok: boolean; results: Array<{ name: string; failures: string[] }> }}
 */
export function runAllGates(rootDir) {
  const results = [
    {
      name: "Gate 1: Zero prod/optional deps, exact devDependencies & zero @capacitor/* in src/",
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
    {
      name: "Gate 5: Phase 4D dist/sw.js manifest, scope isolation, pr-* bypass & SKIP_WAITING",
      failures: checkDistServiceWorker(rootDir),
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
