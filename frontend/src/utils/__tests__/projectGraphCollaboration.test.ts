import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectGraphCollaborationSession,
  connectProjectGraphCollaborationSocket,
  toProjectGraphWebSocketUrl,
  retainActiveProjectGraphRemoteCursors,
} from '../projectGraphCollaboration';
import {
  createProjectGraphCrdtDoc,
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtSnapshot,
  insertProjectGraphNextScenario,
  projectGraphFromCrdtDoc,
} from '../projectGraphCrdt';
import {
  projectGraphDiagnosticsToProblems,
  projectGraphToReactFlow,
  searchProjectGraph,
  type ProjectGraphSnapshot,
} from '../projectGraphProjection';

const graph: ProjectGraphSnapshot = {
  project_id: 'sprint-7-project',
  files: [
    {
      id: 'file-day-1',
      path: 'renpy_mouse_day_1.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 600 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-day-1',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 420 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-intro',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "RenPy Mouse starts sprint seven."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 64, y: 136 }, size: { width: 360, height: 88 } },
    },
    {
      id: 'node-comment',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'comment',
      content: '# RenPy Mouse records the editorial squeak.',
      order: '0001',
      source_span: { start_line: 2, end_line: 2 },
      metadata: {},
      visual: { position: { x: 64, y: 248 }, size: { width: 360, height: 72 } },
    },
    {
      id: 'node-jump',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'jump',
      content: 'jump day_two',
      order: '0002',
      source_span: { start_line: 3, end_line: 3 },
      metadata: { target: 'day_two' },
      visual: { position: { x: 64, y: 344 }, size: { width: 280, height: 72 } },
    },
    {
      id: 'node-call',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'call',
      content: 'call cheese_count',
      order: '0003',
      source_span: { start_line: 4, end_line: 4 },
      metadata: { target: 'cheese_count' },
      visual: { position: { x: 64, y: 440 }, size: { width: 280, height: 72 } },
    },
    {
      id: 'node-return',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'return',
      content: 'return',
      order: '0004',
      source_span: { start_line: 5, end_line: 5 },
      metadata: {},
      visual: { position: { x: 64, y: 536 }, size: { width: 220, height: 72 } },
    },
    {
      id: 'node-raw-action',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'raw_action',
      content: 'show renpy_mouse proud with dissolve',
      order: '0005',
      source_span: { start_line: 6, end_line: 6 },
      metadata: {},
      visual: { position: { x: 64, y: 632 }, size: { width: 360, height: 72 } },
    },
    {
      id: 'node-raw-block',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'raw_block',
      content: 'python:\n    renpy_mouse_notes.append("cheese")',
      order: '0006',
      source_span: { start_line: 7, end_line: 8 },
      metadata: { raw_block_type: 'python' },
      visual: { position: { x: 64, y: 728 }, size: { width: 400, height: 96 } },
    },
    {
      id: 'node-menu',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'menu',
      content: 'menu:',
      order: '0007',
      source_span: { start_line: 9, end_line: 9 },
      metadata: {},
      visual: { position: { x: 500, y: 136 }, size: { width: 360, height: 220 } },
    },
    {
      id: 'node-menu-prompt',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: 'node-menu',
      type: 'menu_prompt',
      content: '"Where should RenPy hide the crumb?"',
      order: '0007.0000',
      source_span: { start_line: 10, end_line: 10 },
      metadata: { prompt_text: 'Where should RenPy hide the crumb?' },
      visual: { position: { x: 32, y: 72 }, size: { width: 300, height: 72 } },
    },
    {
      id: 'node-menu-choice',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: 'node-menu',
      type: 'menu_choice',
      content: '"Under the quiet cup" if has_quiet_cup:',
      order: '0007.0001',
      source_span: { start_line: 11, end_line: 11 },
      metadata: { choice_text: 'Under the quiet cup', condition: 'has_quiet_cup' },
      visual: { position: { x: 32, y: 168 }, size: { width: 300, height: 72 } },
    },
  ],
  edges: [],
  diagnostics: [],
  source_index: { files: {} },
};

describe('ProjectGraphCollaborationSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends CRDT updates for content edits, applies them on a peer, and persists reloadable snapshots', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const sentUpdates: Uint8Array[] = [];
    const persistedSnapshots: Uint8Array[] = [];
    const peerGraphs: ProjectGraphSnapshot[] = [];

    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => sentUpdates.push(update),
      persistSnapshot: (snapshot) => persistedSnapshots.push(snapshot),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (updatedGraph) => peerGraphs.push(updatedGraph),
    });

    sessionA.editScenarioContent('node-intro', 'r "RenPy Mouse edits through Loro."');
    sessionB.receiveRemoteUpdate(sentUpdates[0]);

    expect(sentUpdates).toHaveLength(1);
    expect(sentUpdates[0].byteLength).toBeGreaterThan(0);
    expect(persistedSnapshots).toHaveLength(1);
    expect(sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );
    expect(peerGraphs.at(-1)?.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );

    const reloadedDoc = importProjectGraphCrdtSnapshot(persistedSnapshots[0], { peerId: '3' });
    expect(projectGraphFromCrdtDoc(reloadedDoc).nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse edits through Loro."',
    );
  });

  it('keeps optimistic text visible while earlier binary updates are acknowledged', () => {
    const optimisticGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'node-intro' ? { ...node, type: 'action', content: '' } : node,
      ),
    };
    const sentUpdates: Uint8Array[] = [];
    const session = new ProjectGraphCollaborationSession(
      createProjectGraphCrdtDoc(optimisticGraph, { peerId: '41' }),
      { sendUpdate: (update) => sentUpdates.push(update) },
    );

    session.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: 0,
      deleteCount: 0,
      insertText: 'привет',
    });
    session.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: 6,
      deleteCount: 0,
      insertText: ' мир',
    });

    expect(session.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe('привет мир');
    expect(session.pendingUpdateCount).toBe(2);

    session.receiveRemoteUpdate(sentUpdates[0]);
    expect(session.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe('привет мир');
    expect(session.pendingUpdateCount).toBe(1);

    session.receiveRemoteUpdate(sentUpdates[1]);
    expect(session.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe('привет мир');
    expect(session.pendingUpdateCount).toBe(0);
  });

  it('applies authoritative continuation updates without queuing them as local pending changes', () => {
    const client = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const authority = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(client), { peerId: '2' });
    const from = getProjectGraphCrdtVersion(authority);
    insertProjectGraphNextScenario(authority, {
      sourceNodeId: 'node-intro',
      action: 'jump',
      targetLabelId: 'label-start',
    });
    const update = exportProjectGraphCrdtUpdate(authority, from);
    const sentUpdates: Uint8Array[] = [];
    const persistedSnapshots: Uint8Array[] = [];
    const session = new ProjectGraphCollaborationSession(client, {
      sendUpdate: (pending) => sentUpdates.push(pending),
      persistSnapshot: (snapshot) => persistedSnapshots.push(snapshot),
    });

    session.applyAuthoritativeUpdate(update);

    expect(session.graph.nodes.some((node) => node.type === 'jump' && node.content === 'jump start')).toBe(true);
    expect(session.pendingUpdateCount).toBe(0);
    expect(sentUpdates).toEqual([]);
    expect(persistedSnapshots).toEqual([]);
  });

  it('resends pending optimistic updates without duplicating visible scenario text', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const sentUpdates: Uint8Array[] = [];
    const session = new ProjectGraphCollaborationSession(doc, {
      sendUpdate: (update) => sentUpdates.push(update.slice()),
    });

    session.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: graph.nodes[0].content.length,
      deleteCount: 0,
      insertText: '\nr "RenPy Mouse queues a relay retry."',
    });
    const firstSend = sentUpdates[0];
    sentUpdates.length = 0;

    session.resendPendingUpdates();

    expect(sentUpdates).toHaveLength(1);
    expect([...sentUpdates[0]]).toEqual([...firstSend]);
    expect(session.graph.nodes.find((node) => node.id === 'node-intro')?.content).toContain(
      'RenPy Mouse queues a relay retry.',
    );
  });

  it('converges edit and drag operations across two clients and persists remote imports too', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updatesFromA: Uint8Array[] = [];
    const updatesFromB: Uint8Array[] = [];
    const snapshotsFromA: Uint8Array[] = [];
    const snapshotsFromB: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updatesFromA.push(update),
      persistSnapshot: (snapshot) => snapshotsFromA.push(snapshot),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      sendUpdate: (update) => updatesFromB.push(update),
      persistSnapshot: (snapshot) => snapshotsFromB.push(snapshot),
    });

    sessionA.editScenarioContent('node-intro', 'r "Client A changes the line."');
    sessionB.receiveRemoteUpdate(updatesFromA[0]);
    sessionB.moveEntity('label-start', { x: 120, y: 96 });
    sessionA.receiveRemoteUpdate(updatesFromB[0]);

    expect(sessionA.graph).toEqual(sessionB.graph);
    expect(sessionA.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Client A changes the line."',
    );
    expect(sessionA.graph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 120,
      y: 96,
    });
    expect(snapshotsFromA.length).toBeGreaterThanOrEqual(2);
    expect(snapshotsFromB.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves both Action editor drafts when one writer continues after receiving the other writer update', () => {
    const sharedActionContent = [
      '# RenPy Mouse shares a cheese map.',
      'r "The crumb trail is ready."',
    ].join('\n');
    const collaborativeGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'node-intro'
          ? { ...node, type: 'action', content: sharedActionContent }
          : node,
      ),
    };
    const clientA = createProjectGraphCrdtDoc(collaborativeGraph, { peerId: '31' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '32' });
    const updatesFromA: Uint8Array[] = [];
    const updatesFromB: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updatesFromA.push(update),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      sendUpdate: (update) => updatesFromB.push(update),
    });

    // Both fullscreen Action editors started from the same projected content.
    const staleDraftA = `${sharedActionContent}\nr "A marks the attic."`;
    const staleDraftB = `${sharedActionContent}\nr "B marks the cellar."`;
    sessionA.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: sharedActionContent.length,
      deleteCount: 0,
      insertText: '\nr "A marks the attic."',
    });
    sessionB.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: sharedActionContent.length,
      deleteCount: 0,
      insertText: '\nr "B marks the cellar."',
    });

    sessionA.receiveRemoteUpdate(updatesFromB[0]);
    sessionB.receiveRemoteUpdate(updatesFromA[0]);

    const initiallyMergedContentA = sessionA.graph.nodes.find((node) => node.id === 'node-intro')?.content ?? '';
    const initiallyMergedContentB = sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content ?? '';
    expect(initiallyMergedContentA).toBe(initiallyMergedContentB);
    expect(initiallyMergedContentA).toContain('A marks the attic.');
    expect(initiallyMergedContentA).toContain('B marks the cellar.');

    // The open editor keeps its local full-string draft after the remote graph update,
    // then its next debounce writes that stale string back into the merged LoroText.
    sessionA.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: staleDraftA.length,
      deleteCount: 0,
      insertText: '\nr "A keeps typing."',
    });
    sessionB.receiveRemoteUpdate(updatesFromA[1]);

    const contentA = sessionA.graph.nodes.find((node) => node.id === 'node-intro')?.content ?? '';
    const contentB = sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content ?? '';
    expect(contentA).toBe(contentB);
    expect(contentA).toContain('A marks the attic.');
    expect(contentA).toContain('A keeps typing.');
    expect(contentA).toContain('B marks the cellar.');
  });

  it('projects CRDT content and drag changes into the React Flow canvas model', () => {
    const linearGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: graph.nodes.filter((node) => !node.id.startsWith('node-menu')),
    };
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(linearGraph, { peerId: '1' }));

    session.editScenarioContent('node-intro', 'r "Projection reads the edited CRDT line."');
    session.moveEntity('node-intro', { x: 180, y: 220 });

    const projection = projectGraphToReactFlow(session.graph);
    const projectedNode = projection.nodes.find((node) => node.id === 'node-intro');

    expect(projectedNode).toMatchObject({
      type: 'scenarioNode',
      position: { x: 180, y: 220 },
      data: {
        kind: 'scenario',
        content: 'r "Projection reads the edited CRDT line."',
      },
    });
  });

  it('broadcasts Action editor Next node insertions as CRDT graph updates', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const sentUpdates: Uint8Array[] = [];
    const peerGraphs: ProjectGraphSnapshot[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => sentUpdates.push(update),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (updatedGraph) => peerGraphs.push(updatedGraph),
    });

    const result = sessionA.insertNextScenario({
      action: 'jump',
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-start',
    });
    sessionB.receiveRemoteUpdate(sentUpdates[0]);

    const insertedNode = sessionB.graph.nodes.find((node) => node.id === result.selectedNodeId);
    expect(insertedNode).toMatchObject({
      content: 'jump start',
      metadata: { target: 'start' },
      parent_node_id: null,
      type: 'jump',
    });
    expect(sessionB.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'jump',
          source_node_id: insertedNode?.id,
          target_node_id: 'label-start-node',
          metadata: { target: 'start' },
        }),
      ]),
    );
    expect(sessionB.graph.nodes.filter((node) => node.label_id === 'label-start' && node.parent_node_id === null).map((node) => node.id)).toEqual([
      'node-intro',
      insertedNode?.id,
      'node-comment',
      'node-jump',
      'node-call',
      'node-return',
      'node-raw-action',
      'node-raw-block',
      'node-menu',
    ]);
    expect(peerGraphs.at(-1)?.nodes.find((node) => node.id === result.selectedNodeId)?.content).toBe('jump start');
  });

  it('converges customized conditional leaves and stable existing IDs on a peer', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '21' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '22' });
    const updates: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, { sendUpdate: (update) => updates.push(update) });
    const sessionB = new ProjectGraphCollaborationSession(clientB);
    const existingIds = sessionA.graph.nodes.map((node) => node.id);

    const result = sessionA.insertNextScenario({
      action: 'conditional',
      sourceNodeId: 'node-intro',
      conditionalDraft: {
        mode: 'structured', raw: '',
        ifBranch: { condition: 'hungry', continuation: { kind: 'action', comment: 'Add cheese' } },
        elifBranches: [{ id: 'elif-a', condition: 'tired', continuation: { kind: 'jump', targetLabelId: 'label-start' } }],
        elseBranch: null,
      },
    });
    expect(updates).toHaveLength(1);
    sessionB.receiveRemoteUpdate(updates[0]);

    expect(sessionB.graph).toEqual(sessionA.graph);
    expect(result.createdNodeIds.map((id) => sessionB.graph.nodes.find((node) => node.id === id)?.type)).toEqual([
      'if', 'action', 'elif', 'jump',
    ]);
    expect(sessionB.graph.nodes.find((node) => node.id === result.createdNodeIds[1])?.content).toBe('# Add cheese\npass');
    for (const id of existingIds) expect(sessionB.graph.nodes.some((node) => node.id === id)).toBe(true);
  });

  it('converges and reloads every Action editor Next scaffold through collaboration snapshots', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '101' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), {
      peerId: '102',
    });
    const sentUpdates: Uint8Array[] = [];
    const persistedSnapshots: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      persistSnapshot: (snapshot) => persistedSnapshots.push(snapshot),
      sendUpdate: (update) => sentUpdates.push(update),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB);

    const menu = sessionA.insertNextScenario({ action: 'menu', sourceNodeId: 'node-intro' });
    sessionB.receiveRemoteUpdate(sentUpdates.at(-1)!);
    const conditional = sessionA.insertNextScenario({ action: 'conditional', sourceNodeId: 'node-intro' });
    sessionB.receiveRemoteUpdate(sentUpdates.at(-1)!);
    const jump = sessionA.insertNextScenario({
      action: 'jump',
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-start',
    });
    sessionB.receiveRemoteUpdate(sentUpdates.at(-1)!);
    const call = sessionA.insertNextScenario({
      action: 'call',
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-start',
    });
    sessionB.receiveRemoteUpdate(sentUpdates.at(-1)!);
    const returnResult = sessionA.insertNextScenario({ action: 'return', sourceNodeId: 'node-intro' });
    sessionB.receiveRemoteUpdate(sentUpdates.at(-1)!);

    expect(sentUpdates).toHaveLength(5);
    expect(sentUpdates.every((update) => update.byteLength > 0)).toBe(true);
    expect(persistedSnapshots).toHaveLength(5);

    const peerGraph = sessionB.graph;
    expect(menu.createdNodeIds.map((id) => peerGraph.nodes.find((node) => node.id === id)?.type)).toEqual([
      'menu',
      'menu_prompt',
      'menu_choice',
      'action',
      'menu_choice',
      'action',
    ]);
    expect(conditional.createdNodeIds.map((id) => peerGraph.nodes.find((node) => node.id === id)?.type)).toEqual([
      'if',
      'action',
      'elif',
      'action',
      'else',
      'action',
    ]);
    expect(peerGraph.nodes.find((node) => node.id === jump.selectedNodeId)).toMatchObject({
      content: 'jump start',
      type: 'jump',
    });
    expect(peerGraph.nodes.find((node) => node.id === call.selectedNodeId)).toMatchObject({
      content: 'call start',
      type: 'call',
    });
    expect(peerGraph.nodes.find((node) => node.id === returnResult.selectedNodeId)).toMatchObject({
      content: 'return',
      type: 'return',
    });
    expect(peerGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'jump',
          source_node_id: jump.selectedNodeId,
          target_node_id: 'label-start-node',
        }),
        expect.objectContaining({
          kind: 'call',
          source_node_id: call.selectedNodeId,
          target_node_id: 'label-start-node',
        }),
      ]),
    );
    expect(peerGraph.edges.some((edge) => edge.source_node_id === returnResult.selectedNodeId)).toBe(false);

    const reloaded = projectGraphFromCrdtDoc(
      importProjectGraphCrdtSnapshot(persistedSnapshots.at(-1)!, { peerId: '103' }),
    );
    for (const result of [menu, conditional, jump, call, returnResult]) {
      expect(result.createdNodeIds.every((id) => reloaded.nodes.some((node) => node.id === id))).toBe(true);
    }
    expect(reloaded.edges).toEqual(peerGraph.edges);
  });

  it('persists grouped drag rebases without marking every rebased scenario as manually laid out', () => {
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }));

    session.moveEntities([
      { entityId: 'label-start', position: { x: 40, y: 40 }, manual: true },
      { entityId: 'node-intro', position: { x: 160, y: 220 }, manual: false },
      { entityId: 'node-comment', position: { x: 200, y: 320 }, manual: true },
    ]);

    const movedGraph = session.graph;
    expect(movedGraph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({ x: 40, y: 40 });
    expect(movedGraph.nodes.find((node) => node.id === 'node-intro')?.visual.position).toEqual({ x: 160, y: 220 });
    expect(movedGraph.nodes.find((node) => node.id === 'node-intro')?.metadata._manual_position).toBeUndefined();
    expect(movedGraph.nodes.find((node) => node.id === 'node-comment')?.metadata._manual_position).toBe(true);
  });

  it('edits every MVP scenario node type through content and metadata operations without editor metadata leakage', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updates: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updates.push(update),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB);
    const expectedContentById = new Map([
      ['node-intro', 'r "RenPy Mouse edits dialogue in sprint ten."'],
      ['node-comment', '# RenPy Mouse keeps comments editable.'],
      ['node-jump', 'jump crumb_vault'],
      ['node-call', 'call cheese_count(3)'],
      ['node-return', 'return crumb_total'],
      ['node-raw-action', 'scene kitchen_floor with fade'],
      ['node-raw-block', 'python:\n    renpy_mouse_notes.append("typed editor")'],
      ['node-menu-prompt', '"Which crumb gets promoted?"'],
      ['node-menu-choice', '"The brave crumb" if has_brave_crumb:'],
    ]);

    for (const [nodeId, content] of expectedContentById) {
      sessionA.editScenarioContent(nodeId, content);
    }
    sessionA.editScenarioMetadata('node-menu-choice', {
      choice_text: 'The brave crumb',
      condition: 'has_brave_crumb',
    });

    for (const update of updates) {
      sessionB.receiveRemoteUpdate(update);
    }

    const graphB = sessionB.graph;
    for (const [nodeId, content] of expectedContentById) {
      expect(graphB.nodes.find((node) => node.id === nodeId)?.content).toBe(content);
    }
    expect(graphB.nodes.find((node) => node.id === 'node-menu-choice')?.metadata).toEqual({
      choice_text: 'The brave crumb',
      condition: 'has_brave_crumb',
    });
    expect(graphB.nodes.flatMap((node) => Object.keys(node.metadata))).not.toContain('editor_state');
    expect(graphB.nodes.flatMap((node) => Object.keys(node.metadata))).not.toContain('ui_selected');
  });

  it('debounces snapshot persistence while keeping the final content and position reloadable', async () => {
    vi.useFakeTimers();
    const persistedSnapshots: Uint8Array[] = [];
    const persistenceStates: string[] = [];
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }), {
      persistDebounceMs: 50,
      persistSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
      },
      onPersistenceStatusChange: (status) => persistenceStates.push(status),
    });

    session.editScenarioContent('node-intro', 'r "First fast edit."');
    session.editScenarioContent('node-intro', 'r "Final debounced edit."');
    session.moveEntity('label-start', { x: 188, y: 144 });

    expect(persistedSnapshots).toHaveLength(0);
    expect(persistenceStates.at(-1)).toBe('saving');

    await vi.advanceTimersByTimeAsync(49);
    expect(persistedSnapshots).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(persistedSnapshots).toHaveLength(1);
    expect(persistenceStates.at(-1)).toBe('saved');

    const reloaded = projectGraphFromCrdtDoc(importProjectGraphCrdtSnapshot(persistedSnapshots[0], { peerId: '3' }));
    expect(reloaded.nodes.find((node) => node.id === 'node-intro')?.content).toBe('r "Final debounced edit."');
    expect(reloaded.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 188,
      y: 144,
    });
  });

  it('flushes a pending debounced snapshot when the collaboration session is disposed', async () => {
    vi.useFakeTimers();
    const persistedSnapshots: Uint8Array[] = [];
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }), {
      persistDebounceMs: 5_000,
      persistSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
      },
    });

    session.editScenarioContent('node-intro', 'r "RenPy Mouse saves before leaving the canvas."');
    session.dispose();
    await Promise.resolve();

    expect(persistedSnapshots).toHaveLength(1);
    const reloaded = projectGraphFromCrdtDoc(
      importProjectGraphCrdtSnapshot(persistedSnapshots[0], { peerId: '3' }),
    );
    expect(reloaded.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "RenPy Mouse saves before leaving the canvas."',
    );
  });

  it('persists manual layout for files, labels, label starts, and scenario nodes after collaboration and reload', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updates: Uint8Array[] = [];
    const persistedSnapshots: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updates.push(update),
      persistSnapshot: (snapshot) => persistedSnapshots.push(snapshot),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB);

    sessionA.moveEntity('file-day-1', { x: 320, y: 180 });
    sessionA.moveEntity('label-start', { x: 72, y: 84 });
    sessionA.moveEntity('label-start-node', { x: 44, y: 52 });
    sessionA.moveEntity('node-comment', { x: 96, y: 288 });

    for (const update of updates) {
      sessionB.receiveRemoteUpdate(update);
    }

    const reloadedGraph = projectGraphFromCrdtDoc(
      importProjectGraphCrdtSnapshot(persistedSnapshots.at(-1)!, { peerId: '3' }),
    );
    for (const checkedGraph of [sessionB.graph, reloadedGraph]) {
      expect(checkedGraph.files.find((file) => file.id === 'file-day-1')?.visual.position).toEqual({
        x: 320,
        y: 180,
      });
      expect(checkedGraph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
        x: 72,
        y: 84,
      });
      expect(checkedGraph.label_starts.find((start) => start.id === 'label-start-node')?.visual.position).toEqual({
        x: 44,
        y: 52,
      });
      expect(checkedGraph.nodes.find((node) => node.id === 'node-comment')?.visual.position).toEqual({
        x: 96,
        y: 288,
      });
    }
  });

  it('updates search and problems from the current CRDT graph after live content and diagnostic changes', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updates: Uint8Array[] = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updates.push(update),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB);

    expect(searchProjectGraph(sessionB.graph, 'moon crumb')).toEqual([]);

    sessionA.editScenarioContent('node-intro', 'r "RenPy Mouse finds the moon crumb."');
    sessionB.receiveRemoteUpdate(updates.shift()!);

    expect(searchProjectGraph(sessionB.graph, 'moon crumb')).toMatchObject([
      {
        nodeId: 'node-intro',
        content: 'r "RenPy Mouse finds the moon crumb."',
      },
    ]);

    sessionA.replaceDiagnostics([
      {
        id: 'diagnostic-live-unresolved',
        code: 'unresolved_target',
        severity: 'warning',
        message: 'RenPy Mouse has not named this moon door yet.',
        blocking: false,
        file_id: 'file-day-1',
        label_id: 'label-start',
        node_id: 'node-jump',
        source_span: { start_line: 3, end_line: 3 },
        metadata: { target: 'moon_door' },
      },
    ]);
    sessionB.receiveRemoteUpdate(updates.shift()!);

    expect(projectGraphDiagnosticsToProblems(sessionB.graph)).toMatchObject([
      {
        id: 'diagnostic-live-unresolved',
        code: 'unresolved_target',
        nodeId: 'node-jump',
        severity: 'warning',
      },
    ]);
  });

  it('reports persistence errors after a debounced save fails', async () => {
    vi.useFakeTimers();
    const persistenceStates: string[] = [];
    const session = new ProjectGraphCollaborationSession(createProjectGraphCrdtDoc(graph, { peerId: '1' }), {
      persistDebounceMs: 20,
      persistSnapshot: async () => {
        throw new Error('snapshot write failed');
      },
      onPersistenceStatusChange: (status) => persistenceStates.push(status),
    });

    session.editScenarioContent('node-intro', 'r "This save will fail."');
    await vi.advanceTimersByTimeAsync(20);

    expect(persistenceStates).toEqual(['saving', 'error']);
  });

  it('lets a disconnected client recover the latest graph from the debounced snapshot without duplicate entities', async () => {
    vi.useFakeTimers();
    const persistedSnapshots: Uint8Array[] = [];
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      persistDebounceMs: 25,
      persistSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
      },
    });

    sessionA.editScenarioContent('node-intro', 'r "Client B catches up after reload."');
    sessionA.moveEntity('label-start', { x: 222, y: 166 });
    await vi.advanceTimersByTimeAsync(25);

    const reconnectedClientB = importProjectGraphCrdtSnapshot(persistedSnapshots.at(-1)!, { peerId: '2' });
    const reconnectedGraph = projectGraphFromCrdtDoc(reconnectedClientB);

    expect(reconnectedGraph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Client B catches up after reload."',
    );
    expect(reconnectedGraph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 222,
      y: 166,
    });
    expect(new Set(reconnectedGraph.files.map((file) => file.id))).toHaveProperty('size', graph.files.length);
    expect(new Set(reconnectedGraph.labels.map((label) => label.id))).toHaveProperty('size', graph.labels.length);
    expect(new Set(reconnectedGraph.label_starts.map((start) => start.id))).toHaveProperty(
      'size',
      graph.label_starts.length,
    );
    expect(new Set(reconnectedGraph.nodes.map((node) => node.id))).toHaveProperty('size', graph.nodes.length);
  });
});

describe('ProjectGraph collaboration WebSocket helpers', () => {
  it('drops cursors for users who are no longer present in the project room', () => {
    expect(
      retainActiveProjectGraphRemoteCursors(
        {
          online: { userId: 'online', username: 'Online Mouse', position: { x: 1, y: 2 } },
          gone: { userId: 'gone', username: 'Gone Mouse', position: { x: 3, y: 4 } },
        },
        [{ id: 'online', username: 'Online Mouse' }],
      ),
    ).toEqual({
      online: { userId: 'online', username: 'Online Mouse', position: { x: 1, y: 2 } },
    });
  });

  it('builds the project WebSocket URL without embedding bearer tokens in the query string', () => {
    expect(toProjectGraphWebSocketUrl('https://editor.example.test/api', 'project 1')).toBe(
      'wss://editor.example.test/api/ws/project/project%201',
    );
  });

  it('sends the collaboration bearer token as an explicit auth frame after socket open', () => {
    const socket = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-auth',
      authToken: 'session-token',
      WebSocketImpl: FakeWebSocket,
      onUpdate: () => undefined,
    });
    const instance = FakeWebSocket.instances.at(-1)!;

    instance.emitOpen();

    expect(instance.sent[0]).toBe(JSON.stringify({ type: 'auth', token: 'session-token' }));
    socket.close();
  });

  it('receives ArrayBuffer binary messages and sends Uint8Array payloads without JSON wrapping', () => {
    const received: Uint8Array[] = [];
    const presenceUsers: unknown[] = [];
    const socket = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-7',
      WebSocketImpl: FakeWebSocket,
      onUpdate: (update) => received.push(update),
      onPresenceUsers: (users) => presenceUsers.push(users),
    });
    const instance = FakeWebSocket.instances.at(-1)!;
    const outbound = new Uint8Array([9, 8, 7]);

    instance.emitMessage(new Uint8Array([1, 2, 3]).buffer);
    instance.emitMessage('{"type":"active_users","users":[{"id":"u1","username":"Mira","connected_at":"now"}]}');
    socket.sendBinary(outbound);

    expect(instance.binaryType).toBe('arraybuffer');
    expect(received).toHaveLength(1);
    expect([...received[0]]).toEqual([1, 2, 3]);
    expect(presenceUsers).toEqual([[{ id: 'u1', username: 'Mira', connectedAt: 'now' }]]);
    expect(instance.sent).toEqual([outbound]);
  });

  it('notifies callers when the project socket opens so pending CRDT updates can be resent', () => {
    const openEvents: string[] = [];
    const socket = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9-open',
      WebSocketImpl: FakeWebSocket,
      onUpdate: () => undefined,
      onOpen: () => openEvents.push('open'),
    });
    const instance = FakeWebSocket.instances.at(-1)!;
    const outbound = new Uint8Array([4, 5, 6]);

    instance.readyState = 0;
    socket.sendBinary(outbound);
    instance.emitOpen();
    socket.sendBinary(outbound);

    expect(openEvents).toEqual(['open']);
    expect(instance.sent).toEqual([outbound]);
  });

  it('resends session pending CRDT updates when a delayed project socket opens', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    let socket: ProjectGraphSocketHandle | null = null;
    const session = new ProjectGraphCollaborationSession(doc, {
      sendUpdate: (update) => socket?.sendBinary(update),
    });
    socket = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9-pending-open',
      WebSocketImpl: FakeWebSocket,
      onUpdate: (update) => session.receiveRemoteUpdate(update),
      onOpen: () => session.resendPendingUpdates(),
    });
    const instance = FakeWebSocket.instances.at(-1)!;
    instance.readyState = 0;

    session.applyScenarioTextSplice({
      nodeId: 'node-intro',
      index: graph.nodes[0].content.length,
      deleteCount: 0,
      insertText: '\nr "RenPy Mouse sends after open."',
    });
    expect(instance.sent).toEqual([]);

    instance.emitOpen();

    expect(instance.sent).toHaveLength(1);
    expect(session.pendingUpdateCount).toBe(1);
    expect(session.graph.nodes.find((node) => node.id === 'node-intro')?.content).toContain(
      'RenPy Mouse sends after open.',
    );
  });

  it('normalizes typed remote activity without treating it as a CRDT update', () => {
    const received: Uint8Array[] = [];
    const cursors: unknown[] = [];
    connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-11-presence',
      WebSocketImpl: FakeWebSocket,
      onUpdate: (update) => received.push(update),
      onRemoteCursor: (cursor) => cursors.push(cursor),
    });
    const instance = FakeWebSocket.instances.at(-1)!;

    instance.emitMessage(
      JSON.stringify({
        type: 'cursor_update',
        userId: 'u2',
        userName: 'Alex',
        x: 120,
        y: 240,
        activity: 'editing_action',
        targetNodeId: 'node-intro',
      }),
    );

    expect(received).toEqual([]);
    expect(cursors).toEqual([
      {
        userId: 'u2',
        username: 'Alex',
        activity: 'editing_action',
        targetNodeId: 'node-intro',
        position: { x: 120, y: 240 },
      },
    ]);
  });

  it('normalizes legacy canvas activity and rejects unsupported activity labels', () => {
    const cursors: unknown[] = [];
    connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-11-presence-legacy',
      WebSocketImpl: FakeWebSocket,
      onUpdate: () => undefined,
      onRemoteCursor: (cursor) => cursors.push(cursor),
    });
    const instance = FakeWebSocket.instances.at(-1)!;

    instance.emitMessage(JSON.stringify({
      type: 'cursor_update',
      userId: 'legacy-user',
      userName: 'Legacy Mouse',
      x: 12,
      y: 24,
      activity: 'viewing canvas',
    }));
    instance.emitMessage(JSON.stringify({
      type: 'cursor_update',
      userId: 'unsafe-user',
      userName: 'Unsafe Mouse',
      x: 36,
      y: 48,
      activity: '<img src=x onerror=alert(1)>',
    }));

    expect(cursors).toEqual([
      {
        userId: 'legacy-user',
        username: 'Legacy Mouse',
        activity: 'viewing_canvas',
        position: { x: 12, y: 24 },
      },
      {
        userId: 'unsafe-user',
        username: 'Unsafe Mouse',
        position: { x: 36, y: 48 },
      },
    ]);
  });

  it('relays content and drag CRDT updates between two browser-like project clients', () => {
    RelayWebSocket.reset();
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const peerGraphs: ProjectGraphSnapshot[] = [];

    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (updatedGraph) => peerGraphs.push(updatedGraph),
    });
    const socketB = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9',
      WebSocketImpl: RelayWebSocket,
      onUpdate: (update) => sessionB.receiveRemoteUpdate(update),
    });

    const socketA = connectProjectGraphCollaborationSocket({
      url: 'ws://example.test/ws/project/sprint-9',
      WebSocketImpl: RelayWebSocket,
      onUpdate: () => undefined,
    });
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => socketA.sendBinary(update),
    });

    sessionA.editScenarioContent('node-intro', 'r "Browser A edits and Browser B sees it."');
    sessionA.moveEntity('label-start', { x: 144, y: 108 });
    RelayWebSocket.emitJson('ws://example.test/ws/project/sprint-9', '{"type":"active_users","users":[]}');

    expect(sessionB.graph.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Browser A edits and Browser B sees it."',
    );
    expect(sessionB.graph.labels.find((label) => label.id === 'label-start')?.visual.position).toEqual({
      x: 144,
      y: 108,
    });
    expect(peerGraphs).toHaveLength(2);

    socketA.close();
    socketB.close();
  });

  it('publishes dirty-ID incremental read-model evidence for local and imported content edits', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const updates: Uint8Array[] = [];
    const readUpdates: Array<{ mode: string; by: string[]; dirtyEntityIds: string[]; fallbackReason: string | null }> = [];
    const sessionA = new ProjectGraphCollaborationSession(clientA, {
      sendUpdate: (update) => updates.push(update),
      onGraphChange: (_updatedGraph, readUpdate) => readUpdates.push(readUpdate),
    });
    const sessionB = new ProjectGraphCollaborationSession(clientB, {
      onGraphChange: (_updatedGraph, readUpdate) => readUpdates.push(readUpdate),
    });

    sessionA.editScenarioContent('node-intro', 'r "RenPy Mouse edits only one dirty ID."');
    sessionB.receiveRemoteUpdate(updates[0]);

    expect(readUpdates).toEqual([
      expect.objectContaining({
        mode: 'incremental',
        by: ['local'],
        dirtyEntityIds: ['node-intro'],
        fallbackReason: null,
      }),
      expect.objectContaining({
        mode: 'incremental',
        by: ['import'],
        dirtyEntityIds: ['node-intro'],
        fallbackReason: null,
      }),
    ]);
    expect(sessionA.readModelStats).toMatchObject({
      fullMaterializationCount: 1,
      incrementalUpdateCount: 1,
      fullFallbackCount: 0,
    });
    expect(sessionB.graph).toEqual(projectGraphFromCrdtDoc(clientB));
    sessionA.dispose();
    sessionB.dispose();
  });

  it('keeps a feature-disabled full-materialization A/B path with an explicit reason', () => {
    const readUpdates: Array<{ mode: string; fallbackReason: string | null }> = [];
    const session = new ProjectGraphCollaborationSession(
      createProjectGraphCrdtDoc(graph, { peerId: '1' }),
      {
        incrementalReadModel: false,
        onGraphChange: (_updatedGraph, readUpdate) => readUpdates.push(readUpdate),
      },
    );

    session.editScenarioContent('node-intro', 'r "RenPy Mouse checks the full-read oracle."');

    expect(readUpdates).toEqual([
      expect.objectContaining({ mode: 'full', fallbackReason: 'feature-disabled' }),
    ]);
    expect(session.readModelStats).toMatchObject({
      fullMaterializationCount: 2,
      fullFallbackCount: 1,
      incrementalUpdateCount: 0,
    });
    session.dispose();
  });
});

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  binaryType: BinaryType = 'blob';
  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    for (const listener of this.listeners.get('close') ?? []) {
      listener({} as MessageEvent);
    }
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    for (const listener of this.listeners.get('open') ?? []) {
      listener({} as MessageEvent);
    }
  }

  emitMessage(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}

class RelayWebSocket {
  static readonly OPEN = 1;
  private static readonly rooms = new Map<string, Set<RelayWebSocket>>();
  binaryType: BinaryType = 'blob';
  readyState = RelayWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(readonly url: string) {
    RelayWebSocket.rooms.set(url, new Set([...(RelayWebSocket.rooms.get(url) ?? []), this]));
  }

  static reset(): void {
    RelayWebSocket.rooms.clear();
  }

  static emitJson(url: string, data: string): void {
    for (const socket of RelayWebSocket.rooms.get(url) ?? []) {
      socket.emitMessage(data);
    }
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: Uint8Array): void {
    for (const socket of RelayWebSocket.rooms.get(this.url) ?? []) {
      if (socket !== this) {
        socket.emitMessage(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    }
  }

  close(): void {
    this.readyState = 3;
    RelayWebSocket.rooms.get(this.url)?.delete(this);
  }

  private emitMessage(data: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}
