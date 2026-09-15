import { describe, expect, it } from 'vitest';
import {
  createProjectGraphCrdtDoc,
  createProjectGraphStructure,
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtSnapshot,
  importProjectGraphCrdtUpdate,
  insertProjectGraphNextScenario,
  moveProjectGraphEntity,
  projectGraphFromCrdtDoc,
  reparentScenarioNode,
  spliceScenarioNodeContent,
  updateScenarioNodeContent,
  updateScenarioNodeMetadata,
  updateSourceFileContent,
} from '../projectGraphCrdt';
import { projectGraphToReactFlow, type ProjectGraphSnapshot } from '../projectGraphProjection';

const graph: ProjectGraphSnapshot = {
  project_id: 'crdt-project',
  files: [
    {
      id: 'file-day-1',
      path: 'mouse_day_1.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 640 } },
    },
    {
      id: 'file-day-2',
      path: 'mouse_day_2.rpy',
      order: '0001',
      visual: { position: { x: 920, y: 0 }, size: { width: 800, height: 640 } },
      metadata: { code_only: true, code_only_reason: 'no_labels' },
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
      label_start_node_id: 'start-node-start',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 460 } },
    },
    {
      id: 'label-shared-nook',
      file_id: 'file-day-1',
      parent_label_id: 'label-start',
      name: '.shared_nook',
      qualified_name: 'start.shared_nook',
      scope: 'local',
      label_start_node_id: 'start-node-shared-nook',
      source_span: { start_line: 12, end_line: 12 },
      visual: { position: { x: 360, y: 240 }, size: { width: 300, height: 180 } },
    },
    {
      id: 'label-day-two',
      file_id: 'file-day-2',
      parent_label_id: null,
      name: 'day_two',
      qualified_name: 'day_two',
      scope: 'global',
      label_start_node_id: 'start-node-day-two',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 360 } },
    },
  ],
  label_starts: [
    {
      id: 'start-node-start',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
    {
      id: 'start-node-shared-nook',
      file_id: 'file-day-1',
      label_id: 'label-shared-nook',
      qualified_name: 'start.shared_nook',
      content: 'label .shared_nook:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
    {
      id: 'start-node-day-two',
      file_id: 'file-day-2',
      label_id: 'label-day-two',
      qualified_name: 'day_two',
      content: 'label day_two:',
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
      content: 'r "RenPy Mouse stores the graph in a CRDT pantry."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 64, y: 136 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'node-choice',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'menu_choice',
      content: '"Compare crumbs from both clients"',
      order: '0001',
      source_span: { start_line: 3, end_line: 3 },
      metadata: { condition: 'has_cheese_compass' },
      visual: { position: { x: 64, y: 248 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'node-call-nook',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: 'node-choice',
      type: 'call',
      content: 'call .shared_nook',
      order: '0001.0000',
      source_span: { start_line: 4, end_line: 4 },
      metadata: { target: '.shared_nook' },
      visual: { position: { x: 32, y: 72 }, size: { width: 220, height: 72 } },
    },
    {
      id: 'node-day-two',
      file_id: 'file-day-2',
      label_id: 'label-day-two',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "Day two receives binary updates."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 64, y: 136 }, size: { width: 320, height: 88 } },
    },
  ],
  edges: [
    {
      id: 'edge-call-nook',
      source_node_id: 'node-call-nook',
      target_node_id: 'start-node-shared-nook',
      kind: 'call',
      metadata: { target: '.shared_nook' },
    },
  ],
  diagnostics: [
    {
      id: 'diagnostic-dynamic-target',
      code: 'dynamic_target',
      severity: 'info',
      message: 'Dynamic jump is preserved as a non-blocking problem.',
      blocking: false,
      file_id: 'file-day-1',
      label_id: 'label-start',
      node_id: 'node-choice',
      source_span: { start_line: 5, end_line: 5 },
      metadata: { target: 'expression' },
    },
  ],
  source_index: { files: { 'mouse_day_1.rpy': 'file-day-1', 'mouse_day_2.rpy': 'file-day-2' } },
};

const createDeterministicIdFactory = () => {
  let index = 0;
  return (prefix: string) => `${prefix}-${String(index++).padStart(2, '0')}`;
};

describe('ProjectGraph Loro CRDT adapter', () => {
  it('stores ProjectGraph in one LoroDoc snapshot and restores semantic identity', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const snapshot = exportProjectGraphCrdtSnapshot(doc);

    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.byteLength).toBeGreaterThan(0);

    const restoredDoc = importProjectGraphCrdtSnapshot(snapshot, { peerId: '2' });
    expect(projectGraphFromCrdtDoc(restoredDoc)).toEqual(graph);
  });

  it('migrates a legacy snapshot from stored scenario order to native tree order without changing IDs', () => {
    const legacyDoc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const entityIndex = legacyDoc.getMap('project_graph_entity_tree_ids');
    const tree = legacyDoc.getTree('project_graph_tree');
    const introNode = tree.getNodeByID(String(entityIndex.get('node-intro')) as `${number}@${number}`)!;
    const choiceNode = tree.getNodeByID(String(entityIndex.get('node-choice')) as `${number}@${number}`)!;
    introNode.moveAfter(choiceNode);
    legacyDoc.getMap('project_graph_edges').clear();
    legacyDoc.getMap('project_graph_meta').set('edges', graph.edges);
    legacyDoc.getMap('project_graph_meta').set('schema_version', 1);
    legacyDoc.commit({ origin: 'legacy-test-fixture', message: 'Create legacy reversed tree order' });

    const legacyVersion = getProjectGraphCrdtVersion(legacyDoc);
    const legacySnapshot = exportProjectGraphCrdtSnapshot(legacyDoc);
    const migratedDoc = importProjectGraphCrdtSnapshot(legacySnapshot, { peerId: '2' });
    const migratedGraph = projectGraphFromCrdtDoc(migratedDoc);

    expect(migratedDoc.getMap('project_graph_meta').get('schema_version')).toBe(2);
    expect(migratedGraph.nodes.filter((node) => node.label_id === 'label-start' && node.parent_node_id === null).map((node) => node.id)).toEqual([
      'node-intro',
      'node-choice',
    ]);
    expect(migratedGraph.nodes.map((node) => node.id).sort()).toEqual(graph.nodes.map((node) => node.id).sort());
    expect(migratedGraph.edges).toEqual(graph.edges);
    expect(migratedDoc.getMap('project_graph_edges').get('edge-call-nook')).toEqual(graph.edges[0]);

    const reloadedDoc = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(migratedDoc), { peerId: '3' });
    expect(projectGraphFromCrdtDoc(reloadedDoc)).toEqual(migratedGraph);

    const concurrentlyMigratedDoc = importProjectGraphCrdtSnapshot(legacySnapshot, { peerId: '4' });
    const migrationUpdateA = exportProjectGraphCrdtUpdate(migratedDoc, legacyVersion);
    const migrationUpdateB = exportProjectGraphCrdtUpdate(concurrentlyMigratedDoc, legacyVersion);
    importProjectGraphCrdtUpdate(migratedDoc, migrationUpdateB);
    importProjectGraphCrdtUpdate(concurrentlyMigratedDoc, migrationUpdateA);
    expect(projectGraphFromCrdtDoc(concurrentlyMigratedDoc)).toEqual(projectGraphFromCrdtDoc(migratedDoc));
  });

  it('updates source text for code-only files through the CRDT snapshot', () => {
    const codeOnlyGraph: ProjectGraphSnapshot = {
      ...graph,
      source_index: {
        files: {
          'mouse_day_1.rpy': 'file-day-1',
          'mouse_day_2.rpy': 'file-day-2',
          'file-day-2': { content: 'define config.mouse_menu = True\n' },
        },
      },
    };
    const doc = createProjectGraphCrdtDoc(codeOnlyGraph, { peerId: '1' });

    updateSourceFileContent(doc, 'file-day-2', 'define config.mouse_menu = False\n');
    const restoredDoc = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(doc), { peerId: '2' });
    const restoredGraph = projectGraphFromCrdtDoc(restoredDoc);

    expect(restoredGraph.source_index).toMatchObject({
      files: {
        'file-day-2': { content: 'define config.mouse_menu = False\n' },
      },
    });
    expect(restoredGraph.files.find((file) => file.id === 'file-day-2')?.metadata).toEqual({
      code_only: true,
      code_only_reason: 'no_labels',
    });
  });

  it('converges after independent content, metadata, and position edits are exchanged as binary updates', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);

    updateScenarioNodeContent(clientA, 'node-intro', 'r "Client A sharpens the cheese pencil."');
    moveProjectGraphEntity(clientB, 'label-shared-nook', { x: 420, y: 280 });
    updateScenarioNodeMetadata(clientB, 'node-choice', {
      condition: 'has_cheese_compass and crumbs_are_aligned',
    });

    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);

    importProjectGraphCrdtUpdate(clientA, updateB);
    importProjectGraphCrdtUpdate(clientB, updateA);

    const graphA = projectGraphFromCrdtDoc(clientA);
    const graphB = projectGraphFromCrdtDoc(clientB);
    expect(graphA).toEqual(graphB);

    expect(graphA.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Client A sharpens the cheese pencil."',
    );
    expect(graphA.labels.find((label) => label.id === 'label-shared-nook')?.visual.position).toEqual({
      x: 420,
      y: 280,
    });
    expect(graphA.nodes.find((node) => node.id === 'node-choice')?.metadata).toEqual({
      condition: 'has_cheese_compass and crumbs_are_aligned',
    });
  });

  it('merges concurrent edits inside one scenario content field instead of picking one whole string', () => {
    const collaborativeGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'node-intro'
          ? {
              ...node,
              content: 'r "RenPy Mouse compares crumbs."',
            }
          : node,
      ),
    };
    const clientA = createProjectGraphCrdtDoc(collaborativeGraph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);

    updateScenarioNodeContent(clientA, 'node-intro', 'r "RenPy Mouse compares left-client crumbs."');
    updateScenarioNodeContent(clientB, 'node-intro', 'r "RenPy Mouse compares right-client crumbs."');

    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);

    importProjectGraphCrdtUpdate(clientA, updateB);
    importProjectGraphCrdtUpdate(clientB, updateA);

    const graphA = projectGraphFromCrdtDoc(clientA);
    const graphB = projectGraphFromCrdtDoc(clientB);
    const mergedContent = graphA.nodes.find((node) => node.id === 'node-intro')?.content ?? '';

    expect(graphA).toEqual(graphB);
    expect(mergedContent).toContain('left-client');
    expect(mergedContent).toContain('right-client');
    expect(mergedContent).toContain('RenPy Mouse compares');
  });

  it('keeps edits to different scenario text containers independent', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);

    updateScenarioNodeContent(clientA, 'node-intro', 'r "Client A maps the attic crumbs."');
    updateScenarioNodeContent(clientB, 'node-day-two', 'r "Client B maps the cellar crumbs."');

    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);
    importProjectGraphCrdtUpdate(clientA, updateB);
    importProjectGraphCrdtUpdate(clientB, updateA);

    const graphA = projectGraphFromCrdtDoc(clientA);
    const graphB = projectGraphFromCrdtDoc(clientB);
    expect(graphA).toEqual(graphB);
    expect(graphA.nodes.find((node) => node.id === 'node-intro')?.content).toContain('Client A');
    expect(graphA.nodes.find((node) => node.id === 'node-day-two')?.content).toContain('Client B');
  });

  it('preserves unrelated concurrent lines when a writer continues with granular scenario text splices', () => {
    const collaborativeGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'node-intro'
          ? { ...node, type: 'action', content: '# RenPy Mouse shares a cheese map.' }
          : node,
      ),
    };
    const clientA = createProjectGraphCrdtDoc(collaborativeGraph, { peerId: '31' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '32' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);
    const baseLength = collaborativeGraph.nodes.find((node) => node.id === 'node-intro')!.content.length;

    spliceScenarioNodeContent(clientA, {
      nodeId: 'node-intro',
      index: baseLength,
      deleteCount: 0,
      insertText: '\nr "A marks the attic."',
    });
    spliceScenarioNodeContent(clientB, {
      nodeId: 'node-intro',
      index: baseLength,
      deleteCount: 0,
      insertText: '\nr "B marks the cellar."',
    });

    importProjectGraphCrdtUpdate(clientA, exportProjectGraphCrdtUpdate(clientB, versionB));
    importProjectGraphCrdtUpdate(clientB, exportProjectGraphCrdtUpdate(clientA, versionA));

    const mergedA = projectGraphFromCrdtDoc(clientA).nodes.find((node) => node.id === 'node-intro')!.content;
    const beforeContinuation = getProjectGraphCrdtVersion(clientA);
    spliceScenarioNodeContent(clientA, {
      nodeId: 'node-intro',
      index: mergedA.length,
      deleteCount: 0,
      insertText: '\nr "A keeps typing."',
    });
    importProjectGraphCrdtUpdate(clientB, exportProjectGraphCrdtUpdate(clientA, beforeContinuation));

    const contentA = projectGraphFromCrdtDoc(clientA).nodes.find((node) => node.id === 'node-intro')!.content;
    const contentB = projectGraphFromCrdtDoc(clientB).nodes.find((node) => node.id === 'node-intro')!.content;
    expect(contentA).toBe(contentB);
    expect(contentA).toContain('A marks the attic.');
    expect(contentA).toContain('B marks the cellar.');
    expect(contentA).toContain('A keeps typing.');
  });

  it('keeps domain IDs stable when a scenario node is reparented through Loro Tree updates', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const versionB = getProjectGraphCrdtVersion(clientB);

    reparentScenarioNode(clientB, 'node-call-nook', 'label-shared-nook');
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);
    importProjectGraphCrdtUpdate(clientA, updateB);

    const reparentedGraph = projectGraphFromCrdtDoc(clientA);
    const allIds = [
      ...reparentedGraph.files.map((file) => file.id),
      ...reparentedGraph.labels.map((label) => label.id),
      ...reparentedGraph.label_starts.map((start) => start.id),
      ...reparentedGraph.nodes.map((node) => node.id),
    ].sort();
    const originalIds = [
      ...graph.files.map((file) => file.id),
      ...graph.labels.map((label) => label.id),
      ...graph.label_starts.map((start) => start.id),
      ...graph.nodes.map((node) => node.id),
    ].sort();

    expect(allIds).toEqual(originalIds);
    expect(reparentedGraph.nodes.find((node) => node.id === 'node-call-nook')).toMatchObject({
      label_id: 'label-shared-nook',
      parent_node_id: null,
      content: 'call .shared_nook',
    });
  });

  it('rejects containment cycles and leaves the ProjectGraph unchanged', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const before = projectGraphFromCrdtDoc(doc);

    expect(() => reparentScenarioNode(doc, 'node-choice', 'node-call-nook')).toThrow();
    expect(projectGraphFromCrdtDoc(doc)).toEqual(before);
  });

  it('imports duplicate binary updates idempotently without duplicating graph entities', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(clientA), { peerId: '2' });
    const versionA = getProjectGraphCrdtVersion(clientA);

    updateScenarioNodeContent(clientA, 'node-day-two', 'r "Duplicate packets do not duplicate crumbs."');
    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);

    importProjectGraphCrdtUpdate(clientB, updateA);
    importProjectGraphCrdtUpdate(clientB, updateA);

    const graphB = projectGraphFromCrdtDoc(clientB);
    expect(graphB.files).toHaveLength(graph.files.length);
    expect(graphB.labels).toHaveLength(graph.labels.length);
    expect(graphB.label_starts).toHaveLength(graph.label_starts.length);
    expect(graphB.nodes).toHaveLength(graph.nodes.length);
    expect(graphB.nodes.find((node) => node.id === 'node-day-two')?.content).toBe(
      'r "Duplicate packets do not duplicate crumbs."',
    );
  });

  it('inserts a full Player Choice branch immediately after the source scenario node', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });

    const result = insertProjectGraphNextScenario(doc, {
      action: 'menu',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
    });

    const updatedGraph = projectGraphFromCrdtDoc(doc);
    const insertedNodes = result.createdNodeIds.map((nodeId) => updatedGraph.nodes.find((node) => node.id === nodeId));
    const menuNode = insertedNodes[0];
    expect(result.selectedNodeId).toBe(menuNode?.id);
    expect(insertedNodes.map((node) => node?.type)).toEqual([
      'menu',
      'menu_prompt',
      'menu_choice',
      'action',
      'menu_choice',
      'action',
    ]);
    expect(menuNode).toMatchObject({
      content: 'menu:',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      source_span: null,
      type: 'menu',
    });
    expect(insertedNodes[1]).toMatchObject({
      content: '"What should RenPy Mouse do next?"',
      parent_node_id: menuNode?.id,
      type: 'menu_prompt',
    });
    expect(insertedNodes[2]).toMatchObject({
      content: '"Follow the cheese trail":',
      metadata: { choice_text: 'Follow the cheese trail' },
      parent_node_id: menuNode?.id,
      type: 'menu_choice',
    });
    expect(insertedNodes[3]).toMatchObject({
      content: 'r "RenPy Mouse follows the cheese trail."',
      parent_node_id: insertedNodes[2]?.id,
      type: 'action',
    });
    expect(updatedGraph.nodes.filter((node) => node.label_id === 'label-start' && node.parent_node_id === null).map((node) => node.id)).toEqual([
      'node-intro',
      menuNode?.id,
      'node-choice',
    ]);
    expect(updatedGraph.nodes.find((node) => node.id === 'node-choice')?.order).toBe('0002');
  });

  it('splices a continuation without rewriting the stored order of existing tail entities', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const entityIndex = doc.getMap('project_graph_entity_tree_ids');
    const tree = doc.getTree('project_graph_tree');
    const tailTreeId = String(entityIndex.get('node-choice')) as `${number}@${number}`;
    const tailNode = tree.getNodeByID(tailTreeId);

    expect(tailNode?.data.get('order')).toBe('0001');

    insertProjectGraphNextScenario(doc, {
      action: 'menu',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
    });

    expect(projectGraphFromCrdtDoc(doc).nodes.find((node) => node.id === 'node-choice')?.order).toBe('0002');
    expect(tailNode?.data.get('order')).toBe('0001');
  });

  it('inserts an if/elif/else branch group immediately after the source scenario node', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });

    const result = insertProjectGraphNextScenario(doc, {
      action: 'conditional',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
    });

    const updatedGraph = projectGraphFromCrdtDoc(doc);
    const insertedNodes = result.createdNodeIds.map((nodeId) => updatedGraph.nodes.find((node) => node.id === nodeId));
    expect(insertedNodes.map((node) => node?.type)).toEqual(['if', 'action', 'elif', 'action', 'else', 'action']);
    expect(insertedNodes[0]).toMatchObject({
      content: 'if renpy_mouse_has_cheese:',
      metadata: { condition: 'renpy_mouse_has_cheese' },
      parent_node_id: null,
      source_span: null,
    });
    expect(insertedNodes[1]).toMatchObject({
      content: 'r "RenPy Mouse chooses the cheesy route."',
      parent_node_id: insertedNodes[0]?.id,
    });
    expect(insertedNodes[2]).toMatchObject({
      content: 'elif renpy_mouse_sees_crumbs:',
      metadata: { condition: 'renpy_mouse_sees_crumbs' },
      parent_node_id: null,
    });
    expect(insertedNodes[4]).toMatchObject({
      content: 'else:',
      metadata: {},
      parent_node_id: null,
    });
    expect(updatedGraph.nodes.filter((node) => node.label_id === 'label-start' && node.parent_node_id === null).map((node) => node.id)).toEqual([
      'node-intro',
      insertedNodes[0]?.id,
      insertedNodes[2]?.id,
      insertedNodes[4]?.id,
      'node-choice',
    ]);
  });

  it('inserts customized modal drafts with pass actions and nested relation edges in one graph update', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const existingIds = projectGraphFromCrdtDoc(doc).nodes.map((node) => node.id);

    const conditional = insertProjectGraphNextScenario(doc, {
      action: 'conditional',
      conditionalDraft: {
        mode: 'structured',
        raw: '',
        ifBranch: { condition: 'renpy_mouse_hungry', continuation: { kind: 'action', comment: 'Add cheese reveal' } },
        elifBranches: [
          { id: 'elif-curious', condition: 'renpy_mouse_curious', continuation: { kind: 'call', targetLabelId: 'label-day-two' } },
          { id: 'elif-tired', condition: 'renpy_mouse_tired', continuation: { kind: 'jump', targetLabelId: 'label-day-two' } },
        ],
        elseBranch: null,
      },
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
    });

    const updated = projectGraphFromCrdtDoc(doc);
    const created = conditional.createdNodeIds.map((id) => updated.nodes.find((node) => node.id === id));
    expect(created.map((node) => node?.type)).toEqual(['if', 'action', 'elif', 'call', 'elif', 'jump']);
    expect(created[1]?.content).toBe('# Add cheese reveal\npass');
    expect(created[2]?.content).toBe('elif renpy_mouse_curious:');
    expect(created[4]?.content).toBe('elif renpy_mouse_tired:');
    expect(updated.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'call', source_node_id: created[3]?.id, target_node_id: 'start-node-day-two' }),
      expect.objectContaining({ kind: 'jump', source_node_id: created[5]?.id, target_node_id: 'start-node-day-two' }),
    ]));
    for (const id of existingIds) {
      expect(updated.nodes.some((node) => node.id === id)).toBe(true);
    }
    expect(updated.nodes.find((node) => node.id === 'node-choice')?.order).toBe('0004');
  });

  it('creates menu choices without a prompt and supports action, call, and jump leaves', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const result = insertProjectGraphNextScenario(doc, {
      action: 'menu',
      menuDraft: {
        mode: 'structured',
        raw: '',
        prompt: '',
        choices: [
          { id: 'stay', text: 'Stay', condition: '', continuation: { kind: 'action', comment: '' } },
          { id: 'visit', text: 'Visit', condition: 'renpy_mouse_brave', continuation: { kind: 'call', targetLabelId: 'label-day-two' } },
          { id: 'leave', text: 'Leave', condition: '', continuation: { kind: 'jump', targetLabelId: 'label-day-two' } },
        ],
      },
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
    });
    const updated = projectGraphFromCrdtDoc(doc);
    const created = result.createdNodeIds.map((id) => updated.nodes.find((node) => node.id === id));
    expect(created.map((node) => node?.type)).toEqual(['menu', 'menu_choice', 'action', 'menu_choice', 'call', 'menu_choice', 'jump']);
    expect(created.some((node) => node?.type === 'menu_prompt')).toBe(false);
    expect(created[3]?.content).toBe('"Visit" if renpy_mouse_brave:');
    expect(created[2]?.content).toBe('pass');
  });

  it('merges concurrent call and jump relation edges without losing either insertion', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const snapshot = exportProjectGraphCrdtSnapshot(clientA);
    const clientB = importProjectGraphCrdtSnapshot(snapshot, { peerId: '2' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);

    insertProjectGraphNextScenario(clientA, {
      action: 'call',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-day-two',
    });
    insertProjectGraphNextScenario(clientB, {
      action: 'jump',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-day-two',
    });

    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);
    importProjectGraphCrdtUpdate(clientA, updateB);
    importProjectGraphCrdtUpdate(clientB, updateA);

    const graphA = projectGraphFromCrdtDoc(clientA);
    const graphB = projectGraphFromCrdtDoc(clientB);
    const concurrentSourceIds = new Set(['node-call-00', 'node-jump-00']);
    const concurrentEdgesA = graphA.edges.filter((edge) => concurrentSourceIds.has(edge.source_node_id));
    const concurrentEdgesB = graphB.edges.filter((edge) => concurrentSourceIds.has(edge.source_node_id));

    expect(graphA).toEqual(graphB);
    expect(concurrentEdgesA).toHaveLength(2);
    expect(concurrentEdgesB).toHaveLength(2);
    expect(new Set(concurrentEdgesA.map((edge) => edge.kind))).toEqual(new Set(['call', 'jump']));
    expect(concurrentEdgesA.every((edge) => edge.target_node_id === 'start-node-day-two')).toBe(true);
    const topLevelIds = graphA.nodes
      .filter((node) => node.label_id === 'label-start' && node.parent_node_id === null)
      .map((node) => node.id);
    expect(topLevelIds[0]).toBe('node-intro');
    expect(new Set(topLevelIds.slice(1, 3))).toEqual(new Set(['node-call-00', 'node-jump-00']));
    expect(topLevelIds[3]).toBe('node-choice');
  });

  it('projects an inserted menu through an imported call-jump tail without detaching or replacing existing nodes', () => {
    const tailGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        { ...graph.nodes[0], id: 'node-action-anchor', type: 'action', order: '0000' },
        {
          id: 'node-call-tail',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'call',
          content: 'call .shared_nook',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: { target: '.shared_nook' },
          visual: { position: { x: 64, y: 248 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'node-jump-tail',
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
        graph.nodes[3],
      ],
      edges: [],
    };
    const doc = createProjectGraphCrdtDoc(tailGraph, { peerId: '1' });
    const result = insertProjectGraphNextScenario(doc, {
      action: 'menu',
      idFactory: createDeterministicIdFactory(),
      menuDraft: {
        mode: 'structured',
        raw: '',
        prompt: '',
        choices: [
          { id: 'continue', text: 'Continue', condition: '', continuation: { kind: 'action', comment: 'Rejoin the old tail' } },
          { id: 'leave', text: 'Leave', condition: '', continuation: { kind: 'jump', targetLabelId: 'label-day-two' } },
        ],
      },
      sourceNodeId: 'node-action-anchor',
    });

    const updated = projectGraphFromCrdtDoc(doc);
    const created = result.createdNodeIds.map((id) => updated.nodes.find((node) => node.id === id)!);
    const menu = created.find((node) => node.type === 'menu')!;
    const actionLeaf = created.find((node) => node.type === 'action')!;
    const jumpLeaf = created.find((node) => node.type === 'jump')!;
    const topLevelIds = updated.nodes
      .filter((node) => node.label_id === 'label-start' && node.parent_node_id === null)
      .map((node) => node.id);
    expect(topLevelIds).toEqual(['node-action-anchor', menu.id, 'node-call-tail', 'node-jump-tail']);
    expect(updated.nodes.find((node) => node.id === 'node-call-tail')?.content).toBe('call .shared_nook');
    expect(updated.nodes.find((node) => node.id === 'node-jump-tail')?.content).toBe('jump day_two');

    const projection = projectGraphToReactFlow(updated);
    const derivedPairs = new Set(
      projection.edges
        .filter((edge) => edge.data?.derived === true)
        .map((edge) => `${edge.source}->${edge.target}`),
    );
    expect(derivedPairs.has(`node-action-anchor->${menu.id}`)).toBe(true);
    expect(derivedPairs.has(`${actionLeaf.id}->node-call-tail`)).toBe(true);
    expect(derivedPairs.has('node-call-tail->node-jump-tail')).toBe(true);
    expect([...derivedPairs].some((pair) => pair.startsWith(`${jumpLeaf.id}->`))).toBe(false);
    expect(derivedPairs.has('node-action-anchor->node-call-tail')).toBe(false);
  });

  it('inserts jump, call, and return nodes with relation edges for resolved label targets', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const idFactory = createDeterministicIdFactory();

    const jumpResult = insertProjectGraphNextScenario(doc, {
      action: 'jump',
      idFactory,
      sourceNodeId: 'node-intro',
      targetLabelId: 'label-day-two',
    });
    const callResult = insertProjectGraphNextScenario(doc, {
      action: 'call',
      idFactory,
      sourceNodeId: jumpResult.selectedNodeId,
      targetLabelId: 'label-day-two',
    });
    const returnResult = insertProjectGraphNextScenario(doc, {
      action: 'return',
      idFactory,
      sourceNodeId: callResult.selectedNodeId,
    });

    const updatedGraph = projectGraphFromCrdtDoc(doc);
    const jumpNode = updatedGraph.nodes.find((node) => node.id === jumpResult.selectedNodeId);
    const callNode = updatedGraph.nodes.find((node) => node.id === callResult.selectedNodeId);
    const returnNode = updatedGraph.nodes.find((node) => node.id === returnResult.selectedNodeId);
    expect(jumpNode).toMatchObject({
      content: 'jump day_two',
      metadata: { target: 'day_two' },
      parent_node_id: null,
      type: 'jump',
    });
    expect(callNode).toMatchObject({
      content: 'call day_two',
      metadata: { target: 'day_two' },
      parent_node_id: null,
      type: 'call',
    });
    expect(returnNode).toMatchObject({
      content: 'return',
      metadata: {},
      parent_node_id: null,
      type: 'return',
    });
    expect(updatedGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'jump',
          source_node_id: jumpNode?.id,
          target_node_id: 'start-node-day-two',
          metadata: { target: 'day_two' },
        }),
        expect.objectContaining({
          kind: 'call',
          source_node_id: callNode?.id,
          target_node_id: 'start-node-day-two',
          metadata: { target: 'day_two' },
        }),
      ]),
    );
    expect(updatedGraph.edges.some((edge) => edge.source_node_id === returnNode?.id)).toBe(false);
  });

  it('creates a new file, global label, label start, jump, and edge in one Loro change', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const beforeIds = new Set([
      ...graph.files.map((file) => file.id),
      ...graph.labels.map((label) => label.id),
      ...graph.label_starts.map((start) => start.id),
      ...graph.nodes.map((node) => node.id),
      ...graph.edges.map((edge) => edge.id),
    ]);

    const result = insertProjectGraphNextScenario(doc, {
      action: 'jump',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
      target: {
        kind: 'new',
        draftId: 'draft-cheese-heist',
        file: { kind: 'new', path: 'chapters/cheese_heist.rpy' },
        scope: 'global',
        ownerLabelId: null,
        name: 'cheese_heist',
      },
    });

    const updated = projectGraphFromCrdtDoc(doc);
    const file = updated.files.find((candidate) => candidate.path === 'chapters/cheese_heist.rpy')!;
    const label = updated.labels.find((candidate) => candidate.qualified_name === 'cheese_heist')!;
    const start = updated.label_starts.find((candidate) => candidate.label_id === label.id)!;
    const jump = updated.nodes.find((candidate) => candidate.id === result.selectedNodeId)!;
    const placeholder = updated.nodes.find((candidate) => candidate.label_id === label.id && candidate.type === 'action');
    expect(file.order).toBe('0002');
    expect(label).toMatchObject({ file_id: file.id, parent_label_id: null, name: 'cheese_heist', scope: 'global' });
    expect(start).toMatchObject({ file_id: file.id, qualified_name: 'cheese_heist', content: 'label cheese_heist:' });
    expect(jump).toMatchObject({ content: 'jump cheese_heist', type: 'jump' });
    expect(placeholder).toMatchObject({ content: 'pass', parent_node_id: null, order: '0000' });
    expect(updated.edges).toContainEqual(expect.objectContaining({
      kind: 'jump',
      source_node_id: jump.id,
      target_node_id: start.id,
    }));
    expect((updated.source_index.files as Record<string, { path: string }>)[file.id]).toEqual({
      path: 'chapters/cheese_heist.rpy',
      content: '',
    });
    expect(result.createdTargetIds).toEqual({ files: [file.id], labels: [label.id], labelStarts: [start.id] });
    const afterIds = new Set([
      ...updated.files.map((item) => item.id),
      ...updated.labels.map((item) => item.id),
      ...updated.label_starts.map((item) => item.id),
      ...updated.nodes.map((item) => item.id),
      ...updated.edges.map((item) => item.id),
    ]);
    expect([...beforeIds].every((id) => afterIds.has(id))).toBe(true);
  });

  it('creates a local label under its existing global owner and clears no-label file metadata', () => {
    const localGraph: ProjectGraphSnapshot = {
      ...graph,
      files: graph.files.map((file) =>
        file.id === 'file-day-1'
          ? { ...file, metadata: { code_only: true, code_only_reason: 'no_labels' } }
          : file,
      ),
    };
    const doc = createProjectGraphCrdtDoc(localGraph, { peerId: '1' });
    const result = insertProjectGraphNextScenario(doc, {
      action: 'call',
      idFactory: createDeterministicIdFactory(),
      sourceNodeId: 'node-intro',
      target: {
        kind: 'new',
        draftId: 'draft-cache',
        file: { kind: 'existing', fileId: 'file-day-1' },
        scope: 'local',
        ownerLabelId: 'label-start',
        name: 'cheese_cache',
      },
    });

    const updated = projectGraphFromCrdtDoc(doc);
    const label = updated.labels.find((candidate) => candidate.qualified_name === 'start.cheese_cache')!;
    const start = updated.label_starts.find((candidate) => candidate.label_id === label.id)!;
    expect(label).toMatchObject({
      file_id: 'file-day-1',
      parent_label_id: 'label-start',
      name: '.cheese_cache',
      scope: 'local',
    });
    expect(start.content).toBe('label .cheese_cache:');
    expect(updated.files.find((file) => file.id === 'file-day-1')?.metadata ?? {}).toEqual({});
    expect(updated.edges).toContainEqual(expect.objectContaining({
      kind: 'call',
      source_node_id: result.selectedNodeId,
      target_node_id: start.id,
    }));
  });

  it('creates standalone files, global labels, and nested labels with canonical pass actions', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const idFactory = createDeterministicIdFactory();

    const fileResult = createProjectGraphStructure(doc, {
      kind: 'file',
      path: 'chapters/mouse_vault.rpy',
      position: { x: 2200, y: 320 },
      idFactory,
    });
    const fileGraph = projectGraphFromCrdtDoc(doc);
    const file = fileGraph.files.find((candidate) => candidate.id === fileResult.selectedEntityId)!;
    expect(file).toMatchObject({
      path: 'chapters/mouse_vault.rpy',
      metadata: { code_only: true, code_only_reason: 'no_labels' },
      visual: { position: { x: 2200, y: 320 } },
    });

    const labelResult = createProjectGraphStructure(doc, {
      kind: 'label',
      fileId: file.id,
      name: 'mouse_vault',
      idFactory,
    });
    const labelGraph = projectGraphFromCrdtDoc(doc);
    const label = labelGraph.labels.find((candidate) => candidate.id === labelResult.selectedEntityId)!;
    const labelPass = labelGraph.nodes.find((candidate) => candidate.label_id === label.id)!;
    expect(label).toMatchObject({ qualified_name: 'mouse_vault', parent_label_id: null, scope: 'global' });
    expect(labelPass).toMatchObject({ type: 'action', content: 'pass', order: '0000' });
    expect(labelGraph.files.find((candidate) => candidate.id === file.id)?.metadata ?? {}).toEqual({});

    const nestedResult = createProjectGraphStructure(doc, {
      kind: 'sublabel',
      parentLabelId: label.id,
      name: 'secret_crumb',
      idFactory,
    });
    const nestedGraph = projectGraphFromCrdtDoc(doc);
    const nested = nestedGraph.labels.find((candidate) => candidate.id === nestedResult.selectedEntityId)!;
    const nestedStart = nestedGraph.label_starts.find((candidate) => candidate.label_id === nested.id)!;
    expect(nested).toMatchObject({
      file_id: file.id,
      parent_label_id: label.id,
      qualified_name: 'mouse_vault.secret_crumb',
      scope: 'local',
    });
    expect(nestedStart.content).toBe('label .secret_crumb:');
    expect(nestedGraph.nodes.find((candidate) => candidate.label_id === nested.id)).toMatchObject({ content: 'pass' });
  });

  it('rejects a duplicate new target before writing any Loro operation', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const before = exportProjectGraphCrdtSnapshot(doc);

    expect(() => insertProjectGraphNextScenario(doc, {
      action: 'jump',
      sourceNodeId: 'node-intro',
      target: {
        kind: 'new',
        draftId: 'draft-duplicate',
        file: { kind: 'existing', fileId: 'file-day-1' },
        scope: 'global',
        ownerLabelId: null,
        name: 'start',
      },
    })).toThrow('already exists');
    expect(exportProjectGraphCrdtSnapshot(doc)).toEqual(before);
  });

  it('converges a larger three-client session with content, position, metadata, and containment edits', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const snapshot = exportProjectGraphCrdtSnapshot(clientA);
    const clientB = importProjectGraphCrdtSnapshot(snapshot, { peerId: '2' });
    const clientC = importProjectGraphCrdtSnapshot(snapshot, { peerId: '3' });
    const versionA = getProjectGraphCrdtVersion(clientA);
    const versionB = getProjectGraphCrdtVersion(clientB);
    const versionC = getProjectGraphCrdtVersion(clientC);

    updateScenarioNodeContent(clientA, 'node-intro', 'r "Three clients count crumbs in sync."');
    moveProjectGraphEntity(clientB, 'file-day-2', { x: 1040, y: 120 });
    reparentScenarioNode(clientC, 'node-call-nook', 'label-shared-nook');
    updateScenarioNodeMetadata(clientC, 'node-choice', {
      condition: 'has_cheese_compass and three_clients_agree',
      review: 'checked by client C',
    });

    const updateA = exportProjectGraphCrdtUpdate(clientA, versionA);
    const updateB = exportProjectGraphCrdtUpdate(clientB, versionB);
    const updateC = exportProjectGraphCrdtUpdate(clientC, versionC);

    for (const update of [updateB, updateC]) {
      importProjectGraphCrdtUpdate(clientA, update);
    }
    for (const update of [updateC, updateA]) {
      importProjectGraphCrdtUpdate(clientB, update);
    }
    for (const update of [updateA, updateB]) {
      importProjectGraphCrdtUpdate(clientC, update);
    }

    const graphA = projectGraphFromCrdtDoc(clientA);
    const graphB = projectGraphFromCrdtDoc(clientB);
    const graphC = projectGraphFromCrdtDoc(clientC);

    expect(graphA).toEqual(graphB);
    expect(graphB).toEqual(graphC);
    expect(graphA.nodes.find((node) => node.id === 'node-intro')?.content).toBe(
      'r "Three clients count crumbs in sync."',
    );
    expect(graphA.files.find((file) => file.id === 'file-day-2')?.visual.position).toEqual({ x: 1040, y: 120 });
    expect(graphA.nodes.find((node) => node.id === 'node-call-nook')).toMatchObject({
      label_id: 'label-shared-nook',
      parent_node_id: null,
    });
    expect(graphA.nodes.find((node) => node.id === 'node-choice')?.metadata).toEqual({
      condition: 'has_cheese_compass and three_clients_agree',
      review: 'checked by client C',
    });
  });
});
