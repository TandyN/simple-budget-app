import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
  version: string;
};

function getGitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function listFilesRelative(dir: string, baseDir = dir): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRelative(fullPath, baseDir));
    } else if (entry.name !== 'sw.js') {
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push(`./${rel}`);
    }
  }
  return results;
}

function releaseMetadataAndSwPlugin(): Plugin {
  return {
    name: 'simple-budget-release-metadata-and-sw',
    apply: 'build',
    closeBundle() {
      const distDir = path.join(rootDir, 'dist');
      if (!fs.existsSync(distDir)) {
        return;
      }
      const commit = getGitShortSha();
      const versionInfo = {
        app: 'simple-budget',
        version: packageJson.version,
        commit,
        builtAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(distDir, 'version.json'),
        `${JSON.stringify(versionInfo, null, 2)}\n`,
        'utf8',
      );

      const swPath = path.join(distDir, 'sw.js');
      if (fs.existsSync(swPath)) {
        const assets = ['./', ...listFilesRelative(distDir)];
        const swTemplate = fs.readFileSync(swPath, 'utf8');
        const swCompiled = swTemplate
          .replace('__CACHE_VERSION__', `${packageJson.version}-${commit}`)
          .replace('__PRECACHE_ASSETS__', JSON.stringify(assets));
        fs.writeFileSync(swPath, swCompiled, 'utf8');
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react(), releaseMetadataAndSwPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
});
