# Updates

This file is the short project memory for RenPy Visual Editor 2.0. Keep it current when closing master items, changing decisions, or classifying old code.

## 2026-05-08

### Simple Label Column Centering

Fixed a canvas readability regression where small/simple labels without branch nodes could place `LabelStartNode` left of the first story block, producing an unnecessary crooked step edge between `START` and the next node.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `docs/editor-2.0-architecture.md`
4. `docs/canvas-layout-usability-audit.md`

Result:

1. Simple labels now compact as centered vertical columns when the start node and first visible scenario block are misaligned.
2. Label-frame fallback compaction centers siblings by column width instead of left-aligning nodes with different widths.
3. Forward sequence edges use `straight` routing when source and target are already vertically aligned in the same parent.
4. Branch and rejoin edges still use the existing `nearTargetStep` routing.
5. Old saved simple labels with `_manual_position` scenario offsets are also normalized into a readable vertical story column instead of preserving stale crooked X offsets.

Checks:

1. Added projection regression coverage for `LabelStartNode` and first scenario center alignment.
2. Added projection regression coverage for a direct `straight` `LabelStartNode -> first scenario` sequence edge.
3. Added projection regression coverage proving old manual offsets do not break a simple label column.
4. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 17 tests.
5. `npm test -- --run` passed with 43 frontend tests.
6. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Body Click Selection With Header-Only Drag

Fixed a canvas interaction mismatch where nodes and frames could be dragged only from their header, which is correct, but single-click selection/opening also worked only from the header.

Files:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `docs/editor-2.0-architecture.md`
4. `docs/canvas-layout-usability-audit.md`

Result:

1. Body/content zones keep `pointer-events: none`, so LMB drag over a node body still pans the canvas.
2. Pane click handling now hit-tests the click point against projected node bounds and selects the deepest visible node under the cursor.
3. Header drag remains the only object-drag entry point.
4. Single click on a node body now selects/opens the same node as single click on its header.

Checks:

1. Added projection hit-test coverage for scenario body, label start body, label frame body, file frame body, and outside-canvas clicks.
2. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 16 tests.
3. `npm test -- --run` passed with 42 frontend tests.
4. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Live Parent Frame Expansion During Header Drag

Fixed a canvas drag usability gap where nested nodes and nested `LabelFrame`s could be dragged toward a parent frame edge without the parent frame expanding in real time.

Follow-up correction: live expansion must be reversible while dragging. Parent preview size is derived from current child bounds plus padding on every drag tick, not accumulated from the previous preview size. This prevents the frame wall from running away together with the held node and prevents stale oversized frames after moving the node back inward.

Second follow-up correction: the whole drag preview is now derived from the pointer-down baseline plus the current pointer delta. It is not derived from the previous interactive preview state. This closes the real sequence bug where dragging to a wall and then returning inward could leave rebased ancestors and oversized frames from earlier drag ticks.

Files:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/components/EditorPage.tsx`
3. `frontend/src/utils/projectGraphCrdt.ts`
4. `frontend/src/utils/projectGraphCollaboration.ts`
5. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
6. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`
7. `docs/editor-2.0-architecture.md`
8. `docs/canvas-layout-usability-audit.md`

Result:

1. Header-only drag now expands ancestor `FileFrame`/`LabelFrame` bounds while the pointer moves, matching the expected React Flow parent-child `expandParent` behavior in the custom drag layer.
2. Dragging right/down increases parent width/height.
3. Dragging left/up rebases the parent frame position and shifts its direct children by the opposite local offset, so existing siblings keep their absolute canvas location while the wall moves.
4. Pointer-up persists all changed positions as one grouped CRDT operation.
5. Only directly dragged nodes/frames are marked manual. Siblings moved by coordinate rebase keep their positions without receiving scenario `_manual_position`, so branch-managed layout is not accidentally disabled.
6. Parent frame preview bounds now shrink back when the dragged child moves back inward, while the dragged child keeps the pointer-controlled position and does not receive extra expansion drift.
7. Sequential drag ticks now use a stable baseline model: left-edge push, right-edge push, and return-to-origin all recompute from the original drag-start graph plus current delta.

Checks:

1. Added projection tests for right/bottom expansion and left/top rebase with stable absolute sibling positions.
2. Added collaboration test for grouped position persistence without marking every rebased scenario as manual.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts src/utils/__tests__/projectGraphCollaboration.test.ts` passed with 26 tests before the follow-up correction.
4. `npm test -- --run` passed with 41 frontend tests after the second follow-up correction.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.
6. Added regression coverage for stale expanded frame bounds shrinking back from current children without moving the dragged node away from its pointer-controlled position.
7. Added sequential drag-preview regression coverage proving that a held child remains under the pointer when pushing left/right walls and that the parent frame restores stable bounds when the pointer returns inward.

### Small Label Frame Header Padding

Fixed a canvas readability regression where small/simple `LabelFrame` nodes placed their `LabelStartNode` inside the frame header zone, visually overlapping the `LABEL` title and the label name.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `docs/editor-2.0-architecture.md`
4. `docs/canvas-layout-usability-audit.md`
5. `artifacts/small-label-frame-header-padding.png`

Result:

1. Added reserved top padding for all children inside `LabelFrame`.
2. Non-branch labels now get the same readable separation between the `LabelFrame` header and the first `LabelStartNode` that branch-managed labels already had.
3. The projection regression test now asserts that `LabelStartNode.position.y` is below the frame header/content boundary.
4. Browser smoke focused the small `ask_duck` label in project `1546d43e-481b-488c-84d1-5cbc7c3c838d` and confirmed the label title no longer overlaps the start node.

Checks:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
2. `npm test -- --run` passed with 36 frontend tests.
3. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

## 2026-05-07

### Nested Local Label Lane Separation

Fixed a browser-visible layout regression where a nested local label frame could remain beside the active parent label branch tree and route its own internal lines through the parent story flow.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `docs/editor-2.0-architecture.md`
4. `docs/canvas-layout-usability-audit.md`
5. `artifacts/nested-local-label-lane-separation.png`

Result:

1. `normalizeLayout` now applies branch-managed layout before honoring `_manual_position` group skips.
2. Manual scenario offsets no longer prevent nested `LabelFrame` siblings from being moved below the branch-managed story-flow area.
3. Regression coverage now checks that a nested local label stays below the parent story flow even when a branch child has `_manual_position`.
4. Browser smoke reloaded project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, focused `start.crumb_trail`, and confirmed the local label frame is separated from the parent branch tree.

Checks:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
2. `npm test -- --run` passed with 36 frontend tests.
3. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Canvas Body Pan, Relation Visibility, And Branch Drag Stabilization

Files:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
3. `frontend/src/utils/projectGraphProjection.ts`
4. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
5. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`
6. `docs/editor-2.0-architecture.md`

Result:

1. Node/frame body zones now behave like canvas surface for LMB pan; only `.pg-node__drag-handle` starts object drag.
2. React Flow native node drag was replaced for this canvas path with a header-only pointer handler, because draggable root nodes keep React Flow `nopan` behavior on their wrapper.
3. `jump/call` relation edges are more visible: denser dashed stroke, higher opacity, larger stroke width, larger interaction width, and higher z-index.
4. Attached `else/elif` headers and their branch content now receive shared `dragGroupIds`, so dragging a child block under `else` moves the `else` header with it in the interactive canvas.
5. `_manual_position` on a scenario node no longer disables branch auto-layout for the whole label. This prevents one moved node from collapsing an `if/else/menu` tree into fallback compaction.
6. Projection tests now cover attached branch drag groups and the invariant that branch-managed labels keep tree layout even when a child scenario has `_manual_position`.
7. Browser smoke loaded the multi-file project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` with 91 React Flow nodes. Screenshot capture was flaky in the in-app browser after reload, so final visual confirmation is partial.
8. Tests passed: `npm test -- --run`.
9. Build passed: `npm run build`.

Known follow-up:

1. Branch-managed scenario drag is now stabilized against full-tree collapse, but deeper manual layout semantics still need a dedicated design pass before arbitrary scenario offsets can be considered durable collaboration state.
2. The in-app browser screenshot path timed out during the final reload; repeat visual smoke manually or when browser automation is stable.

### Conditional Visual Tree Detachment And LTR Branch Pass

Continued the browser-driven layout correction after the user clarified that `if/else` must not be visual nested containers and that the current target is a left-to-right branch graph.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `docs/editor-2.0-architecture.md`
4. `docs/canvas-layout-usability-audit.md`
5. `artifacts/nested-if-left-to-right-branches-smoke.png`

Result:

1. Conditional descendants keep their domain `parent_node_id` for CRDT/export, but React Flow projects them as sibling nodes inside the owning `LabelFrame`.
2. `if/elif/else` cards no longer become oversized visual containers.
3. Derived `sequence` and `branch` edges are built from the domain tree, not from React Flow visual parentage.
4. Conditional-heavy labels now lay out left-to-right: linear flow moves right, branch lanes split right/down, and branch terminals rejoin into the next linear block on the right.
5. `else/elif` lanes start near the conditional branch split instead of waiting below the entire true subtree.
6. LTR layout is shifted down when tall action nodes would otherwise create negative local coordinates and trigger fallback vertical compaction.

Checks:

1. Added failing projection expectations first for conditional visual detachment, left-to-right branch lanes, derived branch/sequence edges, and rejoin position.
2. Browser smoke re-imported `renpy_mouse_nested_if_blocks.rpy` into project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, then used search-focus to inspect `if cheese_compass_ready` and the post-branch action.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 10 tests.
4. `npm test -- --run` passed with 35 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Conditional Edge Spacing And Rejoin Line Pass

Continued the same browser-driven branch layout work after screenshots showed that line routing and indentation still read as random wiring.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
4. `artifacts/nested-if-edge-spacing-pass.png`

Result:

1. Derived flow edges now use React Flow `step` routing instead of `smoothstep`, so branch/sequence lines are orthogonal and easier to follow.
2. Branch lanes now reserve vertical space based on the actual branch subtree bottom, not only the branch header height.
3. Column and row gaps were increased for conditional-heavy labels so nested branch cards do not visually crowd each other.
4. Rejoin edges are marked with `data.flowRole = "rejoin"` and rendered as a weaker gray layer, separate from forward sequence and orange branch lines.
5. Projection tests now assert edge roles, edge type, rejoin styling, and branch spacing around nested conditional subtrees.

Checks:

1. Added failing projection expectations first for `step` derived edges, rejoin role/style, and true-subtree spacing before the `else` lane.
2. Browser smoke checked `if crumb_count > 3` and the post-branch action on project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 10 tests.
4. `npm test -- --run` passed with 35 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Near-target Rejoin Routing Pass

Continued the rejoin-line cleanup after the user clarified that lines should not turn in the middle of the path. Multiple lines converging into one target should share a stable target-side turn lane.

Files:

1. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
2. `frontend/src/utils/projectGraphProjection.ts`
3. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
4. `docs/editor-2.0-architecture.md`
5. `docs/canvas-layout-usability-audit.md`
6. `artifacts/nested-if-near-target-rejoin-routing.png`

Result:

1. Added a custom React Flow edge type `nearTargetStep`.
2. Rejoin edges now use `nearTargetStep`, while normal forward and branch edges keep built-in `step` routing.
3. `nearTargetStep` computes the turn lane as `targetX - targetTurnOffset` for left-to-right flow, so separate incoming rejoin lines to the same target turn at the same x coordinate.
4. Projection marks rejoin edges with `data.targetTurnOffset = 72`.
5. Added a pure path test proving two different sources to the same target share the same target-side turn lane.

Checks:

1. Added failing projection/path expectations first for `nearTargetStep` and shared target-side turn lane.
2. Browser smoke logged into the local project, re-imported `renpy_mouse_nested_if_blocks.rpy`, focused `After the maze`, and saved `artifacts/nested-if-near-target-rejoin-routing.png`.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
4. `npm test -- --run` passed with 36 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Top-down Conditional Narrative Layout Pass

Changed the conditional-heavy ProjectGraph projection from left-to-right narrative flow to top-down narrative flow after the user pointed out that LTR wastes horizontal screen space.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `docs/editor-2.0-architecture.md`
5. `docs/canvas-layout-usability-audit.md`
6. `artifacts/nested-if-top-down-branch-layout.png`

Result:

1. Conditional-heavy labels now place `LabelStartNode`, action blocks, and `if` blocks on a vertical center axis.
2. The first scenario block is connected from the `LabelStartNode` through top/bottom handles.
3. `if` true content is placed to the right of the `if` center; `else/elif` branch heads are placed to the left.
4. Nested `if/else` keeps the same local rule relative to its own `if` center.
5. Rejoin custom edges now support vertical near-target routing, using a shared turn lane above the target node.
6. Start nodes in conditional-heavy labels are moved down to a safer top padding so they do not overlap label titles.

Checks:

1. Added failing projection expectations first for top-down ordering, start-to-first edge handles, true-right/else-left placement, and vertical near-target path generation.
2. Browser smoke reloaded project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` and verified `nested_if_maze` visually.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
4. `npm test -- --run` passed with 36 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Else/Elif Branch Header Pass

Adjusted visual semantics for `else/elif` after the user noted that a full standalone `ELSE` card feels too heavy, even though the domain node remains necessary.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
5. `docs/editor-2.0-architecture.md`
6. `docs/canvas-layout-usability-audit.md`
7. `artifacts/nested-if-else-branch-headers.png`

Result:

1. `else/elif` still exist as ProjectGraph scenario nodes for stable IDs, CRDT state, editing, and export.
2. React Flow projection marks `else/elif` with `data.visualRole = "branchHeader"`.
3. Branch headers use compact visual height and CSS that shows only the branch label.
4. The first child block under `else/elif` is placed close to the header, making it read like a header attached to the branch content.
5. All local flow and relation target handles now enter through top `flow-in`; `jump/call` may still start from a side relation handle, but their target entry is top-only.

Checks:

1. Added projection expectations that `else/elif` heights are compact, marked `branchHeader`, and sit close to their first child.
2. Added relation edge expectations that `jump/call` target entries use `flow-in`.
3. Browser smoke focused `if backup_duck_ready` and saved `artifacts/nested-if-else-branch-headers.png`.
4. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
5. `npm test -- --run` passed with 36 frontend tests.
6. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Attached Else Headers And Target-Side Branch Routing Pass

Continued the same browser-driven canvas correction after screenshots showed three concrete defects: lines still crossed near other nodes, `ELSE` headers still felt separated from their content, and `jump` relation edges did not clearly point to the target label start.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
5. `docs/editor-2.0-architecture.md`
6. `docs/canvas-layout-usability-audit.md`
7. `artifacts/nested-if-attached-else-routing-after-css.png`
8. `artifacts/nested-if-jump-target-frame-after-css.png`

Result:

1. Branch headers now attach directly to the first branch content node: no visual gap, matched width, and no derived `else -> child` arrow.
2. Branch edges now use the same custom `nearTargetStep` router as rejoin edges, so branch lines turn close to the target instead of in the middle of the path.
3. The shared target-side turn offset was reduced from `72` to `24`, making branch/rejoin convergence happen closer to the target edge.
4. `jump/call` relation edges remain secondary hints, but are now visible enough to follow across label frames: arrow marker, wider interaction lane, higher z-index, and stronger dashed stroke.
5. Domain containment and export semantics did not change: `else/elif` remain `ScenarioNode` entries, and `jump/call` still target `LabelStartNode`.

Checks:

1. Added failing projection expectations first for attached branch header width/position, removed `else -> child` edge, branch `nearTargetStep` routing, tighter target turn offset, and visible jump/call relation style.
2. Browser smoke reloaded project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`, focused `backup_duck_ready`, then focused `jump nested_if_exit`.
3. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
4. `npm test -- --run` passed with 36 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Menu Branch Tree And Drag Header Pass

Continued the canvas usability pass after the user asked to make `menu` blocks follow the same branch-tree visual language as `if/else` and to restrict drag operations to explicit node/frame headers.

Official docs checked:

1. React Flow drag handle docs: `https://reactflow.dev/examples/nodes/drag-handle`
2. React Flow handles/custom nodes guidance already referenced in the previous projection passes.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/projectGraphCrdt.ts`
3. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
5. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
6. `docs/editor-2.0-architecture.md`
7. `docs/canvas-layout-usability-audit.md`
8. `artifacts/menu-branch-layout-and-node-headers.png`
9. `artifacts/menu-drag-handle-smoke.png`

Result:

1. `menu_prompt` is no longer projected as a separate visible canvas node; it is displayed inside the owning `menu` node.
2. `menu_choice` nodes are projected as branch lanes inside the owning `LabelFrame`, not as nested React Flow children inside `menu`.
3. `menu -> menu_choice` edges use the same near-target branch routing as conditional alternatives.
4. Statements inside a `menu_choice`, such as `jump`, render as normal branch content below that choice.
5. All projected nodes now carry `dragHandle = ".pg-node__drag-handle"`.
6. File frames, label frames, label starts, and scenario nodes now render a visible header separated by a thin accent line.
7. React Flow node changes are applied locally during drag, while `onNodeDragStop` still persists the final position to CRDT.
8. Scenario drag operations mark `_manual_position = true`, and projection/normalization now preserve labels containing manual scenario positions instead of auto-layouting them again.

Checks:

1. Added failing projection expectations first for hidden `menu_prompt`, prompt text on `menu`, detached `menu_choice` visual parentage, side-by-side menu branch lanes, and node drag handle selectors.
2. Existing collaboration test caught the manual-position regression; fixed it by preserving manual-position labels through projection and normalization.
3. Browser smoke imported `artifacts/smoke_single_file_layout.rpy` into project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`.
4. Browser smoke confirmed body-drag did not move a `menu` node, while header-drag moved it and saved the position.
5. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 11 tests.
6. `npm test -- --run` passed with 36 frontend tests.
7. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

## 2026-05-02

### Action Blocks And Nested If Smoke

Closed the browser-driven parser/layout correction for the user's nested conditional and post-line-noise concern.

Files:

1. `backend/tests/fixtures/renpy_mouse/renpy_mouse_nested_if_blocks.rpy`
2. `backend/tests/test_project_graph_action_blocks.py`
3. `backend/app/services/project_graph/importer.py`
4. `backend/app/services/project_graph/exporter.py`
5. `backend/tests/test_project_graph_actions.py`
6. `backend/tests/test_project_graph_conditionals.py`
7. `backend/tests/test_project_graph_sprint_1_2_blackbox.py`
8. `backend/tests/test_project_graph_import_route.py`
9. `backend/tests/test_project_graph_diagnostics.py`
10. `backend/tests/test_mouse_renpy_fixtures.py`
11. `frontend/src/utils/projectGraphProjection.ts`
12. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
13. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
14. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
15. `docs/editor-2.0-architecture.md`
16. `docs/canvas-layout-usability-audit.md`
17. `artifacts/nested-if-action-blocks-smoke.png`

Result:

1. Added a dedicated RenPy Mouse fixture with nested `if/else` inside `if/else`.
2. Import now scans statements recursively and preserves nested conditional hierarchy instead of flattening branch blocks.
3. Linear non-control story chunks import as one `action` node until `menu`, `if/elif/else`, `jump`, `call`, `return`, nested label, or unsafe raw block.
4. Comments, dialogue/narration, and presentation/action statements like `scene` and `show` are preserved inside the related action block instead of becoming one canvas node per line.
5. Action block metadata stores `default_title` from the first non-empty line; the canvas editor can set a user title in metadata without changing exported `.rpy`.
6. Export renders multiline action blocks back to normalized `.rpy` text with correct indentation and without editor metadata.
7. Browser smoke on project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` after importing `renpy_mouse_nested_if_blocks.rpy` showed the first six story lines as one `ACTION` block, followed by the nested conditional tree.

Checks:

1. `python -m pytest backend/tests/test_project_graph_action_blocks.py -q` passed with 3 tests.
2. `python -m pytest backend/tests/test_project_graph_actions.py backend/tests/test_project_graph_conditionals.py backend/tests/test_project_graph_sprint_1_2_blackbox.py backend/tests/test_project_graph_exporter.py backend/tests/test_project_graph_import_route.py -q` passed with 19 tests.
3. `python -m pytest backend/tests -q` passed with 150 tests.
4. `npm test -- --run` passed with 34 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Sequence And Branch Arrows Pass

Continued the browser-driven canvas readability work after the user clarified that `if/else` must read as tree branches with arrows, not only as nested structures.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
5. `docs/editor-2.0-architecture.md`
6. `docs/canvas-layout-usability-audit.md`
7. `artifacts/nested-if-branch-arrows-smoke.png`

Result:

1. Projection now derives `sequence` arrows for top-down story reading without writing them into CRDT state.
2. Projection now derives `branch` arrows from incoming flow to `if/elif/else` alternatives and from branch nodes to their first child blocks.
3. Consecutive `if/elif/else` siblings are arranged as horizontal branch lanes on one row.
4. Node handles are split into top/bottom flow handles and left/right relation handles so sequence/branch arrows are visually distinct from `jump/call` hints.
5. Long rejoin arrows were intentionally excluded from this pass after browser smoke showed they crossed content and made the graph noisier.
6. Minimap is smaller and more transparent so it does not cover the right-side branch area as aggressively.

Checks:

1. Added failing projection tests first for sequence arrows, branch arrows, and side-by-side `if/else` lanes.
2. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 10 tests.
3. Browser smoke on project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6` after importing `renpy_mouse_nested_if_blocks.rpy` produced `artifacts/nested-if-branch-arrows-smoke.png`.
4. `npm test -- --run` passed with 35 frontend tests.
5. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.
6. `python -m pytest backend/tests/test_project_graph_action_blocks.py backend/tests/test_project_graph_import_route.py -q` passed with 8 backend tests.

### Canvas Layout Usability Audit

Created `docs/canvas-layout-usability-audit.md` after a real browser single-file smoke test showed that the current MVP 2.0 canvas is technically rendering but not yet usable as a readable top-down story tree.

Result:

1. Captured the smoke screenshot at `artifacts/single-file-layout-smoke.png`.
2. Recorded the main layout failures: `LabelStartNode` is not the first visual anchor, nested labels mix with parent flow, frames are too large, source/runtime flow is not readable top-down, jump/call edges create visual noise, branch blocks do not read as branches, overlay panels can compete with the graph, and initial fit makes text too small.
3. Added closure checks for each problem: black-box layout invariants, browser screenshot checks, compact frame bounds, readable top-down order, branch readability, secondary jump/call relation styling, and preservation of collaboration/manual drag behavior.
4. This audit is the working artifact for the next focused layout usability fix.

### Canvas Layout Usability First Pass

Implemented the first focused layout improvement pass from `docs/canvas-layout-usability-audit.md`.

Files:

1. `backend/app/services/project_graph/importer.py`
2. `backend/tests/test_project_graph_importer.py`
3. `frontend/src/utils/projectGraphProjection.ts`
4. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
5. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
6. `docs/canvas-layout-usability-audit.md`
7. `artifacts/single-file-layout-smoke-after.png`

Result:

1. New imports receive compact source-ordered scenario node coordinates instead of broad repeated default positions.
2. Existing bad snapshots get frontend projection fallback compaction when siblings are clearly stacked from import.
3. `LabelStartNode` is the first visual anchor inside a label frame.
4. Frame bounds are recalculated from real child bounds plus padding, so imported default frame sizes no longer dominate.
5. Menu/choice nested nodes stay inside branch parent bounds without sibling overlap in the tested smoke graph.
6. Manual CRDT drag positions are preserved: auto-compaction no longer treats any arbitrary overlap as an import defect.
7. Initial canvas viewport focuses the first readable `LabelStartNode` instead of shrinking the full tall graph into unreadable fitView.
8. Browser smoke screenshot updated at `artifacts/single-file-layout-smoke-after.png`.

Checks:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 8 tests.
2. `python -m pytest backend/tests/test_project_graph_importer.py backend/tests/test_project_graph_import_route.py -q` passed with 9 tests.
3. `npm test -- --run` passed with 33 tests.
4. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Canvas Layout Usability Second Pass

Continued the layout usability fix after browser review still showed visual overlap/noise in the lower nested-label area.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
4. `docs/canvas-layout-usability-audit.md`
5. `artifacts/single-file-layout-smoke-after-2.png`
6. `artifacts/single-file-layout-smoke-lower-after-2.png`

Result:

1. Layout normalization now runs multiple arrange/expand passes so file and label sibling positions are recalculated after parent frames reach their final child-derived size.
2. Groups identified as imported stacked layout keep using compact layout across later passes; this fixes global label overlap after a large preceding label expands.
3. Added regression assertions that `ask_duck` does not overlap the expanded `start` label and that the single-file smoke's top-level nodes do not overlap each other.
4. Relation `jump/call` edges no longer render text labels; visual noise is reduced through lower opacity, thinner strokes, and no arrow marker on `jump`.
5. File and label frame backgrounds are lighter so containment remains visible without dominating scenario nodes.
6. Browser hot checks were performed on the running app after re-importing `artifacts/smoke_single_file_layout.rpy` into project `1988eb90-56a7-4a5d-9dc5-0ffc39a7c1d6`.

Checks:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts src/utils/__tests__/projectGraphCollaboration.test.ts` passed with 20 tests.
2. `npm test -- --run` passed with 33 frontend tests.
3. `python -m pytest backend/tests/test_project_graph_importer.py backend/tests/test_project_graph_import_route.py -q` passed with 9 tests.
4. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Canvas Layout Usability Third Pass

Continued the browser-driven layout cleanup after the canvas was geometrically better but still visually noisy.

Files:

1. `frontend/src/utils/projectGraphProjection.ts`
2. `frontend/src/utils/__tests__/projectGraphProjection.test.ts`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
5. `docs/canvas-layout-usability-audit.md`
6. `artifacts/single-file-layout-smoke-after-3.png`

Result:

1. Added a failing black-box projection expectation first: relation `jump/call` edges must remain present but be non-interactive, faded, thin background hints.
2. Relation edges now use `selectable=false`, `focusable=false`, `interactionWidth=1`, lower opacity, thinner strokes, and softer dash patterns.
3. CSS relation-edge strokes are quieter, so runtime links no longer visually compete with containment frames and scenario text.
4. Search result navigation now clears the query after focusing a node, preventing the results panel from staying over the graph.
5. The toolbar has a bounded height and local scrolling for result-heavy searches.
6. Browser hot check confirmed the single-file smoke project reloads into a cleaner top-down view and focusing `start.cupboard` no longer leaves search results covering the local-label tree.

Checks:

1. `npm test -- --run src/utils/__tests__/projectGraphProjection.test.ts` passed with 8 tests.
2. `npm test -- --run` passed with 33 frontend tests.
3. `npm run build` passed with the known non-blocking Vite/env.js, Browserslist, and large Loro chunk warnings.

### Deployment Packaging Fix

Fixed the Docker backend image contract for the MVP 2.0 import path after remote deployment smoke testing found that `POST /api/projects/{project_id}/graph-import` could not create initial Loro snapshots inside the container.

Files:

1. `docker-compose.yml`
2. `.dockerignore`
3. `backend/Dockerfile`
4. `backend/tests/test_docker_packaging.py`
5. `backend/app/services/project_graph/crdt_bridge.py`
6. `backend/tests/test_project_graph_crdt_bridge.py`
7. `frontend/scripts/project-graph-snapshot-cli.mjs`

Result:

1. Backend Docker builds now use the repository root as context so the image can package the checked-in frontend Loro snapshot bridge.
2. Backend images install Node.js/npm, install frontend production dependencies, and copy `frontend/scripts` beside the Python app.
3. Backend images set `PROJECT_GRAPH_FRONTEND_DIR=/app/frontend`, and `ProjectGraphCrdtSnapshotBridge` now respects that explicit runtime path with local fallback discovery for development.
4. Added packaging and bridge path contract tests so future compose/Dockerfile edits do not silently remove the runtime needed by `ProjectGraphCrdtSnapshotBridge`.
5. The snapshot CLI now imports the Node package entrypoint for `loro-crdt` through a CommonJS/ESM-compatible namespace import. The browser-facing frontend adapter still uses `loro-crdt/base64`, but the backend CLI runs in Node and must use the package's Node build.
6. Added root `.dockerignore` entries to keep the widened backend build context from sending git history, local node modules, build output, caches, and debug databases.

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

### Sprint 9 / MVP Actions 9.1-9.4 Collaboration And Persistence Hardening

Started Sprint 9 by hardening the ProjectGraph collaboration layer around two-client update flow, debounced persistence, reload recovery, and JSON/binary WebSocket separation.

Files:

1. `frontend/src/utils/projectGraphCollaboration.ts`
2. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`
3. `frontend/src/components/EditorPage.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
5. `backend/tests/test_websocket.py`
6. `frontend/e2e/project-graph-collaboration.spec.ts`
7. `frontend/public/e2e/project-graph-collaboration.html`
8. `frontend/playwright.config.ts`
9. `frontend/vite.config.ts`
10. `frontend/package.json`
11. `frontend/package-lock.json`

Result:

1. Added a two-client browser-like WebSocket relay smoke test for content edits and drag updates.
2. Verified JSON presence messages are ignored by frontend CRDT update handling and do not mutate the graph.
3. Added debounced snapshot persistence to `ProjectGraphCollaborationSession`.
4. Added observable persistence statuses: `idle`, `saving`, `saved`, `error`.
5. `EditorPage` now passes a debounced persistence callback and displays save status on the canvas.
6. Rapid local edits and drag events coalesce into one persisted snapshot while preserving the final content and position.
7. Persistence errors no longer become unhandled promise rejections; they report `error`.
8. Added reconnect/reload recovery coverage: a disconnected client can recover the latest graph from the saved Loro snapshot without duplicate files, labels, label starts, or scenario nodes.
9. Added backend mixed-frame coverage proving project presence JSON and binary CRDT updates share the project room without crossing frame types.
10. Added Playwright as the real browser E2E harness for MVP 2.0 collaboration smoke coverage.
11. Added a real Chromium two-context E2E test using the production Loro adapter, the frontend WebSocket helper, and a small test WebSocket relay.
12. E2E verifies content edit and drag update visibility in the second browser context.
13. E2E verifies JSON presence frames do not change the ProjectGraph DOM projection.
14. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphCollaboration.test.ts`.
15. Tests passed: `python -m pytest backend/tests/test_websocket.py -q`.
16. Tests passed: `npm run test:e2e`.

### Sprint 10 / MVP Action 10.1 Typed Scenario Node Editor

Started Sprint 10 by extending the editable ProjectGraph canvas from plain content edits to typed scenario editing contracts.

Files:

1. `frontend/src/utils/projectGraphCollaboration.ts`
2. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`
3. `frontend/src/components/EditorPage.tsx`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
5. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`

Result:

1. Added a black-box collaboration test that edits dialogue, comment, jump, call, return, raw_action, raw_block, menu prompt, and menu choice nodes.
2. Added `ProjectGraphCollaborationSession.editScenarioMetadata()` so typed editor metadata changes publish as binary Loro updates, update the projected graph, and remain persistable.
3. `ProjectGraphCanvas` now labels the editor by scenario type and exposes a dedicated menu choice condition field.
4. Editing a menu choice condition updates the visible Ren'Py choice line and the node metadata condition field.
5. The action test asserts that typed editing does not introduce UI/editor metadata fields into ProjectGraph nodes.
6. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphCollaboration.test.ts`.

### Sprint 10 / MVP Action 10.2 Manual Layout Persistence

Closed the manual layout persistence contract for all MVP entity levels.

Files:

1. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`

Result:

1. Added a black-box collaboration/reload test that moves a `FileFrame`, `LabelFrame`, `LabelStartNode`, and `ScenarioNode`.
2. Verified the moved positions sync to a second CRDT client through binary updates.
3. Verified the same positions survive binary snapshot export/import reload.
4. No new implementation was required because the existing Sprint 7/Sprint 9 `moveEntity()` operation already works on all ProjectGraph entity kinds.
5. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphCollaboration.test.ts`.

### Sprint 10 / MVP Action 10.3 Export Safety Gate

Added the first user-facing export safety gate to the ProjectGraph export API.

Files:

1. `backend/app/api/routes/projects.py`
2. `backend/tests/test_project_graph_snapshot_route.py`

Result:

1. Added route tests proving non-blocking warning diagnostics still allow normalized `.rpy` export.
2. Added route tests proving explicitly blocking diagnostics stop export with a clear `400` response.
3. The export route now checks loaded ProjectGraph diagnostics before invoking the exporter.
4. The blocking response returns concise diagnostic IDs, codes, severities, messages, and node IDs without dumping full graph internals.
5. Tests passed: `python -m pytest backend/tests/test_project_graph_snapshot_route.py -q`.

### Sprint 10 / MVP Action 10.4 Live Search And Problems After Edits

Closed the live search/problems update contract for the collaborative ProjectGraph canvas.

Files:

1. `frontend/src/utils/projectGraphCrdt.ts`
2. `frontend/src/utils/projectGraphCollaboration.ts`
3. `frontend/src/utils/__tests__/projectGraphCollaboration.test.ts`

Result:

1. Added a black-box test proving search results are derived from the current CRDT graph after a remote content edit.
2. Added `replaceProjectGraphDiagnostics()` to the CRDT adapter.
3. Added `ProjectGraphCollaborationSession.replaceDiagnostics()` so diagnostic-bearing updates publish through the same binary collaboration path.
4. Added coverage proving the Problems projection updates after a remote diagnostic replacement.
5. Tests passed: `npm test -- --run src/utils/__tests__/projectGraphCollaboration.test.ts`.

### Sprint 10 / MVP Action 10.5 Export UX Contract

Closed the visible export result contract for the ProjectGraph canvas.

Files:

1. `frontend/src/components/EditorPage.tsx`
2. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
3. `frontend/src/components/projectGraph/ProjectGraphCanvas.css`
4. `frontend/e2e/project-graph-collaboration.spec.ts`
5. `frontend/public/e2e/project-graph-export-ux.html`
6. `frontend/src/e2e/project-graph-export-ux.tsx`

Result:

1. `EditorPage` now keeps the returned export file map instead of discarding it after a successful export.
2. `ProjectGraphCanvas` renders an Exported Files panel with stable sorted filenames and normalized `.rpy` text previews.
3. Export failure clears stale exported file results.
4. Added a Playwright export UX harness and test that clicks Export, observes `Exporting...`, resolves the export, and verifies returned filenames and content.
5. Tests passed: `npm run test:e2e -- --grep "canvas export UX"`.

### Sprint 10 Verification

Sprint 10 editor/export readiness gate passed.

Result:

1. Backend tests passed: `python -m pytest backend/tests -q` with 142 tests.
2. Frontend unit tests passed: `npm test -- --run` with 30 tests.
3. Frontend E2E tests passed: `npm run test:e2e` with 2 Playwright tests.
4. Frontend build passed: `npm run build`.
5. Known build warnings remain non-blocking for Sprint 10: large Loro bundle chunk, `/env.js` script module warning, and outdated Browserslist data. Sprint 11 release gate must either document these as MVP exceptions or fix them.

### Sprint 11 / MVP Release Gate

Closed the MVP 2.0 release gate around cross-sprint behavior, legacy path isolation, bundle budget, and operator documentation.

Files:

1. `backend/tests/test_project_graph_import_route.py`
2. `frontend/src/components/__tests__/EditorPage.mvp2.test.ts`
3. `frontend/scripts/check-mvp-bundle.mjs`
4. `frontend/package.json`
5. `README.md`
6. `docs/editor-2.0-architecture.md`

Result:

1. Added a release contract test that imports the full mouse RenPy corpus through the API, opens the saved Loro snapshot, edits a dialogue node, moves ProjectGraph visual metadata, exports with non-blocking diagnostics, reimports the exported files, and compares MVP semantics.
2. Added a frontend isolation guard proving the MVP 2.0 `EditorPage` path uses ProjectGraph snapshot/import/export APIs and does not call legacy line-range parse/update/insert or lock collaboration APIs.
3. Added `npm run check:mvp-bundle` with an explicit MVP budget: largest frontend JS chunk must be at or below 6,000,000 bytes.
4. Updated README with MVP status, run commands, demo path, release gate commands, bundle budget, and known non-blocking MVP exceptions.
5. Updated the architecture document with current release gate status and accepted MVP exceptions.
6. Tests passed: `python -m pytest backend/tests/test_project_graph_import_route.py -q`.
7. Tests passed: `npm test -- --run src/components/__tests__/EditorPage.mvp2.test.ts`.
8. Check passed: `npm run check:mvp-bundle`.

Final release gate:

1. Backend tests passed: `python -m pytest backend/tests -q` with 143 tests.
2. Frontend unit tests passed: `npm test -- --run` with 31 tests.
3. Frontend build passed: `npm run build`.
4. Bundle budget passed: `npm run check:mvp-bundle`, largest JS chunk 5,283,267 bytes under the 6,000,000 byte MVP budget.
5. Frontend E2E passed: `npm run test:e2e` with 2 Playwright Chromium tests.
6. MVP 2.0 ProjectGraph path is now considered a working MVP on this branch.

## 2026-04-30

### Branch And Initial Architecture

Created branch `codex/editor-2-architecture` and added the first version of `docs/editor-2.0-architecture.md`.

### Repo Findings

1. Current collaboration is not CRDT-based. It uses JSON WebSocket presence/lock-style behavior.
2. Current React Flow graph is a projection from parser output, not a durable project graph.
3. Current backend parser produces unstable IDs in some paths through object identity/address-like behavior.
4. Current architecture is close to `one file = one graph`; MVP 2.0 must become `one project = one canvas`.
5. Existing MVP 1.0 code is useful as context, but it is not the target architecture.
