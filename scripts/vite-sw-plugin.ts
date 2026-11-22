import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const EXCLUDED_FILES = new Set(["sw.js", "budgetApi.es.js"]);
const PR_PREVIEW_RE = /\/pr-(\d+)\/?$/;
const BUILD_HASH_LENGTH = 12;

export interface SwScopeInfo {
  baseUrl: string;
  isPrPreview: boolean;
  prNumber: string | null;
  prPrefix: string | null;
  cacheNamePrefix: string;
}

export interface GeneratedSwOptions {
  basePath: string;
  buildHash: string;
  assetPaths: readonly string[];
}

/**
 * Normalizes a Vite `base` path so it always starts and ends with `/`.
 */
export function normalizeBaseUrl(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/**
 * Derives base-path-scoped Service Worker cache naming metadata (OQ-1).
 * Matches `/\/pr-(\d+)\/?$/` used by `deriveDbName` and `deriveSyncChannelName`.
 *
 * - Production (`/simple-budget-app/`): `sbapp-<buildhash>`
 * - PR preview (`/simple-budget-app/pr-<N>/`): `sbapp-pr-<N>-<buildhash>`
 */
export function deriveSwScope(basePath: string): SwScopeInfo {
  const baseUrl = normalizeBaseUrl(basePath);
  const match = PR_PREVIEW_RE.exec(baseUrl);
  if (match?.[1]) {
    const prNumber = match[1];
    const prPrefix = `sbapp-pr-${prNumber}-`;
    return {
      baseUrl,
      isPrPreview: true,
      prNumber,
      prPrefix,
      cacheNamePrefix: prPrefix,
    };
  }
  return {
    baseUrl,
    isPrPreview: false,
    prNumber: null,
    prPrefix: null,
    cacheNamePrefix: "sbapp-",
  };
}

/**
 * Recursively collects POSIX-relative file paths under `dir`, sorted stably.
 */
function walkRelativeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRelativeFiles(full, rel));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results.sort();
}

/**
 * Collects SPA asset relative paths from `outDir`, excluding `sw.js`,
 * `budgetApi.es.js`, and source maps. When `emittedBundleFiles` is supplied
 * (from Vite's `generateBundle` hook), only those bundle entries plus files
 * from `publicDir` are collected so stale chunks left behind by
 * `emptyOutDir: false` are never precached.
 */
export function collectPrecacheAssetPaths(
  outDir: string,
  options?: {
    emittedBundleFiles?: readonly string[];
    publicDir?: string | false;
  },
): string[] {
  const candidates = new Set<string>();

  if (options?.emittedBundleFiles && options.emittedBundleFiles.length > 0) {
    for (const file of options.emittedBundleFiles) {
      candidates.add(file.split(path.sep).join("/"));
    }
    if (
      typeof options.publicDir === "string" &&
      existsSync(options.publicDir)
    ) {
      for (const rel of walkRelativeFiles(options.publicDir)) {
        if (existsSync(path.join(outDir, rel))) {
          candidates.add(rel);
        }
      }
    }
  } else {
    for (const rel of walkRelativeFiles(outDir)) {
      candidates.add(rel);
    }
  }

  return [...candidates]
    .filter((rel) => {
      const normalized = rel.replace(/^\/+/, "");
      if (!normalized || EXCLUDED_FILES.has(normalized)) {
        return false;
      }
      if (normalized.endsWith(".map")) {
        return false;
      }
      return existsSync(path.join(outDir, normalized));
    })
    .sort();
}

/**
 * Computes a deterministic SHA-256 hex digest prefix over `baseUrl` and sorted
 * `(relativePath, fileBytes)` entries.
 */
export function computeBuildHash(
  baseUrl: string,
  assets: ReadonlyArray<{ path: string; content: Buffer | string }>,
): string {
  const hash = createHash("sha256");
  hash.update(`base:${baseUrl}\0`);
  const sorted = [...assets].sort((a, b) => a.path.localeCompare(b.path));
  for (const asset of sorted) {
    hash.update(asset.path);
    hash.update("\0");
    hash.update(asset.content);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, BUILD_HASH_LENGTH);
}

/**
 * Generates the zero-dependency Service Worker source for `dist/sw.js`.
 */
export function generateServiceWorkerSource(
  options: GeneratedSwOptions,
): string {
  const scope = deriveSwScope(options.basePath);
  const activeCache = `${scope.cacheNamePrefix}${options.buildHash}`;

  const urlSet = new Set<string>([scope.baseUrl, `${scope.baseUrl}index.html`]);
  for (const rel of options.assetPaths) {
    const cleanRel = rel.replace(/^\/+/, "");
    if (
      !cleanRel ||
      EXCLUDED_FILES.has(cleanRel) ||
      cleanRel.endsWith(".map")
    ) {
      continue;
    }
    urlSet.add(`${scope.baseUrl}${cleanRel}`);
  }
  const precacheUrls = [...urlSet].sort();

  return `// Auto-generated by scripts/vite-sw-plugin.ts during vite build.
// Do not edit directly or commit under public/.

const BASE_URL = ${JSON.stringify(scope.baseUrl)};
const BUILD_HASH = ${JSON.stringify(options.buildHash)};
const IS_PR_PREVIEW = ${JSON.stringify(scope.isPrPreview)};
const PR_PREFIX = ${JSON.stringify(scope.prPrefix)};
const ACTIVE_CACHE = ${JSON.stringify(activeCache)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

function shouldDeleteCache(key) {
  if (key === ACTIVE_CACHE) {
    return false;
  }
  if (IS_PR_PREVIEW) {
    return typeof PR_PREFIX === "string" && key.startsWith(PR_PREFIX);
  }
  return key.startsWith("sbapp-") && !key.startsWith("sbapp-pr-");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ACTIVE_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter(shouldDeleteCache).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (!IS_PR_PREVIEW && url.pathname.startsWith(BASE_URL + "pr-")) {
    return;
  }

  if (!url.pathname.startsWith(BASE_URL)) {
    return;
  }

  if (url.pathname === BASE_URL + "sw.js") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(ACTIVE_CACHE);
        const cached =
          (await cache.match(BASE_URL + "index.html")) ||
          (await cache.match(BASE_URL));
        return (
          cached ||
          new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(ACTIVE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }
      const response = await fetch(event.request);
      if (response && response.ok && response.type === "basic") {
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
`;
}

/**
 * Custom zero-dependency Vite plugin that emits `dist/sw.js` during `vite build`.
 */
export function viteSwPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;
  let emittedBundleFiles: string[] = [];

  return {
    name: "simple-budget-vite-sw",
    apply: "build",
    configResolved(config) {
      resolvedConfig = config;
    },
    generateBundle(_options, bundle) {
      emittedBundleFiles = Object.keys(bundle);
    },
    closeBundle() {
      if (!resolvedConfig) {
        return;
      }
      const outDir = path.resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      );
      if (!existsSync(outDir)) {
        return;
      }

      const assetPaths = collectPrecacheAssetPaths(outDir, {
        emittedBundleFiles,
        publicDir: resolvedConfig.publicDir,
      });

      const scope = deriveSwScope(resolvedConfig.base);
      const assetsWithContent = assetPaths.map((relPath) => ({
        path: relPath,
        content: readFileSync(path.join(outDir, relPath)),
      }));
      const buildHash = computeBuildHash(scope.baseUrl, assetsWithContent);
      const swSource = generateServiceWorkerSource({
        basePath: scope.baseUrl,
        buildHash,
        assetPaths,
      });

      writeFileSync(path.join(outDir, "sw.js"), swSource, "utf8");
    },
  };
}
