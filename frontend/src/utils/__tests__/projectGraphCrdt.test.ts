import { describe, expect, it } from 'vitest';
import {
  createProjectGraphCrdtDoc,
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtSnapshot,
  importProjectGraphCrdtUpdate,
  moveProjectGraphEntity,
  projectGraphFromCrdtDoc,
  updateScenarioNodeContent,
  updateScenarioNodeMetadata,
} from '../projectGraphCrdt';
import type { ProjectGraphSnapshot } from '../projectGraphProjection';

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

describe('ProjectGraph Loro CRDT adapter', () => {
  it('stores ProjectGraph in one LoroDoc snapshot and restores semantic identity', () => {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    const snapshot = exportProjectGraphCrdtSnapshot(doc);

    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.byteLength).toBeGreaterThan(0);

    const restoredDoc = importProjectGraphCrdtSnapshot(snapshot, { peerId: '2' });
    expect(projectGraphFromCrdtDoc(restoredDoc)).toEqual(graph);
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
});
