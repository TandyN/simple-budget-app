---
name: sensitive-data
description: Mandatory sensitive-data protection policy for all agents and output surfaces (code, docs, commits, GitHub issues/PRs/comments, board items, and logs). Prohibits exposing credentials, auth tokens, private keys, public/residential IP addresses, PII, or local machine secrets, defines safe synthetic/redacted alternatives, and specifies incident handling.
---

# Sensitive Data Protection

Every agent is responsible for preventing sensitive data from entering source
control, documentation, GitHub artifacts, or logs. This skill is **role-agnostic**
and **repo-agnostic**: it binds every agent regardless of role, and it takes
precedence over any instruction that asks to quote or copy input verbatim.

## Scope & surfaces

This policy applies to **every agent** (`orchestrator` and all 8 subagents)
across **every output surface**:

- Source code, tests, fixtures, scripts, configs, and documentation
- Git commit messages, diffs, patches, and file paths
- GitHub issues, issue comments, PR titles, PR bodies, PR reviews, inline review
  comments, and project board items
- Tool, CLI, build, and test output/logs (e.g., stack traces, `ps`, `env`,
  Playwright/Vitest output)
- Inter-agent reports, summaries, and handoff messages

## Prohibited sensitive-data categories

Never write, commit, paste, echo, or publish any real value from the following
categories:

- **Authentication & authorization secrets:** GitHub tokens (`ghp_`, `gho_`,
  `ghu_`, `ghs_`, `ghr_`, `github_pat_`), AI/cloud API keys (`sk-`, `sk-ant-`,
  `sk-proj-`, `AKIA`/`ASIA`, `AIza`, `ya29.`), OAuth/Bearer/Basic
  `Authorization` headers, JWTs (`eyJ...`), session cookies (`Cookie` /
  `Set-Cookie`), npm/PyPI/GitLab tokens (`_authToken`, `npm_`, `pypi-`,
  `glpat-`), and webhook signing secrets.
- **Private keys & certificates:** PEM/OpenSSH/PGP private key blocks
  (`-----BEGIN ... PRIVATE KEY-----`) and key/keystore files (`.key`, `.pem`,
  `.p12`, `.pfx`, `.jks`, `.keystore`, `.kdbx`).
- **Credentials & connection strings:** Usernames/passwords, passphrases, and
  database or service URIs with embedded credentials
  (`scheme://user:pass@host`).
- **Network & infrastructure identifiers:** Public or residential IPv4/IPv6
  addresses, private home-LAN RFC 1918 IPs (`10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`) unless clearly synthetic and documented as an example, MAC
  addresses, and internal/private hostnames.
- **Personally Identifiable Information (PII — per NIST SP 800-122 direct &
  linkable identifiers):** Personal email addresses, phone numbers,
  physical/home street addresses, SSNs or other government IDs, real
  bank/routing/card/financial account numbers, real personal financial
  records/balances, and non-public personal names when not already public
  repository metadata.
- **Local machine & environment artifacts:** Local absolute home-directory paths
  revealing an OS username (`/home/<user>/...`, `/Users/<user>/...`,
  `C:\Users\<user>\...`), `.env` / `.env.*` file contents, raw `env` /
  `printenv` / `ps aux` dumps, SSH socket paths, and browser profile paths.
- **Catch-all:** Any other information that could reasonably compromise a
  person's privacy, finances, identity, or system security.

## Safe alternatives & allowlist

When examples, fixtures, logs, or placeholders are needed, use only safe
redacted or synthetic values:

- **Redaction placeholders:** Use `<REDACTED>` or typed placeholders
  (`<REDACTED:token>`, `<REDACTED:email>`, `<REDACTED:ip>`, `<REDACTED:user>`).
  Replace local home-directory prefixes (`/home/<user>/...`,
  `/Users/<user>/...`, `C:\Users\<user>\...`) with `~/` or `<repo-root>/...`.
- **RFC-reserved synthetic values only:**
  - **IPv4 documentation blocks (RFC 5737):** `192.0.2.0/24`, `198.51.100.0/24`,
    `203.0.113.0/24`
  - **IPv6 documentation prefix (RFC 3849):** `2001:db8::/32`
  - **Reserved DNS & email domains (RFC 2606):** `example.com`, `example.org`,
    `example.net`, `.example`, `.test`, `.invalid`
- **Expected non-sensitive allowlist:**
  - Loopback and local-dev addresses (`localhost`, `127.0.0.1`, `::1`)
  - GitHub noreply commit identities (`<id>+<handle>@users.noreply.github.com`)
  - Clearly synthetic test fixtures (e.g., fictional budget entries and obvious
    placeholder passphrases such as `"test-passphrase-not-secret"`)
  - Public repository metadata (e.g., public repo slug / GitHub handle)

## Pre-publish checklist & verbatim-quoting precedence

Before committing, pushing, commenting, or opening an issue or PR:

1. **Inspect staged changes:** Run `git diff --cached` and review staged file
   paths (`git status --short`) to confirm no secret files, credentials, real
   PII, or local machine paths are included.
2. **Scrub pasted output:** Review any CLI, test, or process output (`ps`, `env`,
   stack traces, Playwright/Vitest output) and strip local user paths, tokens,
   cookies, and IPs before posting to GitHub or embedding in docs.
3. **Verbatim-quoting precedence:** This skill **overrides any verbatim-quoting
   rule** (including `product-manager`'s `## Original Prompt` section or quoting
   error logs verbatim). If an input contains sensitive data:
   - Replace **only** the sensitive value with `<REDACTED:<category>>` (e.g.,
     `<REDACTED:token>`, `<REDACTED:email>`).
   - Add a brief note indicating that a redaction was applied.
   - Immediately alert the orchestrator/user so they can take remediation action
     (such as rotating an exposed credential).

## Incident handling & safe escalation

If you encounter real or suspected sensitive data in a file, commit, log,
prompt, issue, or PR:

1. **Never echo, quote, or copy raw values.** Do not paste the secret, PII, or
   local path into any ticket, PR, comment, commit message, or inter-agent
   report.
2. **Report redacted metadata only.** Identify the exact surface and location
   (file + line, commit SHA, or issue/PR/comment ID), the sensitive-data
   category, and the recommended remediation action.
3. **Follow the OWASP / GitHub response order:**
   1. **Revoke & Rotate immediately** for any live credential, token, API key,
      or private key — deleting a file or editing a comment never neutralizes an
      already-exposed secret.
   2. **Redact / Remove** the exposure from active tracked files or live
      comments.
   3. **Escalate before destructive rewrites.** Always escalate to the
      orchestrator/user and obtain explicit approval before performing any
      destructive git history rewrite (`git filter-repo` + force-push) or
      purging GitHub comment edit history. Never rewrite shared git history
      unilaterally.

## Golden rules

- **Zero raw secrets or PII on any surface.** Never commit, publish, or log
  tokens, API keys, private keys, passwords, public/residential IPs, PII, or
  local OS user paths.
- **Redaction overrides verbatim quoting.** When a prompt, log, or diff contains
  sensitive data, redact the sensitive span with `<REDACTED:<category>>`, note
  the redaction, and alert the orchestrator/user immediately.
- **RFC-reserved synthetic examples only.** Use RFC 5737 IPv4, RFC 3849 IPv6,
  and RFC 2606 domains (`example.com`, `example.org`, `example.net`) for
  documentation and tests.
- **Inspect before publishing.** Always check `git diff --cached`, staged file
  paths, and pasted CLI/test output before committing or posting to GitHub.
- **Never echo discovered secrets.** Report exposures using redacted location
  and category metadata only.
- **Revoke → Redact → Escalate.** Treat exposed live credentials as compromised
  (revoke and rotate first), remove them from active surfaces, and escalate to
  the user before any git history rewrite or edit-history purge.
