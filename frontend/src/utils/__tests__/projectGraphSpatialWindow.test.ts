import type { Edge, Node, Viewport } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildProjectGraphSpatialEdgeIndex,
  buildProjectGraphSpatialNodeIndex,
  buildProjectGraphSpatialRenderRect,
  getProjectGraphViewportFlowRect,
  queryProjectGraphSpatialEdges,
  queryProjectGraphSpatialNodes,
  refreshProjectGraphSpatialNodeIndexNodes,
  shouldRefreshProjectGraphSpatialRenderRect,
} from '../projectGraphSpatialWindow';

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string,
  data: Record<string, unknown> = {},
): Node => ({
  id,
  type: id.startsWith('file') ? 'projectFrame' : id.startsWith('label') ? 'labelFrame' : 'scenario',
  position: { x, y },
  width,
  height,
  parentId,
  data,
});

const nodes: Node[] = [
  node('file', 0, 0, 5000, 3000),
  node('label-near', 100, 100, 700, 600, 'file'),
  node('near', 30, 80, 180, 90, 'label-near', { dragGroupIds: ['near', 'branch-mate'] }),
  node('label-middle', 1800, 100, 700, 600, 'file'),
  node('branch-mate', 40, 80, 180, 90, 'label-middle'),
  node('label-far', 3600, 1800, 700, 600, 'file'),
  node('far', 40, 80, 180, 90, 'label-far'),
];

const edges: Edge[] = [
  { id: 'near-to-far', source: 'near', target: 'far' },
  { id: 'near-to-mate', source: 'near', target: 'branch-mate' },
  { id: 'mate-to-far', source: 'branch-mate', target: 'far' },
];

describe('ProjectGraph spatial render window', () => {
  it('queries a bounded node set and preserves lexical ancestors in React Flow order', () => {
    const index = buildProjectGraphSpatialNodeIndex(nodes, edges, { cellSize: 512 });
    const result = queryProjectGraphSpatialNodes(index, { x: 0, y: 0, width: 1000, height: 900 });

    expect(result.nodes.map((candidate) => candidate.id)).toEqual([
      'file',
      'label-near',
      'near',
      'label-middle',
      'branch-mate',
    ]);
    expect(result.nodeIds.has('label-far')).toBe(false);
    expect(result.nodeIds.has('far')).toBe(false);
  });

  it('pins offscreen selection, its ancestors and connected endpoints without mounting unrelated nodes', () => {
    const index = buildProjectGraphSpatialNodeIndex(nodes, edges, { cellSize: 512 });
    const result = queryProjectGraphSpatialNodes(
      index,
      { x: 0, y: 0, width: 1000, height: 900 },
      {
        pinnedNodeIds: ['far'],
        pinConnectionsOfNodeIds: ['far'],
      },
    );

    expect(result.nodes.map((candidate) => candidate.id)).toEqual([
      'file',
      'label-near',
      'near',
      'label-middle',
      'branch-mate',
      'label-far',
      'far',
    ]);
    expect(result.nodeIds.has('far')).toBe(true);
    expect(result.nodeIds.has('label-far')).toBe(true);
  });

  it('keeps only edges whose endpoints are mounted and preserves source edge order', () => {
    const index = buildProjectGraphSpatialEdgeIndex(edges);

    expect(queryProjectGraphSpatialEdges(index, new Set(['near', 'branch-mate'])).map((edge) => edge.id)).toEqual([
      'near-to-mate',
    ]);
    expect(queryProjectGraphSpatialEdges(index, new Set(['near', 'branch-mate', 'far'])).map((edge) => edge.id)).toEqual([
      'near-to-far',
      'near-to-mate',
      'mate-to-far',
    ]);
  });

  it('uses overscan and hysteresis so small continuous pans do not rebuild the render set', () => {
    const canvasSize = { width: 1000, height: 500 };
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
    const activeRect = buildProjectGraphSpatialRenderRect(viewport, canvasSize, 0.75);

    expect(activeRect).toEqual({ x: -750, y: -375, width: 2500, height: 1250 });
    expect(
      shouldRefreshProjectGraphSpatialRenderRect(
        activeRect,
        getProjectGraphViewportFlowRect({ x: -350, y: 0, zoom: 1 }, canvasSize),
      ),
    ).toBe(false);
    expect(
      shouldRefreshProjectGraphSpatialRenderRect(
        activeRect,
        getProjectGraphViewportFlowRect({ x: -800, y: 0, zoom: 1 }, canvasSize),
      ),
    ).toBe(true);
  });

  it('returns no viewport area before the canvas has a measurable size', () => {
    expect(getProjectGraphViewportFlowRect({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 0 })).toBeNull();
    expect(buildProjectGraphSpatialRenderRect({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 0 })).toBeNull();
  });

  it('refreshes presentation node objects without rebuilding stable geometry or topology', () => {
    const index = buildProjectGraphSpatialNodeIndex(nodes, edges, { cellSize: 512 });
    const updatedNear = {
      ...nodes.find((candidate) => candidate.id === 'near')!,
      data: { ...nodes.find((candidate) => candidate.id === 'near')!.data, content: 'updated' },
    };
    const updatedNodes = nodes.map((candidate) => (candidate.id === updatedNear.id ? updatedNear : candidate));

    const refreshed = refreshProjectGraphSpatialNodeIndexNodes(index, updatedNodes);

    expect(refreshed).not.toBe(index);
    expect(refreshed.nodesById.get('near')).toBe(updatedNear);
    expect(refreshed.boundsById).toBe(index.boundsById);
    expect(refreshed.nodeIdsByCell).toBe(index.nodeIdsByCell);
    expect(refreshed.connectedNodeIdsByNodeId).toBe(index.connectedNodeIdsByNodeId);
    expect(refreshed.nodeOrderById).toBe(index.nodeOrderById);
  });
});
