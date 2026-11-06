#!/usr/bin/env bash
# check-docs.sh — mechanical checks that the docs match the repository.
#
# What it checks (each failure prints a reason and the file:line to fix):
#   1. Every repo path written in `backticks` or as a markdown link inside
#      AGENTS.md, README.md, docs/*.md and .agents/skills/*/SKILL.md exists.
#      - Fenced code blocks are skipped (use them for illustrative trees).
#      - Lines containing "(planned" are skipped, e.g. "(planned)" or
#        "(planned until T05)", for things not built yet.
#      - docs/plan/ is skipped (the plan describes the future on purpose).
#   2. Every skill folder in .agents/skills/ is listed in AGENTS.md.
#   3. Every task file docs/plan/T*.md is listed in docs/plan/README.md.
#   4. Every top-level folder in src/ is described in AGENTS.md as `src/<name>/`.
#   5. Every script in package.json is documented in docs/developer-setup.md
#      as `pnpm <script>`.
#
# Usage: bash scripts/check-docs.sh        (exit 0 = docs are accurate)

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root" || exit 1

problems=0
report() {
  echo "  ✗ $1"
  problems=$((problems + 1))
}

# Path roots we consider "repo paths" when they appear in inline code.
path_pattern='^(\./)?(src|e2e|scripts|docs|config|dev|public|\.agents|\.github)(/[^ ]*)?$|^[A-Za-z0-9._-]+\.(md|json|toml|ts|tsx|mjs|cjs|js|sh|yaml|yml|html|css)$'

docs_to_check=()
for f in AGENTS.md README.md docs/*.md .agents/skills/*/SKILL.md; do
  [[ -f "$f" ]] && docs_to_check+=("$f")
done

echo "▶ 1/5 Paths mentioned in docs exist"
for doc in "${docs_to_check[@]}"; do
  doc_dir="$(dirname "$doc")"
  line_number=0
  inside_fence=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    if [[ "$line" =~ ^[[:space:]]*(\`\`\`|~~~) ]]; then
      inside_fence=$((1 - inside_fence))
      continue
    fi
    (( inside_fence )) && continue
    [[ "$line" == *"(planned"* ]] && continue   # "(planned)" or "(planned until T05)"

    # Inline code spans: paths are relative to the repository root.
    while IFS= read -r candidate; do
      [[ -z "$candidate" ]] && continue
      candidate="${candidate%%#*}"          # drop #L10-L20 anchors
      candidate="${candidate%/}"            # trailing slash is fine
      candidate="${candidate#./}"
      [[ "$candidate" =~ [\<\>\*\{\}\$] ]] && continue   # placeholders/globs
      [[ "$candidate" =~ $path_pattern ]] || continue
      [[ -e "$candidate" ]] || report "$doc:$line_number mentions \`$candidate\` but it does not exist (if it is not built yet, add '(planned until Txx)' to the line)"
    done < <(grep -o '`[^`]*`' <<<"$line" | tr -d '`')

    # Markdown links: paths are relative to the document's own folder.
    while IFS= read -r target; do
      [[ -z "$target" ]] && continue
      [[ "$target" =~ ^(https?:|mailto:|#|file:|conversation:) ]] && continue
      target="${target%%#*}"
      [[ -z "$target" ]] && continue
      [[ -e "$doc_dir/$target" ]] || report "$doc:$line_number links to '$target' but $doc_dir/$target does not exist"
    done < <(grep -oE '\]\([^) ]+\)' <<<"$line" | sed -E 's/^\]\((.*)\)$/\1/')
  done <"$doc"
done

echo "▶ 2/5 Every agent skill is listed in AGENTS.md"
for skill_dir in .agents/skills/*/; do
  [[ -d "$skill_dir" ]] || continue
  skill_name="$(basename "$skill_dir")"
  grep -q "$skill_name" AGENTS.md || report "skill '$skill_name' is not mentioned in AGENTS.md"
done

echo "▶ 3/5 Every plan task is listed in docs/plan/README.md"
for task_file in docs/plan/T*.md; do
  [[ -f "$task_file" ]] || continue
  grep -q "$(basename "$task_file")" docs/plan/README.md || report "$(basename "$task_file") is not listed in docs/plan/README.md"
done

echo "▶ 4/5 Every top-level src/ folder is described in AGENTS.md"
if [[ -d src ]]; then
  for source_dir in src/*/; do
    [[ -d "$source_dir" ]] || continue
    grep -q "\`${source_dir}\`" AGENTS.md || report "\`${source_dir}\` exists but AGENTS.md does not describe it"
  done
else
  echo "  (no src/ yet — skipped)"
fi

echo "▶ 5/5 Every package.json script is documented in docs/developer-setup.md"
if [[ -f package.json ]]; then
  if command -v jq >/dev/null 2>&1; then
    script_names="$(jq -r '.scripts // {} | keys[]' package.json)"
  elif command -v node >/dev/null 2>&1; then
    script_names="$(node -e 'for (const k of Object.keys(require("./package.json").scripts ?? {})) console.log(k)')"
  else
    script_names=""
    echo "  (neither jq nor node available — skipped)"
  fi
  while IFS= read -r script_name; do
    [[ -z "$script_name" ]] && continue
    grep -qF "pnpm $script_name\`" docs/developer-setup.md || report "package.json script '$script_name' is not documented in docs/developer-setup.md as \`pnpm $script_name\`"
  done <<<"$script_names"
else
  echo "  (no package.json yet — skipped)"
fi

echo
if (( problems > 0 )); then
  echo "✗ Docs check failed with $problems problem(s). Fix the docs (or the code) and re-run."
  exit 1
fi
echo "✓ Docs check passed."
