import { describe, expect, it } from 'vitest';
import { projectGraphNodeTypes } from '../../components/projectGraph/ProjectGraphCanvas';
import {
  getAbsoluteNodePosition,
  projectGraphDiagnosticsToProblems,
  projectGraphToReactFlow,
  searchProjectGraph,
  type ProjectGraphSnapshot,
} from '../projectGraphProjection';

const nodeRect = (node: { position: { x: number; y: number }; width?: number; height?: number }) => ({
  x: node.position.x,
  y: node.position.y,
  width: Number(node.width ?? 0),
  height: Number(node.height ?? 0),
});

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const childFitsParent = (
  child: { position: { x: number; y: number }; width?: number; height?: number },
  parent: { width?: number; height?: number },
) => {
  const childBounds = nodeRect(child);
  return (
    childBounds.x >= 0 &&
    childBounds.y >= 0 &&
    childBounds.x + childBounds.width <= Number(parent.width ?? 0) &&
    childBounds.y + childBounds.height <= Number(parent.height ?? 0)
  );
};

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

  it('normalizes overlapping layout and expands parent frames around children', () => {
    const overlappingGraph: ProjectGraphSnapshot = {
      project_id: 'overlap-project',
      files: [
        {
          id: 'file-day-1',
          path: 'day_1.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 360, height: 240 } },
        },
        {
          id: 'file-day-2',
          path: 'day_2.rpy',
          order: '0001',
          visual: { position: { x: 0, y: 0 }, size: { width: 360, height: 240 } },
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
          visual: { position: { x: 24, y: 48 }, size: { width: 260, height: 160 } },
        },
        {
          id: 'label-day-one-late',
          file_id: 'file-day-1',
          parent_label_id: null,
          name: 'day_one_late',
          qualified_name: 'day_one_late',
          scope: 'global',
          label_start_node_id: 'start-node-day-one-late',
          source_span: { start_line: 20, end_line: 20 },
          visual: { position: { x: 24, y: 48 }, size: { width: 260, height: 160 } },
        },
      ],
      label_starts: [
        {
          id: 'start-node-start',
          file_id: 'file-day-1',
          label_id: 'label-start',
          qualified_name: 'start',
          content: 'label start:',
          visual: { position: { x: 16, y: 16 }, size: { width: 220, height: 64 } },
        },
        {
          id: 'start-node-day-one-late',
          file_id: 'file-day-1',
          label_id: 'label-day-one-late',
          qualified_name: 'day_one_late',
          content: 'label day_one_late:',
          visual: { position: { x: 16, y: 16 }, size: { width: 220, height: 64 } },
        },
      ],
      nodes: [
        {
          id: 'node-dialogue-a',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "RenPy Mouse checks the layout grid."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 16, y: 96 }, size: { width: 260, height: 72 } },
        },
        {
          id: 'node-dialogue-b',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "No two crumbs may occupy one square."',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 16, y: 96 }, size: { width: 260, height: 72 } },
        },
      ],
      edges: [],
      diagnostics: [],
      source_index: { files: {} },
    };

    const projection = projectGraphToReactFlow(overlappingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));

    const fileOne = byId.get('file-day-1');
    const fileTwo = byId.get('file-day-2');
    const labelStart = byId.get('label-start');
    const labelLate = byId.get('label-day-one-late');
    const startNode = byId.get('start-node-start');
    const dialogueA = byId.get('node-dialogue-a');
    const dialogueB = byId.get('node-dialogue-b');

    expect(fileOne && fileTwo && labelStart && labelLate && startNode && dialogueA && dialogueB).toBeTruthy();

    expect(rectsOverlap(nodeRect(fileOne!), nodeRect(fileTwo!))).toBe(false);
    expect(rectsOverlap(nodeRect(labelStart!), nodeRect(labelLate!))).toBe(false);
    expect(rectsOverlap(nodeRect(dialogueA!), nodeRect(dialogueB!))).toBe(false);

    expect(childFitsParent(labelStart!, fileOne!)).toBe(true);
    expect(childFitsParent(labelLate!, fileOne!)).toBe(true);
    expect(childFitsParent(startNode!, labelStart!)).toBe(true);
    expect(childFitsParent(dialogueA!, labelStart!)).toBe(true);
    expect(childFitsParent(dialogueB!, labelStart!)).toBe(true);
  });

  it('projects a complete multi-file MVP 2.0 canvas contract', () => {
    const fullGraph: ProjectGraphSnapshot = {
      project_id: 'sprint-4-contract',
      files: [
        {
          id: 'file-day-1',
          path: 'mouse_day_1.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 420, height: 320 } },
        },
        {
          id: 'file-day-2',
          path: 'mouse_day_2.rpy',
          order: '0001',
          visual: { position: { x: 0, y: 0 }, size: { width: 420, height: 320 } },
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
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 220 } },
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
          visual: { position: { x: 24, y: 120 }, size: { width: 320, height: 180 } },
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
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 220 } },
        },
      ],
      label_starts: [
        {
          id: 'start-node-start',
          file_id: 'file-day-1',
          label_id: 'label-start',
          qualified_name: 'start',
          content: 'label start:',
          visual: { position: { x: 24, y: 24 }, size: { width: 240, height: 64 } },
        },
        {
          id: 'start-node-shared-nook',
          file_id: 'file-day-1',
          label_id: 'label-shared-nook',
          qualified_name: 'start.shared_nook',
          content: 'label .shared_nook:',
          visual: { position: { x: 24, y: 24 }, size: { width: 240, height: 64 } },
        },
        {
          id: 'start-node-day-two',
          file_id: 'file-day-2',
          label_id: 'label-day-two',
          qualified_name: 'day_two',
          content: 'label day_two:',
          visual: { position: { x: 24, y: 24 }, size: { width: 240, height: 64 } },
        },
      ],
      nodes: [
        {
          id: 'node-intro',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "RenPy Mouse enters the contract kitchen."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 24, y: 112 }, size: { width: 300, height: 72 } },
        },
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
          visual: { position: { x: 24, y: 112 }, size: { width: 300, height: 120 } },
        },
        {
          id: 'node-choice',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Follow the dotted cheese arrow"',
          order: '0001.0000',
          source_span: { start_line: 3, end_line: 3 },
          metadata: { condition: 'has_cheese_compass' },
          visual: { position: { x: 24, y: 64 }, size: { width: 240, height: 72 } },
        },
        {
          id: 'node-call-nook',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-choice',
          type: 'call',
          content: 'call .shared_nook',
          order: '0001.0000.0000',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { target: '.shared_nook' },
          visual: { position: { x: 24, y: 64 }, size: { width: 220, height: 64 } },
        },
        {
          id: 'node-jump-day-two',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'jump',
          content: 'jump day_two',
          order: '0002',
          source_span: { start_line: 6, end_line: 6 },
          metadata: { target: 'day_two' },
          visual: { position: { x: 24, y: 112 }, size: { width: 220, height: 64 } },
        },
        {
          id: 'node-nook-comment',
          file_id: 'file-day-1',
          label_id: 'label-shared-nook',
          parent_node_id: null,
          type: 'comment',
          content: '# The tiny chair is canonically too small.',
          order: '0000',
          source_span: { start_line: 13, end_line: 13 },
          metadata: {},
          visual: { position: { x: 24, y: 112 }, size: { width: 260, height: 64 } },
        },
        {
          id: 'node-day-two-dialogue',
          file_id: 'file-day-2',
          label_id: 'label-day-two',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "Day two begins with disciplined spacing."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 24, y: 112 }, size: { width: 300, height: 72 } },
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
        {
          id: 'edge-jump-day-two',
          source_node_id: 'node-jump-day-two',
          target_node_id: 'start-node-day-two',
          kind: 'jump',
          metadata: { target: 'day_two' },
        },
      ],
      diagnostics: [
        {
          id: 'diagnostic-dynamic',
          code: 'dynamic_target',
          severity: 'info',
          message: 'Dynamic target kept for problems panel projection later.',
          blocking: false,
          file_id: 'file-day-1',
          label_id: 'label-start',
          node_id: 'node-menu',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
        },
      ],
      source_index: { files: {} },
    };

    const projection = projectGraphToReactFlow(fullGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const frameIds = new Set(
      projection.nodes
        .filter((node) => node.type === 'projectFrame' || node.type === 'labelFrame')
        .map((node) => node.id),
    );

    expect(projection.nodes).toHaveLength(15);
    expect(projection.edges).toHaveLength(2);
    expect(projection.nodes.every((node) => node.hidden !== true)).toBe(true);

    for (const node of projection.nodes) {
      if (node.parentId) {
        const parent = byId.get(node.parentId);
        expect(parent, `${node.id} has missing parent ${node.parentId}`).toBeDefined();
        expect(childFitsParent(node, parent!)).toBe(true);
      }
    }

    const siblingsByParent = new Map<string, typeof projection.nodes>();
    for (const node of projection.nodes) {
      const key = node.parentId ?? '__root__';
      siblingsByParent.set(key, [...(siblingsByParent.get(key) ?? []), node]);
    }

    for (const siblings of siblingsByParent.values()) {
      for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < siblings.length; rightIndex += 1) {
          expect(rectsOverlap(nodeRect(siblings[leftIndex]), nodeRect(siblings[rightIndex]))).toBe(false);
        }
      }
    }

    for (const edge of projection.edges) {
      expect(byId.has(edge.source)).toBe(true);
      expect(byId.has(edge.target)).toBe(true);
      expect(frameIds.has(edge.source)).toBe(false);
      expect(frameIds.has(edge.target)).toBe(false);
    }

    expect(byId.get('label-shared-nook')).toMatchObject({
      type: 'labelFrame',
      parentId: 'label-start',
    });
    expect(byId.get('node-choice')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'node-menu',
    });
    expect(projection.edges.map((edge) => [edge.id, edge.source, edge.target, edge.className])).toEqual([
      ['edge-call-nook', 'node-call-nook', 'start-node-shared-nook', 'project-edge project-edge--call'],
      ['edge-jump-day-two', 'node-jump-day-two', 'start-node-day-two', 'project-edge project-edge--jump'],
    ]);

    expect(searchProjectGraph(fullGraph, 'cheese arrow')).toEqual([
      expect.objectContaining({
        nodeId: 'node-choice',
        kind: 'scenario',
        content: '"Follow the dotted cheese arrow"',
      }),
    ]);
    expect(projectGraphDiagnosticsToProblems(fullGraph)).toEqual([
      expect.objectContaining({
        id: 'diagnostic-dynamic',
        code: 'dynamic_target',
        severity: 'info',
        nodeId: 'node-menu',
      }),
    ]);

    const absoluteChoicePosition = getAbsoluteNodePosition(projection.nodes, 'node-choice');
    const menuPosition = getAbsoluteNodePosition(projection.nodes, 'node-menu');
    expect(absoluteChoicePosition).not.toBeNull();
    expect(menuPosition).not.toBeNull();
    expect(absoluteChoicePosition!.x).toBeGreaterThan(menuPosition!.x);
    expect(absoluteChoicePosition!.y).toBeGreaterThan(menuPosition!.y);
  });
});
