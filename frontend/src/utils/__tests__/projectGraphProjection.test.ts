import { describe, expect, it } from 'vitest';
import {
  applySelectedDashedEdgeAnimation,
  buildNestedDragPreviewNodes,
  buildNearTargetStepPath,
  calculateProjectGraphViewportMetrics,
  expandAncestorFramesForMovedNodes,
  findProjectGraphNodeAtCanvasPoint,
  getProjectGraphHeaderDragGroupIds,
  getProjectGraphLodLevel,
  projectGraphNodeTypes,
  shouldTrackProjectGraphViewportLive,
  summarizeProjectGraphFrameMetrics,
} from '../../components/projectGraph/ProjectGraphCanvas';
import {
  buildLabelRelations,
  buildLabelRelationComponents,
  getAbsoluteNodePosition,
  measureLabelPackingQuality,
  projectGraphDiagnosticsToProblems,
  projectGraphToReactFlow,
  searchProjectGraph,
  shouldAutoPackLabelFrames,
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

const projectionEdgesByKind = (projection: ReturnType<typeof projectGraphToReactFlow>, kind: string) =>
  projection.edges.filter((edge) => edge.data?.kind === kind);

const labelFrameContentTop = 72;

describe('relation-aware label frame packing helpers', () => {
  it('maps zoom to stable canvas LOD buckets', () => {
    expect(getProjectGraphLodLevel(0.8)).toBe('full');
    expect(getProjectGraphLodLevel(0.55)).toBe('full');
    expect(getProjectGraphLodLevel(0.4)).toBe('compact');
    expect(getProjectGraphLodLevel(0.25)).toBe('compact');
    expect(getProjectGraphLodLevel(0.18)).toBe('bars');
    expect(getProjectGraphLodLevel(0.12)).toBe('bars');
    expect(getProjectGraphLodLevel(0.08)).toBe('map');
  });

  it('tracks viewport live only when remote cursor projection needs it', () => {
    expect(shouldTrackProjectGraphViewportLive(0)).toBe(false);
    expect(shouldTrackProjectGraphViewportLive(1)).toBe(true);
    expect(shouldTrackProjectGraphViewportLive(4)).toBe(true);
  });

  it('animates only dashed edges attached to the selected node', () => {
    const edges = [
      {
        id: 'edge-selected-jump',
        source: 'node-selected',
        target: 'node-target',
        animated: false,
        style: { strokeDasharray: '6 8' },
      },
      {
        id: 'edge-selected-call-target',
        source: 'node-source',
        target: 'node-selected',
        animated: false,
        style: { strokeDasharray: '5 7' },
      },
      {
        id: 'edge-unselected-call',
        source: 'node-source',
        target: 'node-other',
        animated: false,
        style: { strokeDasharray: '5 7' },
      },
      {
        id: 'edge-solid-selected',
        source: 'node-selected',
        target: 'node-solid-target',
        animated: true,
        style: {},
      },
    ];

    const selectedEdges = applySelectedDashedEdgeAnimation(edges as never, 'node-selected');
    expect(selectedEdges.map((edge) => [edge.id, edge.animated])).toEqual([
      ['edge-selected-jump', true],
      ['edge-selected-call-target', true],
      ['edge-unselected-call', false],
      ['edge-solid-selected', false],
    ]);

    const unselectedEdges = applySelectedDashedEdgeAnimation(selectedEdges, null);
    expect(unselectedEdges.every((edge) => edge.animated === false)).toBe(true);
  });

  it('summarizes dev frame samples as FPS and long-frame metrics', () => {
    const metrics = summarizeProjectGraphFrameMetrics([16, 18, 50, 32], 116);

    expect(metrics.sampleFrames).toBe(4);
    expect(metrics.fps).toBeCloseTo(34.48, 2);
    expect(metrics.averageFrameMs).toBe(29);
    expect(metrics.maxFrameMs).toBe(50);
    expect(metrics.longFrameCount).toBe(1);
  });

  it('calculates viewport dev metrics without treating offscreen nodes as visible', () => {
    const nodes = [
      makeCanvasNode('file-main', 'projectFrame', { x: 0, y: 0 }, { width: 1200, height: 900 }),
      makeCanvasNode('label-visible', 'labelFrame', { x: 40, y: 60 }, { width: 420, height: 260 }, 'file-main'),
      makeCanvasNode('start-visible', 'labelStart', { x: 32, y: 72 }, { width: 280, height: 72 }, 'label-visible'),
      makeCanvasNode('label-offscreen', 'labelFrame', { x: 1800, y: 60 }, { width: 420, height: 260 }, 'file-main'),
      makeCanvasNode('start-offscreen', 'labelStart', { x: 32, y: 72 }, { width: 280, height: 72 }, 'label-offscreen'),
    ];
    const edges = [
      {
        id: 'edge-visible-offscreen',
        source: 'start-visible',
        target: 'start-offscreen',
      },
    ];

    const metrics = calculateProjectGraphViewportMetrics(
      nodes,
      edges as never,
      { x: 0, y: 0, zoom: 1 },
      { width: 800, height: 600 },
    );

    expect(metrics.totalNodes).toBe(5);
    expect(metrics.totalEdges).toBe(1);
    expect(metrics.visibleNodes).toBe(3);
    expect(metrics.visibleNodeTypes).toMatchObject({
      projectFrame: 1,
      labelFrame: 1,
      labelStart: 1,
    });
    expect(metrics.crossingEdges).toBe(1);
    expect(metrics.flowRect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('builds weighted same-sibling label relations from resolved jump and call edges', () => {
    const relations = buildLabelRelations(makeRelationGraph());
    const byPair = new Map(relations.map((relation) => [`${relation.sourceLabelId}->${relation.targetLabelId}`, relation]));

    expect([...byPair.keys()].sort()).toEqual(['label-helper->label-hub', 'label-start->label-helper']);
    expect(byPair.get('label-start->label-helper')).toMatchObject({
      sourceLabelId: 'label-start',
      targetLabelId: 'label-helper',
      weight: 1.8,
    });
    expect([...byPair.get('label-start->label-helper')!.kinds].sort()).toEqual(['call', 'jump']);
    expect(byPair.get('label-helper->label-hub')).toMatchObject({
      sourceLabelId: 'label-helper',
      targetLabelId: 'label-hub',
      weight: 1,
    });
    expect([...byPair.get('label-helper->label-hub')!.kinds]).toEqual(['jump']);
  });

  it('detects import-like label groups without repacking existing 2D layouts', () => {
    const singleColumnLabels = Array.from({ length: 10 }, (_, index) =>
      makeCanvasNode(
        `label-${index}`,
        'labelFrame',
        { x: 48, y: 48 + index * 260 },
        { width: 320, height: 220 },
        'file-main',
      ),
    );
    const spreadLabels = singleColumnLabels.map((label, index) => ({
      ...label,
      position: { x: 48 + (index % 3) * 380, y: 48 + Math.floor(index / 3) * 260 },
    }));
    const manuallyManagedLabels = singleColumnLabels.map((label) => ({
      ...label,
      data: { manualPosition: true },
    }));

    expect(shouldAutoPackLabelFrames(singleColumnLabels, 0)).toBe(true);
    expect(shouldAutoPackLabelFrames(singleColumnLabels.slice(0, 2), 0)).toBe(false);
    expect(shouldAutoPackLabelFrames(singleColumnLabels.slice(0, 2), 1)).toBe(true);
    expect(shouldAutoPackLabelFrames(spreadLabels, 4)).toBe(false);
    expect(shouldAutoPackLabelFrames(manuallyManagedLabels, 4)).toBe(false);
  });

  it('splits label relations into deterministic connected components with isolated fallback labels last', () => {
    const components = buildLabelRelationComponents(
      ['label-a', 'label-isolated-1', 'label-b', 'label-c', 'label-d', 'label-isolated-2', 'label-e'],
      [
        { sourceLabelId: 'label-a', targetLabelId: 'label-b', weight: 1, kinds: new Set(['jump']) },
        { sourceLabelId: 'label-b', targetLabelId: 'label-c', weight: 1, kinds: new Set(['jump']) },
        { sourceLabelId: 'label-d', targetLabelId: 'label-e', weight: 0.8, kinds: new Set(['call']) },
        { sourceLabelId: 'label-a', targetLabelId: 'label-outside', weight: 1, kinds: new Set(['jump']) },
      ],
    );

    expect(components).toEqual([
      ['label-a', 'label-b', 'label-c'],
      ['label-d', 'label-e'],
      ['label-isolated-1', 'label-isolated-2'],
    ]);
  });

  it('measures relation distance, bounding area and overlaps for packed label groups', () => {
    const labels = [
      makeCanvasNode('label-a', 'labelFrame', { x: 0, y: 0 }, { width: 100, height: 100 }),
      makeCanvasNode('label-b', 'labelFrame', { x: 120, y: 0 }, { width: 100, height: 100 }),
      makeCanvasNode('label-c', 'labelFrame', { x: 80, y: 60 }, { width: 100, height: 100 }),
    ];
    const quality = measureLabelPackingQuality(labels, [
      { sourceLabelId: 'label-a', targetLabelId: 'label-b', weight: 1, kinds: new Set(['jump']) },
      { sourceLabelId: 'label-a', targetLabelId: 'label-missing', weight: 1, kinds: new Set(['jump']) },
    ]);

    expect(quality.weightedRelationDistance).toBe(120);
    expect(quality.boundingBoxArea).toBe(35200);
    expect(quality.overlapCount).toBe(2);
  });
});

const makeCanvasNode = (
  id: string,
  type: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  parentId?: string,
) => ({
  id,
  type,
  position,
  parentId,
  width: size.width,
  height: size.height,
  data: {},
  style: size,
});

const nodeRightPaddingInsideParent = (
  child: { position: { x: number }; width?: number },
  parent: { width?: number },
) => Number(parent.width ?? 0) - (child.position.x + Number(child.width ?? 0));

const nodeCenterX = (node: { position: { x: number }; width?: number }) =>
  node.position.x + Number(node.width ?? 0) / 2;

const distinctRoundedValues = (values: number[], tolerance = 24) => {
  const distinct: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (!distinct.some((seen) => Math.abs(seen - value) <= tolerance)) {
      distinct.push(value);
    }
  }
  return distinct;
};

const distanceBetweenNodes = (
  left: { position: { x: number; y: number }; width?: number; height?: number },
  right: { position: { x: number; y: number }; width?: number; height?: number },
) => {
  const leftCenter = {
    x: left.position.x + Number(left.width ?? 0) / 2,
    y: left.position.y + Number(left.height ?? 0) / 2,
  };
  const rightCenter = {
    x: right.position.x + Number(right.width ?? 0) / 2,
    y: right.position.y + Number(right.height ?? 0) / 2,
  };
  return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
};

const makeRelationGraph = (): ProjectGraphSnapshot => {
  const labels = [
    ['label-start', 'file-main', null, 'start', 0],
    ['label-helper', 'file-main', null, 'helper', 10],
    ['label-hub', 'file-main', null, 'hub', 20],
    ['label-other-file', 'file-other', null, 'other_file', 0],
    ['label-local', 'file-main', 'label-start', 'start.local', 5],
  ] as const;

  return {
    project_id: 'relation-builder-project',
    files: [
      {
        id: 'file-main',
        path: 'script.rpy',
        order: '0000',
        visual: { position: { x: 0, y: 0 }, size: { width: 1200, height: 900 } },
      },
      {
        id: 'file-other',
        path: 'other.rpy',
        order: '0001',
        visual: { position: { x: 1400, y: 0 }, size: { width: 1200, height: 900 } },
      },
    ],
    labels: labels.map(([id, fileId, parentLabelId, qualifiedName, sourceLine]) => ({
      id,
      file_id: fileId,
      parent_label_id: parentLabelId,
      name: qualifiedName.split('.').at(-1) ?? qualifiedName,
      qualified_name: qualifiedName,
      scope: parentLabelId ? 'local' : 'global',
      label_start_node_id: `start-${id}`,
      source_span: { start_line: sourceLine, end_line: sourceLine },
      visual: { position: { x: 48, y: 48 + sourceLine * 20 }, size: { width: 320, height: 220 } },
    })),
    label_starts: labels.map(([id, fileId, , qualifiedName]) => ({
      id: `start-${id}`,
      file_id: fileId,
      label_id: id,
      qualified_name: qualifiedName,
      content: `label ${qualifiedName}:`,
      visual: { position: { x: 32, y: 96 }, size: { width: 280, height: 72 } },
    })),
    nodes: [
      {
        id: 'node-jump-helper',
        file_id: 'file-main',
        label_id: 'label-start',
        parent_node_id: null,
        type: 'jump',
        content: 'jump helper',
        order: '0000',
        source_span: { start_line: 1, end_line: 1 },
        metadata: {},
        visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
      },
      {
        id: 'node-call-helper',
        file_id: 'file-main',
        label_id: 'label-start',
        parent_node_id: null,
        type: 'call',
        content: 'call helper',
        order: '0001',
        source_span: { start_line: 2, end_line: 2 },
        metadata: {},
        visual: { position: { x: 96, y: 340 }, size: { width: 320, height: 88 } },
      },
      {
        id: 'node-jump-hub',
        file_id: 'file-main',
        label_id: 'label-helper',
        parent_node_id: null,
        type: 'jump',
        content: 'jump hub',
        order: '0000',
        source_span: { start_line: 11, end_line: 11 },
        metadata: {},
        visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
      },
      {
        id: 'node-self-jump',
        file_id: 'file-main',
        label_id: 'label-helper',
        parent_node_id: null,
        type: 'jump',
        content: 'jump helper',
        order: '0001',
        source_span: { start_line: 12, end_line: 12 },
        metadata: {},
        visual: { position: { x: 96, y: 340 }, size: { width: 320, height: 88 } },
      },
      {
        id: 'node-cross-file-jump',
        file_id: 'file-main',
        label_id: 'label-hub',
        parent_node_id: null,
        type: 'jump',
        content: 'jump other_file',
        order: '0000',
        source_span: { start_line: 21, end_line: 21 },
        metadata: {},
        visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
      },
      {
        id: 'node-cross-parent-jump',
        file_id: 'file-main',
        label_id: 'label-start',
        parent_node_id: null,
        type: 'jump',
        content: 'jump .local',
        order: '0002',
        source_span: { start_line: 3, end_line: 3 },
        metadata: {},
        visual: { position: { x: 96, y: 460 }, size: { width: 320, height: 88 } },
      },
    ],
    edges: [
      {
        id: 'edge-jump-helper',
        source_node_id: 'node-jump-helper',
        target_node_id: 'start-label-helper',
        kind: 'jump',
        metadata: { target: 'helper' },
      },
      {
        id: 'edge-call-helper',
        source_node_id: 'node-call-helper',
        target_node_id: 'start-label-helper',
        kind: 'call',
        metadata: { target: 'helper' },
      },
      {
        id: 'edge-jump-hub',
        source_node_id: 'node-jump-hub',
        target_node_id: 'start-label-hub',
        kind: 'jump',
        metadata: { target: 'hub' },
      },
      {
        id: 'edge-self-jump',
        source_node_id: 'node-self-jump',
        target_node_id: 'start-label-helper',
        kind: 'jump',
        metadata: { target: 'helper' },
      },
      {
        id: 'edge-cross-file-jump',
        source_node_id: 'node-cross-file-jump',
        target_node_id: 'start-label-other-file',
        kind: 'jump',
        metadata: { target: 'other_file' },
      },
      {
        id: 'edge-cross-parent-jump',
        source_node_id: 'node-cross-parent-jump',
        target_node_id: 'start-label-local',
        kind: 'jump',
        metadata: { target: '.local' },
      },
    ],
    diagnostics: [],
    source_index: { files: {} },
  };
};

const makeManyLabelPackingGraph = (labelCount = 30): ProjectGraphSnapshot => {
  const labels = Array.from({ length: labelCount }, (_, index) => ({
    id: `label-helper-${index}`,
    file_id: 'file-main',
    parent_label_id: null,
    name: `helper_${index}`,
    qualified_name: `helper_${index}`,
    scope: 'global' as const,
    label_start_node_id: `start-helper-${index}`,
    source_span: { start_line: index * 10, end_line: index * 10 },
    visual: {
      position: { x: 48, y: 48 + index * 276 },
      size: { width: 280, height: 180 },
    },
  }));

  return {
    project_id: 'many-label-packing-project',
    files: [
      {
        id: 'file-main',
        path: 'helpers.rpy',
        order: '0000',
        visual: { position: { x: 0, y: 0 }, size: { width: 1600, height: 9000 } },
      },
    ],
    labels,
    label_starts: labels.map((label) => ({
      id: label.label_start_node_id,
      file_id: label.file_id,
      label_id: label.id,
      qualified_name: label.qualified_name,
      content: `label ${label.qualified_name}:`,
      visual: { position: { x: 32, y: 96 }, size: { width: 220, height: 72 } },
    })),
    nodes: [],
    edges: [],
    diagnostics: [],
    source_index: { files: {} },
  };
};

const makeLateTargetPackingGraph = (): ProjectGraphSnapshot => {
  const graph = makeManyLabelPackingGraph(30);
  graph.nodes = [20, 25, 29].map((targetIndex, relationIndex) => ({
    id: `node-jump-late-${targetIndex}`,
    file_id: 'file-main',
    label_id: 'label-helper-0',
    parent_node_id: null,
    type: 'jump',
    content: `jump helper_${targetIndex}`,
    order: `${relationIndex}`.padStart(4, '0'),
    source_span: { start_line: relationIndex + 1, end_line: relationIndex + 1 },
    metadata: {},
    visual: { position: { x: 96, y: 220 + relationIndex * 112 }, size: { width: 320, height: 88 } },
  }));
  graph.edges = [20, 25, 29].map((targetIndex) => ({
    id: `edge-jump-late-${targetIndex}`,
    source_node_id: `node-jump-late-${targetIndex}`,
    target_node_id: `start-helper-${targetIndex}`,
    kind: 'jump',
    metadata: { target: `helper_${targetIndex}` },
  }));
  return graph;
};

const makeRelationComponentPackingGraph = (): ProjectGraphSnapshot => {
  const graph = makeManyLabelPackingGraph(12);
  graph.nodes = [8, 9].map((targetIndex, relationIndex) => ({
    id: `node-jump-component-${targetIndex}`,
    file_id: 'file-main',
    label_id: 'label-helper-0',
    parent_node_id: null,
    type: 'jump',
    content: `jump helper_${targetIndex}`,
    order: `${relationIndex}`.padStart(4, '0'),
    source_span: { start_line: relationIndex + 1, end_line: relationIndex + 1 },
    metadata: {},
    visual: { position: { x: 96, y: 220 + relationIndex * 112 }, size: { width: 320, height: 88 } },
  }));
  graph.edges = [8, 9].map((targetIndex) => ({
    id: `edge-jump-component-${targetIndex}`,
    source_node_id: `node-jump-component-${targetIndex}`,
    target_node_id: `start-helper-${targetIndex}`,
    kind: 'jump',
    metadata: { target: `helper_${targetIndex}` },
  }));
  return graph;
};

const makeIncomingHubPackingGraph = (): ProjectGraphSnapshot => {
  const graph = makeManyLabelPackingGraph(30);
  const sourceIndexes = Array.from({ length: 9 }, (_, index) => index);
  graph.nodes = sourceIndexes.map((sourceIndex) => ({
    id: `node-jump-hub-${sourceIndex}`,
    file_id: 'file-main',
    label_id: `label-helper-${sourceIndex}`,
    parent_node_id: null,
    type: 'jump',
    content: 'jump helper_29',
    order: '0000',
    source_span: { start_line: sourceIndex * 10 + 1, end_line: sourceIndex * 10 + 1 },
    metadata: {},
    visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
  }));
  graph.edges = sourceIndexes.map((sourceIndex) => ({
    id: `edge-jump-hub-${sourceIndex}`,
    source_node_id: `node-jump-hub-${sourceIndex}`,
    target_node_id: 'start-helper-29',
    kind: 'jump',
    metadata: { target: 'helper_29' },
  }));
  return graph;
};

const makeMixedSizeRelationPackingGraph = (): ProjectGraphSnapshot => {
  const graph = makeManyLabelPackingGraph(14);
  graph.labels = graph.labels.map((label, index) => ({
    ...label,
    visual: {
      ...label.visual,
      size:
        index === 0
          ? { width: 620, height: 460 }
          : index % 4 === 0
            ? { width: 420, height: 300 }
            : { width: 240, height: 150 },
    },
  }));
  graph.nodes = Array.from({ length: 8 }, (_, relationIndex) => ({
    id: `node-mixed-jump-${relationIndex}`,
    file_id: 'file-main',
    label_id: `label-helper-${relationIndex}`,
    parent_node_id: null,
    type: 'jump',
    content: `jump helper_${relationIndex + 1}`,
    order: '0000',
    source_span: { start_line: relationIndex * 10 + 1, end_line: relationIndex * 10 + 1 },
    metadata: {},
    visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
  }));
  graph.edges = Array.from({ length: 8 }, (_, relationIndex) => ({
    id: `edge-mixed-jump-${relationIndex}`,
    source_node_id: `node-mixed-jump-${relationIndex}`,
    target_node_id: `start-helper-${relationIndex + 1}`,
    kind: 'jump',
    metadata: { target: `helper_${relationIndex + 1}` },
  }));
  return graph;
};

const makeManualTwoDimensionalLabelGraph = (): ProjectGraphSnapshot => {
  const graph = makeLateTargetPackingGraph();
  const manualPositions = new Map(
    graph.labels.map((label, index) => [
      label.id,
      {
        x: 64 + (index % 3) * 700,
        y: 80 + Math.floor(index / 3) * 700,
      },
    ]),
  );

  graph.labels = graph.labels.map((label) => ({
    ...label,
    visual: {
      ...label.visual,
      position: manualPositions.get(label.id)!,
    },
  }));

  return graph;
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
  it('expands ancestor frames in the direction of a dragged nested item', () => {
    const nodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 600, height: 420 }),
      makeCanvasNode('label', 'labelFrame', { x: 48, y: 48 }, { width: 420, height: 300 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 32, y: 72 }, { width: 260, height: 72 }, 'label'),
      makeCanvasNode('local-label', 'labelFrame', { x: 360, y: 260 }, { width: 240, height: 180 }, 'label'),
    ];

    const expanded = expandAncestorFramesForMovedNodes(nodes, new Set(['local-label']));
    const file = expanded.find((node) => node.id === 'file')!;
    const label = expanded.find((node) => node.id === 'label')!;
    const localLabel = expanded.find((node) => node.id === 'local-label')!;

    expect(localLabel.position).toEqual({ x: 360, y: 260 });
    expect(label.width).toBeGreaterThanOrEqual(360 + 240 + 32);
    expect(label.height).toBeGreaterThanOrEqual(260 + 180 + 32);
    expect(file.width).toBeGreaterThanOrEqual(label.position.x + Number(label.width) + 32);
    expect(file.height).toBeGreaterThanOrEqual(label.position.y + Number(label.height) + 32);
  });

  it('derives live parent frame size from current children instead of retaining stale drag expansion', () => {
    const nodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 1200, height: 760 }),
      makeCanvasNode('label', 'labelFrame', { x: 48, y: 48 }, { width: 1040, height: 620 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 32, y: 72 }, { width: 260, height: 72 }, 'label'),
      makeCanvasNode('action', 'scenarioNode', { x: 96, y: 220 }, { width: 320, height: 88 }, 'label'),
    ];

    const expanded = expandAncestorFramesForMovedNodes(nodes, new Set(['action']));
    const label = expanded.find((node) => node.id === 'label')!;
    const action = expanded.find((node) => node.id === 'action')!;

    expect(action.position).toEqual({ x: 96, y: 220 });
    expect(label.width).toBeLessThan(1040);
    expect(label.height).toBeLessThan(620);
    expect(label.width).toBeGreaterThanOrEqual(action.position.x + Number(action.width) + 32);
    expect(label.height).toBeGreaterThanOrEqual(action.position.y + Number(action.height) + 32);
  });

  it('keeps a held child under the cursor and restores stable frame padding across drag ticks', () => {
    const baselineNodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 900, height: 640 }),
      makeCanvasNode('label', 'labelFrame', { x: 48, y: 48 }, { width: 520, height: 360 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 32, y: 72 }, { width: 260, height: 72 }, 'label'),
      makeCanvasNode('action', 'scenarioNode', { x: 96, y: 220 }, { width: 320, height: 88 }, 'label'),
    ];
    const baselineMovedPositions = new Map([['action', { x: 96, y: 220 }]]);
    const movedIds = new Set(['action']);
    const baselineActionAbsolute = getAbsoluteNodePosition(baselineNodes, 'action')!;

    const pushedLeft = buildNestedDragPreviewNodes(baselineNodes, movedIds, baselineMovedPositions, {
      x: -180,
      y: 0,
    });
    const pushedLeftLabel = pushedLeft.find((node) => node.id === 'label')!;
    const pushedLeftAction = pushedLeft.find((node) => node.id === 'action')!;
    const pushedLeftLabelAbsolute = getAbsoluteNodePosition(pushedLeft, 'label')!;
    const pushedLeftActionAbsolute = getAbsoluteNodePosition(pushedLeft, 'action')!;

    expect(pushedLeftLabelAbsolute.x).toBeLessThan(48);
    expect(pushedLeftActionAbsolute).toEqual({
      x: baselineActionAbsolute.x - 180,
      y: baselineActionAbsolute.y,
    });
    expect(pushedLeftAction.position.x).toBe(32);

    const pushedRight = buildNestedDragPreviewNodes(baselineNodes, movedIds, baselineMovedPositions, {
      x: 424,
      y: 0,
    });
    const pushedRightLabel = pushedRight.find((node) => node.id === 'label')!;
    const pushedRightAction = pushedRight.find((node) => node.id === 'action')!;
    const pushedRightActionAbsolute = getAbsoluteNodePosition(pushedRight, 'action')!;

    expect(pushedRightAction.position.x).toBe(520);
    expect(pushedRightActionAbsolute).toEqual({
      x: baselineActionAbsolute.x + 424,
      y: baselineActionAbsolute.y,
    });
    expect(nodeRightPaddingInsideParent(pushedRightAction, pushedRightLabel)).toBe(32);

    const returned = buildNestedDragPreviewNodes(baselineNodes, movedIds, baselineMovedPositions, {
      x: 0,
      y: 0,
    });
    const returnedLabel = returned.find((node) => node.id === 'label')!;
    const returnedAction = returned.find((node) => node.id === 'action')!;
    const returnedActionAbsolute = getAbsoluteNodePosition(returned, 'action')!;

    expect(returnedLabel.position).toEqual({ x: 48, y: 48 });
    expect(returnedLabel.width).toBe(520);
    expect(returnedAction.position).toEqual({ x: 96, y: 220 });
    expect(returnedActionAbsolute).toEqual(baselineActionAbsolute);
  });

  it('uses semantic drag groups for label starts, branch-managed nodes, and simple nodes', () => {
    const nodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 900, height: 640 }),
      makeCanvasNode('label', 'labelFrame', { x: 48, y: 48 }, { width: 520, height: 360 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 32, y: 72 }, { width: 260, height: 72 }, 'label'),
      {
        ...makeCanvasNode('branch-action', 'scenarioNode', { x: 96, y: 220 }, { width: 320, height: 88 }, 'label'),
        data: { autoBranchLayout: true, dragGroupIds: ['branch-action'] },
      },
      {
        ...makeCanvasNode('simple-action', 'scenarioNode', { x: 96, y: 340 }, { width: 320, height: 88 }, 'label'),
        data: { dragGroupIds: ['simple-action'] },
      },
    ];

    expect(getProjectGraphHeaderDragGroupIds(nodes[2], nodes)).toEqual(['label']);
    expect(getProjectGraphHeaderDragGroupIds(nodes[3], nodes)).toEqual(['branch-action']);
    expect(getProjectGraphHeaderDragGroupIds(nodes[4], nodes)).toEqual(['simple-action']);

    const preview = buildNestedDragPreviewNodes(
      nodes,
      new Set(['label']),
      new Map([['label', { x: 48, y: 48 }]]),
      { x: -220, y: -160 },
    );
    const label = preview.find((node) => node.id === 'label')!;
    const start = preview.find((node) => node.id === 'start')!;

    expect(label.position).toEqual({ x: 48, y: 48 });
    expect(start.position).toEqual({ x: 32, y: 72 });
    expect(getAbsoluteNodePosition(preview, 'label')).toEqual({ x: -172, y: -112 });
    expect(getAbsoluteNodePosition(preview, 'start')).toEqual({ x: -140, y: -40 });

    const branchPreview = buildNestedDragPreviewNodes(
      nodes,
      new Set(['branch-action']),
      new Map([['branch-action', { x: 96, y: 220 }]]),
      { x: 140, y: -40 },
    );
    expect(branchPreview.find((node) => node.id === 'label')?.position).toEqual({ x: 48, y: 48 });
    expect(branchPreview.find((node) => node.id === 'branch-action')?.position).toEqual({ x: 236, y: 180 });
  });

  it('hit-tests body clicks to the deepest visible node while body drag remains pane-owned', () => {
    const nodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 900, height: 640 }),
      makeCanvasNode('label', 'labelFrame', { x: 48, y: 48 }, { width: 520, height: 360 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 32, y: 72 }, { width: 260, height: 72 }, 'label'),
      makeCanvasNode('action', 'scenarioNode', { x: 96, y: 220 }, { width: 320, height: 88 }, 'label'),
    ];

    expect(findProjectGraphNodeAtCanvasPoint(nodes, { x: 48 + 96 + 12, y: 48 + 220 + 40 })?.id).toBe('action');
    expect(findProjectGraphNodeAtCanvasPoint(nodes, { x: 48 + 32 + 12, y: 48 + 72 + 30 })?.id).toBe('start');
    expect(findProjectGraphNodeAtCanvasPoint(nodes, { x: 48 + 500, y: 48 + 340 })?.id).toBe('label');
    expect(findProjectGraphNodeAtCanvasPoint(nodes, { x: 890, y: 620 })?.id).toBe('file');
    expect(findProjectGraphNodeAtCanvasPoint(nodes, { x: 960, y: 720 })).toBeNull();
  });

  it('rebases parent frames when a dragged child pushes the left or top wall', () => {
    const nodes = [
      makeCanvasNode('file', 'projectFrame', { x: 0, y: 0 }, { width: 800, height: 600 }),
      makeCanvasNode('label', 'labelFrame', { x: 120, y: 120 }, { width: 520, height: 380 }, 'file'),
      makeCanvasNode('start', 'labelStart', { x: 64, y: 96 }, { width: 260, height: 72 }, 'label'),
      makeCanvasNode('local-label', 'labelFrame', { x: -80, y: 24 }, { width: 240, height: 180 }, 'label'),
    ];
    const startBefore = { x: 120 + 64, y: 120 + 96 };

    const expanded = expandAncestorFramesForMovedNodes(nodes, new Set(['local-label']));
    const file = expanded.find((node) => node.id === 'file')!;
    const label = expanded.find((node) => node.id === 'label')!;
    const start = expanded.find((node) => node.id === 'start')!;
    const localLabel = expanded.find((node) => node.id === 'local-label')!;

    expect(label.position.x).toBeLessThan(120);
    expect(label.position.y).toBeLessThan(120);
    expect(localLabel.position.x).toBe(32);
    expect(localLabel.position.y).toBe(labelFrameContentTop);
    expect(file.position.x + label.position.x + start.position.x).toBe(startBefore.x);
    expect(file.position.y + label.position.y + start.position.y).toBe(startBefore.y);
  });

  it('projects file frames, label frames, label starts, and scenario nodes', () => {
    const projection = projectGraphToReactFlow(graph);

    expect(projection.nodes.map((node) => node.id)).toEqual([
      'file-day-1',
      'label-start',
      'start-node-start',
      'node-dialogue-1',
    ]);
    expect(projection.edges).toEqual([
      expect.objectContaining({
        source: 'start-node-start',
        target: 'node-dialogue-1',
        data: expect.objectContaining({ derived: true, kind: 'sequence' }),
      }),
    ]);

    const fileNode = projection.nodes.find((node) => node.id === 'file-day-1');
    expect(fileNode).toMatchObject({
      type: 'projectFrame',
      position: { x: 0, y: 0 },
        data: { kind: 'file', path: 'day_1.rpy', title: 'day_1.rpy' },
      });
    expect(projection.nodes.every((node) => node.dragHandle === '.pg-node__drag-handle')).toBe(true);
    expect(projection.nodes.every((node) => node.className === 'project-graph-rf-node')).toBe(true);
    expect(Number(fileNode?.width)).toBeLessThan(1200);
    expect(Number(fileNode?.height)).toBeLessThan(800);
    expect(fileNode?.style).toMatchObject({ width: fileNode?.width, height: fileNode?.height });

    const labelNode = projection.nodes.find((node) => node.id === 'label-start');
    expect(labelNode).toMatchObject({
      type: 'labelFrame',
      parentId: 'file-day-1',
      data: { kind: 'label', qualifiedName: 'start', title: 'start' },
    });
    expect(labelNode?.extent).toBeUndefined();

    const startNode = projection.nodes.find((node) => node.id === 'start-node-start');
    expect(startNode).toMatchObject({
      type: 'labelStart',
      parentId: 'label-start',
      data: { kind: 'labelStart', qualifiedName: 'start', content: 'label start:' },
      dragHandle: '.pg-node__drag-handle',
    });
    expect(startNode?.extent).toBeUndefined();
    expect(startNode?.position.y).toBeGreaterThanOrEqual(labelFrameContentTop);

    const scenarioNode = projection.nodes.find((node) => node.id === 'node-dialogue-1');
    expect(scenarioNode).toMatchObject({
      type: 'scenarioNode',
      parentId: 'label-start',
      data: { kind: 'scenario', scenarioType: 'dialogue', content: 'r "Hello projection."' },
      dragHandle: '.pg-node__drag-handle',
    });
    expect(scenarioNode?.extent).toBeUndefined();
    expect(Math.abs(nodeCenterX(startNode!) - nodeCenterX(scenarioNode!))).toBeLessThanOrEqual(1);
    expect(projection.edges.find((edge) => edge.source === startNode?.id && edge.target === scenarioNode?.id)).toMatchObject({
      type: 'straight',
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
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

  it('preserves manually moved root file frames above and left of the initial import area', () => {
    const movedGraph: ProjectGraphSnapshot = {
      ...graph,
      files: [
        {
          ...graph.files[0],
          visual: { ...graph.files[0].visual, position: { x: -640, y: -360 } },
        },
      ],
    };

    const projection = projectGraphToReactFlow(movedGraph);
    expect(projection.nodes.find((node) => node.id === 'file-day-1')?.position).toEqual({ x: -640, y: -360 });
  });

  it('keeps old manual offsets from breaking a simple label vertical story column', () => {
    const manualSimpleGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          metadata: { _manual_position: true },
          visual: { position: { x: 188, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-return',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'return',
          content: 'return',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: { _manual_position: true },
          visual: { position: { x: 72, y: 280 }, size: { width: 320, height: 88 } },
        },
      ],
    };

    const projection = projectGraphToReactFlow(manualSimpleGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const startNode = byId.get('start-node-start')!;
    const dialogueNode = byId.get('node-dialogue-1')!;
    const returnNode = byId.get('node-return')!;

    expect(Math.abs(nodeCenterX(startNode) - nodeCenterX(dialogueNode))).toBeLessThanOrEqual(1);
    expect(Math.abs(nodeCenterX(dialogueNode) - nodeCenterX(returnNode))).toBeLessThanOrEqual(1);
    expect(
      projection.edges
        .filter((edge) => edge.data?.kind === 'sequence')
        .map((edge) => `${edge.source}->${edge.target}:${edge.type}`),
    ).toEqual(['start-node-start->node-dialogue-1:straight', 'node-dialogue-1->node-return:straight']);
  });

  it('uses action metadata as the visible scenario title without changing content', () => {
    const actionGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          id: 'node-action-block',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: [
            '# RenPy Mouse enters the maze with too many tiny monologues.',
            'scene maze morning',
            'show renpy curious at center',
            'r "The first corridor smells like compiled cheese."',
          ].join('\n'),
          order: '0000',
          source_span: { start_line: 1, end_line: 4 },
          metadata: { default_title: '# RenPy Mouse enters the maze with too many tiny monologues.' },
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 128 } },
        },
      ],
    };

    const projection = projectGraphToReactFlow(actionGraph);
    const actionNode = projection.nodes.find((node) => node.id === 'node-action-block');

    expect(actionNode).toMatchObject({
      type: 'scenarioNode',
      data: {
        scenarioType: 'action',
        title: '# RenPy Mouse enters the maze with too many tiny monologues.',
        content: actionGraph.nodes[0].content,
      },
    });
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
    });
    expect(byId.get('label-start-shared-nook')?.extent).toBeUndefined();
    expect(byId.get('start-node-shared-nook')).toMatchObject({
      type: 'labelStart',
      parentId: 'label-start-shared-nook',
    });
    expect(byId.get('start-node-shared-nook')?.extent).toBeUndefined();
    expect(byId.get('node-menu-choice')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'label-start',
      data: expect.objectContaining({
        original: expect.objectContaining({ parent_node_id: 'node-menu' }),
      }),
    });
    expect(byId.get('node-call-local')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'label-start',
      data: expect.objectContaining({
        original: expect.objectContaining({ parent_node_id: 'node-menu-choice' }),
      }),
    });

    const frameIds = new Set(
      projection.nodes
        .filter((node) => node.type === 'projectFrame' || node.type === 'labelFrame')
        .map((node) => node.id),
    );
    expect(projection.edges.every((edge) => !frameIds.has(edge.source) && !frameIds.has(edge.target))).toBe(true);

    const relationEdges = projection.edges.filter((edge) => edge.data?.kind === 'jump' || edge.data?.kind === 'call');
    expect(relationEdges).toEqual([
      expect.objectContaining({
        id: 'edge-dialogue-jump-start',
        source: 'node-dialogue-1',
        target: 'start-node-start',
        type: 'smoothstep',
        animated: false,
        className: 'project-edge project-edge--jump',
        data: expect.objectContaining({ kind: 'jump' }),
        markerEnd: { type: 'arrowclosed' },
        selectable: false,
        focusable: false,
        interactionWidth: 10,
        zIndex: 3,
        sourceHandle: 'relation-out',
        targetHandle: 'flow-in',
        style: expect.objectContaining({ opacity: 0.34, strokeWidth: 1.8, strokeDasharray: '6 8' }),
      }),
      expect.objectContaining({
        id: 'edge-call-local-start',
        source: 'node-call-local',
        target: 'start-node-shared-nook',
        type: 'smoothstep',
        animated: false,
        className: 'project-edge project-edge--call',
        data: expect.objectContaining({ kind: 'call' }),
        selectable: false,
        focusable: false,
        interactionWidth: 10,
        zIndex: 3,
        sourceHandle: 'relation-out',
        targetHandle: 'flow-in',
        style: expect.objectContaining({ opacity: 0.38, strokeWidth: 1.8, strokeDasharray: '5 7' }),
      }),
    ]);
  });

  it('projects sequence and branch arrows for conditional story trees', () => {
    const conditionalGraph: ProjectGraphSnapshot = {
      ...graph,
      labels: [
        ...graph.labels,
        {
          id: 'label-local-note',
          file_id: 'file-day-1',
          parent_label_id: 'label-start',
          name: '.local_note',
          qualified_name: 'start.local_note',
          scope: 'local',
          label_start_node_id: 'start-node-local-note',
          source_span: { start_line: 10, end_line: 10 },
          visual: { position: { x: 1200, y: 120 }, size: { width: 320, height: 180 } },
        },
      ],
      label_starts: [
        ...graph.label_starts,
        {
          id: 'start-node-local-note',
          file_id: 'file-day-1',
          label_id: 'label-local-note',
          qualified_name: 'start.local_note',
          content: 'label .local_note:',
          visual: { position: { x: 24, y: 24 }, size: { width: 240, height: 64 } },
        },
      ],
      nodes: [
        {
          id: 'node-intro-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'r "RenPy Mouse reaches a fork in the cheese maze."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: { default_title: 'r "RenPy Mouse reaches a fork in the cheese maze."' },
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-if-cheese',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if cheese_compass_ready:',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: { condition: 'cheese_compass_ready' },
          visual: { position: { x: 96, y: 256 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-if-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-cheese',
          type: 'action',
          content: 'r "The compass points at cheddar."',
          order: '0001.0000',
          source_span: { start_line: 3, end_line: 3 },
          metadata: { default_title: 'r "The compass points at cheddar."' },
          visual: { position: { x: 24, y: 48 }, size: { width: 300, height: 88 } },
        },
        {
          id: 'node-else-cheese',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'else',
          content: 'else:',
          order: '0002',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { condition: null },
          visual: { position: { x: 96, y: 376 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-inner-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-cheese',
          type: 'if',
          content: 'if cheddar_door_open:',
          order: '0001.0001',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { condition: 'cheddar_door_open' },
          visual: { position: { x: 24, y: 160 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-inner-if-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-inner-if',
          type: 'action',
          content: 'r "The inner door opens."',
          order: '0001.0001.0000',
          source_span: { start_line: 5, end_line: 5 },
          metadata: { default_title: 'r "The inner door opens."' },
          visual: { position: { x: 24, y: 48 }, size: { width: 300, height: 88 } },
        },
        {
          id: 'node-inner-else',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-cheese',
          type: 'else',
          content: 'else:',
          order: '0001.0002',
          source_span: { start_line: 6, end_line: 6 },
          metadata: { condition: null },
          visual: { position: { x: 24, y: 272 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-inner-else-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-inner-else',
          type: 'action',
          content: 'r "The inner door asks for more crumbs."',
          order: '0001.0002.0000',
          source_span: { start_line: 7, end_line: 7 },
          metadata: { default_title: 'r "The inner door asks for more crumbs."' },
          visual: { position: { x: 24, y: 48 }, size: { width: 300, height: 88 } },
        },
        {
          id: 'node-else-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-else-cheese',
          type: 'action',
          content: 'r "The compass points at a TODO."',
          order: '0002.0000',
          source_span: { start_line: 8, end_line: 8 },
          metadata: { default_title: 'r "The compass points at a TODO."' },
          visual: { position: { x: 24, y: 48 }, size: { width: 300, height: 88 } },
        },
        {
          id: 'node-after-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'r "The maze joins again after the fork."',
          order: '0003',
          source_span: { start_line: 9, end_line: 9 },
          metadata: { default_title: 'r "The maze joins again after the fork."' },
          visual: { position: { x: 96, y: 496 }, size: { width: 320, height: 96 } },
        },
      ],
      edges: [],
    };

    const projection = projectGraphToReactFlow(conditionalGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const ifNode = byId.get('node-if-cheese')!;
    const introAction = byId.get('node-intro-action')!;
    const startNode = byId.get('start-node-start')!;
    const ifAction = byId.get('node-if-action')!;
    const innerIf = byId.get('node-inner-if')!;
    const innerIfAction = byId.get('node-inner-if-action')!;
    const innerElse = byId.get('node-inner-else')!;
    const innerElseAction = byId.get('node-inner-else-action')!;
    const elseNode = byId.get('node-else-cheese')!;
    const elseAction = byId.get('node-else-action')!;
    const afterNode = byId.get('node-after-action')!;
    const localNoteLabel = byId.get('label-local-note')!;
    const branchEdges = projectionEdgesByKind(projection, 'branch');
    const sequenceEdges = projectionEdgesByKind(projection, 'sequence');
    const edgePairs = (edges: typeof projection.edges) => new Set(edges.map((edge) => `${edge.source}->${edge.target}`));
    const rejoinEdges = sequenceEdges.filter((edge) => edge.data?.flowRole === 'rejoin');

    expect(edgePairs(sequenceEdges)).toEqual(
      new Set([
        'start-node-start->node-intro-action',
        'node-intro-action->node-if-cheese',
        'node-if-action->node-inner-if',
        'node-inner-if-action->node-after-action',
        'node-inner-else-action->node-after-action',
        'node-else-action->node-after-action',
      ]),
    );
    expect(edgePairs(branchEdges)).toEqual(
      new Set([
        'node-if-cheese->node-if-action',
        'node-if-cheese->node-else-cheese',
        'node-inner-if->node-inner-if-action',
        'node-inner-if->node-inner-else',
      ]),
    );
    expect(branchEdges.find((edge) => edge.source === 'node-if-cheese' && edge.target === 'node-else-cheese')).toMatchObject({
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    });
    expect(branchEdges.find((edge) => edge.source === 'node-else-cheese' && edge.target === 'node-else-action')).toBeUndefined();
    expect(branchEdges.find((edge) => edge.source === 'node-inner-else' && edge.target === 'node-inner-else-action')).toBeUndefined();
    expect(branchEdges.find((edge) => edge.source === 'node-if-cheese' && edge.target === 'node-if-action')).toMatchObject({
      type: 'nearTargetStep',
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
      data: expect.objectContaining({ direction: 'source-vertical', sourceTurnOffset: 36, targetTurnOffset: 24 }),
    });
    expect(sequenceEdges.find((edge) => edge.source === 'start-node-start' && edge.target === 'node-intro-action')).toMatchObject({
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    });
    expect(
      projection.edges
        .filter((edge) => edge.data?.derived === true && edge.data?.flowRole !== 'rejoin' && edge.data?.kind !== 'branch')
        .every((edge) => edge.type === 'step' || edge.type === 'straight'),
    ).toBe(true);
    expect(branchEdges.every((edge) => edge.type === 'nearTargetStep')).toBe(true);
    expect(rejoinEdges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual([
      'node-else-action->node-after-action',
      'node-inner-else-action->node-after-action',
      'node-inner-if-action->node-after-action',
    ]);
    expect(rejoinEdges.every((edge) => String(edge.className ?? '').includes('project-edge--rejoin'))).toBe(true);
    expect(rejoinEdges.every((edge) => edge.type === 'nearTargetStep')).toBe(true);
    expect(rejoinEdges.every((edge) => edge.data?.targetTurnOffset === 24)).toBe(true);
    expect(rejoinEdges.every((edge) => Number(edge.style?.opacity ?? 1) < 0.5)).toBe(true);

    expect(ifAction.parentId).toBe('label-start');
    expect(innerIf.parentId).toBe('label-start');
    expect(innerIfAction.parentId).toBe('label-start');
    expect(innerElse.parentId).toBe('label-start');
    expect(innerElseAction.parentId).toBe('label-start');
    expect(elseAction.parentId).toBe('label-start');
    expect(Number(ifNode.height)).toBe(96);
    expect(Number(elseNode.height)).toBeLessThanOrEqual(44);
    expect(Number(innerElse.height)).toBeLessThanOrEqual(44);
    expect(elseNode.data).toMatchObject({ visualRole: 'branchHeader' });
    expect(innerElse.data).toMatchObject({ visualRole: 'branchHeader' });
    expect(elseNode.data?.dragGroupIds).toEqual(expect.arrayContaining(['node-else-cheese', 'node-else-action']));
    expect(elseAction.data?.dragGroupIds).toEqual(expect.arrayContaining(['node-else-cheese', 'node-else-action']));
    expect(innerElse.data?.dragGroupIds).toEqual(expect.arrayContaining(['node-inner-else', 'node-inner-else-action']));
    expect(innerElseAction.data?.dragGroupIds).toEqual(expect.arrayContaining(['node-inner-else', 'node-inner-else-action']));
    expect(startNode.position.y).toBeGreaterThanOrEqual(80);
    expect(introAction.position.y).toBeGreaterThanOrEqual(startNode.position.y + Number(startNode.height) + 48);
    expect(ifNode.position.y).toBeGreaterThanOrEqual(introAction.position.y + Number(introAction.height) + 48);
    const ifCenterX = ifNode.position.x + Number(ifNode.width) / 2;
    const introCenterX = introAction.position.x + Number(introAction.width) / 2;
    const startCenterX = startNode.position.x + Number(startNode.width) / 2;
    expect(Math.abs(ifCenterX - introCenterX)).toBeLessThanOrEqual(2);
    expect(Math.abs(ifCenterX - startCenterX)).toBeLessThanOrEqual(2);
    expect(ifAction.position.x + Number(ifAction.width) / 2).toBeGreaterThanOrEqual(ifCenterX + 260);
    expect(elseNode.position.x + Number(elseNode.width) / 2).toBeLessThanOrEqual(ifCenterX - 260);
    expect(elseNode.position.y).toBeGreaterThanOrEqual(ifNode.position.y + Number(ifNode.height) + 48);
    expect(elseAction.position.y).toBe(elseNode.position.y + Number(elseNode.height));
    expect(Number(elseNode.width)).toBe(Number(elseAction.width));
    expect(Math.abs(elseAction.position.x + Number(elseAction.width) / 2 - (elseNode.position.x + Number(elseNode.width) / 2))).toBeLessThanOrEqual(2);
    expect(rectsOverlap(nodeRect(ifNode), nodeRect(elseNode))).toBe(false);
    expect(ifAction.position.y).toBeGreaterThanOrEqual(ifNode.position.y + Number(ifNode.height) + 48);
    expect(innerIf.position.y).toBeGreaterThanOrEqual(ifAction.position.y + Number(ifAction.height) + 48);
    const innerIfCenterX = innerIf.position.x + Number(innerIf.width) / 2;
    expect(Math.abs(innerIfCenterX - (ifAction.position.x + Number(ifAction.width) / 2))).toBeLessThanOrEqual(2);
    expect(innerIfAction.position.x + Number(innerIfAction.width) / 2).toBeGreaterThanOrEqual(innerIfCenterX + 260);
    expect(innerElse.position.x + Number(innerElse.width) / 2).toBeLessThanOrEqual(innerIfCenterX - 260);
    expect(innerElse.position.y).toBeGreaterThanOrEqual(innerIf.position.y + Number(innerIf.height) + 48);
    expect(innerElseAction.position.y).toBe(innerElse.position.y + Number(innerElse.height));
    expect(Number(innerElse.width)).toBe(Number(innerElseAction.width));
    expect(Math.abs(innerElseAction.position.x + Number(innerElseAction.width) / 2 - (innerElse.position.x + Number(innerElse.width) / 2))).toBeLessThanOrEqual(2);
    const trueSubtreeBottom = Math.max(
      ifAction.position.y + Number(ifAction.height),
      innerIf.position.y + Number(innerIf.height),
      innerIfAction.position.y + Number(innerIfAction.height),
      innerElse.position.y + Number(innerElse.height),
      innerElseAction.position.y + Number(innerElseAction.height),
    );
    expect(afterNode.position.y).toBeGreaterThanOrEqual(
      Math.max(
        innerIfAction.position.y + Number(innerIfAction.height),
        innerElseAction.position.y + Number(innerElseAction.height),
        elseAction.position.y + Number(elseAction.height),
      ) + 48,
    );
    expect(Math.abs(afterNode.position.x + Number(afterNode.width) / 2 - ifCenterX)).toBeLessThanOrEqual(2);
    const storyFlowBottom = Math.max(
      ...[startNode, introAction, ifNode, ifAction, innerIf, innerIfAction, innerElse, innerElseAction, elseNode, elseAction, afterNode]
        .map((node) => node.position.y + Number(node.height)),
    );
    expect(localNoteLabel.position.y).toBeGreaterThanOrEqual(storyFlowBottom + 24);

    const manuallyMovedBranchGraph: ProjectGraphSnapshot = {
      ...conditionalGraph,
      nodes: conditionalGraph.nodes.map((node) =>
        node.id === 'node-else-cheese'
          ? {
              ...node,
              metadata: { ...node.metadata, _manual_position: true },
              visual: { ...node.visual, position: { x: 64, y: 720 } },
            }
          : node.id === 'node-else-action'
          ? {
              ...node,
              metadata: { ...node.metadata, _manual_position: true },
              visual: { ...node.visual, position: { x: 64, y: 760 } },
            }
          : node,
      ),
    };
    const manualProjection = projectGraphToReactFlow(manuallyMovedBranchGraph);
    const manualById = new Map(manualProjection.nodes.map((node) => [node.id, node]));
    const manualIfNode = manualById.get('node-if-cheese')!;
    const manualElseNode = manualById.get('node-else-cheese')!;
    const manualElseAction = manualById.get('node-else-action')!;
    const manualAfterNode = manualById.get('node-after-action')!;
    const manualLocalNoteLabel = manualById.get('label-local-note')!;
    const manualIfCenterX = manualIfNode.position.x + Number(manualIfNode.width) / 2;
    const manualStoryFlowBottom = Math.max(
      ...manualProjection.nodes
        .filter((node) => node.parentId === 'label-start' && node.data?.autoBranchLayout === true)
        .map((node) => node.position.y + Number(node.height)),
    );

    expect(manualProjection.nodes.filter((node) => node.data?.autoBranchLayout === true).length).toBeGreaterThan(6);
    expect(manualElseNode.position).toEqual({ x: 64, y: 720 });
    expect(manualElseAction.position).toEqual({ x: 64, y: 760 });
    expect(manualElseAction.position.y).toBe(manualElseNode.position.y + Number(manualElseNode.height));
    expect(Number(manualElseNode.width)).toBe(Number(manualElseAction.width));
    expect(Math.abs(manualElseAction.position.x + Number(manualElseAction.width) / 2 - (manualElseNode.position.x + Number(manualElseNode.width) / 2))).toBeLessThanOrEqual(2);
    expect(manualElseNode.position.x + Number(manualElseNode.width) / 2).toBeLessThanOrEqual(manualIfCenterX - 260);
    expect(manualAfterNode.position.y).toBeGreaterThanOrEqual(
      manualElseAction.position.y + Number(manualElseAction.height) + 48,
    );
    expect(manualLocalNoteLabel.position.y).toBeGreaterThanOrEqual(manualStoryFlowBottom + 24);
  });

  it('draws an explicit false pass-through edge when if has no else branch', () => {
    const graphWithoutElse: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          id: 'node-intro-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'r "RenPy Mouse checks the corridor."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: { default_title: 'r "RenPy Mouse checks the corridor."' },
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-if-cheese',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if cheese_ready:',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: { condition: 'cheese_ready' },
          visual: { position: { x: 96, y: 256 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-if-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-cheese',
          type: 'action',
          content: 'r "The cheese path is true."',
          order: '0001.0000',
          source_span: { start_line: 3, end_line: 3 },
          metadata: { default_title: 'r "The cheese path is true."' },
          visual: { position: { x: 24, y: 64 }, size: { width: 320, height: 96 } },
        },
        {
          id: 'node-after-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'r "RenPy Mouse continues after the optional cheese."',
          order: '0002',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { default_title: 'r "RenPy Mouse continues after the optional cheese."' },
          visual: { position: { x: 96, y: 376 }, size: { width: 320, height: 96 } },
        },
      ],
    };

    const projection = projectGraphToReactFlow(graphWithoutElse);
    const branchEdges = projectionEdgesByKind(projection, 'branch');
    const sequenceEdges = projectionEdgesByKind(projection, 'sequence');
    const edgePairs = (edges: typeof projection.edges) => new Set(edges.map((edge) => `${edge.source}->${edge.target}`));

    expect(edgePairs(branchEdges)).toEqual(
      new Set([
        'node-if-cheese->node-if-action',
        'node-if-cheese->node-after-action',
      ]),
    );
    expect(branchEdges.find((edge) => edge.source === 'node-if-cheese' && edge.target === 'node-after-action')).toMatchObject({
      data: expect.objectContaining({ flowRole: 'alternative' }),
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    });
    expect(edgePairs(sequenceEdges)).toEqual(
      new Set([
        'start-node-start->node-intro-action',
        'node-intro-action->node-if-cheese',
        'node-if-action->node-after-action',
      ]),
    );
  });

  it('draws explicit true and false branch edges for nested if blocks without else', () => {
    const nestedNoElseGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          id: 'node-process-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if not list(set(process_list).intersection(stream_list)):',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: { condition: 'not list(set(process_list).intersection(stream_list))' },
          visual: { position: { x: 96, y: 136 }, size: { width: 420, height: 96 } },
        },
        {
          id: 'node-current-user-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-process-if',
          type: 'if',
          content: 'if currentuser != "" and currentuser.lower() != player.lower():',
          order: '0000.0000',
          source_span: { start_line: 2, end_line: 2 },
          metadata: { condition: 'currentuser != "" and currentuser.lower() != player.lower()' },
          visual: { position: { x: 24, y: 48 }, size: { width: 420, height: 104 } },
        },
        {
          id: 'node-or-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-current-user-if',
          type: 'action',
          content: 'm "Or..."\n\nm "...Do you actually go by [currentuser] or something?"',
          order: '0000.0000.0000',
          source_span: { start_line: 3, end_line: 5 },
          metadata: { default_title: 'm "Or..."' },
          visual: { position: { x: 24, y: 48 }, size: { width: 420, height: 128 } },
        },
        {
          id: 'node-real-you-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'm "Now that I think about it, I don\'t really know anything about the real you."',
          order: '0001',
          source_span: { start_line: 7, end_line: 7 },
          metadata: { default_title: 'm "Now that I think about it, I don\'t really know anything about the real you."' },
          visual: { position: { x: 96, y: 376 }, size: { width: 420, height: 112 } },
        },
      ],
      edges: [],
    };

    const projection = projectGraphToReactFlow(nestedNoElseGraph);
    const branchEdges = projectionEdgesByKind(projection, 'branch');
    const branchEdgeByPair = new Map(branchEdges.map((edge) => [`${edge.source}->${edge.target}`, edge]));

    expect(branchEdgeByPair.get('node-process-if->node-current-user-if')).toMatchObject({
      data: expect.objectContaining({ branchRole: 'true' }),
      className: expect.stringContaining('project-edge--branch-true'),
    });
    expect(branchEdgeByPair.get('node-process-if->node-real-you-action')).toMatchObject({
      data: expect.objectContaining({ branchRole: 'false' }),
      className: expect.stringContaining('project-edge--branch-false'),
    });
    expect(branchEdgeByPair.get('node-current-user-if->node-or-action')).toMatchObject({
      data: expect.objectContaining({ branchRole: 'true' }),
      className: expect.stringContaining('project-edge--branch-true'),
    });
    expect(branchEdgeByPair.get('node-current-user-if->node-real-you-action')).toMatchObject({
      data: expect.objectContaining({ branchRole: 'false' }),
      className: expect.stringContaining('project-edge--branch-false'),
    });
  });

  it('keeps sequential if/else blocks as separate branch groups', () => {
    const sequentialConditionGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          id: 'node-name-empty-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if player_name_buf == "":',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: { condition: 'player_name_buf == ""' },
          visual: { position: { x: 96, y: 136 }, size: { width: 360, height: 96 } },
        },
        {
          id: 'node-name-default-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-name-empty-if',
          type: 'action',
          content: '$ player_name = "Саня Юрченко"\n$ player_name_buf = "Юрченко"',
          order: '0000.0000',
          source_span: { start_line: 2, end_line: 3 },
          metadata: { default_title: '$ player_name = "Саня Юрченко"' },
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 112 } },
        },
        {
          id: 'node-name-empty-else',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'else',
          content: 'else:',
          order: '0001',
          source_span: { start_line: 4, end_line: 4 },
          metadata: { condition: null },
          visual: { position: { x: 96, y: 256 }, size: { width: 360, height: 96 } },
        },
        {
          id: 'node-name-append-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-name-empty-else',
          type: 'action',
          content: '$ player_name += player_name_buf',
          order: '0001.0000',
          source_span: { start_line: 5, end_line: 5 },
          metadata: { default_title: '$ player_name += player_name_buf' },
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 88 } },
        },
        {
          id: 'node-name-changed-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if player_name_buf != player_name_tmp:',
          order: '0002',
          source_span: { start_line: 7, end_line: 7 },
          metadata: { condition: 'player_name_buf != player_name_tmp' },
          visual: { position: { x: 96, y: 376 }, size: { width: 360, height: 96 } },
        },
        {
          id: 'node-name-changed-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-name-changed-if',
          type: 'action',
          content: 'pasha "А-а-а, а я почему-то запомнил [player_name_tmp], ну ладно, [player_name_buf], теперь никогда не забуду!"',
          order: '0002.0000',
          source_span: { start_line: 8, end_line: 8 },
          metadata: {
            default_title:
              'pasha "А-а-а, а я почему-то запомнил [player_name_tmp], ну ладно, [player_name_buf], теперь никогда не забуду!"',
          },
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 128 } },
        },
        {
          id: 'node-name-changed-else',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'else',
          content: 'else:',
          order: '0003',
          source_span: { start_line: 9, end_line: 9 },
          metadata: { condition: null },
          visual: { position: { x: 96, y: 496 }, size: { width: 360, height: 96 } },
        },
        {
          id: 'node-name-same-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-name-changed-else',
          type: 'action',
          content: 'pasha "А-а-а, ну я так и запомнил! Давай, [player_name_buf], бывай!"',
          order: '0003.0000',
          source_span: { start_line: 10, end_line: 10 },
          metadata: { default_title: 'pasha "А-а-а, ну я так и запомнил! Давай, [player_name_buf], бывай!"' },
          visual: { position: { x: 24, y: 48 }, size: { width: 360, height: 112 } },
        },
        {
          id: 'node-hide-pasha',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: 'hide pasha sad',
          order: '0004',
          source_span: { start_line: 12, end_line: 12 },
          metadata: { default_title: 'hide pasha sad' },
          visual: { position: { x: 96, y: 616 }, size: { width: 360, height: 88 } },
        },
      ],
      edges: [],
    };

    const projection = projectGraphToReactFlow(sequentialConditionGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const branchPairs = new Set(projectionEdgesByKind(projection, 'branch').map((edge) => `${edge.source}->${edge.target}`));
    const sequencePairs = new Set(projectionEdgesByKind(projection, 'sequence').map((edge) => `${edge.source}->${edge.target}`));
    const firstIf = byId.get('node-name-empty-if')!;
    const firstElse = byId.get('node-name-empty-else')!;
    const firstTrueAction = byId.get('node-name-default-action')!;
    const firstElseAction = byId.get('node-name-append-action')!;
    const secondIf = byId.get('node-name-changed-if')!;
    const secondElse = byId.get('node-name-changed-else')!;
    const hidePasha = byId.get('node-hide-pasha')!;
    const firstIfCenterX = nodeCenterX(firstIf);
    const secondIfCenterX = nodeCenterX(secondIf);

    expect(branchPairs).toEqual(
      new Set([
        'node-name-empty-if->node-name-default-action',
        'node-name-empty-if->node-name-empty-else',
        'node-name-changed-if->node-name-changed-action',
        'node-name-changed-if->node-name-changed-else',
      ]),
    );
    expect(branchPairs).not.toContain('node-name-empty-if->node-name-changed-if');
    expect(branchPairs).not.toContain('node-name-empty-if->node-name-changed-else');
    expect(sequencePairs).toEqual(
      new Set([
        'start-node-start->node-name-empty-if',
        'node-name-default-action->node-name-changed-if',
        'node-name-append-action->node-name-changed-if',
        'node-name-changed-action->node-hide-pasha',
        'node-name-same-action->node-hide-pasha',
      ]),
    );
    expect(Math.abs(firstIfCenterX - secondIfCenterX)).toBeLessThanOrEqual(2);
    expect(secondIf.position.y).toBeGreaterThan(
      Math.max(
        firstTrueAction.position.y + Number(firstTrueAction.height),
        firstElseAction.position.y + Number(firstElseAction.height),
      ),
    );
    expect(hidePasha.position.y).toBeGreaterThan(
      Math.max(
        byId.get('node-name-changed-action')!.position.y + Number(byId.get('node-name-changed-action')!.height),
        byId.get('node-name-same-action')!.position.y + Number(byId.get('node-name-same-action')!.height),
      ),
    );
    expect(firstElse.position.y).toBeGreaterThanOrEqual(firstIf.position.y + Number(firstIf.height) + 48);
    expect(secondElse.position.y).toBeGreaterThanOrEqual(secondIf.position.y + Number(secondIf.height) + 48);
  });

  it('keeps a narrow else branch close when the true branch has a wide subtree', () => {
    const nodes: ProjectGraphSnapshot['nodes'] = [];
    let order = 0;
    let line = 1;
    const nextOrder = () => `${String(order++).padStart(4, '0')}`;
    const addNode = (
      id: string,
      parentNodeId: string | null,
      type: string,
      content: string,
      metadata: Record<string, unknown> = {},
    ) => {
      nodes.push({
        id,
        file_id: 'file-day-1',
        label_id: 'label-start',
        parent_node_id: parentNodeId,
        type,
        content,
        order: nextOrder(),
        source_span: { start_line: line, end_line: line },
        metadata,
        visual: { position: { x: 96, y: 136 + order * 112 }, size: { width: 320, height: type === 'action' ? 104 : 96 } },
      });
      line += 1;
    };
    const addWideTrueFork = (parentNodeId: string, path: string, depth: number) => {
      const ifId = `node-wide-if-${path}`;
      addNode(ifId, parentNodeId, 'if', `if flags["wide_${path}"]:`, { condition: `flags["wide_${path}"]` });
      if (depth === 0) {
        addNode(`node-wide-leaf-${path}-true`, ifId, 'action', `r "RenPy Mouse counts crumbs on true path ${path}."`, {
          default_title: `r "RenPy Mouse counts crumbs on true path ${path}."`,
        });
      } else {
        addWideTrueFork(ifId, `${path}T`, depth - 1);
      }

      const elseId = `node-wide-else-${path}`;
      addNode(elseId, parentNodeId, 'else', 'else:', { condition: null });
      if (depth === 0) {
        addNode(`node-wide-leaf-${path}-false`, elseId, 'action', `r "RenPy Mouse counts crumbs on false path ${path}."`, {
          default_title: `r "RenPy Mouse counts crumbs on false path ${path}."`,
        });
      } else {
        addWideTrueFork(elseId, `${path}F`, depth - 1);
      }
    };

    addNode('node-root-if', null, 'if', 'if renpy_mouse_enters_big_maze:', {
      condition: 'renpy_mouse_enters_big_maze',
    });
    addWideTrueFork('node-root-if', 'T', 3);
    addNode('node-root-else', null, 'else', 'else:', { condition: null });
    addNode('node-small-else-action', 'node-root-else', 'action', 'r "RenPy Mouse takes the tiny shortcut."', {
      default_title: 'r "RenPy Mouse takes the tiny shortcut."',
    });
    addNode('node-after-root-if', null, 'action', 'r "RenPy Mouse returns to the readable path."', {
      default_title: 'r "RenPy Mouse returns to the readable path."',
    });

    const unbalancedGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes,
      edges: [],
    };

    const projection = projectGraphToReactFlow(unbalancedGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const rootIf = byId.get('node-root-if')!;
    const rootElse = byId.get('node-root-else')!;
    const trueEntry = byId.get('node-wide-if-T')!;
    const rootIfCenterX = nodeCenterX(rootIf);
    const rootElseCenterX = nodeCenterX(rootElse);
    const trueEntryCenterX = nodeCenterX(trueEntry);

    expect(rootElseCenterX).toBeLessThan(rootIfCenterX);
    expect(trueEntryCenterX).toBeGreaterThan(rootIfCenterX);
    expect(rootIfCenterX - rootElseCenterX).toBeLessThanOrEqual(560);
    expect(trueEntryCenterX - rootIfCenterX).toBeGreaterThan(rootIfCenterX - rootElseCenterX);
  });

  it('expands branch lanes by measured subtree width for deep binary conditionals', () => {
    const nodes: ProjectGraphSnapshot['nodes'] = [];
    let order = 0;
    let line = 1;
    const nextOrder = () => `${String(order++).padStart(4, '0')}`;
    const addNode = (
      id: string,
      parentNodeId: string | null,
      type: string,
      content: string,
      metadata: Record<string, unknown> = {},
    ) => {
      nodes.push({
        id,
        file_id: 'file-day-1',
        label_id: 'label-start',
        parent_node_id: parentNodeId,
        type,
        content,
        order: nextOrder(),
        source_span: { start_line: line, end_line: line },
        metadata,
        visual: { position: { x: 96, y: 136 + order * 112 }, size: { width: 320, height: type === 'action' ? 104 : 96 } },
      });
      line += 1;
    };
    const addBinaryFork = (parentNodeId: string | null, path: string, depth: number) => {
      const ifId = `node-if-${path}`;
      addNode(ifId, parentNodeId, 'if', `if flags["${path}"]:`, { condition: `flags["${path}"]` });
      if (depth === 0) {
        addNode(`node-leaf-${path}-true`, ifId, 'action', `r "RenPy Mouse takes true path ${path}."`, {
          default_title: `r "RenPy Mouse takes true path ${path}."`,
        });
      } else {
        addBinaryFork(ifId, `${path}T`, depth - 1);
      }

      const elseId = `node-else-${path}`;
      addNode(elseId, parentNodeId, 'else', 'else:', { condition: null });
      if (depth === 0) {
        addNode(`node-leaf-${path}-false`, elseId, 'action', `r "RenPy Mouse takes false path ${path}."`, {
          default_title: `r "RenPy Mouse takes false path ${path}."`,
        });
      } else {
        addBinaryFork(elseId, `${path}F`, depth - 1);
      }
    };

    addNode('node-intro-action', null, 'action', 'r "RenPy Mouse opens the recursive cheese map."', {
      default_title: 'r "RenPy Mouse opens the recursive cheese map."',
    });
    addBinaryFork(null, 'root', 3);
    addNode('node-after-action', null, 'action', 'r "RenPy Mouse escapes the recursive cheese map."', {
      default_title: 'r "RenPy Mouse escapes the recursive cheese map."',
    });

    const deepGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes,
    };

    const projection = projectGraphToReactFlow(deepGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const leafNodes = nodes
      .filter((node) => node.id.startsWith('node-leaf-'))
      .map((node) => byId.get(node.id)!)
      .sort((left, right) => nodeCenterX(left) - nodeCenterX(right));
    const roundedCenters = leafNodes.map((node) => Math.round(nodeCenterX(node)));
    const uniqueCenters = new Set(roundedCenters);

    expect(leafNodes).toHaveLength(16);
    expect(uniqueCenters.size).toBe(leafNodes.length);
    for (let index = 1; index < leafNodes.length; index += 1) {
      expect(nodeCenterX(leafNodes[index]) - nodeCenterX(leafNodes[index - 1])).toBeGreaterThanOrEqual(280);
    }

    for (let leftIndex = 0; leftIndex < leafNodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < leafNodes.length; rightIndex += 1) {
        expect(rectsOverlap(nodeRect(leafNodes[leftIndex]), nodeRect(leafNodes[rightIndex]))).toBe(false);
      }
    }
  });

  it('treats jump and return nodes as terminal flow endpoints', () => {
    const terminalGraph: ProjectGraphSnapshot = {
      ...graph,
      labels: [
        ...graph.labels,
        {
          id: 'label-day-two',
          file_id: 'file-day-1',
          parent_label_id: null,
          name: 'day_two',
          qualified_name: 'day_two',
          scope: 'global',
          label_start_node_id: 'start-node-day-two',
          source_span: { start_line: 20, end_line: 24 },
          visual: { position: { x: 640, y: 48 }, size: { width: 520, height: 420 } },
        },
      ],
      label_starts: [
        ...graph.label_starts,
        {
          id: 'start-node-day-two',
          file_id: 'file-day-1',
          label_id: 'label-day-two',
          qualified_name: 'day_two',
          content: 'label day_two:',
          visual: { position: { x: 96, y: 120 }, size: { width: 280, height: 80 } },
        },
      ],
      nodes: [
        {
          id: 'node-intro',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: '# RenPy Mouse checks the hallway.',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 96, y: 220 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-jump-away',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'jump',
          content: 'jump day_two',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 360 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-after-jump',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: '# This text is lexically after jump, not a fallthrough.',
          order: '0002',
          source_span: { start_line: 3, end_line: 3 },
          metadata: {},
          visual: { position: { x: 96, y: 500 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-if-snack',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if snack_ready:',
          order: '0003',
          source_span: { start_line: 4, end_line: 4 },
          metadata: {},
          visual: { position: { x: 96, y: 640 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-return-snack',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-snack',
          type: 'return',
          content: 'return',
          order: '0004',
          source_span: { start_line: 5, end_line: 5 },
          metadata: {},
          visual: { position: { x: 96, y: 780 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-else-snack',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'else',
          content: 'else:',
          order: '0005',
          source_span: { start_line: 6, end_line: 6 },
          metadata: {},
          visual: { position: { x: 96, y: 920 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-else-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-else-snack',
          type: 'action',
          content: '# RenPy Mouse keeps walking.',
          order: '0006',
          source_span: { start_line: 7, end_line: 7 },
          metadata: {},
          visual: { position: { x: 96, y: 1060 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-after-if',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'action',
          content: '# Only the else path can fall through here.',
          order: '0007',
          source_span: { start_line: 8, end_line: 8 },
          metadata: {},
          visual: { position: { x: 96, y: 1200 }, size: { width: 320, height: 88 } },
        },
      ],
      edges: [
        {
          id: 'edge-jump-away',
          source_node_id: 'node-jump-away',
          target_node_id: 'start-node-day-two',
          kind: 'jump',
          metadata: {},
        },
      ],
    };

    const projection = projectGraphToReactFlow(terminalGraph);
    const derivedPairs = new Set(
      projection.edges
        .filter((edge) => edge.data?.derived === true)
        .map((edge) => `${edge.source}->${edge.target}`),
    );

    expect(derivedPairs).toContain('start-node-start->node-intro');
    expect(derivedPairs).toContain('node-intro->node-jump-away');
    expect(derivedPairs).not.toContain('node-jump-away->node-after-jump');
    expect(derivedPairs).toContain('node-after-jump->node-if-snack');
    expect(derivedPairs).toContain('node-if-snack->node-return-snack');
    expect(derivedPairs).toContain('node-if-snack->node-else-snack');
    expect(derivedPairs).not.toContain('node-return-snack->node-after-if');
    expect(derivedPairs).toContain('node-else-action->node-after-if');
  });

  it('clamps stale manual branch positions so alternatives remain below their source', () => {
    const staleManualBranchGraph: ProjectGraphSnapshot = {
      ...graph,
      nodes: [
        {
          id: 'node-if-shelf',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'if',
          content: 'if shelf_is_tall:',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: { _manual_position: true },
          visual: { position: { x: 96, y: 520 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-if-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-if-shelf',
          type: 'action',
          content: '# RenPy Mouse climbs the tall shelf.',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 660 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-else-shelf',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'else',
          content: 'else:',
          order: '0002',
          source_span: { start_line: 3, end_line: 3 },
          metadata: { _manual_position: true },
          visual: { position: { x: 520, y: 480 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-else-action',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-else-shelf',
          type: 'action',
          content: '# RenPy Mouse asks for a tiny ladder.',
          order: '0003',
          source_span: { start_line: 4, end_line: 4 },
          metadata: {},
          visual: { position: { x: 520, y: 620 }, size: { width: 320, height: 88 } },
        },
      ],
      edges: [],
    };

    const projection = projectGraphToReactFlow(staleManualBranchGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const ifNode = byId.get('node-if-shelf')!;
    const elseNode = byId.get('node-else-shelf')!;
    const branchEdge = projection.edges.find((edge) => edge.source === 'node-if-shelf' && edge.target === 'node-else-shelf');

    expect(elseNode.position.y).toBeGreaterThanOrEqual(ifNode.position.y + Number(ifNode.height) + 48);
    expect(branchEdge?.type).toBe('nearTargetStep');
  });

  it('builds near-target rejoin paths with a shared target-side turn lane', () => {
    const firstPath = buildNearTargetStepPath({
      sourceX: 120,
      sourceY: 80,
      targetX: 640,
      targetY: 180,
      targetOffset: 72,
      direction: 'horizontal',
    });
    const secondPath = buildNearTargetStepPath({
      sourceX: 320,
      sourceY: 300,
      targetX: 640,
      targetY: 180,
      targetOffset: 72,
      direction: 'horizontal',
    });
    const verticalPath = buildNearTargetStepPath({
      sourceX: 120,
      sourceY: 80,
      targetX: 640,
      targetY: 520,
      targetOffset: 24,
      direction: 'vertical',
    });
    const sourceVerticalPath = buildNearTargetStepPath({
      sourceX: 120,
      sourceY: 80,
      targetX: 640,
      targetY: 520,
      targetOffset: 24,
      sourceOffset: 36,
      direction: 'source-vertical',
    });

    expect(firstPath).toBe('M 120 80 L 568 80 L 568 180 L 640 180');
    expect(secondPath).toBe('M 320 300 L 568 300 L 568 180 L 640 180');
    expect(verticalPath).toBe('M 120 80 L 120 496 L 640 496 L 640 520');
    expect(sourceVerticalPath).toBe('M 120 80 L 120 496 L 640 496 L 640 520');
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

  it('compacts pathological imported nested layout without giant parent nodes or sibling overlap', () => {
    const importedGraph: ProjectGraphSnapshot = {
      project_id: 'pathological-import-layout',
      files: [
        {
          id: 'file-day-1',
          path: 'renpy_mouse_day_1.rpy',
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
          source_span: { start_line: 1, end_line: 1 },
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
          id: 'node-dialogue',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "RenPy Mouse sees two blocks on the same crumb."',
          order: '0000',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-menu',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'menu',
          content: 'menu:',
          order: '0001',
          source_span: { start_line: 3, end_line: 3 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-menu-prompt',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_prompt',
          content: '"Which cheese tunnel should RenPy Mouse inspect?"',
          order: '0001.0000',
          source_span: { start_line: 4, end_line: 4 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-choice-a',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Follow the cheese tunnel":',
          order: '0001.0001',
          source_span: { start_line: 5, end_line: 5 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-choice-b',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Audit the crumbs":',
          order: '0001.0002',
          source_span: { start_line: 7, end_line: 7 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-jump',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: 'node-choice-a',
          type: 'jump',
          content: 'jump day_two',
          order: '0001.0001.0000',
          source_span: { start_line: 6, end_line: 6 },
          metadata: { target: 'day_two' },
          visual: { position: { x: 96, y: 360 }, size: { width: 320, height: 88 } },
        },
      ],
      edges: [],
      diagnostics: [],
      source_index: { files: {} },
    };

    const projection = projectGraphToReactFlow(importedGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const menu = byId.get('node-menu');
    const prompt = byId.get('node-menu-prompt');
    const choiceA = byId.get('node-choice-a');
    const choiceB = byId.get('node-choice-b');
    const jump = byId.get('node-jump');
    const branchEdges = projectionEdgesByKind(projection, 'branch');
    const sequenceEdges = projectionEdgesByKind(projection, 'sequence');

    expect(menu && choiceA && choiceB && jump).toBeTruthy();
    expect(prompt).toBeUndefined();
    expect(menu!.data).toMatchObject({
      scenarioType: 'menu',
      menuPrompt: '"Which cheese tunnel should RenPy Mouse inspect?"',
    });
    expect(rectsOverlap(nodeRect(byId.get('node-dialogue')!), nodeRect(menu!))).toBe(false);
    expect(rectsOverlap(nodeRect(choiceA!), nodeRect(choiceB!))).toBe(false);
    expect(choiceA!.parentId).toBe('label-start');
    expect(choiceB!.parentId).toBe('label-start');
    expect(jump!.parentId).toBe('label-start');
    expect(Math.abs(menu!.position.x + Number(menu!.width) / 2 - (byId.get('node-dialogue')!.position.x + Number(byId.get('node-dialogue')!.width) / 2))).toBeLessThanOrEqual(2);
    expect(choiceA!.position.y).toBeGreaterThanOrEqual(menu!.position.y + Number(menu!.height) + 48);
    expect(choiceB!.position.y).toBe(choiceA!.position.y);
    expect(choiceA!.position.x + Number(choiceA!.width) / 2).toBeLessThan(menu!.position.x + Number(menu!.width) / 2);
    expect(choiceB!.position.x + Number(choiceB!.width) / 2).toBeGreaterThan(menu!.position.x + Number(menu!.width) / 2);
    expect(jump!.position.y).toBeGreaterThanOrEqual(choiceA!.position.y + Number(choiceA!.height) + 48);
    expect(branchEdges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual([
      'node-menu->node-choice-a',
      'node-menu->node-choice-b',
    ]);
    expect(branchEdges.every((edge) => edge.type === 'nearTargetStep')).toBe(true);
    expect(sequenceEdges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'start-node-start->node-dialogue',
      'node-dialogue->node-menu',
      'node-choice-a->node-jump',
    ]);
  });

  it('lays out a single-file RenPy story as a readable top-down tree', () => {
    const singleFileGraph: ProjectGraphSnapshot = {
      project_id: 'single-file-top-down-smoke',
      files: [
        {
          id: 'file-smoke',
          path: 'smoke_single_file_layout.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 1200, height: 800 } },
        },
      ],
      labels: [
        {
          id: 'label-start',
          file_id: 'file-smoke',
          parent_label_id: null,
          name: 'start',
          qualified_name: 'start',
          scope: 'global',
          label_start_node_id: 'start-node-start',
          source_span: { start_line: 1, end_line: 1 },
          visual: { position: { x: 48, y: 48 }, size: { width: 960, height: 360 } },
        },
        {
          id: 'label-cupboard',
          file_id: 'file-smoke',
          parent_label_id: 'label-start',
          name: '.cupboard',
          qualified_name: 'start.cupboard',
          scope: 'local',
          label_start_node_id: 'start-node-cupboard',
          source_span: { start_line: 13, end_line: 13 },
          visual: { position: { x: 48, y: 48 }, size: { width: 960, height: 360 } },
        },
        {
          id: 'label-ask-duck',
          file_id: 'file-smoke',
          parent_label_id: null,
          name: 'ask_duck',
          qualified_name: 'ask_duck',
          scope: 'global',
          label_start_node_id: 'start-node-ask-duck',
          source_span: { start_line: 21, end_line: 21 },
          visual: { position: { x: 48, y: 48 }, size: { width: 960, height: 360 } },
        },
      ],
      label_starts: [
        {
          id: 'start-node-start',
          file_id: 'file-smoke',
          label_id: 'label-start',
          qualified_name: 'start',
          content: 'label start:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'start-node-cupboard',
          file_id: 'file-smoke',
          label_id: 'label-cupboard',
          qualified_name: 'start.cupboard',
          content: 'label .cupboard:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'start-node-ask-duck',
          file_id: 'file-smoke',
          label_id: 'label-ask-duck',
          qualified_name: 'ask_duck',
          content: 'label ask_duck:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
      ],
      nodes: [
        {
          id: 'node-comment',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'comment',
          content: '# RenPy Mouse starts a tiny map.',
          order: '0000',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-scene',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'raw_action',
          content: 'scene kitchen morning',
          order: '0001',
          source_span: { start_line: 3, end_line: 3 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-dialogue',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "I found the first cheese coordinate."',
          order: '0002',
          source_span: { start_line: 4, end_line: 4 },
          metadata: {},
          visual: { position: { x: 96, y: 360 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-menu',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'menu',
          content: 'menu:',
          order: '0003',
          source_span: { start_line: 6, end_line: 6 },
          metadata: {},
          visual: { position: { x: 96, y: 472 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-prompt',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_prompt',
          content: '"Where should RenPy Mouse go?"',
          order: '0003.0000',
          source_span: { start_line: 7, end_line: 7 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-choice-cupboard',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Inspect the cupboard":',
          order: '0003.0001',
          source_span: { start_line: 8, end_line: 8 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-jump-cupboard',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: 'node-choice-cupboard',
          type: 'jump',
          content: 'jump .cupboard',
          order: '0003.0001.0000',
          source_span: { start_line: 9, end_line: 9 },
          metadata: {},
          visual: { position: { x: 96, y: 360 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-choice-duck',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: 'node-menu',
          type: 'menu_choice',
          content: '"Ask the duck":',
          order: '0003.0002',
          source_span: { start_line: 10, end_line: 10 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-jump-duck',
          file_id: 'file-smoke',
          label_id: 'label-start',
          parent_node_id: 'node-choice-duck',
          type: 'jump',
          content: 'jump ask_duck',
          order: '0003.0002.0000',
          source_span: { start_line: 11, end_line: 11 },
          metadata: {},
          visual: { position: { x: 96, y: 360 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-cupboard-dialogue',
          file_id: 'file-smoke',
          label_id: 'label-cupboard',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "The cupboard is a nested label, but not a new file."',
          order: '0000',
          source_span: { start_line: 14, end_line: 14 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-duck-dialogue',
          file_id: 'file-smoke',
          label_id: 'label-ask-duck',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "The duck says the graph should be readable."',
          order: '0000',
          source_span: { start_line: 22, end_line: 22 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
      ],
      edges: [
        {
          id: 'edge-jump-cupboard',
          source_node_id: 'node-jump-cupboard',
          target_node_id: 'start-node-cupboard',
          kind: 'jump',
          metadata: { target: '.cupboard' },
        },
        {
          id: 'edge-jump-duck',
          source_node_id: 'node-jump-duck',
          target_node_id: 'start-node-ask-duck',
          kind: 'jump',
          metadata: { target: 'ask_duck' },
        },
      ],
      diagnostics: [],
      source_index: { files: {} },
    };

    const projection = projectGraphToReactFlow(singleFileGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const start = byId.get('start-node-start')!;
    const comment = byId.get('node-comment')!;
    const scene = byId.get('node-scene')!;
    const dialogue = byId.get('node-dialogue')!;
    const menu = byId.get('node-menu')!;
    const menuPrompt = byId.get('node-prompt');
    const cupboardChoice = byId.get('node-choice-cupboard')!;
    const cupboardJump = byId.get('node-jump-cupboard')!;
    const duckChoice = byId.get('node-choice-duck')!;
    const duckJump = byId.get('node-jump-duck')!;
    const localLabel = byId.get('label-cupboard')!;
    const askDuckLabel = byId.get('label-ask-duck')!;
    const file = byId.get('file-smoke')!;
    const startLabel = byId.get('label-start')!;

    expect([comment, scene, dialogue, menu, localLabel].every((node) => node.position.y > start.position.y)).toBe(true);
    expect([start.position.y, comment.position.y, scene.position.y, dialogue.position.y, menu.position.y, localLabel.position.y]).toEqual(
      [...[start.position.y, comment.position.y, scene.position.y, dialogue.position.y, menu.position.y, localLabel.position.y]].sort(
        (left, right) => left - right,
      ),
    );
    expect(childFitsParent(localLabel, startLabel)).toBe(true);
    expect(rectsOverlap(nodeRect(start), nodeRect(comment))).toBe(false);
    expect(rectsOverlap(nodeRect(comment), nodeRect(scene))).toBe(false);
    expect(rectsOverlap(nodeRect(scene), nodeRect(dialogue))).toBe(false);
    expect(rectsOverlap(nodeRect(dialogue), nodeRect(menu))).toBe(false);
    expect(rectsOverlap(nodeRect(menu), nodeRect(localLabel))).toBe(false);
    expect(menuPrompt).toBeUndefined();
    expect(menu.data).toMatchObject({ menuPrompt: '"Where should RenPy Mouse go?"' });
    expect(cupboardChoice.parentId).toBe('label-start');
    expect(cupboardJump.parentId).toBe('label-start');
    expect(duckChoice.parentId).toBe('label-start');
    expect(duckJump.parentId).toBe('label-start');
    expect(cupboardChoice.position.y).toBeGreaterThan(menu.position.y + Number(menu.height));
    expect(duckChoice.position.y).toBe(cupboardChoice.position.y);
    expect(cupboardJump.position.y).toBeGreaterThan(cupboardChoice.position.y + Number(cupboardChoice.height));
    expect(duckJump.position.y).toBeGreaterThan(duckChoice.position.y + Number(duckChoice.height));
    expect(cupboardChoice.position.x + Number(cupboardChoice.width) / 2).toBeLessThan(menu.position.x + Number(menu.width) / 2);
    expect(duckChoice.position.x + Number(duckChoice.width) / 2).toBeGreaterThan(menu.position.x + Number(menu.width) / 2);
    expect(rectsOverlap(nodeRect(startLabel), nodeRect(askDuckLabel))).toBe(false);
    expect(askDuckLabel.position.x).toBeGreaterThanOrEqual(startLabel.position.x + Number(startLabel.width) + 48);
    expect(Math.abs(askDuckLabel.position.y - startLabel.position.y)).toBeLessThanOrEqual(2);
    expect(Number(startLabel.width)).toBeLessThanOrEqual(980);
    expect(Number(startLabel.height)).toBeLessThanOrEqual(1700);
    expect(Number(file.width)).toBeLessThanOrEqual(1700);
    expect(Number(file.height)).toBeLessThanOrEqual(2100);
  });

  it('keeps file frames from overlapping after relation-aware label placement expands a file', () => {
    const relationGraph: ProjectGraphSnapshot = {
      project_id: 'relation-overlap-guard',
      files: [
        {
          id: 'file-day-6',
          path: 'day6.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 760, height: 420 } },
        },
        {
          id: 'file-script',
          path: 'script.rpy',
          order: '0001',
          visual: { position: { x: 820, y: 0 }, size: { width: 760, height: 420 } },
        },
      ],
      labels: [
        {
          id: 'label-d6-main',
          file_id: 'file-day-6',
          parent_label_id: null,
          name: 'd6_main',
          qualified_name: 'd6_main',
          scope: 'global',
          label_start_node_id: 'start-d6-main',
          source_span: { start_line: 0, end_line: 0 },
          visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 300 } },
        },
        {
          id: 'label-ending-main',
          file_id: 'file-day-6',
          parent_label_id: null,
          name: 'ending_main',
          qualified_name: 'ending_main',
          scope: 'global',
          label_start_node_id: 'start-ending-main',
          source_span: { start_line: 20, end_line: 20 },
          visual: { position: { x: 48, y: 396 }, size: { width: 520, height: 260 } },
        },
        {
          id: 'label-script-start',
          file_id: 'file-script',
          parent_label_id: null,
          name: 'start',
          qualified_name: 'start',
          scope: 'global',
          label_start_node_id: 'start-script-start',
          source_span: { start_line: 0, end_line: 0 },
          visual: { position: { x: 48, y: 48 }, size: { width: 520, height: 260 } },
        },
      ],
      label_starts: [
        {
          id: 'start-d6-main',
          file_id: 'file-day-6',
          label_id: 'label-d6-main',
          qualified_name: 'd6_main',
          content: 'label d6_main:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'start-ending-main',
          file_id: 'file-day-6',
          label_id: 'label-ending-main',
          qualified_name: 'ending_main',
          content: 'label ending_main:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
        {
          id: 'start-script-start',
          file_id: 'file-script',
          label_id: 'label-script-start',
          qualified_name: 'start',
          content: 'label start:',
          visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
        },
      ],
      nodes: [
        {
          id: 'node-d6-action',
          file_id: 'file-day-6',
          label_id: 'label-d6-main',
          parent_node_id: null,
          type: 'action',
          content: 'window hide',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-jump-ending',
          file_id: 'file-day-6',
          label_id: 'label-d6-main',
          parent_node_id: null,
          type: 'jump',
          content: 'jump ending_main',
          order: '0001',
          source_span: { start_line: 2, end_line: 2 },
          metadata: {},
          visual: { position: { x: 96, y: 248 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-ending-return',
          file_id: 'file-day-6',
          label_id: 'label-ending-main',
          parent_node_id: null,
          type: 'return',
          content: 'return',
          order: '0000',
          source_span: { start_line: 21, end_line: 21 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-script-action',
          file_id: 'file-script',
          label_id: 'label-script-start',
          parent_node_id: null,
          type: 'action',
          content: 'stop music',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 96, y: 136 }, size: { width: 320, height: 88 } },
        },
      ],
      edges: [
        {
          id: 'edge-jump-ending',
          source_node_id: 'node-jump-ending',
          target_node_id: 'start-ending-main',
          kind: 'jump',
          metadata: { target: 'ending_main' },
        },
      ],
      diagnostics: [],
      source_index: { files: {} },
    };

    const projection = projectGraphToReactFlow(relationGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const day6File = byId.get('file-day-6')!;
    const scriptFile = byId.get('file-script')!;
    const d6Label = byId.get('label-d6-main')!;
    const endingLabel = byId.get('label-ending-main')!;

    expect(endingLabel.position.x).toBeGreaterThan(d6Label.position.x + Number(d6Label.width));
    expect(rectsOverlap(nodeRect(day6File), nodeRect(scriptFile))).toBe(false);
    expect(scriptFile.position.x).toBeGreaterThanOrEqual(day6File.position.x + Number(day6File.width));
  });

  it('packs many import-like narrow labels into multiple compact columns', () => {
    const packingGraph = makeManyLabelPackingGraph(30);
    const baselineLabels = packingGraph.labels;
    const baselineTop = Math.min(...baselineLabels.map((label) => label.visual.position.y));
    const baselineBottom = Math.max(
      ...baselineLabels.map((label) => label.visual.position.y + label.visual.size.height),
    );
    const baselineHeight = baselineBottom - baselineTop;

    const projection = projectGraphToReactFlow(packingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const labels = packingGraph.labels.map((label) => byId.get(label.id)!);
    const packedTop = Math.min(...labels.map((label) => label.position.y));
    const packedBottom = Math.max(...labels.map((label) => label.position.y + Number(label.height)));
    const packedHeight = packedBottom - packedTop;
    const distinctColumns = distinctRoundedValues(labels.map(nodeCenterX));

    expect(distinctColumns.length).toBeGreaterThanOrEqual(3);
    expect(packedHeight).toBeLessThan(baselineHeight * 0.75);
    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
        expect(rectsOverlap(nodeRect(labels[leftIndex]), nodeRect(labels[rightIndex]))).toBe(false);
      }
    }
    const file = byId.get('file-main')!;
    expect(labels.every((label) => childFitsParent(label, file))).toBe(true);
  });

  it('keeps late jump targets near their source label when packing shelves', () => {
    const packingGraph = makeLateTargetPackingGraph();
    const sourceLabel = packingGraph.labels.find((label) => label.id === 'label-helper-0')!;
    const targetLabelIds = ['label-helper-20', 'label-helper-25', 'label-helper-29'];
    const targetLabels = targetLabelIds.map((labelId) => packingGraph.labels.find((label) => label.id === labelId)!);
    const baselineAverageDistance =
      targetLabels.reduce((sum, target) => sum + distanceBetweenNodes(sourceLabel.visual, target.visual), 0) /
      targetLabels.length;

    const projection = projectGraphToReactFlow(packingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const source = byId.get('label-helper-0')!;
    const targets = targetLabelIds.map((labelId) => byId.get(labelId)!);
    const projectedAverageDistance =
      targets.reduce((sum, target) => sum + distanceBetweenNodes(source, target), 0) / targets.length;

    expect(distinctRoundedValues([source, ...targets].map((label) => label.position.y)).length).toBe(1);
    expect(projectedAverageDistance).toBeLessThan(baselineAverageDistance * 0.2);
    for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
        expect(rectsOverlap(nodeRect(targets[leftIndex]), nodeRect(targets[rightIndex]))).toBe(false);
      }
    }
  });

  it('starts isolated fallback labels on a new shelf after connected relation components', () => {
    const packingGraph = makeRelationComponentPackingGraph();
    const projection = projectGraphToReactFlow(packingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const componentLabels = ['label-helper-0', 'label-helper-8', 'label-helper-9'].map((labelId) => byId.get(labelId)!);
    const firstIsolated = byId.get('label-helper-1')!;
    const componentBottom = Math.max(...componentLabels.map((label) => label.position.y + Number(label.height)));

    expect(firstIsolated.position.y).toBeGreaterThanOrEqual(componentBottom + 48);
  });

  it('places high-incoming hub labels near the median incoming source shelf', () => {
    const packingGraph = makeIncomingHubPackingGraph();
    const projection = projectGraphToReactFlow(packingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const sources = Array.from({ length: 9 }, (_, index) => byId.get(`label-helper-${index}`)!);
    const hub = byId.get('label-helper-29')!;
    const sourceRows = distinctRoundedValues(sources.map((source) => source.position.y));
    const medianSourceRow = sourceRows[Math.floor(sourceRows.length / 2)];

    expect(Math.abs(hub.position.y - medianSourceRow)).toBeLessThanOrEqual(24);
  });

  it('keeps mixed-size relation-packed label frames non-overlapping and contained', () => {
    const packingGraph = makeMixedSizeRelationPackingGraph();
    const projection = projectGraphToReactFlow(packingGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const packedLabels = packingGraph.labels.map((label) => byId.get(label.id)!);
    const file = byId.get('file-main')!;
    const distinctColumns = distinctRoundedValues(packedLabels.map(nodeCenterX));

    expect(distinctColumns.length).toBeGreaterThanOrEqual(3);
    for (let leftIndex = 0; leftIndex < packedLabels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < packedLabels.length; rightIndex += 1) {
        expect(rectsOverlap(nodeRect(packedLabels[leftIndex]), nodeRect(packedLabels[rightIndex]))).toBe(false);
      }
    }
    expect(packedLabels.every((label) => childFitsParent(label, file))).toBe(true);
  });

  it('preserves existing manual 2D label frame layouts during relation-aware packing', () => {
    const manualGraph = makeManualTwoDimensionalLabelGraph();
    const projection = projectGraphToReactFlow(manualGraph);
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));

    for (const label of manualGraph.labels) {
      const projected = byId.get(label.id)!;
      expect(projected.position).toEqual(label.visual.position);
    }
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
    const relationEdges = projection.edges.filter((edge) => edge.data?.kind === 'jump' || edge.data?.kind === 'call');
    expect(relationEdges).toHaveLength(2);
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
    const mainLabelChildren = projection.nodes.filter((node) => node.parentId === 'label-start');
    const storyFlowBottom = Math.max(
      ...mainLabelChildren
        .filter((node) => node.data?.autoBranchLayout === true)
        .map((node) => node.position.y + Number(node.height)),
    );
    expect(byId.get('label-shared-nook')!.position.y).toBeGreaterThanOrEqual(storyFlowBottom + 24);
    expect(byId.get('node-choice')).toMatchObject({
      type: 'scenarioNode',
      parentId: 'label-start',
      data: expect.objectContaining({
        original: expect.objectContaining({ parent_node_id: 'node-menu' }),
      }),
    });
    expect(relationEdges.map((edge) => [edge.id, edge.source, edge.target, edge.className])).toEqual([
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
    expect(Math.abs((absoluteChoicePosition!.x + Number(byId.get('node-choice')!.width) / 2) - (menuPosition!.x + Number(byId.get('node-menu')!.width) / 2))).toBeLessThanOrEqual(2);
    expect(absoluteChoicePosition!.y).toBeGreaterThan(menuPosition!.y);
  });

  it('projects imported non-blocking diagnostics into focusable problems', () => {
    const diagnosticGraph: ProjectGraphSnapshot = {
      project_id: 'diagnostic-import',
      files: [
        {
          id: 'file-diagnostics',
          path: 'renpy_mouse_diagnostics.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 900, height: 640 } },
        },
      ],
      labels: [
        {
          id: 'label-duplicate-cheese',
          file_id: 'file-diagnostics',
          parent_label_id: null,
          name: 'duplicate_cheese',
          qualified_name: 'duplicate_cheese',
          scope: 'global',
          label_start_node_id: 'start-duplicate-cheese',
          source_span: { start_line: 1, end_line: 1 },
          visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 360 } },
        },
      ],
      label_starts: [
        {
          id: 'start-duplicate-cheese',
          file_id: 'file-diagnostics',
          label_id: 'label-duplicate-cheese',
          qualified_name: 'duplicate_cheese',
          content: 'label duplicate_cheese:',
          visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
        },
      ],
      nodes: [
        {
          id: 'node-dynamic',
          file_id: 'file-diagnostics',
          label_id: 'label-duplicate-cheese',
          parent_node_id: null,
          type: 'jump',
          content: 'jump expression suspicious_target',
          order: '0000',
          source_span: { start_line: 5, end_line: 5 },
          metadata: { target_expression: 'suspicious_target' },
          visual: { position: { x: 64, y: 136 }, size: { width: 320, height: 88 } },
        },
        {
          id: 'node-raw-while',
          file_id: 'file-diagnostics',
          label_id: 'label-duplicate-cheese',
          parent_node_id: null,
          type: 'raw_block',
          content: 'while crumb_count < 3:\n    $ crumb_count += 1',
          order: '0001',
          source_span: { start_line: 9, end_line: 10 },
          metadata: { raw_block_type: 'while' },
          visual: { position: { x: 64, y: 248 }, size: { width: 320, height: 120 } },
        },
      ],
      edges: [],
      diagnostics: [
        {
          id: 'diagnostic-dynamic-target',
          code: 'dynamic_target',
          severity: 'info',
          message: 'Dynamic target is preserved but cannot be resolved statically.',
          blocking: false,
          file_id: 'file-diagnostics',
          label_id: 'label-duplicate-cheese',
          node_id: 'node-dynamic',
          source_span: { start_line: 5, end_line: 5 },
          metadata: {},
        },
        {
          id: 'diagnostic-raw-block',
          code: 'unsupported_raw_block',
          severity: 'warning',
          message: 'Unsupported control-flow block is preserved as raw text for MVP.',
          blocking: false,
          file_id: 'file-diagnostics',
          label_id: 'label-duplicate-cheese',
          node_id: 'node-raw-while',
          source_span: { start_line: 9, end_line: 10 },
          metadata: {},
        },
      ],
      source_index: { files: {} },
    };

    expect(projectGraphDiagnosticsToProblems(diagnosticGraph)).toEqual([
      expect.objectContaining({
        id: 'diagnostic-dynamic-target',
        code: 'dynamic_target',
        severity: 'info',
        blocking: false,
        nodeId: 'node-dynamic',
      }),
      expect.objectContaining({
        id: 'diagnostic-raw-block',
        code: 'unsupported_raw_block',
        severity: 'warning',
        blocking: false,
        nodeId: 'node-raw-while',
      }),
    ]);
  });
});
