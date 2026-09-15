import type { Edge, Node, Viewport } from '@xyflow/react';

export interface ProjectGraphSpatialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectGraphSpatialNodeIndex {
  boundsById: Map<string, ProjectGraphSpatialRect>;
  cellSize: number;
  connectedNodeIdsByNodeId: Map<string, string[]>;
  nodeIdsByCell: Map<string, string[]>;
  nodeOrderById: Map<string, number>;
  nodesById: Map<string, Node>;
  oversizedNodeIds: string[];
}

export interface ProjectGraphSpatialEdgeIndex {
  edgeIdsByNodeId: Map<string, string[]>;
  edgeOrderById: Map<string, number>;
  edgesById: Map<string, Edge>;
}

export interface ProjectGraphSpatialNodeQueryOptions {
  pinnedNodeIds?: Iterable<string | null | undefined>;
  pinConnectionsOfNodeIds?: Iterable<string | null | undefined>;
}

export interface ProjectGraphSpatialNodeQueryResult {
  nodeIds: Set<string>;
  nodes: Node[];
}

const DEFAULT_CELL_SIZE = 1024;
const MAX_INDEX_CELLS_PER_NODE = 64;
const DEFAULT_OVERSCAN_FACTOR = 0.75;
const DEFAULT_HYSTERESIS_MARGIN_FACTOR = 0.2;

const numericSize = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const rectsIntersect = (left: ProjectGraphSpatialRect, right: ProjectGraphSpatialRect): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

const buildAbsoluteNodeBounds = (nodes: Node[]): Map<string, ProjectGraphSpatialRect> => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const boundsById = new Map<string, ProjectGraphSpatialRect>();
  const visiting = new Set<string>();

  const resolve = (node: Node | undefined): ProjectGraphSpatialRect | null => {
    if (!node) {
      return null;
    }
    const cached = boundsById.get(node.id);
    if (cached) {
      return cached;
    }
    if (visiting.has(node.id)) {
      return null;
    }

    visiting.add(node.id);
    const parentBounds = node.parentId ? resolve(nodesById.get(node.parentId)) : null;
    visiting.delete(node.id);
    if (node.parentId && !parentBounds) {
      return null;
    }

    const bounds = {
      x: (parentBounds?.x ?? 0) + node.position.x,
      y: (parentBounds?.y ?? 0) + node.position.y,
      width: Math.max(0, numericSize(node.width, numericSize(node.style?.width, 0))),
      height: Math.max(0, numericSize(node.height, numericSize(node.style?.height, 0))),
    };
    boundsById.set(node.id, bounds);
    return bounds;
  };

  for (const node of nodes) {
    resolve(node);
  }

  return boundsById;
};

const cellKey = (x: number, y: number): string => `${x}:${y}`;

const getCellRange = (rect: ProjectGraphSpatialRect, cellSize: number) => {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  return {
    minX: Math.floor(rect.x / cellSize),
    maxX: Math.floor((rect.x + width - Number.EPSILON) / cellSize),
    minY: Math.floor(rect.y / cellSize),
    maxY: Math.floor((rect.y + height - Number.EPSILON) / cellSize),
  };
};

export const getProjectGraphViewportFlowRect = (
  viewport: Viewport,
  canvasSize: { width: number; height: number },
): ProjectGraphSpatialRect | null => {
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return null;
  }
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  const normalizeZero = (value: number): number => (Object.is(value, -0) ? 0 : value);
  return {
    x: normalizeZero(-viewport.x / zoom),
    y: normalizeZero(-viewport.y / zoom),
    width: canvasSize.width / zoom,
    height: canvasSize.height / zoom,
  };
};

export const buildProjectGraphSpatialRenderRect = (
  viewport: Viewport,
  canvasSize: { width: number; height: number },
  overscanFactor = DEFAULT_OVERSCAN_FACTOR,
): ProjectGraphSpatialRect | null => {
  const visibleRect = getProjectGraphViewportFlowRect(viewport, canvasSize);
  if (!visibleRect) {
    return null;
  }
  const safeOverscan = Math.max(0, overscanFactor);
  const overscanX = visibleRect.width * safeOverscan;
  const overscanY = visibleRect.height * safeOverscan;
  return {
    x: visibleRect.x - overscanX,
    y: visibleRect.y - overscanY,
    width: visibleRect.width + overscanX * 2,
    height: visibleRect.height + overscanY * 2,
  };
};

export const shouldRefreshProjectGraphSpatialRenderRect = (
  activeRenderRect: ProjectGraphSpatialRect | null,
  nextVisibleRect: ProjectGraphSpatialRect | null,
  marginFactor = DEFAULT_HYSTERESIS_MARGIN_FACTOR,
): boolean => {
  if (!nextVisibleRect) {
    return false;
  }
  if (!activeRenderRect) {
    return true;
  }

  const safeMargin = Math.max(0, marginFactor);
  const marginX = nextVisibleRect.width * safeMargin;
  const marginY = nextVisibleRect.height * safeMargin;
  return (
    nextVisibleRect.x - marginX < activeRenderRect.x ||
    nextVisibleRect.y - marginY < activeRenderRect.y ||
    nextVisibleRect.x + nextVisibleRect.width + marginX > activeRenderRect.x + activeRenderRect.width ||
    nextVisibleRect.y + nextVisibleRect.height + marginY > activeRenderRect.y + activeRenderRect.height
  );
};

export const buildProjectGraphSpatialNodeIndex = (
  nodes: Node[],
  edges: Edge[] = [],
  options: { cellSize?: number } = {},
): ProjectGraphSpatialNodeIndex => {
  const cellSize = Math.max(1, options.cellSize ?? DEFAULT_CELL_SIZE);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodeOrderById = new Map(nodes.map((node, index) => [node.id, index]));
  const boundsById = buildAbsoluteNodeBounds(nodes);
  const nodeIdsByCell = new Map<string, string[]>();
  const oversizedNodeIds: string[] = [];
  const connectedNodeIdSets = new Map<string, Set<string>>();

  for (const node of nodes) {
    const bounds = boundsById.get(node.id);
    if (!bounds) {
      continue;
    }
    const range = getCellRange(bounds, cellSize);
    const cellCount = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    if (cellCount > MAX_INDEX_CELLS_PER_NODE) {
      oversizedNodeIds.push(node.id);
      continue;
    }

    for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
      for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
        const key = cellKey(cellX, cellY);
        const cellNodeIds = nodeIdsByCell.get(key) ?? [];
        cellNodeIds.push(node.id);
        nodeIdsByCell.set(key, cellNodeIds);
      }
    }
  }

  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      continue;
    }
    const sourceConnections = connectedNodeIdSets.get(edge.source) ?? new Set<string>();
    const targetConnections = connectedNodeIdSets.get(edge.target) ?? new Set<string>();
    sourceConnections.add(edge.target);
    targetConnections.add(edge.source);
    connectedNodeIdSets.set(edge.source, sourceConnections);
    connectedNodeIdSets.set(edge.target, targetConnections);
  }

  return {
    boundsById,
    cellSize,
    connectedNodeIdsByNodeId: new Map(
      [...connectedNodeIdSets].map(([nodeId, connectedIds]) => [nodeId, [...connectedIds]]),
    ),
    nodeIdsByCell,
    nodeOrderById,
    nodesById,
    oversizedNodeIds,
  };
};

export const refreshProjectGraphSpatialNodeIndexNodes = (
  index: ProjectGraphSpatialNodeIndex,
  nodes: Node[],
): ProjectGraphSpatialNodeIndex => {
  if (
    nodes.length !== index.nodesById.size ||
    nodes.some((node, order) => index.nodeOrderById.get(node.id) !== order)
  ) {
    throw new Error('Cannot refresh ProjectGraph spatial node objects after geometry membership changed.');
  }

  return {
    ...index,
    nodesById: new Map(nodes.map((node) => [node.id, node])),
  };
};

const addNodeClosure = (index: ProjectGraphSpatialNodeIndex, nodeId: string, includedNodeIds: Set<string>): void => {
  const pending = [nodeId];
  while (pending.length > 0) {
    const currentId = pending.pop();
    if (!currentId || includedNodeIds.has(currentId)) {
      continue;
    }
    const node = index.nodesById.get(currentId);
    if (!node) {
      continue;
    }

    includedNodeIds.add(currentId);
    if (node.parentId) {
      pending.push(node.parentId);
    }
    if (Array.isArray(node.data?.dragGroupIds)) {
      for (const dragGroupId of node.data.dragGroupIds) {
        if (typeof dragGroupId === 'string') {
          pending.push(dragGroupId);
        }
      }
    }
  }
};

export const queryProjectGraphSpatialNodes = (
  index: ProjectGraphSpatialNodeIndex,
  renderRect: ProjectGraphSpatialRect | null,
  options: ProjectGraphSpatialNodeQueryOptions = {},
): ProjectGraphSpatialNodeQueryResult => {
  const includedNodeIds = new Set<string>();
  const candidateNodeIds = new Set<string>();

  if (renderRect) {
    const range = getCellRange(renderRect, index.cellSize);
    for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
      for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
        for (const nodeId of index.nodeIdsByCell.get(cellKey(cellX, cellY)) ?? []) {
          candidateNodeIds.add(nodeId);
        }
      }
    }
    for (const nodeId of index.oversizedNodeIds) {
      candidateNodeIds.add(nodeId);
    }

    for (const nodeId of candidateNodeIds) {
      const bounds = index.boundsById.get(nodeId);
      if (bounds && rectsIntersect(bounds, renderRect)) {
        addNodeClosure(index, nodeId, includedNodeIds);
      }
    }
  }

  for (const nodeId of options.pinnedNodeIds ?? []) {
    if (nodeId) {
      addNodeClosure(index, nodeId, includedNodeIds);
    }
  }

  for (const nodeId of options.pinConnectionsOfNodeIds ?? []) {
    if (!nodeId) {
      continue;
    }
    addNodeClosure(index, nodeId, includedNodeIds);
    for (const connectedNodeId of index.connectedNodeIdsByNodeId.get(nodeId) ?? []) {
      addNodeClosure(index, connectedNodeId, includedNodeIds);
    }
  }

  const nodes = [...includedNodeIds]
    .sort((left, right) => (index.nodeOrderById.get(left) ?? 0) - (index.nodeOrderById.get(right) ?? 0))
    .map((nodeId) => index.nodesById.get(nodeId))
    .filter((node): node is Node => node !== undefined);

  return { nodeIds: includedNodeIds, nodes };
};

export const buildProjectGraphSpatialEdgeIndex = (edges: Edge[]): ProjectGraphSpatialEdgeIndex => {
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const edgeOrderById = new Map(edges.map((edge, index) => [edge.id, index]));
  const edgeIdsByNodeId = new Map<string, string[]>();

  for (const edge of edges) {
    for (const nodeId of new Set([edge.source, edge.target])) {
      const edgeIds = edgeIdsByNodeId.get(nodeId) ?? [];
      edgeIds.push(edge.id);
      edgeIdsByNodeId.set(nodeId, edgeIds);
    }
  }

  return { edgeIdsByNodeId, edgeOrderById, edgesById };
};

export const queryProjectGraphSpatialEdges = (
  index: ProjectGraphSpatialEdgeIndex,
  renderedNodeIds: ReadonlySet<string>,
): Edge[] => {
  const includedEdgeIds = new Set<string>();
  for (const nodeId of renderedNodeIds) {
    for (const edgeId of index.edgeIdsByNodeId.get(nodeId) ?? []) {
      const edge = index.edgesById.get(edgeId);
      if (edge && renderedNodeIds.has(edge.source) && renderedNodeIds.has(edge.target)) {
        includedEdgeIds.add(edgeId);
      }
    }
  }

  return [...includedEdgeIds]
    .sort((left, right) => (index.edgeOrderById.get(left) ?? 0) - (index.edgeOrderById.get(right) ?? 0))
    .map((edgeId) => index.edgesById.get(edgeId))
    .filter((edge): edge is Edge => edge !== undefined);
};
