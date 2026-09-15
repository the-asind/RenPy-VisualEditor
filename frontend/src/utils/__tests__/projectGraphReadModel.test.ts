import { describe, expect, it } from 'vitest';

import {
  createProjectGraphCrdtDoc,
  createProjectGraphStructure,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtSnapshot,
  importProjectGraphCrdtUpdate,
  moveProjectGraphEntity,
  projectGraphFromCrdtDoc,
  reparentScenarioNode,
  replaceProjectGraphDiagnostics,
  spliceScenarioNodeContent,
  updateScenarioNodeMetadata,
  updateSourceFileContent,
} from '../projectGraphCrdt';
import { ProjectGraphDirtyEventAdapter } from '../projectGraphDirtyEvents';
import { ProjectGraphReadModel } from '../projectGraphReadModel';
import type { ProjectGraphSnapshot } from '../projectGraphProjection';

const graph: ProjectGraphSnapshot = {
  project_id: 'read-model-renpy-mouse',
  files: [
    {
      id: 'file-mouse',
      path: 'mouse_story.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 900, height: 720 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-mouse',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 720, height: 560 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-mouse',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-mouse-one',
      file_id: 'file-mouse',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "RenPy Mouse counts one crumb."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: { speaker: 'r' },
      visual: { position: { x: 64, y: 136 }, size: { width: 340, height: 88 } },
    },
    {
      id: 'node-mouse-two',
      file_id: 'file-mouse',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'action',
      content: 'r "RenPy Mouse counts two crumbs."',
      order: '0001',
      source_span: { start_line: 2, end_line: 2 },
      metadata: {},
      visual: { position: { x: 64, y: 248 }, size: { width: 340, height: 88 } },
    },
    {
      id: 'node-mouse-child',
      file_id: 'file-mouse',
      label_id: 'label-start',
      parent_node_id: 'node-mouse-two',
      type: 'action',
      content: 'r "The child crumb hides under its parent."',
      order: '0001.0000',
      source_span: { start_line: 3, end_line: 3 },
      metadata: {},
      visual: { position: { x: 32, y: 72 }, size: { width: 320, height: 80 } },
    },
  ],
  edges: [],
  diagnostics: [],
  source_index: {
    files: {
      'file-mouse': { path: 'mouse_story.rpy', content: 'label start:\n    pass\n' },
    },
  },
};

const deterministicIdFactory = () => {
  let id = 0;
  return (prefix: string) => `${prefix}-read-model-${id++}`;
};

describe('ProjectGraph dirty-ID Loro event adapter', () => {
  it('maps text and entity-map commits to the exact stable entity ID and origin', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const adapter = new ProjectGraphDirtyEventAdapter(doc);

    spliceScenarioNodeContent(doc, {
      nodeId: 'node-mouse-one',
      index: graph.nodes[0].content.length - 1,
      deleteCount: 0,
      insertText: ' carefully',
    });
    updateScenarioNodeMetadata(doc, 'node-mouse-two', { mood: 'hungry' });

    const [textBatch, mapBatch] = adapter.drain();
    expect(textBatch).toMatchObject({
      by: 'local',
      origin: 'project-graph-content',
      dirtyEntityIds: ['node-mouse-one'],
      entityFieldsById: { 'node-mouse-one': ['content'] },
      fallbackReasons: [],
    });
    expect(textBatch.dirtyContainerIds).toEqual(['cid:root-scenario_content:node-mouse-one:Text']);
    expect(mapBatch).toMatchObject({
      by: 'local',
      origin: 'project-graph-metadata',
      dirtyEntityIds: ['node-mouse-two'],
      entityFieldsById: { 'node-mouse-two': ['metadata'] },
      fallbackReasons: [],
    });
    adapter.dispose();
  });

  it('reports exact create, move and deleted-subtree IDs from tree diffs', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const adapter = new ProjectGraphDirtyEventAdapter(doc);

    const created = createProjectGraphStructure(doc, {
      kind: 'label',
      fileId: 'file-mouse',
      parentLabelId: null,
      name: 'cheese_room',
      idFactory: deterministicIdFactory(),
    });
    const createBatch = adapter.drain()[0];
    expect(createBatch.treeChanges.map((change) => change.action)).toContain('create');
    expect(createBatch.dirtyEntityIds).toEqual(
      expect.arrayContaining([
        ...created.createdEntityIds.labels,
        ...created.createdEntityIds.labelStarts,
        ...created.createdEntityIds.nodes,
      ]),
    );

    reparentScenarioNode(doc, 'node-mouse-one', 'node-mouse-two');
    const moveBatch = adapter.drain()[0];
    expect(moveBatch.treeChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'move', entityId: 'node-mouse-one' }),
      ]),
    );
    expect(moveBatch.dirtyEntityIds).toEqual(
      expect.arrayContaining(['node-mouse-one', 'node-mouse-two', 'label-start']),
    );

    const entityIndex = doc.getMap('project_graph_entity_tree_ids');
    const tree = doc.getTree('project_graph_tree');
    const parentTreeId = String(entityIndex.get('node-mouse-two')) as `${number}@${number}`;
    tree.delete(parentTreeId);
    entityIndex.delete('node-mouse-two');
    entityIndex.delete('node-mouse-one');
    entityIndex.delete('node-mouse-child');
    doc.commit({ origin: 'test-delete-subtree', message: 'RenPy Mouse removes a crumb branch' });

    const deleteBatch = adapter.drain()[0];
    expect(deleteBatch.treeChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'delete',
          entityId: 'node-mouse-two',
          affectedEntityIds: expect.arrayContaining([
            'node-mouse-two',
            'node-mouse-one',
            'node-mouse-child',
          ]),
        }),
      ]),
    );
    expect(deleteBatch.dirtyEntityIds).toEqual(
      expect.arrayContaining(['node-mouse-two', 'node-mouse-one', 'node-mouse-child']),
    );
    adapter.dispose();
  });

  it('preserves imported origin and exact dirty ID for a remote update', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(clientA.export({ mode: 'snapshot' }), { peerId: '2' });
    const adapterB = new ProjectGraphDirtyEventAdapter(clientB);
    const before = getProjectGraphCrdtVersion(clientA);

    spliceScenarioNodeContent(clientA, {
      nodeId: 'node-mouse-child',
      index: 0,
      deleteCount: 0,
      insertText: '# remote\n',
    });
    importProjectGraphCrdtUpdate(clientB, exportProjectGraphCrdtUpdate(clientA, before));

    expect(adapterB.drain()).toEqual([
      expect.objectContaining({
        by: 'import',
        origin: null,
        dirtyEntityIds: ['node-mouse-child'],
        fallbackReasons: [],
      }),
    ]);
    adapterB.dispose();
  });
});

describe('incremental ProjectGraph read model', () => {
  it('matches the full codec and retains every unchanged entity object after a character edit', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const readModel = new ProjectGraphReadModel(doc);
    const before = readModel.graph;
    const unchangedBefore = before.nodes.find((node) => node.id === 'node-mouse-two');
    const changedBefore = before.nodes.find((node) => node.id === 'node-mouse-one');

    spliceScenarioNodeContent(doc, {
      nodeId: 'node-mouse-one',
      index: 2,
      deleteCount: 0,
      insertText: 'tiny ',
    });
    const update = readModel.flush();

    expect(update.mode).toBe('incremental');
    expect(update.fallbackReason).toBeNull();
    expect(update.dirtyEntityIds).toEqual(['node-mouse-one']);
    expect(update.graph).toEqual(projectGraphFromCrdtDoc(doc));
    expect(update.graph.files).toBe(before.files);
    expect(update.graph.labels).toBe(before.labels);
    expect(update.graph.label_starts).toBe(before.label_starts);
    expect(update.graph.edges).toBe(before.edges);
    expect(update.graph.nodes.find((node) => node.id === 'node-mouse-two')).toBe(unchangedBefore);
    expect(update.graph.nodes.find((node) => node.id === 'node-mouse-one')).not.toBe(changedBefore);
    expect(readModel.stats.fullMaterializationCount).toBe(1);
    expect(readModel.stats.incrementalUpdateCount).toBe(1);
    readModel.dispose();
  });

  it('invalidates only metadata, source-index and diagnostics consumers', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const readModel = new ProjectGraphReadModel(doc);

    const initial = readModel.graph;
    updateScenarioNodeMetadata(doc, 'node-mouse-two', { cheese: true });
    const metadataUpdate = readModel.flush();
    expect(metadataUpdate.mode).toBe('incremental');
    expect(metadataUpdate.graph.nodes.find((node) => node.id === 'node-mouse-one')).toBe(
      initial.nodes.find((node) => node.id === 'node-mouse-one'),
    );
    expect(metadataUpdate.graph.source_index).toBe(initial.source_index);
    expect(metadataUpdate.graph.diagnostics).toBe(initial.diagnostics);

    const beforeSource = metadataUpdate.graph;
    updateSourceFileContent(doc, 'file-mouse', 'label start:\n    r "Fresh cheese."\n');
    const sourceUpdate = readModel.flush();
    expect(sourceUpdate.mode).toBe('incremental');
    expect(sourceUpdate.dirtySourceFileIds).toEqual(['file-mouse']);
    expect(sourceUpdate.graph.nodes).toBe(beforeSource.nodes);
    expect(sourceUpdate.graph.source_index).not.toBe(beforeSource.source_index);

    const beforeDiagnostics = sourceUpdate.graph;
    replaceProjectGraphDiagnostics(doc, [
      {
        id: 'mouse-warning',
        code: 'missing_cheese',
        severity: 'warning',
        message: 'RenPy Mouse cannot find the cheese.',
        blocking: false,
        file_id: 'file-mouse',
        label_id: 'label-start',
        node_id: 'node-mouse-one',
        source_span: null,
        metadata: {},
      },
    ]);
    const diagnosticsUpdate = readModel.flush();
    expect(diagnosticsUpdate.mode).toBe('incremental');
    expect(diagnosticsUpdate.graph.nodes).toBe(beforeDiagnostics.nodes);
    expect(diagnosticsUpdate.graph.source_index).toBe(beforeDiagnostics.source_index);
    expect(diagnosticsUpdate.graph.diagnostics).not.toBe(beforeDiagnostics.diagnostics);
    expect(diagnosticsUpdate.graph).toEqual(projectGraphFromCrdtDoc(doc));
    readModel.dispose();
  });

  it('uses an explicit full fallback for tree topology and remains equal to the correctness oracle', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const readModel = new ProjectGraphReadModel(doc);

    reparentScenarioNode(doc, 'node-mouse-one', 'node-mouse-two');
    const update = readModel.flush();

    expect(update.mode).toBe('full');
    expect(update.fallbackReason).toMatch(/^tree:move/);
    expect(update.graph).toEqual(projectGraphFromCrdtDoc(doc));
    expect(readModel.stats.fullMaterializationCount).toBe(2);
    expect(readModel.stats.fullFallbackCount).toBe(1);
    readModel.dispose();
  });

  it('converges with the full codec through deterministic two-peer local/import batches', () => {
    const clientA = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const clientB = importProjectGraphCrdtSnapshot(clientA.export({ mode: 'snapshot' }), { peerId: '2' });
    const modelA = new ProjectGraphReadModel(clientA);
    const modelB = new ProjectGraphReadModel(clientB);

    for (let index = 0; index < 24; index += 1) {
      const writer = index % 2 === 0 ? clientA : clientB;
      const receiver = writer === clientA ? clientB : clientA;
      const writerModel = writer === clientA ? modelA : modelB;
      const receiverModel = writer === clientA ? modelB : modelA;
      const before = getProjectGraphCrdtVersion(writer);
      const nodeId = index % 3 === 0 ? 'node-mouse-child' : index % 3 === 1 ? 'node-mouse-one' : 'node-mouse-two';

      if (index % 4 === 0) {
        spliceScenarioNodeContent(writer, { nodeId, index: 0, deleteCount: 0, insertText: `${index} ` });
      } else if (index % 4 === 1) {
        updateScenarioNodeMetadata(writer, nodeId, { [`crumb_${index}`]: true });
      } else if (index % 4 === 2) {
        moveProjectGraphEntity(writer, nodeId, { x: 64 + index, y: 136 + index });
      } else {
        updateSourceFileContent(writer, 'file-mouse', `# synchronized crumb ${index}\n`);
      }

      const local = writerModel.flush();
      expect(local.graph).toEqual(projectGraphFromCrdtDoc(writer));
      importProjectGraphCrdtUpdate(receiver, exportProjectGraphCrdtUpdate(writer, before));
      const remote = receiverModel.flush();
      expect(remote.graph).toEqual(projectGraphFromCrdtDoc(receiver));
      expect(remote.by).toContain('import');
      expect(remote.dirtyEntityIds.length + remote.dirtySourceFileIds.length).toBeGreaterThan(0);
    }

    expect(modelA.graph).toEqual(modelB.graph);
    expect(modelA.graph).toEqual(projectGraphFromCrdtDoc(clientA));
    expect(modelB.graph).toEqual(projectGraphFromCrdtDoc(clientB));
    modelA.dispose();
    modelB.dispose();
  });
});
