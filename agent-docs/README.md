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
- The **docs-agent** does the **final pass once per epic**, after QA approves
  and before the feature PR merges to `main`. It reviews every section 1 by 1
  against what is shipping, fixes what is wrong, and adds what is missing. Only
  then is the feature merged.
