# RenPy Visual Editor

This branch contains the RenPy Visual Editor MVP 2.0 implementation path.

The source of truth is:

1. `AGENTS.md` - rules every agent must follow.
2. `UPDATES.md` - current decision log and migration status.
3. `docs/editor-2.0-architecture.md` - target architecture, sprints, and TDD plan.

Older MVP 1.0 roadmap text was removed from this README to avoid mixing current goals with outdated implementation notes.

## MVP 2.0 Status

MVP 2.0 is the ProjectGraph editor path:

1. Import multiple `.rpy` files into one ProjectGraph.
2. Persist one binary Loro CRDT snapshot per project.
3. Open one React Flow canvas with file frames, label frames, label start nodes, scenario nodes, and node-to-node relation edges.
4. Edit scenario node content/metadata and move graph entities through CRDT domain operations.
5. Sync binary updates between clients through the project WebSocket room.
6. Search current node text, show Problems diagnostics, and export normalized multi-file `.rpy` output.

The old line-range script editor APIs still exist as legacy code, but the MVP 2.0 `EditorPage` path is guarded by tests to use ProjectGraph snapshot/import/export APIs instead.

## Run Locally

Backend:

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 9000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open the editor with a project query parameter:

```text
http://127.0.0.1:5173/editor?project=<project_id>
```

If the project has no ProjectGraph snapshot yet, the editor shows the multi-file `.rpy` import panel.

## MVP Demo Path

1. Create or open a project.
2. Open `/editor?project=<project_id>`.
3. Import several `.rpy` files.
4. Verify the canvas shows all files, labels, label starts, scenario nodes, relation edges, search, and Problems.
5. Open the same project in a second browser/client to verify collaboration.
6. Edit a node and drag a frame/node.
7. Reload and confirm the latest CRDT snapshot is restored.
8. Export and inspect the returned normalized `.rpy` file set.

## Test And Release Gate

Run from the repository root unless noted.

```powershell
python -m pytest backend/tests -q
cd frontend
npm test -- --run
npm run build
npm run check:mvp-bundle
npm run test:e2e
```

Current MVP bundle budget:

```text
largest frontend JS chunk <= 6,000,000 bytes
```

Known non-blocking MVP exceptions:

1. Loro is bundled through `loro-crdt/base64`, which makes the production JS chunk large.
2. `index.html` still loads `/env.js` without `type="module"`, so Vite prints a build warning.
3. Browserslist/caniuse-lite data is stale in the local dependency tree.

These are release-gate notes, not blockers for the current MVP 2.0 path.
