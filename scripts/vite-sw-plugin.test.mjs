import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectPrecacheAssetPaths,
  computeBuildHash,
  deriveSwScope,
  generateServiceWorkerSource,
  normalizeBaseUrl,
  viteSwPlugin,
} from "./vite-sw-plugin";

const tempDirs = [];

function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "vite-sw-plugin-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Evaluates generated `sw.js` inside a mocked ServiceWorkerGlobalScope so we can
 * verify `install`, `message`, `activate`, and `fetch` behavior directly.
 */
function instantiateSw(swSource, options = {}) {
  const origin = options.origin ?? "https://app.example";
  const listeners = new Map();
  const cacheStore = new Map();

  for (const [cacheName, entries] of Object.entries(
    options.initialCaches ?? {},
  )) {
    cacheStore.set(cacheName, new Map(Object.entries(entries)));
  }

  const deletedCaches = [];
  const addedPrecacheUrls = [];
  const skipWaiting = vi.fn(() => Promise.resolve());
  const clientsClaim = vi.fn(() => Promise.resolve());
  const fetchMock =
    options.fetch ??
    vi.fn(() =>
      Promise.resolve(
        new Response("network-body", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

  const cachesMock = {
    open: vi.fn(async (name) => {
      if (!cacheStore.has(name)) {
        cacheStore.set(name, new Map());
      }
      const entries = cacheStore.get(name);
      return {
        addAll: vi.fn(async (urls) => {
          addedPrecacheUrls.push(...urls);
          for (const url of urls) {
            entries.set(
              url,
              new Response(`cached:${url}`, {
                status: 200,
                headers: { "Content-Type": "text/plain" },
              }),
            );
          }
        }),
        match: vi.fn(async (req) => {
          const key = typeof req === "string" ? req : new URL(req.url).pathname;
          return entries.get(key);
        }),
        put: vi.fn(async (req, res) => {
          const key = typeof req === "string" ? req : new URL(req.url).pathname;
          entries.set(key, res);
        }),
      };
    }),
    keys: vi.fn(async () => [...cacheStore.keys()]),
    delete: vi.fn(async (key) => {
      deletedCaches.push(key);
      return cacheStore.delete(key);
    }),
  };

  const selfObj = {
    location: new URL(`${origin}/`),
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    skipWaiting,
    clients: {
      claim: clientsClaim,
    },
  };

  const sandbox = {
    self: selfObj,
    caches: cachesMock,
    fetch: fetchMock,
    URL,
    Response,
    Promise,
  };

  vm.runInNewContext(swSource, sandbox);

  async function dispatchLifecycle(type, extra = {}) {
    const handler = listeners.get(type);
    if (!handler) {
      throw new Error(`Missing ${type} listener`);
    }
    const promises = [];
    const event = {
      ...extra,
      waitUntil(p) {
        promises.push(Promise.resolve(p));
      },
    };
    handler(event);
    await Promise.all(promises);
  }

  function dispatchFetch(url, { method = "GET", mode = "cors" } = {}) {
    const handler = listeners.get("fetch");
    if (!handler) {
      throw new Error("Missing fetch listener");
    }
    let responded = false;
    let responsePromise = null;
    const event = {
      request: { url, method, mode },
      respondWith(p) {
        responded = true;
        responsePromise = Promise.resolve(p);
      },
    };
    handler(event);
    return { responded, responsePromise };
  }

  return {
    listeners,
    cacheStore,
    deletedCaches,
    addedPrecacheUrls,
    skipWaiting,
    clientsClaim,
    fetchMock,
    dispatchLifecycle,
    dispatchFetch,
  };
}

describe("normalizeBaseUrl & deriveSwScope", () => {
  it("normalizes base paths with leading and trailing slashes", () => {
    expect(normalizeBaseUrl("/simple-budget-app/")).toBe("/simple-budget-app/");
    expect(normalizeBaseUrl("/simple-budget-app")).toBe("/simple-budget-app/");
    expect(normalizeBaseUrl("simple-budget-app")).toBe("/simple-budget-app/");
    expect(normalizeBaseUrl("/")).toBe("/");
    expect(normalizeBaseUrl("")).toBe("/");
  });

  it("derives production cache scope for /simple-budget-app/", () => {
    expect(deriveSwScope("/simple-budget-app/")).toEqual({
      baseUrl: "/simple-budget-app/",
      isPrPreview: false,
      prNumber: null,
      prPrefix: null,
      cacheNamePrefix: "sbapp-",
    });
  });

  it("derives PR preview cache scope for /simple-budget-app/pr-<N>/", () => {
    expect(deriveSwScope("/simple-budget-app/pr-999/")).toEqual({
      baseUrl: "/simple-budget-app/pr-999/",
      isPrPreview: true,
      prNumber: "999",
      prPrefix: "sbapp-pr-999-",
      cacheNamePrefix: "sbapp-pr-999-",
    });
    expect(deriveSwScope("/simple-budget-app/pr-42")).toEqual({
      baseUrl: "/simple-budget-app/pr-42/",
      isPrPreview: true,
      prNumber: "42",
      prPrefix: "sbapp-pr-42-",
      cacheNamePrefix: "sbapp-pr-42-",
    });
  });
});

describe("computeBuildHash", () => {
  it("is deterministic regardless of input asset order", () => {
    const a = computeBuildHash("/simple-budget-app/", [
      { path: "index.html", content: "<html></html>" },
      { path: "assets/app.js", content: "console.log(1);" },
    ]);
    const b = computeBuildHash("/simple-budget-app/", [
      { path: "assets/app.js", content: "console.log(1);" },
      { path: "index.html", content: "<html></html>" },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when asset content or base URL changes", () => {
    const base = computeBuildHash("/simple-budget-app/", [
      { path: "index.html", content: "v1" },
    ]);
    const changedContent = computeBuildHash("/simple-budget-app/", [
      { path: "index.html", content: "v2" },
    ]);
    const changedBase = computeBuildHash("/simple-budget-app/pr-1/", [
      { path: "index.html", content: "v1" },
    ]);
    expect(changedContent).not.toBe(base);
    expect(changedBase).not.toBe(base);
  });
});

describe("generateServiceWorkerSource & SW runtime behavior", () => {
  const sampleAssets = [
    "index.html",
    "assets/index-abc123.js",
    "assets/index-def456.css",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "sw.js",
    "budgetApi.es.js",
    "assets/index-abc123.js.map",
  ];

  it("embeds production cache name, precache manifest, and zero external URLs", () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });

    expect(sw).toContain('const ACTIVE_CACHE = "sbapp-a1b2c3d4e5f6";');
    expect(sw).toContain("const IS_PR_PREVIEW = false;");
    expect(sw).toContain('"/simple-budget-app/"');
    expect(sw).toContain('"/simple-budget-app/index.html"');
    expect(sw).toContain('"/simple-budget-app/assets/index-abc123.js"');
    expect(sw).toContain('"/simple-budget-app/manifest.webmanifest"');
    expect(sw).toContain('"/simple-budget-app/icons/icon-192.png"');
    expect(sw).not.toContain("budgetApi.es.js");
    expect(sw).not.toContain('"/simple-budget-app/sw.js"');
    expect(sw).not.toContain("index-abc123.js.map");
    expect(sw).not.toMatch(/https?:\/\//i);
    expect(sw).toContain("ignoreVary: true");
  });

  it("precaches PRECACHE_URLS on install without calling skipWaiting()", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });
    const env = instantiateSw(sw);

    await env.dispatchLifecycle("install");
    expect(env.skipWaiting).not.toHaveBeenCalled();
    expect(env.addedPrecacheUrls).toContain("/simple-budget-app/");
    expect(env.addedPrecacheUrls).toContain("/simple-budget-app/index.html");
    expect(env.addedPrecacheUrls).toContain(
      "/simple-budget-app/manifest.webmanifest",
    );
    expect(env.cacheStore.has("sbapp-a1b2c3d4e5f6")).toBe(true);
  });

  it("calls skipWaiting() only when receiving { type: 'SKIP_WAITING' }", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });
    const env = instantiateSw(sw);

    await env.dispatchLifecycle("message", { data: null });
    await env.dispatchLifecycle("message", { data: { type: "OTHER" } });
    expect(env.skipWaiting).not.toHaveBeenCalled();

    await env.dispatchLifecycle("message", { data: { type: "SKIP_WAITING" } });
    expect(env.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("production activate prunes obsolete sbapp-* caches while preserving sbapp-pr-* caches", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "new000000001",
      assetPaths: sampleAssets,
    });
    const env = instantiateSw(sw, {
      initialCaches: {
        "sbapp-old000000000": {},
        "sbapp-new000000001": {},
        "sbapp-pr-42-abc123456789": {},
        "unrelated-cache": {},
      },
    });

    await env.dispatchLifecycle("activate");
    expect(env.deletedCaches).toEqual(["sbapp-old000000000"]);
    expect([...env.cacheStore.keys()].sort()).toEqual([
      "sbapp-new000000001",
      "sbapp-pr-42-abc123456789",
      "unrelated-cache",
    ]);
    expect(env.clientsClaim).toHaveBeenCalledTimes(1);
  });

  it("PR preview activate prunes only its own sbapp-pr-<N>-* caches", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/pr-999/",
      buildHash: "new000000002",
      assetPaths: sampleAssets,
    });
    const env = instantiateSw(sw, {
      initialCaches: {
        "sbapp-pr-999-old000000000": {},
        "sbapp-pr-999-new000000002": {},
        "sbapp-pr-42-abc123456789": {},
        "sbapp-prod12345678": {},
      },
    });

    await env.dispatchLifecycle("activate");
    expect(env.deletedCaches).toEqual(["sbapp-pr-999-old000000000"]);
    expect([...env.cacheStore.keys()].sort()).toEqual([
      "sbapp-pr-42-abc123456789",
      "sbapp-pr-999-new000000002",
      "sbapp-prod12345678",
    ]);
    expect(env.clientsClaim).toHaveBeenCalledTimes(1);
  });

  it("enforces same-origin guard, non-GET ignore, BASE_URL guard, and production pr-* bypass", () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });
    const env = instantiateSw(sw, { origin: "https://app.example" });

    // Non-GET ignored
    expect(
      env.dispatchFetch("https://app.example/simple-budget-app/", {
        method: "POST",
      }).responded,
    ).toBe(false);

    // Cross-origin ignored
    expect(
      env.dispatchFetch("https://other.example/simple-budget-app/index.html")
        .responded,
    ).toBe(false);

    // Production pr-* sub-path bypassed (navigation + asset)
    expect(
      env.dispatchFetch("https://app.example/simple-budget-app/pr-999/", {
        mode: "navigate",
      }).responded,
    ).toBe(false);
    expect(
      env.dispatchFetch(
        "https://app.example/simple-budget-app/pr-999/assets/app.js",
      ).responded,
    ).toBe(false);

    // Outside BASE_URL ignored
    expect(
      env.dispatchFetch("https://app.example/other-project/index.html")
        .responded,
    ).toBe(false);

    // sw.js itself ignored
    expect(
      env.dispatchFetch("https://app.example/simple-budget-app/sw.js")
        .responded,
    ).toBe(false);
  });

  it("serves navigations network-first with cached index.html fallback when offline", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });

    // Online navigation returns network response
    const onlineEnv = instantiateSw(sw, {
      fetch: vi.fn(async () => new Response("live-html", { status: 200 })),
    });
    await onlineEnv.dispatchLifecycle("install");
    const onlineNav = onlineEnv.dispatchFetch(
      "https://app.example/simple-budget-app/",
      { mode: "navigate" },
    );
    expect(onlineNav.responded).toBe(true);
    expect(await (await onlineNav.responsePromise).text()).toBe("live-html");

    // Offline navigation falls back to cached index.html
    const offlineEnv = instantiateSw(sw, {
      fetch: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    await offlineEnv.dispatchLifecycle("install");
    const offlineNav = offlineEnv.dispatchFetch(
      "https://app.example/simple-budget-app/",
      { mode: "navigate" },
    );
    expect(offlineNav.responded).toBe(true);
    expect(await (await offlineNav.responsePromise).text()).toBe(
      "cached:/simple-budget-app/index.html",
    );
  });

  it("serves static assets cache-first with same-origin network fallback", async () => {
    const sw = generateServiceWorkerSource({
      basePath: "/simple-budget-app/",
      buildHash: "a1b2c3d4e5f6",
      assetPaths: sampleAssets,
    });
    const fetchMock = vi.fn(
      async () => new Response("fresh-asset", { status: 200 }),
    );
    const env = instantiateSw(sw, { fetch: fetchMock });
    await env.dispatchLifecycle("install");

    // Cache hit does not invoke network fetch
    const hit = env.dispatchFetch(
      "https://app.example/simple-budget-app/assets/index-abc123.js",
    );
    expect(hit.responded).toBe(true);
    expect(await (await hit.responsePromise).text()).toBe(
      "cached:/simple-budget-app/assets/index-abc123.js",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    // Cache miss falls back to same-origin fetch
    const miss = env.dispatchFetch(
      "https://app.example/simple-budget-app/assets/extra.js",
    );
    expect(miss.responded).toBe(true);
    expect(await (await miss.responsePromise).text()).toBe("fresh-asset");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("viteSwPlugin hook integration", () => {
  it("emits dist/sw.js excluding stale chunks, sw.js, and budgetApi.es.js", () => {
    const root = createTempDir();
    const outDir = path.join(root, "dist");
    const publicDir = path.join(root, "public");
    mkdirSync(path.join(outDir, "assets"), { recursive: true });
    mkdirSync(path.join(outDir, "icons"), { recursive: true });
    mkdirSync(path.join(publicDir, "icons"), { recursive: true });

    writeFileSync(path.join(outDir, "index.html"), "<html></html>");
    writeFileSync(path.join(outDir, "assets", "current.js"), "export {};");
    writeFileSync(path.join(outDir, "assets", "stale-old.js"), "stale");
    writeFileSync(path.join(outDir, "budgetApi.es.js"), "lib");
    writeFileSync(path.join(outDir, "manifest.webmanifest"), "{}");
    writeFileSync(path.join(publicDir, "manifest.webmanifest"), "{}");
    writeFileSync(path.join(outDir, "icons", "icon.svg"), "<svg/>");
    writeFileSync(path.join(publicDir, "icons", "icon.svg"), "<svg/>");

    const assets = collectPrecacheAssetPaths(outDir, {
      emittedBundleFiles: ["index.html", "assets/current.js"],
      publicDir,
    });
    expect(assets).toEqual([
      "assets/current.js",
      "icons/icon.svg",
      "index.html",
      "manifest.webmanifest",
    ]);

    const plugin = viteSwPlugin();
    plugin.configResolved({
      root,
      base: "/simple-budget-app/pr-999/",
      publicDir,
      build: { outDir: "dist" },
    });
    plugin.generateBundle(
      {},
      {
        "index.html": {},
        "assets/current.js": {},
      },
    );
    plugin.closeBundle();

    const emitted = readFileSync(path.join(outDir, "sw.js"), "utf8");
    expect(emitted).toContain('const BASE_URL = "/simple-budget-app/pr-999/";');
    expect(emitted).toMatch(
      /const ACTIVE_CACHE = "sbapp-pr-999-[0-9a-f]{12}";/,
    );
    expect(emitted).toContain('"/simple-budget-app/pr-999/assets/current.js"');
    expect(emitted).not.toContain("stale-old.js");
    expect(emitted).not.toContain("budgetApi.es.js");
  });
});
