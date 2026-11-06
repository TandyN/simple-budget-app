#!/usr/bin/env bash
# verify.sh — the single gate every change must pass before it is committed.
#
# Runs, in order, stopping at the first failure:
#   docs check → format check → lint → typecheck → unit tests → build → end-to-end tests
#
# Usage: bash scripts/verify.sh      (or `pnpm verify` once the toolchain exists)

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

step() { printf '\n━━━ %s ━━━\n' "$1"; }

step "Docs are accurate"
bash scripts/check-docs.sh

if [[ ! -f package.json ]]; then
  printf '\nNo package.json yet (the toolchain is created in docs/plan/T01-toolchain-and-ci.md).\n'
  printf '✓ Only the docs check applies right now, and it passed.\n'
  exit 0
fi

step "Formatting (pnpm format:check)"
pnpm run format:check

step "Lint (pnpm lint)"
pnpm run lint

step "Types (pnpm typecheck)"
pnpm run typecheck

step "Unit tests (pnpm test)"
pnpm run test

step "Production build (pnpm build)"
pnpm run build

step "End-to-end journeys on every device profile (pnpm test:e2e)"
pnpm run test:e2e

printf '\n✓ Everything passed. Safe to commit.\n'

