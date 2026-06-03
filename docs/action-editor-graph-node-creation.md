# Action Editor Graph Node Creation

Status: planning artifact for the next Action Editor implementation stage.

Created: 2026-06-03.

Related artifact: `docs/action-editor-interface.md`.

## Purpose

The current fullscreen Action editor can edit Action node text, switch to Raw Ren'Py, show writer rows, show scene/audio/next aids, and detect structural Ren'Py statements in Raw mode.

The next step is domain-level graph creation:

1. `Next` panel actions must create ProjectGraph nodes.
2. Raw structural review must create the same ProjectGraph nodes.
3. Created nodes must be stored in the Loro-backed ProjectGraph CRDT state.
4. Created nodes must sync to collaborators, survive reload, project onto React Flow, and export as normalized Ren'Py.

This must not be implemented as hidden raw text inside an Action node.

## Non-negotiable Constraints

1. React Flow remains projection only.
2. Loro ProjectGraph remains source of truth.
3. New graph nodes are durable ProjectGraph entities with stable IDs.
4. `jump` and `call` target `LabelStartNode`, not `LabelFrame`.
5. Edges are node-to-node only.
6. File/label containment is lexical structure and must not be rebuilt from runtime flow.
7. `menu`, `if`, `jump`, `call`, and `return` must not be silently stored as Action text by default.
8. Editor metadata never exports into `.rpy`.
9. New operations must publish binary Loro updates through the existing collaboration session.
10. Tests must prove CRDT sync, reload, projection, and export behavior.

## Official References To Recheck Before Coding

Use official docs again immediately before implementation:

1. Ren'Py menus: https://www.renpy.org/doc/html/menus.html
2. Ren'Py labels and control flow: https://www.renpy.org/doc/html/label.html
3. Ren'Py conditional statements: https://www.renpy.org/doc/html/conditional.html
4. Loro Tree tutorial: https://www.loro.dev/docs/tutorial/tree
5. Loro encoding / updates: https://www.loro.dev/docs/tutorial/encoding
6. React Flow sub-flows / parent-child nodes: https://reactflow.dev/learn/layouting/sub-flows

If docs contradict this artifact, update this artifact first.

## Current Implementation Context

Relevant frontend files:

1. `frontend/src/components/actionEditor/ActionEditorOverlay.tsx`
2. `frontend/src/components/actionEditor/ActionEditorSidebar.tsx`
3. `frontend/src/components/actionEditor/actionEditorModel.ts`
4. `frontend/src/components/projectGraph/ProjectGraphCanvas.tsx`
5. `frontend/src/utils/projectGraphCrdt.ts`
6. `frontend/src/utils/projectGraphCollaboration.ts`
7. `frontend/src/utils/projectGraphProjection.ts`

Current CRDT state:

1. Entity containment lives in Loro Tree container `project_graph_tree`.
2. Entity ID to tree ID index lives in Loro Map `project_graph_entity_tree_ids`.
3. Graph metadata lives in Loro Map `project_graph_meta`.
4. Scenario content lives in LoroText containers keyed as `scenario_content:{nodeId}`.
5. Edges currently live in `project_graph_meta.edges` as an array.
6. Diagnostics currently live in `project_graph_meta.diagnostics` as an array.

Existing CRDT operations:

1. `updateScenarioNodeContent()`.
2. `updateScenarioNodeMetadata()`.
3. `moveProjectGraphEntity()` / `moveProjectGraphEntities()`.
4. `reparentScenarioNode()`.
5. `replaceProjectGraphDiagnostics()`.

Missing CRDT operations:

1. Create scenario node.
2. Create multiple scenario nodes atomically.
3. Insert scenario node after another scenario node in source order.
4. Append scenario node as child of menu/choice/if branch.
5. Update edge list atomically with node creation.
6. Resolve label target for `jump`/`call` from UI-selected target label.
7. Rebalance order strings for inserted siblings.

## Core Design Decision

Create one domain operation family:

```ts
type ProjectGraphCreateScenarioOperation =
  | AppendScenarioNodeAfterOperation
  | AppendMenuAfterOperation
  | AppendConditionalAfterOperation
  | AppendJumpAfterOperation
  | AppendCallAfterOperation
  | AppendReturnAfterOperation;
```

The operation family belongs in `projectGraphCrdt.ts` and is exposed through `ProjectGraphCollaborationSession`.

The Action editor calls collaboration session methods. It must not edit `ProjectGraphSnapshot` directly.

## ID Policy

New nodes need stable IDs at creation time.

Recommended MVP approach:

1. Generate IDs on the client at operation time.
2. Use `crypto.randomUUID()` when available.
3. Inject `createId?: () => string` into operation options for deterministic tests.
4. Persist IDs in Loro Tree immediately.
5. Never derive IDs from array indexes, source order, or React Flow IDs.

Test examples should use deterministic IDs:

```ts
createId: () => ids.shift() ?? 'fallback-id'
```

## Order Policy

Current `ScenarioNode.order` is a sortable string such as:

```text
0001
0001.0000
0001.0001
```

MVP insertion should use a simple stable order allocator:

1. Determine siblings under the same parent entity.
2. Find the source node order.
3. Insert after the source node with a generated order between source and next sibling when possible.
4. If no gap exists, renumber only siblings under the same parent.
5. Preserve relative order of unrelated labels/files.

Recommended first implementation:

1. Use decimal-like segment strings with four digits.
2. For append-after at root label level, create next root order after source.
3. For children under menu/if/choice, create child order as `{parent.order}.{childIndex}`.
4. If this is insufficient, add sibling renumbering in the same TDD loop.

Do not rely on array insertion order alone. `projectGraphFromCrdtDoc()` sorts by `order`.

## Visual Position Policy

New nodes need reasonable initial visual placement, but layout can refine it.

MVP defaults:

1. New sibling after an Action node:
   - `x = source.visual.position.x`
   - `y = source.visual.position.y + source.visual.size.height + 96`
2. Menu children:
   - prompt at `{ x: 32, y: 72 }`
   - first choice at `{ x: 32, y: 168 }`
3. Conditional children:
   - branch action placeholder can start at `{ x: 32, y: 96 }` if created in the same operation.
4. Node sizes use current compact defaults:
   - scenario node: `320 x 88`
   - branch/menu container: wider/taller as already expected by projection.

Manual layout metadata should not be added by automatic creation.

## Edge Policy

There are two edge classes to consider:

1. Durable relation edges in ProjectGraph meta for `jump` and `call`.
2. Derived sequence/branch edges created by projection.

For creation operations:

1. `menu` and `if` do not need durable edges for their internal flow in MVP if projection can derive structure from containment/order.
2. `jump` creates a durable `FlowEdgeSnapshot` with `kind: "jump"`.
3. `call` creates a durable `FlowEdgeSnapshot` with `kind: "call"`.
4. Edge source is the new jump/call node.
5. Edge target is the selected destination `LabelStartNode`.
6. Edge metadata should preserve at least `target` and optionally `target_label_id`.

Current frontend `FlowEdgeSnapshot` type only exposes:

```ts
kind: "jump" | "call";
source_node_id: string;
target_node_id: string;
metadata: Record<string, unknown>;
```

If dynamic/unresolved targets are supported from the UI later, the type may need broadening. Do not broaden it during the first creation sprint unless a test requires it.

## Operation Contracts

### `appendScenarioNodeAfter()`

General primitive.

Input:

```ts
type AppendScenarioNodeAfterInput = {
  afterNodeId: string;
  node: {
    id?: string;
    type: ScenarioNodeSnapshot["type"];
    content: string;
    metadata?: Record<string, unknown>;
    visual?: Partial<GraphVisual>;
  };
};
```

Expected behavior:

1. Looks up `afterNodeId`.
2. Requires `afterNodeId` to be a scenario node.
3. Creates a new scenario node under the same parent entity as `afterNodeId`.
4. Copies `file_id` and `label_id` from `afterNodeId`.
5. Sets `parent_node_id` to the same parent as `afterNodeId`.
6. Allocates stable ID if not provided.
7. Allocates order after `afterNodeId`.
8. Creates Loro Tree node and LoroText content.
9. Commits with origin `project-graph-create-scenario`.

### `appendMenuAfterAction()`

Creates the first Player Choice scaffold.

Expected new nodes:

1. `menu` node after current Action node.
2. `menu_prompt` child under menu with default content:
   - `"What should happen next?"`
3. First `menu_choice` child under menu with default content:
   - `"Choice one":`
4. Optional child Action under first choice may be deferred to later sprint.

The menu node itself should have content:

```renpy
menu:
```

### `appendConditionalAfterAction()`

Creates a simple conditional scaffold.

Expected new nodes:

1. `if` node after current Action node.
2. Optional first child Action can be deferred unless projection needs it.

Default content:

```renpy
if condition:
```

Metadata:

```ts
{ condition: "condition" }
```

### `appendJumpAfterAction()`

Creates a jump node plus relation edge.

Input requires selected target label/start:

```ts
{
  afterNodeId: string;
  targetLabelStartNodeId: string;
  targetQualifiedName: string;
}
```

Expected content:

```renpy
jump targetQualifiedName
```

Expected edge:

```ts
{
  id: generatedEdgeId,
  source_node_id: jumpNodeId,
  target_node_id: targetLabelStartNodeId,
  kind: "jump",
  metadata: { target: targetQualifiedName }
}
```

### `appendCallAfterAction()`

Same as jump, but:

```renpy
call targetQualifiedName
```

Edge kind is `"call"`.

### `appendReturnAfterAction()`

Creates terminal return node.

Default content:

```renpy
return
```

No durable edge.

## Action Editor Integration

`ActionEditorSidebar` currently receives:

```ts
onNextAction: (action) => void
```

This should become:

```ts
onNextAction: (action: ActionEditorNextAction) => void
```

`ActionEditorOverlay` should receive:

```ts
onCreateNextNode?: (action: ActionEditorNextAction, context: ActionEditorCreateContext) => void;
```

For `menu`, `conditional`, and `return`, the operation can run immediately.

For `jump` and `call`, the UI needs a target label picker:

1. First MVP can open a small label search popover.
2. The popover lists `graph.label_starts` by `qualified_name`.
3. Selecting a label start calls `appendJumpAfterAction` or `appendCallAfterAction`.
4. Until the picker exists, jump/call buttons can open a disabled review popover, but tests for completed sprint must not claim creation works.

## Raw Structural Review Integration

The Raw mode review panel currently detects structure but does not create nodes.

Confirming should map to the same operations as `Next`:

| Raw statement | Operation |
| --- | --- |
| `menu:` | `appendMenuAfterAction()` |
| `if ...:` | `appendConditionalAfterAction()` |
| `elif ...:` | post-MVP unless editing existing conditional chain |
| `else:` | post-MVP unless editing existing conditional chain |
| `jump target` | `appendJumpAfterAction()` with resolved target if possible |
| `call target` | `appendCallAfterAction()` with resolved target if possible |
| `return` | `appendReturnAfterAction()` |
| `label name:` | post-MVP label creation operation |

MVP behavior:

1. If target can be resolved to a current label start, create the node and relation edge.
2. If target cannot be resolved, either:
   - open target picker, or
   - create no node and keep review panel visible.
3. Do not remove structural text from raw content until the graph node creation succeeds.
4. After successful creation, remove the intercepted structural line from Action content.
5. If user chooses `Keep as raw text`, leave content untouched and close/dismiss review for that line.

## TDD Sprint Plan

### Sprint 7: CRDT Scenario Creation Primitive

Black-box expectation:

A client can append one scenario node after an Action node; the new node has a stable ID, correct containment, correct order, LoroText-backed content, syncs to another client, and survives snapshot reload.

Atomic tasks:

1. Recheck Loro Tree docs.
2. Add failing CRDT test in `projectGraphCrdt.test.ts`.
3. Add failing collaboration test in `projectGraphCollaboration.test.ts`.
4. Implement deterministic ID injection.
5. Implement sibling/order helper.
6. Implement `appendScenarioNodeAfter()` in `projectGraphCrdt.ts`.
7. Expose `appendScenarioNodeAfter()` on `ProjectGraphCollaborationSession`.
8. Verify binary update publish.
9. Verify snapshot reload.
10. Update `UPDATES.md`.
11. Consider next sprint.

### Sprint 8: Menu And Conditional Creation

Black-box expectation:

Player Choice creates a menu scaffold after the current Action node. Conditional Path creates an if scaffold after the current Action node. Projection shows the new nodes in the correct label frame.

Atomic tasks:

1. Recheck Ren'Py menu and conditional docs.
2. Add failing CRDT tests for menu scaffold.
3. Add failing CRDT tests for conditional scaffold.
4. Implement `appendMenuAfterAction()`.
5. Implement `appendConditionalAfterAction()`.
6. Add projection integration tests.
7. Add export integration tests.
8. Expose methods on collaboration session.
9. Update `UPDATES.md`.
10. Consider next sprint.

### Sprint 9: Jump, Call, Return Creation

Black-box expectation:

Go to Label creates a jump node plus relation edge to the selected `LabelStartNode`. Call Sub-scene creates a call node plus relation edge. Return creates a terminal return node without outgoing edge.

Atomic tasks:

1. Recheck Ren'Py label/control-flow docs.
2. Add test graph with at least two label starts.
3. Add failing CRDT tests for jump creation.
4. Add failing CRDT tests for call creation.
5. Add failing CRDT tests for return terminal creation.
6. Implement edge list append helper.
7. Implement `appendJumpAfterAction()`.
8. Implement `appendCallAfterAction()`.
9. Implement `appendReturnAfterAction()`.
10. Add projection tests for relation edge target and return terminality.
11. Add export tests.
12. Update `UPDATES.md`.
13. Consider next sprint.

### Sprint 10: Action Editor Next Panel Wiring

Black-box expectation:

Clicking `Player Choice`, `Conditional Path`, and `Return` in the fullscreen Action editor creates real ProjectGraph nodes through CRDT operations and updates the canvas projection.

Atomic tasks:

1. Add failing component/source contract test for `ActionEditorOverlay` props.
2. Add failing collaboration test for `ActionEditorNextAction`.
3. Pass graph creation callbacks from `EditorPage` to `ProjectGraphCanvas`.
4. Pass callbacks from `ProjectGraphCanvas` to `ActionEditorOverlay`.
5. Wire `menu`, `conditional`, and `return`.
6. Flush pending Action content before creation.
7. Close or keep editor after creation based on UX decision; MVP recommendation: keep editor open and focus new node in canvas later.
8. Add integration test: created node appears in current graph.
9. Update `UPDATES.md`.
10. Consider next sprint.

### Sprint 11: Label Picker For Jump/Call

Black-box expectation:

Clicking `Go to Label` or `Call Sub-scene` opens a compact target picker; selecting a label creates jump/call node and relation edge to the destination `LabelStartNode`.

Atomic tasks:

1. Add target picker view model test.
2. Add component test for label search/list.
3. Add jump/call creation integration test from Action editor.
4. Implement `ActionEditorTargetPicker`.
5. Pass `label_starts` to overlay through canvas.
6. Wire target selection to CRDT operation.
7. Confirm relation edge projects as soft curve.
8. Confirm export contains `jump target` / `call target`.
9. Update `UPDATES.md`.
10. Consider next sprint.

### Sprint 12: Raw Structural Confirmation

Black-box expectation:

Confirming Raw mode structural review creates the same graph nodes as the visual Next panel and removes the intercepted structural line from Action text only after successful graph creation.

Atomic tasks:

1. Add raw review model tests for line removal.
2. Add component test for confirm behavior.
3. Add CRDT integration test for `menu:` raw confirmation.
4. Add CRDT integration test for `return` raw confirmation.
5. Add jump/call raw confirmation with resolved target.
6. Add unresolved target behavior test.
7. Implement confirm callbacks.
8. Implement `Keep as raw text` dismissal state.
9. Add export test proving structural text is not duplicated.
10. Update `UPDATES.md`.
11. Consider next sprint.

## Test Matrix

Minimum focused tests:

1. `projectGraphCrdt.test.ts`
   - append one scenario node.
   - append menu scaffold.
   - append conditional scaffold.
   - append jump/call/return.
   - snapshot reload.
   - duplicate update idempotency.
2. `projectGraphCollaboration.test.ts`
   - creation publishes binary update.
   - peer receives created nodes.
   - persistence receives updated snapshot.
3. `projectGraphProjection.test.ts`
   - created nodes project into current label frame.
   - jump/call relation edge targets label start.
   - return remains terminal.
4. Action editor tests:
   - Next action invokes graph creation callback.
   - target picker creates jump/call.
   - Raw structural confirm uses same creation path.
5. Export tests:
   - created menu exports as `menu:`.
   - created if exports as `if condition:`.
   - created jump/call/return export normalized statements.

## Failure Modes To Guard

1. New node created in React state but not Loro.
2. New node ID changes after reload.
3. New node appears under wrong label.
4. New node order sorts before the source Action node.
5. Jump/call edge points to label frame instead of label start.
6. Return gets a derived outgoing sequence edge.
7. Structural raw line remains in Action text after graph node creation, causing duplicate export.
8. Creating a graph node overwrites Action node content.
9. Peer receives CRDT update but projection does not update.
10. Edge array update races with node creation in collaboration.

## Recommended First Commit Scope

The first implementation commit should only close Sprint 7:

1. Add `appendScenarioNodeAfter()`.
2. Expose it on `ProjectGraphCollaborationSession`.
3. Prove CRDT update, peer sync, and snapshot reload.
4. Do not wire UI yet.
5. Do not implement menu/jump/call in the same commit.

This keeps the first domain step small enough to debug before adding graph-specific scaffolds.
