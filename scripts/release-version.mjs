#!/usr/bin/env node
// release-version.mjs — Automated SemVer (0.y.z pre-1.0) version bump & CHANGELOG.md generator.
//Zero external dependencies (uses Node built-ins only).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(rootDir, 'package.json');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

function sh(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function getLatestTag() {
  try {
    return sh('git describe --tags --abbrev=0 --match "v[0-9]*" 2>/dev/null');
  } catch {
    return null;
  }
}

function computeNextVersion(currentVersion, commits, explicitVersion) {
  if (explicitVersion) {
    return explicitVersion.replace(/^v/, '');
  }
  const parts = currentVersion.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 1;
  const patch = parts[2] ?? 0;

  const hasBreaking = commits.some(
    (c) => c.includes('BREAKING CHANGE') || /^[a-z]+(\([^)]+\))?!:/.test(c),
  );
  const hasFeat = commits.some((c) => /^feat(\([^)]+\))?!?:/.test(c));

  if (major === 0) {
    // Pre-1.0 SemVer: features and breaking changes bump minor (0.x.0); fixes/chores bump patch (0.y.z)
    if (hasBreaking || hasFeat) {
      return `0.${minor + 1}.0`;
    }
    return `0.${minor}.${patch + 1}`;
  }

  if (hasBreaking) {
    return `${major + 1}.0.0`;
  }
  if (hasFeat) {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  const args = process.argv.slice(2);
  const explicitIdx = args.indexOf('--version');
  const explicitVersion = explicitIdx >= 0 ? args[explicitIdx + 1] : undefined;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const latestTag = getLatestTag();

  const range = latestTag ? `${latestTag}..HEAD` : 'HEAD';
  const rawLog = sh(`git log ${range} --pretty=format:"%h|%s"`);
  const commits = rawLog
    ? rawLog.split('\n').map((line) => {
        const [hash, ...rest] = line.split('|');
        return { hash, subject: rest.join('|') };
      })
    : [];

  const nextVersion = computeNextVersion(
    pkg.version,
    commits.map((c) => c.subject),
    explicitVersion,
  );

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const today = new Date().toISOString().slice(0, 10);
  const features = commits.filter((c) => /^feat(\([^)]+\))?!?:/.test(c.subject));
  const fixes = commits.filter((c) => /^fix(\([^)]+\))?!?:/.test(c.subject));
  const others = commits.filter(
    (c) => !/^feat(\([^)]+\))?!?:/.test(c.subject) && !/^fix(\([^)]+\))?!?:/.test(c.subject),
  );

  const lines = [`## [${nextVersion}] - ${today}`, ''];
  if (features.length > 0) {
    lines.push('### Features', '');
    for (const c of features) {
      lines.push(`- ${c.subject} (\`${c.hash}\`)`);
    }
    lines.push('');
  }
  if (fixes.length > 0) {
    lines.push('### Fixes', '');
    for (const c of fixes) {
      lines.push(`- ${c.subject} (\`${c.hash}\`)`);
    }
    lines.push('');
  }
  if (others.length > 0) {
    lines.push('### Other Changes', '');
    for (const c of others) {
      lines.push(`- ${c.subject} (\`${c.hash}\`)`);
    }
    lines.push('');
  }

  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  const firstReleaseIdx = existing.indexOf('\n## [');
  const updatedChangelog =
    firstReleaseIdx >= 0
      ? `${existing.slice(0, firstReleaseIdx)}\n${lines.join('\n')}${existing.slice(firstReleaseIdx + 1)}`
      : `${existing.trimEnd()}\n\n${lines.join('\n')}`;

  fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');
  console.log(`✓ Bumped version to ${nextVersion} and updated CHANGELOG.md`);
}

main();
