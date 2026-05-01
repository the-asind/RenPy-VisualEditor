# Agent Guide

This repository is currently on the RenPy Visual Editor 2.0 planning branch.

Before changing code, every agent must read these files in this order:

1. `AGENTS.md`
2. `UPDATES.md`
3. `docs/editor-2.0-architecture.md`

These files are the source of truth for MVP 2.0. Older MVP 1.0 notes, old README content, the existing implementation shape, and current tests are context only. They are not architectural authority.

## Project Goal

MVP 2.0 must turn the editor into one project canvas for all `.rpy` files.

The canvas contains:

1. `FileFrame` for each file.
2. `LabelFrame` for global labels.
3. Nested `LabelFrame` for local and nested labels.
4. A visible `LabelStartNode` inside every label frame.
5. Scenario nodes inside label frames.
6. Edges only between nodes, never frame-to-frame.

There must be no collapse/fold behavior on the MVP 2.0 canvas.

## Non-Negotiable Rules

1. React Flow is a projection layer, not the source of truth.
2. The source of truth is the project graph stored in CRDT state.
3. One project uses one project graph and one Loro document.
4. File/label containment is lexical structure, not runtime flow.
5. `jump` and `call` create relation edges and layout hints; they do not move labels or rebuild containment.
6. `jump` and `call` target the destination `LabelStartNode`.
7. Node IDs must remain stable during collaborative editing. Import may generate UUIDs; after import those IDs must be persisted and reused.
8. Parser unknowns inside valid Ren'Py structure must not become graph errors by default.
9. Non-branching Ren'Py statements and blocks become action/raw nodes when they do not affect narrative structure.
10. Comments must be preserved and visible when editing the related block.
11. Editor metadata must never be exported into `.rpy`.
12. Prefer stable normalized export over preserving original formatting.

## Documentation First

Before implementing any master item, check official documentation for the relevant tool:

1. Ren'Py language docs and source parser for parser behavior.
2. React Flow docs for projection, parent-child nodes, layouting, and collaboration guidance.
3. Loro docs for CRDT tree, snapshots, updates, and history primitives.

If official docs contradict the current plan, update the plan before coding.

## TDD Workflow

Development is organized as waterfall sprints. Each sprint contains master items.

Each master item must be a complete TDD loop:

1. Define the black-box expectation.
2. Add or update Ren'Py fixture files when needed.
3. Write failing black-box tests first.
4. Implement the smallest useful code path.
5. Run the relevant tests.
6. Update `UPDATES.md` and, if needed, `docs/editor-2.0-architecture.md`.
7. Close the master item only after tests pass.

Atomic actions live inside a master item. They are small implementation steps, not replacements for the master item's black-box tests.

Starting with Sprint 8, release planning uses smaller `MVP Action` items. Treat every `MVP Action` as its own TDD loop with:

1. A black-box expectation.
2. Failing action tests before implementation.
3. Integration tests that connect the action to prior actions and prior sprints.
4. Artifact updates after tests pass.

Do not close an `MVP Action` with only implementation notes or manual reasoning.

## Test Fixtures

Parser and roundtrip fixtures must tell one continuous, funny story about a mouse named RenPy. Reuse these fixtures across parser, resolver, export, layout, and collaboration tests so that coverage grows around the same project corpus.

The fixture corpus should cover global labels, local labels, nested labels, menus with prompt text, menu choice conditions, if/elif/else, jump, call, return, comments, raw statements, raw blocks, multi-file flow, duplicate labels, unresolved references, and dynamic references.

## Cleanup Rule

Do not delete code, tests, or files just because they belong to MVP 1.0.

First classify them as:

1. `keep`: can be reused directly.
2. `adapt`: useful, but must be reshaped for MVP 2.0.
3. `replace`: concept is useful, implementation should be rewritten.
4. `delete`: actively misleading or unused after replacement exists.

Only delete after the classification is recorded in `UPDATES.md` or a focused migration note.
