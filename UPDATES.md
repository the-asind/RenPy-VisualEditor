# Updates

This file is the short project memory for RenPy Visual Editor 2.0. Keep it current when closing master items, changing decisions, or classifying old code.

## 2026-05-02

### MVP 2.0 Release Sprint Plan

Extended `docs/editor-2.0-architecture.md` with the remaining release path to a working MVP 2.0.

Decision:

1. Starting with Sprint 8, each sprint item is treated as an `MVP Action`: a small black-box TDD result with its own action tests and integration tests.
2. Sprint 8 focuses on product import/open: multi-file `.rpy` upload -> ProjectGraph import -> resolver/diagnostics/layout -> CRDT snapshot -> canvas open -> export contract.
3. Sprint 9 focuses on real collaboration and persistence hardening: two browser clients, live edit/drag sync, reload recovery, debounced saves, and JSON/binary socket separation.
4. Sprint 10 focuses on editor/export readiness: typed node editing, manual layout persistence, export safety gate, live search/problems after edits, and export UX.
5. Sprint 11 is the MVP 2.0 release gate: one end-to-end contract, MVP 1.0 conflict cleanup, build/bundle gate, and operator documentation.
6. The fastest safe route is not to add more feature breadth before Sprint 8; it is to close the missing product path from imported `.rpy` files to usable collaborative canvas and export.

### Sprint 7 / Master Item 7.2 Editable Collaborative Canvas

Closed Sprint 7 by wiring the editor canvas to ProjectGraph CRDT domain operations, binary WebSocket updates, snapshot persistence, and ProjectGraph export.

Files:

1. `backend/app/api/routes/projects.py`
2. `backend/tests/test_project_graph_snapshot_route.py`
3. `frontend/src/services/api.ts`
4. `frontend/src/services/__tests__/api.test.ts`
5. `frontend/src/utils/projectGraphCollaboration.ts`
6. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`
7. `frontend/src/utils/projectGraphCrdt.ts`
8. `frontend/src/components/EditorPage.tsx`
9. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
10. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`

Result:

1. Added authenticated `PUT /api/projects/{project_id}/graph-snapshot` for saving opaque binary CRDT snapshots.
2. Added authenticated `POST /api/projects/{project_id}/graph-export` that exports normalized `.rpy` files from a ProjectGraph JSON payload, not from old line-range script state.
3. Added frontend API helpers for loading a `LoroDoc`, saving binary snapshots, and exporting ProjectGraph files.
4. Added `ProjectGraphCollaborationSession`: scenario content edits and entity drag operations mutate the Loro-backed ProjectGraph, emit binary updates, notify React state, and persist reloadable snapshots.
5. Added browser WebSocket helpers that use `binaryType = "arraybuffer"` and send `Uint8Array` updates without JSON wrapping.
6. `EditorPage` now owns a CRDT collaboration session, connects to `/api/ws/project/{project_id}`, applies incoming binary updates, persists snapshots after local and remote changes, and exports through ProjectGraph.
7. `ProjectGraphCanvas` now has a minimal scenario node editor and writes drag-final positions back through domain callbacks.
8. Added inter-sprint contract coverage proving CRDT edit/drag state projects into the React Flow canvas model.
9. Tests passed: `python -m pytest backend\tests\test_project_graph_snapshot_route.py backend\tests\test_project_graph_crdt_persistence.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_export_roundtrip_contract.py backend\tests\test_project_graph_exporter.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_websocket.py backend\tests\test_database_service.py -q`.
10. Tests passed: `npm test -- --run`.
11. Build passed: `npm run build`.
12. Known follow-up remains: production frontend chunk is large because Loro WASM is bundled through `loro-crdt/base64`; later optimization should move this to explicit WASM handling/code splitting.

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


### Sprint 0 / Master Item 0.2 Inventory

Created `docs/mvp-1-inventory.md` with `keep/adapt/replace/delete` classification for backend, frontend, parser, websocket, database, tests, config, and local ignored artifacts.

Result:

1. Parser, old script line-range API, JSON lock-based websocket collaboration, old flow transformer, and branch snippet insertion are classified as `replace`.
2. Auth, project permissions, database foundation, UI shell, node editor shell, themes/layout/i18n, and project services are classified as `adapt` or `keep`.
3. Local ignored `.notes/`, `reactflow-DOCS/`, pytest caches, and debug databases are classified as `delete` when deletion is permitted by the environment.
4. No tracked code should be deleted before its replacement exists and tests pass.



### Sprint 0 / Master Item 0.3 Parser Coverage Matrix

Created `docs/parser-coverage-matrix.md` after checking official Ren'Py 8.5.3 docs and the official `renpy/parser.py` source.

Result:

1. MVP first-class parser scope is file, label, local/nested label, `LabelStartNode`, dialogue, menu/prompt/choice/choice condition, if/elif/else, jump, call, return, and comments.
2. Presentation and implementation statements like `scene`, `show`, `hide`, `with`, `image`, audio, one-line Python, and Python blocks are action/raw/raw_block unless they create graph-relevant structure.
3. Dynamic jump/call and unresolved targets are non-blocking diagnostics.
4. Blocking diagnostics are limited to cases where containment or safe export cannot be preserved.
5. Sprint 1 should begin with the mouse RenPy fixture corpus and ProjectGraph black-box parser tests.


### Sprint 1 / Master Item 1.1 Mouse RenPy Fixture Corpus

Started Sprint 1 by adding the shared Ren'Py fixture corpus for parser/resolver/export/layout tests.

Files:

1. `backend/tests/fixtures/renpy_mouse/renpy_mouse_day_1.rpy`
2. `backend/tests/fixtures/renpy_mouse/renpy_mouse_day_2.rpy`
3. `backend/tests/fixtures/renpy_mouse/renpy_mouse_diagnostics.rpy`
4. `backend/tests/test_mouse_renpy_fixtures.py`

Coverage:

1. Multi-file project flow.
2. Global labels, local labels, qualified local references, and label parameters.
3. Dialogue, menu prompt text, menu choices, menu choice conditions.
4. If/elif/else, jump, call, call expression, call from, return.
5. Comments, scene/show/with/audio action statements, ATL-like raw block, Python raw block.
6. Duplicate labels, unresolved target, dynamic jump, and raw fallback loop case.


### Sprint 1 / Master Item 1.2 Multi-file Import

Added the first ProjectGraph importer shell.

Files:

1. `backend/app/services/project_graph/models.py`
2. `backend/app/services/project_graph/importer.py`
3. `backend/tests/test_project_graph_importer.py`

Result:

1. `ProjectGraphImporter.import_files()` imports a list of `.rpy` paths into one `ProjectGraph`.
2. Each source file becomes a `FileFrame` with generated persisted-style UUID, stable order string, initial canvas position, and source index entry.
3. Import rejects missing files, non-`.rpy` files, missing project ID, and empty file lists.
4. Label parsing intentionally remains out of scope until Master Item 1.4.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_importer.py` and `python -m pytest backend\tests\test_mouse_renpy_fixtures.py`.


### Sprint 1 / Master Item 1.3 Persistent Generated IDs

Added snapshot and edit helpers for the ProjectGraph shell.

Files:

1. `backend/app/services/project_graph/snapshot.py`
2. `backend/app/services/project_graph/editor.py`
3. `backend/tests/test_project_graph_ids.py`

Result:

1. `ProjectGraphSnapshotCodec.dump/load()` preserves generated file IDs across snapshot roundtrip.
2. `ProjectGraphEditor.update_source_content()` updates source text without changing file frame identity.
3. Tests passed: `python -m pytest backend\tests\test_project_graph_ids.py` and `python -m pytest backend\tests\test_project_graph_importer.py backend\tests\test_mouse_renpy_fixtures.py`.


### Sprint 1 / Master Item 1.4 Label Frames And LabelStartNode

Added first label parsing into the ProjectGraph importer.

Files:

1. `backend/app/services/project_graph/models.py`
2. `backend/app/services/project_graph/importer.py`
3. `backend/app/services/project_graph/snapshot.py`
4. `backend/tests/test_project_graph_labels.py`

Result:

1. Global labels now import as `LabelFrame(scope="global")`.
2. Local `.name` labels import as nested/local `LabelFrame(scope="local")` under the owning global label.
3. Every label gets exactly one `LabelStartNode`.
4. `LabelFrame.label_start_node_id` points to the start node, and snapshot roundtrip preserves label/start IDs.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.


### Sprint 1 / Master Item 1.5 Menu Semantics

Added first ProjectGraph scenario nodes for Ren'Py menu semantics.

Files:

1. `backend/app/services/project_graph/models.py`
2. `backend/app/services/project_graph/importer.py`
3. `backend/app/services/project_graph/snapshot.py`
4. `backend/tests/test_project_graph_menus.py`

Result:

1. `menu:` and named menus import as `ScenarioNode(type="menu")`.
2. Prompt/caption text imports as `ScenarioNode(type="menu_prompt")`.
3. Choices import as `ScenarioNode(type="menu_choice")` with `choice_text` and optional `condition` metadata.
4. Initial statements inside choices import as child nodes; current MVP mapper recognizes `jump`, `call`, `return`, and safe `raw_action`.
5. Snapshot roundtrip preserves scenario node IDs and parent relationships.
6. Tests passed: `python -m pytest backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.


### Sprint 1 / Master Item 1.6 Action And Raw Preservation

Added safe action/raw preservation for non-branching Ren'Py statements.

Files:

1. `backend/app/services/project_graph/importer.py`
2. `backend/tests/test_project_graph_actions.py`

Result:

1. Presentation lines like `scene`, `show`, `with`, and `play` import as `raw_action` nodes.
2. Dialogue and narration lines import as `dialogue` nodes.
3. `python:` and ATL-like `show ...:` blocks import as `raw_block` nodes.
4. Safe action/raw nodes do not create diagnostics.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.


### Sprint 1 / Master Item 1.7 If/Elif/Else And Comments

Added first-class import support for runtime conditionals and editable comments.

Files:

1. `backend/app/services/project_graph/importer.py`
2. `backend/tests/test_project_graph_conditionals.py`
3. `docs/editor-2.0-architecture.md`

Result:

1. `if`, `elif`, and `else` import as first-class `ScenarioNode`s with preserved condition metadata.
2. Statements inside conditional branches import as child nodes of the corresponding branch node.
3. Comments inside label bodies import as `ScenarioNode(type="comment")`.
4. Conditional and comment nodes survive snapshot roundtrip with IDs, parent links, and metadata intact.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.

### Sprint 2 / Master Item 2.1 Global And Cross-file Resolver

Started Sprint 2 by adding the first resolver pass for static global `jump` and `call` targets.

Files:

1. `backend/app/services/project_graph/models.py`
2. `backend/app/services/project_graph/resolver.py`
3. `backend/app/services/project_graph/snapshot.py`
4. `backend/tests/test_project_graph_resolver.py`

Result:

1. Added `FlowEdge` as the ProjectGraph node-to-node relation model.
2. `ProjectGraphResolver.resolve()` builds a project-wide global label index.
3. Static global `jump` targets resolve to the destination `LabelStartNode`.
4. Static global `call` targets with args and `from` labels resolve to the destination `LabelStartNode` and preserve call metadata.
5. Local `.label` and qualified `global.local` targets intentionally remain unresolved until Master Item 2.2.
6. Snapshot roundtrip preserves resolved edges.
7. Tests passed: `python -m pytest backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 2 / Master Item 2.2 Local Resolver

Added scoped local label resolution for `.local` and explicit `global.local` targets.

Files:

1. `backend/app/services/project_graph/resolver.py`
2. `backend/tests/test_project_graph_resolver.py`
3. `backend/tests/fixtures/renpy_mouse/renpy_mouse_day_1.rpy`
4. `backend/tests/fixtures/renpy_mouse/renpy_mouse_day_2.rpy`

Result:

1. `.local` jump/call targets resolve relative to the source node's owning global label.
2. Explicit `global.local` targets resolve directly by qualified label name.
3. The mouse fixture now has matching `.shared_nook` local labels under two different global labels to prove scope isolation.
4. Same local names in different global scopes resolve to different `LabelStartNode`s.
5. Global resolver behavior from Master Item 2.1 remains intact.
6. Tests passed: `python -m pytest backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 2 / Master Item 2.3 Diagnostics MVP

Added non-blocking resolver/import diagnostics for the MVP ProjectGraph.

Files:

1. `backend/app/services/project_graph/models.py`
2. `backend/app/services/project_graph/importer.py`
3. `backend/app/services/project_graph/resolver.py`
4. `backend/app/services/project_graph/snapshot.py`
5. `backend/tests/test_project_graph_diagnostics.py`

Result:

1. Added `GraphDiagnostic` with severity, blocking flag, source links, and metadata.
2. Duplicate global labels create non-blocking `duplicate_global_label` warnings.
3. Unresolved static jump/call targets create non-blocking `unresolved_target` warnings and no edge.
4. Dynamic jump/call targets create non-blocking `dynamic_target` info diagnostics and no edge.
5. Unsupported `while` blocks preserve source text as `raw_block` and create non-blocking `unsupported_raw_block` warnings.
6. Safe raw/action/dialogue/comment nodes do not create diagnostics.
7. Snapshot roundtrip preserves diagnostics.
8. Tests passed: `python -m pytest backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 1+2 Black-box Contract Test

Added one large integration-style black-box test that validates the combined output of Sprint 1 and Sprint 2 from the full mouse RenPy corpus.

Files:

1. `backend/tests/test_project_graph_sprint_1_2_blackbox.py`

Result:

1. The test imports and resolves all three fixture files as one ProjectGraph.
2. It verifies file frames, label frames, label start nodes, menu semantics, conditionals, comments, raw/action preservation, scoped edges, diagnostics, and snapshot roundtrip in one contract.
3. The full current ProjectGraph test set passed: `python -m pytest backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 3 / Master Item 3.1 Single-file Roundtrip

Started Sprint 3 by adding normalized single-file ProjectGraph export.

Files:

1. `backend/app/services/project_graph/exporter.py`
2. `backend/tests/test_project_graph_exporter.py`

Result:

1. `ProjectGraphExporter.export()` renders a ProjectGraph into `.rpy` text keyed by `FileFrame.path`.
2. The first node renderer supports labels, comments, dialogue, menu blocks, menu choices, conditionals, jumps, calls, returns, action lines, and raw blocks.
3. Single-file `import -> resolve -> export -> import -> resolve` preserves MVP semantics for labels, nodes, comments, action/raw text, and diagnostics.
4. Export uses stable normalized indentation rather than exact original formatting.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_exporter.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 3 / Master Item 3.2 Multi-file Roundtrip

Added multi-file export roundtrip coverage for ProjectGraph files and destinations.

Files:

1. `backend/tests/test_project_graph_exporter.py`

Result:

1. Export returns one `.rpy` text per `FileFrame.path` in stable `FileFrame.order` order.
2. Labels and nodes stay in their owning source files after export.
3. Re-importing exported files preserves label names, node type counts, and resolved jump/call edge destinations.
4. Cross-file and scoped local destinations survive normalized export and re-import.
5. Tests passed: `python -m pytest backend\tests\test_project_graph_exporter.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 3 / Master Item 3.3 Raw Preservation And Metadata Exclusion

Added export coverage for raw/action/comment preservation and editor metadata exclusion.

Files:

1. `backend/tests/test_project_graph_exporter.py`

Result:

1. Export preserves comments, dialogue, scene/show/play/with action lines, Python raw blocks, ATL-like raw blocks, and unsupported while raw blocks.
2. Exported `.rpy` text does not include ProjectGraph editor metadata such as IDs, visuals, source spans, resolver edge metadata, or diagnostics codes.
3. Tests passed: `python -m pytest backend\tests\test_project_graph_exporter.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 3 / Master Item 3.4 Full Export Roundtrip Contract

Added the full Sprint 3 black-box export contract over the complete mouse RenPy corpus.

Files:

1. `backend/tests/test_project_graph_export_roundtrip_contract.py`

Result:

1. The test imports, resolves, exports, re-imports, and re-resolves all three fixture files.
2. It verifies stable file paths, label multiset, node type counts, node content, resolved edge destinations, diagnostics semantics, and metadata exclusion.
3. Diagnostic comparison ignores runtime-generated UUIDs and checks user-visible semantics instead.
4. Tests passed: `python -m pytest backend\tests\test_project_graph_export_roundtrip_contract.py backend\tests\test_project_graph_exporter.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_diagnostics.py backend\tests\test_project_graph_resolver.py backend\tests\test_project_graph_conditionals.py backend\tests\test_project_graph_actions.py backend\tests\test_project_graph_menus.py backend\tests\test_project_graph_labels.py backend\tests\test_project_graph_importer.py backend\tests\test_project_graph_ids.py backend\tests\test_mouse_renpy_fixtures.py`.
### Sprint 4 / Master Item 4.1 Static ProjectGraph Projection

Started Sprint 4 by adding an isolated ProjectGraph-to-React-Flow projection module.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`

Result:

1. `projectGraphToReactFlow()` projects `FileFrame`, `LabelFrame`, `LabelStartNode`, and `ScenarioNode` records into React Flow-compatible nodes.
2. Projection uses the new `@xyflow/react@12.10.2` API with `parentId`, `extent: "parent"`, and explicit node dimensions for frame containment.
3. This is a new React Flow 2.0 layer from scratch; the old MVP 1.0 `flowTransformer` is not used.
4. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts`.
### Sprint 4 / Master Item 4.2 New React Flow 2 Canvas Shell

Added a new React Flow 2.0 canvas layer from scratch on `@xyflow/react`, replacing the old MVP 1.0 editor surface.

Files:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
3. `frontend/src/components/EditorPage.tsx`
4. `frontend/src/main.tsx`
5. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`

Result:

1. Added dedicated React Flow 2 node components for file frames, label frames, label start nodes, and scenario nodes.
2. Added `ProjectGraphCanvas`, using `@xyflow/react` `ReactFlow`, `Background`, `MiniMap`, and `Controls`.
3. Replaced the old MVP 1.0 `EditorPage` dependency chain with a minimal ProjectGraph canvas shell.
4. Removed the old collaboration provider wrapper from app bootstrap because the old MVP 1.0 collaboration layer was removed from this frontend path.
5. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts`.
6. Build passed: `npm run build`.

### Sprint 4 / Master Item 4.3 Containment And Node-to-node Edges

Locked the React Flow containment contract for nested labels, nested scenario nodes, and relation edges.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`

Result:

1. Nested `LabelFrame`s project as child nodes through React Flow `parentId`.
2. Nested `ScenarioNode`s project as child nodes of their parent scenario node.
3. `jump` and `call` relation edges target `LabelStartNode` IDs and never target `FileFrame` or `LabelFrame` IDs.
4. `jump` edges render as faded dashed relation edges; `call` edges render as faded animated relation edges.
5. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts`.

### Sprint 4 / Master Item 4.4 Layout Sizing And Non-overlap

Added the first deterministic React Flow 2.0 layout normalizer for ProjectGraph projection.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`

Result:

1. Overlapping root `FileFrame` siblings are shifted apart horizontally.
2. Overlapping children inside the same parent frame/node are shifted apart vertically.
3. Parent `FileFrame`, `LabelFrame`, and scenario container bounds expand to fit their projected children with padding.
4. Existing non-overlapping manual positions are preserved; normalization only corrects collisions and undersized parents.
5. This is the MVP deterministic fallback before a richer flow-first layout engine.
6. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts`.

### Sprint 4 / Master Item 4.5 Search, Problems, And Full Frontend Contract

Closed Sprint 4 with a full MVP 2.0 React Flow projection contract and minimal canvas navigation tools.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
5. `frontend/package.json`
6. `frontend/package-lock.json`

Result:

1. Added text search over visible `LabelStartNode` and `ScenarioNode` content.
2. Added diagnostic projection for the canvas problems panel.
3. Added node focusing helper that resolves absolute React Flow coordinates through parent containment.
4. `ProjectGraphCanvas` now has search results and a problems panel; both can focus the related node.
5. Added one large Sprint 4 black-box frontend contract over a multi-file graph with nested labels, nested scenario nodes, relation edges, diagnostics, search, and layout invariants.
6. Removed legacy `reactflow@11` dependency; the new canvas uses only `@xyflow/react@12.10.2`.
7. Tests passed: `npm test -- --run`.
8. Build passed: `npm run build`.

### Sprint 5 / Master Item 5.1 Loro Storage Proof

Started Sprint 5 with a real Loro CRDT adapter on the frontend/client side.

Files:

1. `frontend/src/utils/projectGraphCrdt.ts`
2. `frontend/src/utils/__tests__/projectGraphCrdt.test.ts`
3. `frontend/package.json`
4. `frontend/package-lock.json`

Result:

1. Added `loro-crdt@1.12.1`.
2. `ProjectGraph` now serializes into one `LoroDoc`.
3. Loro Tree stores containment for files, labels, label starts, and scenario nodes.
4. Loro Maps store entity attributes such as IDs, content, source spans, metadata, and visual positions/sizes.
5. Edges, diagnostics, source index, and project metadata are stored in a root metadata map.
6. Binary Loro snapshot export/import restores the same semantic `ProjectGraph` with stable domain IDs.
7. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphCrdt.test.ts`.

### Sprint 5 / Master Item 5.2 CRDT Convergence

Added the first two-client convergence proof for the ProjectGraph Loro adapter.

Files:

1. `frontend/src/utils/projectGraphCrdt.ts`
2. `frontend/src/utils/__tests__/projectGraphCrdt.test.ts`

Result:

1. Two clients can start from the same binary Loro snapshot.
2. Client A can edit a scenario node's content.
3. Client B can move a label frame and update scenario node metadata.
4. Both clients export binary Loro updates from their prior version vectors.
5. After update exchange/import, both clients converge to the same `ProjectGraph`.
6. Positions, content, metadata, and nested containment survive convergence.
7. Tests passed: `npm test -- --run`.
8. Build passed: `npm run build`.

### Sprint 5 / Master Item 5.3 Edge Cases And Complex CRDT Contract

Extended Sprint 5 with stricter CRDT edge and complex collaboration tests.

Files:

1. `frontend/src/utils/projectGraphCrdt.ts`
2. `frontend/src/utils/__tests__/projectGraphCrdt.test.ts`

Result:

1. Added `reparentScenarioNode()` for containment changes backed by Loro Tree `move`.
2. Reparenting a scenario node preserves all ProjectGraph domain IDs.
3. Reparenting updates scenario `file_id`, `label_id`, and `parent_node_id` after the Loro Tree move succeeds.
4. Scenario descendants inherit the new file/label scope when their parent scenario is moved.
5. Native Loro Tree cycle protection is covered: invalid ancestor-to-descendant reparent throws and leaves the graph unchanged.
6. Duplicate binary update imports are idempotent and do not duplicate files, labels, label starts, or scenario nodes.
7. Added a larger three-client convergence test covering content edit, file position edit, metadata edit, and containment reparent in one session.
8. Tests passed: `npm test -- --run` with 13 frontend tests.
9. Build passed: `npm run build`.

### Sprint 6 / Master Item 6.1 Binary Relay

Started Sprint 6 by adding the backend binary CRDT relay path for project rooms.

Files:

1. `backend/app/services/websocket.py`
2. `backend/app/api/routes/websocket.py`
3. `backend/tests/test_websocket.py`

Result:

1. Project WebSocket rooms can now relay opaque binary CRDT updates with `send_bytes`.
2. The sender is excluded from its own binary relay, while other participants in the same project room receive the bytes unchanged.
3. Participants in other project rooms do not receive the update.
4. Presence and log-style messages stay on the existing JSON text channel.
5. The project WebSocket route now uses mixed-frame receive handling so binary frames are not parsed as JSON.
6. Tests passed: `python -m pytest backend\tests\test_websocket.py -q`.

### Sprint 6 / Master Item 6.2 Snapshot Persistence

Added backend persistence for opaque ProjectGraph CRDT snapshots.

Files:

1. `backend/database/schema.sql`
2. `backend/app/services/database.py`
3. `backend/tests/test_project_graph_crdt_persistence.py`

Result:

1. Added `project_crdt_snapshots` table keyed by `project_id`.
2. Added `save_project_crdt_snapshot()` and `get_project_crdt_snapshot()` to `DatabaseService`.
3. Snapshot storage treats Loro/CRDT state as opaque binary data and does not interpret graph semantics on the server hot path.
4. Saving a later snapshot overwrites the latest project snapshot.
5. Database initialization now migrates existing SQLite databases that already had old MVP 1.0 tables but were missing the CRDT snapshot table.
6. Tests passed: `python -m pytest backend\tests\test_project_graph_crdt_persistence.py backend\tests\test_websocket.py backend\tests\test_database_service.py -q`.

### Sprint 7 / Master Item 7.1 Read-only Canvas 2.0

Started Sprint 7 by connecting the editor entrypoint to persisted ProjectGraph CRDT snapshots instead of the old demo graph.

Files:

1. `backend/app/api/routes/projects.py`
2. `backend/tests/test_project_graph_snapshot_route.py`
3. `frontend/src/services/api.ts`
4. `frontend/src/services/__tests__/api.test.ts`
5. `frontend/src/components/EditorPage.tsx`
6. `frontend/src/utils/projectGraphCrdt.ts`
7. `frontend/vite.config.ts`

Result:

1. Added authenticated `GET /api/projects/{project_id}/graph-snapshot` returning the latest opaque CRDT snapshot as `application/octet-stream`.
2. The route checks project access and returns `404` when the project is inaccessible or no ProjectGraph snapshot exists.
3. The frontend API loads the binary snapshot as `arraybuffer`, imports it into `LoroDoc`, and converts it back into `ProjectGraphSnapshot`.
4. `EditorPage` now reads the project ID from `?project=...`, loads the snapshot, and renders `ProjectGraphCanvas` from real ProjectGraph data.
5. Removed the read-only canvas dependency on the hardcoded demo graph.
6. Switched the frontend Loro adapter import to `loro-crdt/base64` and set Vite build target to `esnext` so the production build can bundle Loro's WASM/top-level-await path for MVP 7.1.
7. Known follow-up: the base64 Loro bundle increases the production JS chunk size. Later optimization should use explicit WASM handling and/or code splitting.
8. Tests passed: `python -m pytest backend\tests\test_project_graph_snapshot_route.py backend\tests\test_project_graph_crdt_persistence.py backend\tests\test_project_graph_sprint_1_2_blackbox.py backend\tests\test_project_graph_export_roundtrip_contract.py backend\tests\test_websocket.py -q`.
9. Tests passed: `npm test -- --run`.
10. Build passed: `npm run build`.

### Sprint 8 / MVP Actions 8.1-8.4 Product Import And Open Pipeline

Started Sprint 8 by wiring the product import path from uploaded `.rpy` files to a persisted ProjectGraph 2.0 canvas snapshot.

Files:

1. `backend/app/api/routes/projects.py`
2. `backend/app/services/project_graph/crdt_bridge.py`
3. `backend/tests/test_project_graph_import_route.py`
4. `frontend/scripts/project-graph-snapshot-cli.mjs`
5. `frontend/src/services/api.ts`
6. `frontend/src/services/__tests__/api.test.ts`
7. `frontend/src/components/EditorPage.tsx`
8. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
9. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
10. `docs/editor-2.0-architecture.md`

Result:

1. Added authenticated `POST /api/projects/{project_id}/graph-import` accepting multiple `.rpy` files as multipart form data.
2. The import route runs ProjectGraph importer, resolver, diagnostics, creates a real binary Loro snapshot, persists it, and returns counts plus diagnostics summary.
3. Because backend Python does not have native Loro installed, the initial snapshot is created by a checked-in Node/Loro bridge that uses the same CRDT container schema as the frontend adapter.
4. `GET /graph-snapshot` after import returns bytes that decode back into the imported ProjectGraph with stable entity IDs.
5. Frontend API now posts multi-file ProjectGraph import requests.
6. `EditorPage` can import `.rpy` files when a project has no snapshot yet, then reload the canvas from the saved CRDT snapshot.
7. Non-blocking import diagnostics are preserved in the snapshot and projected into focusable Problems.
8. Import-export-reimport contract now compares labels, node type counts, relation edges, diagnostics, comments, raw blocks, and action content across the full mouse RenPy corpus.
9. Tests passed: `python -m pytest backend/tests/test_project_graph_import_route.py -q`.
10. Tests passed: `npm test -- --run src/services/__tests__/api.test.ts`.
11. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts`.

## 2026-04-30

### Branch And Initial Architecture

Created branch `codex/editor-2-architecture` and added the first version of `docs/editor-2.0-architecture.md`.

### Repo Findings

1. Current collaboration is not CRDT-based. It uses JSON WebSocket presence/lock-style behavior.
2. Current React Flow graph is a projection from parser output, not a durable project graph.
3. Current backend parser produces unstable IDs in some paths through object identity/address-like behavior.
4. Current architecture is close to `one file = one graph`; MVP 2.0 must become `one project = one canvas`.
5. Existing MVP 1.0 code is useful as context, but it is not the target architecture.
