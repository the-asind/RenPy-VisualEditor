import type { Node } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type ProjectGraphRenderedNodeMode = 'normal' | 'simple';

type ProjectGraphHeaderPointerDown = (
  nodeId: string,
  event: ReactPointerEvent<HTMLDivElement>,
) => void;

interface ProjectGraphRenderedNodeCacheEntry {
  codeOnlyFileOpenHandler: (nodeId: string) => void;
  headerPointerDownHandler: ProjectGraphHeaderPointerDown;
  renderedNode: Node;
  renderMode: ProjectGraphRenderedNodeMode;
  selected: boolean;
  sourceNode: Node;
}

export interface ProjectGraphRenderedNodeCache {
  entries: Map<string, ProjectGraphRenderedNodeCacheEntry>;
}

export interface ProjectGraphRenderedNodeOptions {
  getRenderMode: (node: Node) => ProjectGraphRenderedNodeMode;
  onCodeOnlyFileOpen: (nodeId: string) => void;
  onHeaderPointerDown: ProjectGraphHeaderPointerDown;
  reuseEnabled?: boolean;
  selectedNodeId: string | null;
}

export interface ProjectGraphRenderedNodeResult {
  nodes: Node[];
  stats: {
    created: number;
    reused: number;
  };
}

export const createProjectGraphRenderedNodeCache = (): ProjectGraphRenderedNodeCache => ({
  entries: new Map(),
});

const materializeRenderedNode = (
  node: Node,
  renderMode: ProjectGraphRenderedNodeMode,
  selected: boolean,
  onHeaderPointerDown: ProjectGraphHeaderPointerDown,
  onCodeOnlyFileOpen: (nodeId: string) => void,
): Node => ({
  ...node,
  data: {
    ...node.data,
    renderMode,
    onHeaderPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => onHeaderPointerDown(node.id, event),
    onCodeOnlyFileOpen: () => onCodeOnlyFileOpen(node.id),
  },
  selected,
});

export const reconcileProjectGraphRenderedNodes = (
  cache: ProjectGraphRenderedNodeCache,
  sourceNodes: Node[],
  options: ProjectGraphRenderedNodeOptions,
): ProjectGraphRenderedNodeResult => {
  const reuseEnabled = options.reuseEnabled !== false;
  let created = 0;
  let reused = 0;

  const nodes = sourceNodes.map((sourceNode) => {
    const renderMode = options.getRenderMode(sourceNode);
    const selected = sourceNode.id === options.selectedNodeId;
    const cached = cache.entries.get(sourceNode.id);

    if (
      reuseEnabled &&
      cached?.sourceNode === sourceNode &&
      cached.renderMode === renderMode &&
      cached.selected === selected &&
      cached.headerPointerDownHandler === options.onHeaderPointerDown &&
      cached.codeOnlyFileOpenHandler === options.onCodeOnlyFileOpen
    ) {
      reused += 1;
      return cached.renderedNode;
    }

    created += 1;
    const renderedNode = materializeRenderedNode(
      sourceNode,
      renderMode,
      selected,
      options.onHeaderPointerDown,
      options.onCodeOnlyFileOpen,
    );

    if (reuseEnabled) {
      cache.entries.set(sourceNode.id, {
        codeOnlyFileOpenHandler: options.onCodeOnlyFileOpen,
        headerPointerDownHandler: options.onHeaderPointerDown,
        renderedNode,
        renderMode,
        selected,
        sourceNode,
      });
    }

    return renderedNode;
  });

  return {
    nodes,
    stats: { created, reused },
  };
};

export const pruneProjectGraphRenderedNodeCache = (
  cache: ProjectGraphRenderedNodeCache,
  validNodeIds: Iterable<string>,
): number => {
  const validIds = new Set(validNodeIds);
  let pruned = 0;

  for (const nodeId of cache.entries.keys()) {
    if (!validIds.has(nodeId)) {
      cache.entries.delete(nodeId);
      pruned += 1;
    }
  }

  return pruned;
};
