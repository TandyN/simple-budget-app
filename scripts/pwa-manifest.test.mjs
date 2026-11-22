import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.webmanifest");
const INDEX_HTML_PATH = path.join(ROOT_DIR, "index.html");

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/gi;
const ALLOWED_SVG_NS = "http://www.w3.org/2000/svg";

describe("PWA Web App Manifest (public/manifest.webmanifest)", () => {
  const rawManifest = readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(rawManifest);

  it("contains valid JSON with manifest-relative start_url and scope", () => {
    expect(manifest.name).toBe("Simple Budget App");
    expect(manifest.short_name).toBe("Budget");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(typeof manifest.theme_color).toBe("string");
    expect(manifest.theme_color.length).toBeGreaterThan(0);
    expect(typeof manifest.background_color).toBe("string");
    expect(manifest.background_color.length).toBeGreaterThan(0);
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("contains zero http:// or https:// external URLs", () => {
    const matches = rawManifest.match(URL_RE) ?? [];
    expect(matches).toEqual([]);
  });

  it("declares non-empty manifest-relative icons whose files exist under public/", () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    for (const icon of manifest.icons) {
      expect(typeof icon.src).toBe("string");
      expect(icon.src.startsWith("./")).toBe(true);
      expect(icon.src).not.toMatch(/^https?:\/\//i);
      expect(typeof icon.sizes).toBe("string");
      expect(typeof icon.type).toBe("string");
      expect(["any", "maskable"]).toContain(icon.purpose);

      const resolvedFile = path.resolve(PUBLIC_DIR, icon.src);
      expect(
        resolvedFile.startsWith(PUBLIC_DIR + path.sep),
        `Icon path escapes public/: ${icon.src}`,
      ).toBe(true);
      expect(existsSync(resolvedFile), `Missing icon file: ${icon.src}`).toBe(
        true,
      );
    }

    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(manifest.icons.some((i) => i.type === "image/svg+xml")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("ships valid PNG headers/dimensions and zero-external-URL SVG icon", () => {
    for (const icon of manifest.icons) {
      const filePath = path.resolve(PUBLIC_DIR, icon.src);
      if (icon.type === "image/png") {
        const buf = readFileSync(filePath);
        expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        // IHDR chunk starts at byte 8: 4-byte length, 4-byte "IHDR", 4-byte width, 4-byte height
        expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        expect(`${width}x${height}`).toBe(icon.sizes);
      } else if (icon.type === "image/svg+xml") {
        const svg = readFileSync(filePath, "utf8");
        expect(svg).toContain(`xmlns="${ALLOWED_SVG_NS}"`);
        const urls = svg.match(URL_RE) ?? [];
        const disallowed = urls.filter((u) => u !== ALLOWED_SVG_NS);
        expect(disallowed).toEqual([]);
      }
    }
  });

  it("resolves start_url, scope, and icons cleanly under both production and PR preview base paths", () => {
    for (const basePath of [
      "/simple-budget-app/",
      "/simple-budget-app/pr-42/",
    ]) {
      const manifestUrl = `https://example.test${basePath}manifest.webmanifest`;
      expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(basePath);
      expect(new URL(manifest.scope, manifestUrl).pathname).toBe(basePath);
      for (const icon of manifest.icons) {
        const resolved = new URL(icon.src, manifestUrl);
        expect(resolved.origin).toBe("https://example.test");
        expect(resolved.pathname.startsWith(`${basePath}icons/`)).toBe(true);
      }
    }
  });
});

describe("index.html PWA metadata", () => {
  const html = readFileSync(INDEX_HTML_PATH, "utf8");

  it("links manifest and icons using relative paths", () => {
    expect(html).toContain(
      '<link rel="manifest" href="./manifest.webmanifest">',
    );
    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" href="./icons/icon.svg">',
    );
    expect(html).toContain(
      '<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" sizes="192x192" href="./icons/icon-192.png">',
    );
  });

  it("includes theme-color and apple-mobile-web-app-title meta tags", () => {
    expect(html).toContain('<meta name="theme-color" content="#1d4ed8">');
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-title" content="Budget">',
    );
  });

  it("preserves strict CSP and no-referrer meta tags", () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("manifest-src 'self'");
    expect(html).toContain("require-trusted-types-for 'script'");
    expect(html).toContain("trusted-types sw-register");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });
});
