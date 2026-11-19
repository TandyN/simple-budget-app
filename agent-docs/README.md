# Agent Docs

Short, navigable documentation of this codebase, written so an agent (or a
human) can find exactly what they need with **only the context they need** —
never a giant monolith.

This is the onboarding entry point. Start here, then go to the glossary.

## How to navigate

The docs are a small graph with a fixed shape:

```
README.md  (you are here — entry point + how to read this)
   └── glossary.md  (index: every key term -> 1-line definition -> link)
         └── <topic>.md   (a hub for one area: backend, board, budget-app, ...)
               └── <topic>/<sub>.md   (optional deep dive, only when a hub
                                       outgrows one file)
```

Rules of the shape:

- **Glossary is the index.** Every key term lives in `glossary.md` with a
  one-line definition and a link to where it is documented. Start your search
  there.
- **One concern per file.** A hub doc covers one area. If an area grows, split
  it into `<topic>/<sub>.md` and keep the hub as a short map with links.
- **Front and back stay separate.** A reviewer doing backend work must be able
  to get everything they need **without reading frontend docs**, and vice versa.
  Split by area so that is always true.
- **Short beats long.** Link out instead of inlining. A 1-line pointer in the
  glossary/hub beats a 200-line paste.

## How to find what you need

- **You know the term** -> `glossary.md` -> follow the link.
- **You know the area** (backend / frontend / data / board / orchestration)
  -> open that topic doc directly.
- **You don't know where something is** -> `glossary.md` is the fastest way in;
  every documented concept has an entry.

## What is documented

| Area | Doc | Status |
| ---- | --- | ------ |
| Multi-agent orchestration system | [orchestration.md](orchestration.md) | current |
| GitHub Projects board workflow | [board.md](board.md) | current |
| The budget app (backend / frontend / data) | [budget-app.md](budget-app.md) | growing — documented as it ships |

## How this is kept accurate

- The **software-engineer** updates the docs **best-effort** as part of their
  task (add a glossary entry, keep the relevant area doc roughly right). This is
  quick, not exhaustive.
- The **docs-agent** does the **final pass once per story**, after QA approves
  and before the feature PR merges to `main`. It reviews every section 1 by 1
  against what is shipping, fixes what is wrong, and adds what is missing. Only
  then is the feature PR merged.

## Link & anchor verification

Run this `python3` recipe from the repository root after editing headings or
links in `project-plan/` or `agent-docs/`. It implements GitHub's heading slug
rule (lowercase, strip backticks, remove any char other than `\w`/space/`-`,
replace spaces with `-`, append `-1`/`-2` for duplicate headings) and checks
both file existence and `#anchor` targets:

```bash
python3 - <<'PY'
import glob, os, re, sys

def slugs_for(path):
    slugs, counts, fence = set(), {}, None
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^\s*(`{3,}|~{3,})", line)
            if m:
                ch = m.group(1)[0]
                fence = None if fence == ch else (fence or ch)
                continue
            if fence:
                continue
            h = re.match(r"^#{1,6}\s+(.*?)\s*#*\s*$", line)
            if not h:
                continue
            text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", h.group(1))
            s = re.sub(r"[^\w \-]", "", text.lower().replace("`", "")).replace(" ", "-")
            n = counts.get(s, -1) + 1
            counts[s] = n
            slugs.add(f"{s}-{n}" if n else s)
    return slugs

files = sorted(glob.glob("project-plan/**/*.md", recursive=True) + glob.glob("agent-docs/**/*.md", recursive=True))
cache = {os.path.normpath(p): slugs_for(p) for p in files}
checked, missing, bad = 0, 0, 0

for f in files:
    fence = None
    with open(f, encoding="utf-8") as fp:
        for lineno, line in enumerate(fp, 1):
            m = re.match(r"^\s*(`{3,}|~{3,})", line)
            if m:
                ch = m.group(1)[0]
                fence = None if fence == ch else (fence or ch)
                continue
            if fence:
                continue
            for link in re.finditer(r"\]\(([^)\s]+)\)", re.sub(r"`[^`]*`", "", line)):
                target = link.group(1)
                if target.startswith(("http://", "https://", "mailto:")):
                    continue
                rel, anchor = (target.split("#", 1) + [None])[:2]
                dest = os.path.normpath(os.path.join(os.path.dirname(f), rel)) if rel else os.path.normpath(f)
                if not os.path.exists(dest):
                    print(f"MISSING {f}:{lineno} -> {target}")
                    missing += 1
                    continue
                if anchor is not None:
                    checked += 1
                    cache.setdefault(dest, slugs_for(dest))
                    if anchor not in cache[dest]:
                        print(f"BAD {f}:{lineno} -> {target}")
                        bad += 1

print(f"checked {checked} anchored links, missing {missing}, bad {bad}")
sys.exit(1 if missing or bad else 0)
PY
```

Expected output when all links and heading anchors are valid:
`checked <N> anchored links, missing 0, bad 0` (exit code `0`).
