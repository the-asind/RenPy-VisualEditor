import { describe, expect, it } from 'vitest';
import { projectGraphToReactFlow, type ProjectGraphSnapshot } from '../projectGraphProjection';

const graph: ProjectGraphSnapshot = {
  project_id: 'projection-project',
  files: [
    {
      id: 'file-day-1',
      path: 'day_1.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 1200, height: 800 } },
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
      visual: { position: { x: 48, y: 48 }, size: { width: 960, height: 360 } },
    },
  ],
  label_starts: [
    {
      id: 'start-node-start',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-dialogue-1',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "Hello projection."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
    },
  ],
  edges: [],
  diagnostics: [],
  source_index: { files: {} },
};

describe('projectGraphToReactFlow static projection', () => {
  it('projects file frames, label frames, label starts, and scenario nodes', () => {
    const projection = projectGraphToReactFlow(graph);

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'file-day-1',
      'label-start',
      'start-node-start',
      'node-dialogue-1',
    ]);
    expect(projection.edges).toEqual([]);

    const fileNode = projection.nodes.find((node) => node.id === 'file-day-1');
    expect(fileNode).toMatchObject({
      type: 'projectFrame',
      position: { x: 0, y: 0 },
      data: { kind: 'file', path: 'day_1.rpy', title: 'day_1.rpy' },
    });
    expect(fileNode).toMatchObject({ width: 1200, height: 800 });

    const labelNode = projection.nodes.find((node) => node.id === 'label-start');
    expect(labelNode).toMatchObject({
      type: 'labelFrame',
      parentId: 'file-day-1',
      extent: 'parent',
      data: { kind: 'label', qualifiedName: 'start', title: 'start' },
    });

    const startNode = projection.nodes.find((node) => node.id === 'start-node-start');
    expect(startNode).toMatchObject({
      type: 'labelStart',
      parentId: 'label-start',
      extent: 'parent',
      data: { kind: 'labelStart', qualifiedName: 'start', content: 'label start:' },
    });

    const scenarioNode = projection.nodes.find((node) => node.id === 'node-dialogue-1');
    expect(scenarioNode).toMatchObject({
      type: 'scenarioNode',
      parentId: 'label-start',
      extent: 'parent',
      data: { kind: 'scenario', scenarioType: 'dialogue', content: 'r "Hello projection."' },
    });
  });
});
