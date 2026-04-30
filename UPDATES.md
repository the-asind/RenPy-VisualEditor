# Updates

This file is the short project memory for RenPy Visual Editor 2.0. Keep it current when closing master items, changing decisions, or classifying old code.

## 2026-05-01

### Documentation Pillars

Added `AGENTS.md` and made the root README a pointer to the MVP 2.0 artifacts. Agents must read `AGENTS.md`, `UPDATES.md`, and `docs/editor-2.0-architecture.md` before making implementation changes.

### Latest Product Decisions

1. The MVP 2.0 canvas is one large project canvas, not one graph per file.
2. File frames contain label frames; label frames can contain nested label frames.
3. Every label frame has a visible `LabelStartNode` that marks the start of that label.
4. Edges exist only between nodes. `jump` and `call` target the destination `LabelStartNode`, not the frame itself.
5. Nothing collapses or folds on the MVP canvas.
6. Parser unknowns inside valid Ren'Py structure are not errors by default. Non-branching/non-narrative statements become action/raw nodes.
7. IDs may be generated UUIDs on import, but after import they must be persisted and remain stable during collaborative editing.
8. Test fixtures should tell one funny multi-file story about a mouse named RenPy and cover parser/resolver/export/layout invariants.
9. Exact source formatting is not an MVP guarantee; semantic content and stable normalized export are more important.
10. Comments are preserved and visible when editing the related block.

### Markdown Cleanup

The old MVP 1.0 README roadmap was replaced. At the time of this update, tracked markdown files are only:

1. `README.md`
2. `AGENTS.md`
3. `UPDATES.md`
4. `docs/editor-2.0-architecture.md`

No extra MVP 1.0 markdown files remain tracked.

Local ignored markdown/cache folders were also found: `.notes/`, `reactflow-DOCS/`, `.pytest_cache/`, `backend/.pytest_cache/`, and `backend/app/services/.pytest_cache/`. They are not part of git history, but can still confuse a local agent. Physical deletion was blocked by the current sandbox policy, so they remain a pending local cleanup item.

### Cleanup Policy For Code And Tests

The user asked to start by deleting everything that will not be useful for MVP 2.0. That cleanup must be done through inventory, not blind deletion, because parts of MVP 1.0 may be reused.

Next cleanup master item: classify existing backend, frontend, tests, parser, storage, and websocket code as `keep`, `adapt`, `replace`, or `delete`. Only delete code after that classification is recorded.

## 2026-04-30

### Branch And Initial Architecture

Created branch `codex/editor-2-architecture` and added the first version of `docs/editor-2.0-architecture.md`.

### Repo Findings

1. Current collaboration is not CRDT-based. It uses JSON WebSocket presence/lock-style behavior.
2. Current React Flow graph is a projection from parser output, not a durable project graph.
3. Current backend parser produces unstable IDs in some paths through object identity/address-like behavior.
4. Current architecture is close to `one file = one graph`; MVP 2.0 must become `one project = one canvas`.
5. Existing MVP 1.0 code is useful as context, but it is not the target architecture.
