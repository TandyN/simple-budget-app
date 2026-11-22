import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEPLOY_WORKFLOW_PATH = path.join(
  ROOT_DIR,
  ".github",
  "workflows",
  "deploy-pages.yml",
);
const CI_WORKFLOW_PATH = path.join(ROOT_DIR, ".github", "workflows", "ci.yml");

const ALLOWED_ACTIONS = new Set([
  "actions/checkout",
  "pnpm/action-setup",
  "actions/setup-node",
]);

const BANNED_PAGES_ACTIONS = [
  "peaceiris/actions-gh-pages",
  "rossjrw/pr-preview-action",
  "actions/deploy-pages",
  "actions/upload-pages-artifact",
  "actions/configure-pages",
  "JamesIves/github-pages-deploy-action",
];

/**
 * Extracts the literal bash script for a named workflow step (`- name: <stepName>`).
 * @param {string} workflowYaml
 * @param {string} stepName
 * @returns {string}
 */
function extractStepRunScript(workflowYaml, stepName) {
  const lines = workflowYaml.split("\n");
  const nameLineIdx = lines.findIndex(
    (l) => l.trim() === `- name: ${stepName}`,
  );
  if (nameLineIdx === -1) {
    throw new Error(`Step "${stepName}" not found in workflow`);
  }

  let runLineIdx = -1;
  for (let i = nameLineIdx + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed.startsWith("- name:")) {
      break;
    }
    if (trimmed === "run: |") {
      runLineIdx = i;
      break;
    }
  }
  if (runLineIdx === -1) {
    throw new Error(`"run: |" block not found for step "${stepName}"`);
  }

  const runIndent = (lines[runLineIdx]?.match(/^(\s*)/)?.[1]?.length ?? 0) + 2;
  const scriptLines = [];
  for (let i = runLineIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      scriptLines.push("");
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent < runIndent) {
      break;
    }
    scriptLines.push(line.slice(runIndent));
  }
  return scriptLines.join("\n");
}

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe(".github/workflows/deploy-pages.yml static security & spec invariants", () => {
  const workflow = readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
  const ciWorkflow = readFileSync(CI_WORKFLOW_PATH, "utf8");

  it("declares top-level least-privilege permissions: { contents: read }", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it("declares serialized FIFO concurrency group 'pages-deploy' with cancel-in-progress: false", () => {
    expect(workflow).toMatch(
      /^concurrency:\n {2}group: "pages-deploy"\n {2}cancel-in-progress: false\n/m,
    );
  });

  it("triggers only on pull_request targeting main (opened, synchronize, reopened, closed) and push to main", () => {
    expect(workflow).toMatch(
      /^on:\n {2}pull_request:\n {4}branches: \[main\]\n {4}types: \[opened, synchronize, reopened, closed\]\n {2}push:\n {4}branches: \[main\]\n/m,
    );
  });

  it("scopes contents: write strictly to the publish job and skips fork PRs", () => {
    const writeMatches = [...workflow.matchAll(/contents:\s*write/g)];
    expect(writeMatches).toHaveLength(1);
    expect(workflow).toMatch(
      /jobs:\n {2}publish:[\s\S]*?permissions:\n {6}contents: write/,
    );
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it("pins every uses: action to the exact verified 40-char commit SHA from ci.yml and uses zero third-party Pages actions", () => {
    for (const banned of BANNED_PAGES_ACTIONS) {
      expect(workflow).not.toContain(banned);
    }

    const ciPins = new Map();
    for (const match of ciWorkflow.matchAll(
      /uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})\s+#\s*(v\S+)/g,
    )) {
      ciPins.set(match[1], `${match[2]} # ${match[3]}`);
    }

    const rawUsesLines = workflow
      .split("\n")
      .filter((line) => line.trim().startsWith("uses:"));
    expect(rawUsesLines.length).toBeGreaterThanOrEqual(3);

    for (const line of rawUsesLines) {
      const m = line
        .trim()
        .match(
          /^uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})\s+#\s*(v\S+)$/,
        );
      expect(
        m,
        `Action line is not 40-char SHA pinned: "${line}"`,
      ).not.toBeNull();
      const actionName = m?.[1] ?? "";
      const pinWithVersion = `${m?.[2]} # ${m?.[3]}`;
      expect(ALLOWED_ACTIONS.has(actionName)).toBe(true);
      expect(pinWithVersion).toBe(ciPins.get(actionName));
    }
  });

  it("never interpolates GitHub Actions expressions directly inside run: scripts (prevents shell injection)", () => {
    const buildScript = extractStepRunScript(
      workflow,
      "Build bundle with mode-(a) base path",
    );
    const publishScript = extractStepRunScript(
      workflow,
      "Publish or prune gh-pages site tree",
    );
    const exprPrefix = "$" + "{{";
    expect(buildScript).not.toContain(exprPrefix);
    expect(publishScript).not.toContain(exprPrefix);
  });

  it("computes VITE_BASE_PATH for PR previews (/simple-budget-app/pr-<PR#>/) and main (/simple-budget-app/) and runs verify:gates", () => {
    const buildScript = extractStepRunScript(
      workflow,
      "Build bundle with mode-(a) base path",
    );
    const prBaseExport =
      'export VITE_BASE_PATH="/simple-budget-app/pr-$' + '{PR_NUMBER}/"';
    expect(buildScript).toContain(prBaseExport);
    expect(buildScript).toContain(
      'export VITE_BASE_PATH="/simple-budget-app/"',
    );
    expect(buildScript).toContain("pnpm run build");
    expect(buildScript).toContain("pnpm run verify:gates");
  });
});

describe("deploy-pages.yml mode-(a) git publish, prune & concurrency runtime behavior", () => {
  const workflow = readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
  const publishScript = extractStepRunScript(
    workflow,
    "Publish or prune gh-pages site tree",
  );

  /**
   * Creates an isolated test fixture with a bare `origin` git repo and a cloned `workspace` repo.
   */
  function createGitFixture() {
    const baseDir = mkdtempSync(path.join(tmpdir(), "deploy-pages-test-"));
    tempDirs.push(baseDir);

    const originDir = path.join(baseDir, "origin.git");
    const workspaceDir = path.join(baseDir, "workspace");

    execFileSync("git", ["init", "--bare", originDir], { stdio: "pipe" });
    execFileSync("git", ["init", workspaceDir], { stdio: "pipe" });
    execFileSync("git", ["-C", workspaceDir, "config", "user.name", "Test"], {
      stdio: "pipe",
    });
    execFileSync(
      "git",
      ["-C", workspaceDir, "config", "user.email", "test@example.com"],
      { stdio: "pipe" },
    );
    execFileSync(
      "git",
      ["-C", workspaceDir, "remote", "add", "origin", originDir],
      { stdio: "pipe" },
    );
    writeFileSync(path.join(workspaceDir, "README.md"), "# test\n");
    execFileSync("git", ["-C", workspaceDir, "add", "README.md"], {
      stdio: "pipe",
    });
    execFileSync("git", ["-C", workspaceDir, "commit", "-m", "initial"], {
      stdio: "pipe",
    });
    execFileSync(
      "git",
      ["-C", workspaceDir, "push", "origin", "HEAD:refs/heads/main"],
      { stdio: "pipe" },
    );

    return { baseDir, originDir, workspaceDir };
  }

  /**
   * Writes synthetic built files into `<workspaceDir>/dist/`.
   * @param {string} workspaceDir
   * @param {Record<string, string>} files
   */
  function writeDist(workspaceDir, files) {
    const distDir = path.join(workspaceDir, "dist");
    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(distDir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const fullPath = path.join(distDir, rel);
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  /**
   * Runs the extracted `Publish or prune gh-pages site tree` script in `workspaceDir`.
   * @param {string} workspaceDir
   * @param {Record<string, string>} envVars
   */
  function runPublishStep(workspaceDir, envVars) {
    return execFileSync("bash", ["-c", publishScript], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: workspaceDir,
        COMMIT_SHA: "abcdef1234567890abcdef1234567890abcdef12",
        ...envVars,
      },
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  /**
   * Reads the current tree of `gh-pages` from the bare `originDir` into a map of relative path -> file content.
   * @param {string} baseDir
   * @param {string} originDir
   * @returns {Record<string, string>}
   */
  function inspectOriginGhPages(baseDir, originDir) {
    const inspectDir = mkdtempSync(path.join(baseDir, "inspect-"));
    execFileSync(
      "git",
      ["clone", "--branch", "gh-pages", originDir, inspectDir],
      {
        stdio: "pipe",
      },
    );
    const tracked = execFileSync("git", ["-C", inspectDir, "ls-files"], {
      encoding: "utf8",
      stdio: "pipe",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    /** @type {Record<string, string>} */
    const out = {};
    for (const rel of tracked) {
      out[rel] = readFileSync(path.join(inspectDir, rel), "utf8");
    }
    return out;
  }

  it("initializes orphan gh-pages on first PR deploy, preserves pr-*/ across main deploys, updates previews in isolation, and prunes on PR close", () => {
    const { baseDir, originDir, workspaceDir } = createGitFixture();

    // 1. First ever deploy: PR #120 opened when gh-pages does not yet exist on origin.
    writeDist(workspaceDir, {
      "index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v1.js"></script>',
      "assets/app-v1.js": "console.log('pr-120-v1');",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "opened",
      PR_NUMBER: "120",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "pr-120/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v1.js"></script>',
      "pr-120/assets/app-v1.js": "console.log('pr-120-v1');",
    });

    // 2. Production push to main: writes root files while keeping pr-120/ untouched.
    writeDist(workspaceDir, {
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v1.js"></script>',
      "assets/main-v1.js": "console.log('main-v1');",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "push",
      EVENT_ACTION: "",
      PR_NUMBER: "",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v1.js"></script>',
      "assets/main-v1.js": "console.log('main-v1');",
      "pr-120/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v1.js"></script>',
      "pr-120/assets/app-v1.js": "console.log('pr-120-v1');",
    });

    // 3. Second concurrent PR #121 opened + PR #120 synchronized with new asset hash:
    //    must replace old pr-120/assets/app-v1.js and leave production root untouched.
    writeDist(workspaceDir, {
      "index.html":
        '<!doctype html><script src="/simple-budget-app/pr-121/assets/app-121.js"></script>',
      "assets/app-121.js": "console.log('pr-121');",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "opened",
      PR_NUMBER: "121",
    });

    writeDist(workspaceDir, {
      "index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v2.js"></script>',
      "assets/app-v2.js": "console.log('pr-120-v2');",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "synchronize",
      PR_NUMBER: "120",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v1.js"></script>',
      "assets/main-v1.js": "console.log('main-v1');",
      "pr-120/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v2.js"></script>',
      "pr-120/assets/app-v2.js": "console.log('pr-120-v2');",
      "pr-121/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-121/assets/app-121.js"></script>',
      "pr-121/assets/app-121.js": "console.log('pr-121');",
    });

    // 4. Subsequent production push to main: cleans stale root assets/main-v1.js while keeping pr-120/ and pr-121/.
    writeDist(workspaceDir, {
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v2.js"></script>',
      "assets/main-v2.js": "console.log('main-v2');",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "push",
      EVENT_ACTION: "",
      PR_NUMBER: "",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v2.js"></script>',
      "assets/main-v2.js": "console.log('main-v2');",
      "pr-120/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-120/assets/app-v2.js"></script>',
      "pr-120/assets/app-v2.js": "console.log('pr-120-v2');",
      "pr-121/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-121/assets/app-121.js"></script>',
      "pr-121/assets/app-121.js": "console.log('pr-121');",
    });

    // 5. Close PR #120: prunes pr-120/ via git rm -rf --ignore-unmatch while preserving production root and pr-121/.
    runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "closed",
      PR_NUMBER: "120",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html":
        '<!doctype html><script src="/simple-budget-app/assets/main-v2.js"></script>',
      "assets/main-v2.js": "console.log('main-v2');",
      "pr-121/index.html":
        '<!doctype html><script src="/simple-budget-app/pr-121/assets/app-121.js"></script>',
      "pr-121/assets/app-121.js": "console.log('pr-121');",
    });
  });

  it("handles PR close gracefully when gh-pages or pr-<PR#>/ does not exist", () => {
    const { workspaceDir } = createGitFixture();

    // Closing a PR before gh-pages exists on origin should exit 0 cleanly.
    const outputBeforeBranch = runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "closed",
      PR_NUMBER: "999",
    });
    expect(outputBeforeBranch).toContain(
      "gh-pages branch does not exist on origin; nothing to prune.",
    );

    // Initialize gh-pages via main push, then close an unpublished PR #999.
    writeDist(workspaceDir, {
      "index.html": "<!doctype html><title>Prod</title>",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "push",
      EVENT_ACTION: "",
      PR_NUMBER: "",
    });

    const outputUnpublishedPr = runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "closed",
      PR_NUMBER: "999",
    });
    expect(outputUnpublishedPr).toContain("No changes to publish to gh-pages.");
  });

  it("rejects non-numeric PR_NUMBER values to prevent path traversal or command injection", () => {
    const { workspaceDir } = createGitFixture();
    writeDist(workspaceDir, { "index.html": "ok" });

    for (const badPr of ["", "abc", "120/../../etc", "120; echo pwned"]) {
      expect(() =>
        runPublishStep(workspaceDir, {
          EVENT_NAME: "pull_request",
          EVENT_ACTION: "opened",
          PR_NUMBER: badPr,
        }),
      ).toThrow(/Invalid PR_NUMBER/);
    }
  });

  it("recovers from a non-fast-forward push race via the retry/rebase-on-push loop", () => {
    const { baseDir, originDir, workspaceDir } = createGitFixture();

    // Seed initial production root on gh-pages.
    writeDist(workspaceDir, {
      "index.html": "prod-root",
    });
    runPublishStep(workspaceDir, {
      EVENT_NAME: "push",
      EVENT_ACTION: "",
      PR_NUMBER: "",
    });

    // Install a pre-receive hook on bare origin that rejects the first push while
    // advancing origin/gh-pages with a concurrent PR #201 commit from another clone.
    const markerFile = path.join(baseDir, "race-triggered");
    const sideCloneDir = path.join(baseDir, "side-clone");
    execFileSync(
      "git",
      ["clone", "--branch", "gh-pages", originDir, sideCloneDir],
      { stdio: "pipe" },
    );
    execFileSync("git", ["-C", sideCloneDir, "config", "user.name", "Racer"], {
      stdio: "pipe",
    });
    execFileSync(
      "git",
      ["-C", sideCloneDir, "config", "user.email", "racer@example.com"],
      { stdio: "pipe" },
    );

    const prePushHookPath = path.join(
      workspaceDir,
      ".git",
      "hooks",
      "pre-push",
    );
    writeFileSync(
      prePushHookPath,
      `#!/usr/bin/env bash
set -e
if [ ! -f "${markerFile}" ]; then
  touch "${markerFile}"
  (
    unset $(git rev-parse --local-env-vars)
    mkdir -p "${sideCloneDir}/pr-201"
    echo "concurrent-pr-201" > "${sideCloneDir}/pr-201/index.html"
    git -C "${sideCloneDir}" add pr-201/index.html
    git -C "${sideCloneDir}" commit -m "concurrent deploy pr-201"
    git -C "${sideCloneDir}" push origin gh-pages
  )
fi
`,
    );
    chmodSync(prePushHookPath, 0o755);

    writeDist(workspaceDir, {
      "index.html": "pr-202-preview",
    });
    const output = runPublishStep(workspaceDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "opened",
      PR_NUMBER: "202",
    });

    expect(existsSync(markerFile)).toBe(true);
    expect(output).toContain(
      "Push failed on attempt 1/3; rebasing onto latest origin/gh-pages...",
    );
    expect(output).toContain("Successfully pushed to gh-pages on attempt 2.");

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html": "prod-root",
      "pr-201/index.html": "concurrent-pr-201\n",
      "pr-202/index.html": "pr-202-preview",
    });
  });

  it("works cleanly from a shallow clone (--depth=1, matching actions/checkout default)", () => {
    const { baseDir, originDir } = createGitFixture();
    const shallowDir = path.join(baseDir, "shallow-workspace");
    execFileSync(
      "git",
      ["clone", "--depth=1", `file://${originDir}`, shallowDir],
      {
        stdio: "pipe",
      },
    );

    writeDist(shallowDir, {
      "index.html": "shallow-main-v1",
    });
    runPublishStep(shallowDir, {
      EVENT_NAME: "push",
      EVENT_ACTION: "",
      PR_NUMBER: "",
    });

    writeDist(shallowDir, {
      "index.html": "shallow-pr-300",
    });
    runPublishStep(shallowDir, {
      EVENT_NAME: "pull_request",
      EVENT_ACTION: "opened",
      PR_NUMBER: "300",
    });

    expect(inspectOriginGhPages(baseDir, originDir)).toEqual({
      "index.html": "shallow-main-v1",
      "pr-300/index.html": "shallow-pr-300",
    });
  });
});
