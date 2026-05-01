import { describe, expect, it } from 'vitest';
import { projectGraphNodeTypes } from '../../components/projectGraph/ProjectGraphCanvas';
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
      width: 1200,
      height: 800,
    });

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

  it('exposes dedicated React Flow 2 node types for the new canvas layer', () => {
    expect(Object.keys(projectGraphNodeTypes).sort()).toEqual([
      'labelFrame',
      'labelStart',
      'projectFrame',
      'scenarioNode',
    ]);
  });

  it('keeps nested containment separate from node-to-node jump and call edges', () => {
    const nestedGraph: ProjectGraphSnapshot = {
      ...graph,
      labels: [
        graph.labels[0],
        {
          id: 'label-start-shared-nook',
          file_id: 'file-day-1',
          parent_label_id: 'label-start',
          name: '.shared_nook',
          qualified_name: 'start.shared_nook',
          scope: 'local',
          label_start_node_id: 'start-node-shared-nook',
          source_span: { start_line: 10, end_line: 10 },
          visual: { position: { x: 520, y: 48 }, size: { width: 360, height: 240 } },
        },
      ],
      label_starts: [
        graph.label_starts[0],
        {
          id: 'start-node-shared-nook',
          file_id: 'file-day-1',
          label_id: 'label-start-shared-nook',
          qualified_name: 'start.shared_nook',
          content: 'label .shared_nook:',
          visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
        },
      ],
      nodes: [
        graph.nodes[0],
        {
          id: 'node-menu',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'menu',
          content: 'menu:',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 360, height: 160 } },
        },
        {
          id: 'node-menu-choice',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Inspect the tiny cheese map"',
          order: '0001.0000',
          source_span: { start_line: 3, end_line: 3 },
          metadata: { condition: 'renpy_has_cracker' },
          visual: { position: { x: 32, y: 72 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'node-call-local',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu-choice',
          type: 'call',
          content: 'call .shared_nook',
          order: '0001.0000.0000',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { target: '.shared_nook' },
          visual: { position: { x: 32, y: 64 }, size: { width: 220, height: 64 } },
        },
      ],
      edges: [
        {
          id: 'edge-dialogue-jump-start',
          source_node_id: 'node-dialogue-1',
          target_node_id: 'start-node-start',
          kind: 'jump',
          metadata: { target: 'start' },
        },
        {
          id: 'edge-call-local-start',
          source_node_id: 'node-call-local',
          target_node_id: 'start-node-shared-nook',
          kind: 'call',
          metadata: { target: '.shared_nook' },
        },
      ],
    };

    const projection = projectGraphToReactFlow(nestedGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));

    expect(byId.get('label-start-shared-nook')).toMatchObject({
      type: 'labelFrame',
      parentId: 'label-start',
      extent: 'parent',
    });
    expect(byId.get('start-node-shared-nook')).toMatchObject({
      type: 'labelStart',
      parentId: 'label-start-shared-nook',
      extent: 'parent',
    });
    expect(byId.get('node-menu-choice')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'node-menu',
      extent: 'parent',
    });
    expect(byId.get('node-call-local')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'node-menu-choice',
      extent: 'parent',
    });

    const frameIds = new Set(
      projection.nodes
        .filter((node) => node.type === 'projectFrame' || node.type === 'labelFrame')
        .map((node) => node.id),
    );
    expect(projection.edges.every((edge) => !frameIds.has(edge.source) && !frameIds.has(edge.target))).toBe(true);

    expect(projection.edges).toEqual([
      expect.objectContaining({
        id: 'edge-dialogue-jump-start',
        source: 'node-dialogue-1',
        target: 'start-node-start',
        type: 'smoothstep',
        animated: false,
        className: 'project-edge project-edge--jump',
        label: 'jump',
        data: expect.objectContaining({ kind: 'jump' }),
        style: expect.objectContaining({ opacity: 0.52, strokeDasharray: '8 6' }),
      }),
      expect.objectContaining({
        id: 'edge-call-local-start',
        source: 'node-call-local',
        target: 'start-node-shared-nook',
        type: 'smoothstep',
        animated: true,
        className: 'project-edge project-edge--call',
        label: 'call',
        data: expect.objectContaining({ kind: 'call' }),
        style: expect.objectContaining({ opacity: 0.72, strokeWidth: 2 }),
      }),
    ]);
  });
});
