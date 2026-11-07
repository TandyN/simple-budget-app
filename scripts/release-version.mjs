#!/usr/bin/env node
// release-version.mjs — Automated SemVer (0.y.z pre-1.0) version bump & CHANGELOG.md generator
// from Conventional Commits. Zero external dependencies (uses Node built-ins only).

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

function parseConventionalCommit(commit) {
  const cleanedSubject = commit.subject.replace(/\s*\(agent-generated\)\s*$/i, '').trim();
  const match = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(cleanedSubject);
  if (!match) {
    return {
      hash: commit.hash,
      type: 'other',
      scope: null,
      breaking: commit.subject.includes('BREAKING CHANGE'),
      description: cleanedSubject,
      raw: commit.subject,
    };
  }
  const [, type = 'other', scope = null, bang = '', description = cleanedSubject] = match;
  return {
    hash: commit.hash,
    type,
    scope,
    breaking: Boolean(bang) || commit.subject.includes('BREAKING CHANGE'),
    description,
    raw: commit.subject,
  };
}

function formatCommitBullet(parsed) {
  const scopePrefix = parsed.scope ? `**${parsed.scope}:** ` : '';
  return `- ${scopePrefix}${parsed.description} (\`${parsed.hash}\`)`;
}

function computeNextVersion(currentVersion, parsedCommits, explicitVersion) {
  if (explicitVersion) {
    return explicitVersion.replace(/^v/, '');
  }
  const parts = currentVersion.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 1;
  const patch = parts[2] ?? 0;

  const hasBreaking = parsedCommits.some((c) => c.breaking);
  const hasFeat = parsedCommits.some((c) => c.type === 'feat');

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
  const rawLog = sh(`git log ${range} --no-merges --pretty=format:"%h|%s"`);
  const rawCommits = rawLog
    ? rawLog
        .split('\n')
        .map((line) => {
          const [hash, ...rest] = line.split('|');
          return { hash, subject: rest.join('|') };
        })
        .filter((c) => !/^chore\(release\):/i.test(c.subject))
    : [];

  const parsedCommits = rawCommits.map(parseConventionalCommit);
  if (parsedCommits.length === 0 && !explicitVersion) {
    console.log(
      `✓ No new commits since ${latestTag ?? 'initial commit'}; keeping version ${pkg.version}`,
    );
    return;
  }
  if (parsedCommits.length === 0 && !explicitVersion) {
    console.log(`✓ No new commits since ${latestTag ?? 'initial commit'}; keeping version ${pkg.version}`);
    return;
  }
  const nextVersion = computeNextVersion(pkg.version, parsedCommits, explicitVersion);

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const today = new Date().toISOString().slice(0, 10);
  const sections = [
    {
      title: '### Features',
      items: parsedCommits.filter((c) => c.type === 'feat'),
    },
    {
      title: '### Bug Fixes',
      items: parsedCommits.filter((c) => c.type === 'fix'),
    },
    {
      title: '### Refactoring & Performance',
      items: parsedCommits.filter((c) => c.type === 'refactor' || c.type === 'perf'),
    },
    {
      title: '### Tests & Quality',
      items: parsedCommits.filter((c) => c.type === 'test'),
    },
    {
      title: '### Documentation',
      items: parsedCommits.filter((c) => c.type === 'docs'),
    },
    {
      title: '### Tooling & Maintenance',
      items: parsedCommits.filter(
        (c) => !['feat', 'fix', 'refactor', 'perf', 'test', 'docs'].includes(c.type),
      ),
    },
  ];

  const lines = [`## [${nextVersion}] - ${today}`, ''];
  for (const section of sections) {
    if (section.items.length > 0) {
      lines.push(section.title, '');
      for (const item of section.items) {
        lines.push(formatCommitBullet(item));
      }
      lines.push('');
    }
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
