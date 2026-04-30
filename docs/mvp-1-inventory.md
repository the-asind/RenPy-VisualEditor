# MVP 1.0 Inventory For MVP 2.0

Дата: 2026-05-01

Статус: Sprint 0 / Master Item 0.2.

Цель: перед удалением старой базы классифицировать текущие файлы как `keep`, `adapt`, `replace` или `delete`.

## Правило Чтения

Эта таблица не говорит, что все `replace` нужно удалить немедленно. Она говорит, что текущая реализация не должна определять архитектуру MVP 2.0.

Удалять можно только:

1. Файлы с классификацией `delete`.
2. Файлы `replace` после появления новой реализации и прохождения тестов.
3. Локальные ignored artefacts после разрешения на удаление в среде.

## Summary

| Area | Classification | Decision |
| --- | --- | --- |
| Root docs | keep | `AGENTS.md`, `UPDATES.md`, architecture doc are source of truth. |
| Runtime config / Docker | adapt | Useful local/dev deployment shell, but must add project graph/CRDT persistence later. |
| Auth and project permissions | adapt | Useful foundation for users/projects; not central to graph MVP, but should be preserved. |
| Script text storage | replace | Current `scripts.content` line-range source of truth conflicts with ProjectGraph/CRDT model. |
| Parser | replace | Useful lessons/tests only; current ChoiceNode tree is too narrow for MVP 2.0. |
| Parser tests | replace | Existing tests show regressions to preserve, but new mouse RenPy fixtures and black-box ProjectGraph tests are needed. |
| WebSocket collaboration | replace | Current JSON lock/presence model is not binary CRDT relay. Presence concepts can be adapted. |
| React Flow transformer | replace | Current tab/LabelBlock tree projection conflicts with one full project canvas. |
| Editor page | adapt/replace | Shell, auth/project loading, search/minimap ideas are useful; live graph logic must be replaced. |
| Node editor popup | adapt | Useful editing UI shell; must write domain/CRDT operations instead of line ranges. |
| Branch insertion tools | replace | Current line insertion conflicts with ProjectGraph source of truth. Concepts may reappear as graph operations. |
| Tests for auth/project/db | adapt | Keep while auth/project service exists; refactor brittle debug parts. |
| Local ignored notes/cache | delete | Not tracked; should be physically removed when deletion is allowed. |

## Backend Inventory

### `backend/app/services/parser/renpy_parser.py`

Classification: `replace`.

Why:

1. Parses only `label`, `if`, `elif`, `else`, and `menu` at a narrow level.
2. Does not model `LabelStartNode`.
3. Does not model local/nested labels as frames.
4. Does not parse menu prompt text.
5. Does not parse `jump`, `call`, `return` as relation-relevant nodes.
6. Treats action ranges as line spans, not ProjectGraph nodes.
7. Uses old `ChoiceNodeType` vocabulary that does not match MVP 2.0.

Reusable ideas:

1. Basic indentation scanning.
2. Some regression scenarios around comments before `else`.
3. The principle that unknown lines must not crash the parser.

MVP 2.0 path:

1. Create new ProjectGraph parser module behind tests.
2. Keep old parser only until replacement tests pass.
3. Delete old parser after Editor 2.0 no longer imports it.

### `backend/app/api/routes/scripts.py`

Classification: `replace`.

Why:

1. `/scripts/parse` operates on one uploaded file and returns old tree shape.
2. `node_to_dict` uses `str(id(node))`, which is forbidden for stable collaboration IDs.
3. Node editing is line-range based.
4. Insert-node API mutates raw text and reparses a single script.
5. Structure updates are broadcast as JSON trees.

Reusable ideas:

1. Auth/access validation pattern.
2. File upload validation.
3. Script listing/search endpoints as temporary references.

MVP 2.0 path:

1. Replace with project import/export endpoints.
2. Add ProjectGraph snapshot load/save endpoints.
3. Keep old endpoints only as migration compatibility until new UI path exists.

### `backend/app/api/routes/projects.py`

Classification: `adapt`.

Why:

1. Project/user permission model is useful.
2. Current project details already returns associated scripts.
3. The shape can evolve to return project graph records and source file records.

Problems:

1. Verbose logging/debug style should be cleaned later.
2. Project script creation currently stores raw script text only.

MVP 2.0 path:

1. Preserve project auth/access behavior.
2. Add project graph metadata and source files to project details.
3. Avoid mixing old `scripts` model with new ProjectGraph source of truth.

### `backend/app/services/database.py` and `backend/database/schema.sql`

Classification: `adapt`.

Why:

1. Existing SQLite service and schema are usable for local MVP persistence.
2. User/project/access/script/version tables are useful history.
3. Service must change to store ProjectGraph snapshots and optionally Loro update logs.

Problems:

1. Current `scripts.content` is not enough for CRDT source of truth.
2. `sessions`, `participants`, and `node_locks` support old lock-based collaboration.
3. There is no graph snapshot table or CRDT update log table.

MVP 2.0 path:

1. Add graph snapshot storage.
2. Add source file records/import provenance.
3. Add update log only if Loro adapter makes it cheap.
4. Mark old node lock/session tables as legacy once binary CRDT relay is live.

### `backend/app/services/websocket.py` and `backend/app/api/routes/websocket.py`

Classification: `replace` for collaboration transport, `adapt` for presence concepts.

Why:

1. Current manager broadcasts JSON messages.
2. Collaboration is lock/presence based, not CRDT convergence based.
3. Routes read text messages only, not binary CRDT updates.
4. Rooms are split by project/script, while MVP 2.0 needs one project room for one project graph.

Reusable ideas:

1. Project room routing.
2. Active user presence list.
3. Auth/access checks before accepting a socket.

MVP 2.0 path:

1. Add binary receive/send path for project graph updates.
2. Keep presence/log messages separate from CRDT channel.
3. Remove node locks as collaboration primitive after CRDT path is verified.

### `backend/app/api/routes/auth.py`, `backend/app/services/auth.py`, `backend/app/models/exceptions.py`

Classification: `adapt`.

Why:

1. Auth is useful foundation.
2. Not central to ProjectGraph work.
3. Should remain while graph endpoints reuse project permissions.

MVP 2.0 path:

1. Preserve behavior unless tests expose blocking issues.
2. Use existing current-user dependency for graph import/export/snapshot endpoints.

## Frontend Inventory

### `frontend/src/components/EditorPage.tsx`

Classification: `adapt/replace`.

Keep/adapt:

1. Project loading shell.
2. Existing script selection context as evidence that multi-file project UX existed.
3. React Flow container, minimap, zoom controls, search dialog concept.
4. Node editor popup integration shell.

Replace:

1. One active `scriptId` as editor source.
2. Label tabs as primary graph navigation.
3. `parsedData` old tree model.
4. Line-range node editing.
5. `structureUpdate` JSON tree handling.
6. Old flow transformation path.

MVP 2.0 path:

1. Split page into a project graph loader and canvas module.
2. Replace `scriptId` live state with `projectGraphId` / one project graph state.
3. Render file/label frames and `LabelStartNode` through new projection adapter.
4. Keep search/minimap ideas and rewire them to ProjectGraph.

### `frontend/src/utils/flowTransformer.ts`

Classification: `replace`.

Why:

1. Works from old parser tree, not ProjectGraph.
2. Has `LabelBlock` tabs and generated `EndBlock` per label.
3. Does not support file frames, label frames, nested label frames, or node-to-node jump/call edges to `LabelStartNode`.
4. Layout is local tree layout, not one project canvas flow-first layout.

Reusable ideas:

1. Existing tests show useful expectations around branch visual layout.
2. Some display metadata helper integration may survive.

MVP 2.0 path:

1. Create `projectGraphToFlow` adapter.
2. Add layout invariant tests before implementation.
3. Delete old transformer when Editor 2.0 no longer imports it.

### `frontend/src/contexts/CollabContext.tsx`

Classification: `replace` for transport, `adapt` for presence UI state.

Why:

1. Uses JSON WebSocket messages.
2. Has lock-oriented editing methods.
3. Does not support binary CRDT updates or Loro integration.

Reusable ideas:

1. Project connection lifecycle.
2. Active users state.
3. Runtime config URL resolution.

MVP 2.0 path:

1. Split presence context from CRDT sync context.
2. Add binary WebSocket update handling.
3. Remove lock-based edit control from core collaboration path.

### `frontend/src/components/nodes/*`, `frontend/src/components/edges/*`, `frontend/src/components/NodeEditorPopup.tsx`

Classification: `adapt`.

Why:

1. Visual node components and editor popup can be reused as UI shell.
2. They must receive MVP 2.0 node data instead of old `ParsedNodeData` and line ranges.

MVP 2.0 path:

1. Introduce new node props around `ScenarioNode` and `LabelStartNode`.
2. Add frame components for `FileFrame` and `LabelFrame`.
3. Rewire save to domain operation/CRDT mutation.

### `frontend/src/components/branching/*` and `frontend/src/utils/branching.ts`

Classification: `replace`.

Why:

1. Current feature inserts text snippets into source lines.
2. MVP 2.0 source of truth is ProjectGraph/CRDT.

Reusable ideas:

1. Dialog UX for creating menu/if branches.
2. Text labels and validation expectations.

MVP 2.0 path:

1. Rebuild branch creation as graph/domain operations.
2. Render/export into `.rpy` later through ProjectGraph exporter.

### `frontend/src/services/api.ts`, `frontend/src/services/projectService.ts`, `frontend/src/hooks/useProjects.ts`

Classification: `adapt`.

Why:

1. API client, auth headers, runtime config and project service are useful.
2. Script endpoints need replacement with project graph endpoints.

MVP 2.0 path:

1. Add graph import/load/save/export service functions.
2. Keep project service for project list/details.
3. Remove old script line-range calls when new Editor 2.0 path is complete.

### Landing/layout/theme/i18n files

Classification: `keep/adapt`.

Files:

1. `frontend/src/pages/*`
2. `frontend/src/components/layout/*`
3. `frontend/src/components/landing/*`
4. `frontend/src/themes/*`
5. `frontend/src/locales/*`
6. `frontend/src/i18n.ts`
7. `frontend/src/App.tsx`, routes, main entry.

Why:

1. They are not the core graph problem.
2. Keep unless they block Editor 2.0 UI integration.

## Tests Inventory

### Backend parser test file

File: `backend/app/services/parser/test_renpy_parser.py`

Classification: `replace`.

Why:

1. Uses old `ChoiceNode`/`ChoiceNodeType` assertions.
2. Does not cover ProjectGraph, LabelStartNode, local/nested labels, menu prompt text, jump/call relations, raw/action preservation.

Reusable regression ideas:

1. Basic label/menu/if detection.
2. Comment before `else` should not break parsing.
3. Action-only label should not create extra nodes.

MVP 2.0 path:

1. Move coverage to new mouse RenPy fixture corpus.
2. Write black-box tests against ProjectGraph output.
3. Keep this file only until new parser tests cover equivalent regressions.

### Backend database/auth/project tests

Files:

1. `backend/tests/test_auth_service.py`
2. `backend/tests/test_database.py`
3. `backend/tests/test_database_service.py`
4. `backend/tests/test_project_management.py`
5. `backend/tests/conftest.py`

Classification: `adapt`.

Why:

1. Auth/project/database foundation remains useful.
2. Tests are noisy and sometimes debug-heavy, but protect existing project access behavior.

MVP 2.0 path:

1. Keep while graph endpoints reuse auth/project access.
2. Refactor fixtures when adding graph snapshot tests.
3. Remove debug-only prints and brittle monkeypatching later.

### Backend websocket tests

File: `backend/tests/test_websocket.py`

Classification: `replace`.

Why:

1. Tests lock/JSON protocol.
2. MVP 2.0 needs binary CRDT relay tests.

Reusable ideas:

1. Mock websocket style.
2. Active users behavior.
3. Room broadcast expectations.

MVP 2.0 path:

1. Add binary relay tests first in Sprint 6.
2. Preserve or rewrite presence tests separately.
3. Delete lock protocol tests after lock protocol is removed.

### Frontend tests

Files:

1. `frontend/src/services/__tests__/api.test.ts`
2. `frontend/src/utils/__tests__/branching.test.ts`

Classification: `replace/adapt`.

Why:

1. API tests should be adapted to graph endpoints.
2. Branching snippet tests should be replaced by graph operation tests.

Reusable ideas:

1. Test harness with Vitest.
2. Branch dialog expected output can inform export tests, not live editing.

## Config And Dependencies

### `backend/requirements.txt`

Classification: `adapt`.

Current gap:

1. No Loro Python package yet.
2. No explicit PostgreSQL client yet.

MVP 2.0 path:

1. Add Loro dependency when Sprint 5 starts.
2. Add PostgreSQL driver only when persistence target moves beyond SQLite/local MVP.

### `frontend/package.json`

Classification: `adapt`.

Current gap:

1. No Loro WASM package yet.
2. React Flow is v11 package `reactflow`; official docs now brand as React Flow/XyFlow. Before implementation, verify package/API best practice.
3. `socket.io-client` exists but current frontend uses native WebSocket; likely unused for MVP 2.0.

MVP 2.0 path:

1. Add Loro WASM when Sprint 5/editor integration starts.
2. Re-check official React Flow package guidance before projection implementation.
3. Remove unused socket.io-client only after dependency audit.

### Root `package.json`

Classification: `adapt/delete candidate`.

Why:

1. Currently only contains `shadcn` dev dependency.
2. It may be useful if UI scaffolding is intentionally used, but it is not part of core MVP 2.0.

MVP 2.0 path:

1. Check whether root package is actually used.
2. Delete root Node package files only if no workflow depends on them.

## Local Ignored Artefacts

Classification: `delete` when environment permits.

Items seen locally:

1. `.notes/`
2. `reactflow-DOCS/`
3. `.pytest_cache/`
4. `backend/.pytest_cache/`
5. `backend/app/services/.pytest_cache/`
6. `debug_temp_*.db`
7. `.env` remains local config; do not delete unless explicitly requested.
8. `node_modules/`, `frontend/node_modules/`, and `venv/` are dependencies/environments, not project source.

Physical deletion of ignored folders was blocked by current sandbox policy during the previous documentation step. They should be removed outside this restricted operation or through an approved cleanup action.

## Immediate Sprint 1 Readiness

Before Sprint 1 implementation, we still need Master Item 0.3: parser coverage matrix from official Ren'Py parser/docs.

Known Sprint 1 starting point after that:

1. Create mouse RenPy fixture corpus.
2. Write ProjectGraph parser tests.
3. Implement new parser alongside old parser.
4. Keep old EditorPage/flow path untouched until new ProjectGraph path is testable.

## Open Question For Human Decision

No blocking product question is required to close this inventory.

The next human decision will be needed before physical deletion of local ignored folders or before deleting any tracked `replace` files prior to their MVP 2.0 replacement landing.