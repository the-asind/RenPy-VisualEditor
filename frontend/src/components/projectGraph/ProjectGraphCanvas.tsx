import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Background,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  applyNodeChanges,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type ReactFlowInstance,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import AddIcon from '@mui/icons-material/Add';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CheckIcon from '@mui/icons-material/Check';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import { useTranslation } from 'react-i18next';
import '@xyflow/react/dist/style.css';

import {
  type GraphPoint,
  getAbsoluteNodePosition,
  projectGraphDiagnosticsToProblems,
  reconcileProjectGraphProjection,
  searchProjectGraph,
  type ProjectGraphProjection,
  type ProjectGraphSnapshot,
  type ScenarioNodeSnapshot,
} from '../../utils/projectGraphProjection';
import type {
  ProjectGraphPresenceActivity,
  ProjectGraphPresenceUser,
  ProjectGraphRemoteCursor,
} from '../../utils/projectGraphCollaboration';
import type { ProjectGraphReadModelStats, ProjectGraphReadModelUpdate } from '../../utils/projectGraphReadModel';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';
import {
  createProjectGraphRenderedNodeCache,
  pruneProjectGraphRenderedNodeCache,
  reconcileProjectGraphRenderedNodes,
} from '../../utils/projectGraphRenderedNodeCache';
import {
  buildProjectGraphSpatialEdgeIndex,
  buildProjectGraphSpatialNodeIndex,
  buildProjectGraphSpatialRenderRect,
  getProjectGraphViewportFlowRect,
  queryProjectGraphSpatialEdges,
  queryProjectGraphSpatialNodes,
  refreshProjectGraphSpatialNodeIndexNodes,
  shouldRefreshProjectGraphSpatialRenderRect,
  type ProjectGraphSpatialNodeIndex,
  type ProjectGraphSpatialRect,
} from '../../utils/projectGraphSpatialWindow';
import { ActionEditorOverlay } from '../actionEditor/ActionEditorOverlay';
import type { ActionEditorTextSplice } from '../actionEditor/actionEditorModel';
import type { ActionEditorNextActionRequest, ActionEditorNextTargetLabel } from '../actionEditor/ActionEditorSidebar';
import type { ProjectGraphStructureCommand } from '../../utils/projectGraphStructure';
import {
  analyzeProjectGraphDeletion,
  type ProjectGraphDeletionImpact,
} from '../../utils/projectGraphDeletion';
import { ProjectGraphCreateMenu, type ProjectGraphCreateMenuState } from './ProjectGraphCreateMenu';
import { ProjectGraphDeleteDialog } from './ProjectGraphDeleteDialog';
import brandLogoUrl from '../../assets/logo.svg';
import './ProjectGraphCanvas.css';

export const PROJECT_HELP_URL =
  import.meta.env.VITE_HELP_URL?.trim() ||
  'https://github.com/the-asind/RenPy-VisualEditor/blob/main/docs/quick-start.md';
export const PROJECT_BUG_REPORT_URL =
  import.meta.env.VITE_BUG_REPORT_URL?.trim() ||
  'https://github.com/the-asind/RenPy-VisualEditor/issues/new?template=bug_report.yml&title=%5BBug%5D%20';

type HeaderPointerDownHandler = (event: ReactPointerEvent<HTMLDivElement>) => void;

const getHeaderPointerDownHandler = (data: NodeProps['data']): HeaderPointerDownHandler | undefined =>
  typeof data.onHeaderPointerDown === 'function' ? (data.onHeaderPointerDown as HeaderPointerDownHandler) : undefined;

type ProjectGraphKeyboardShortcutEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export const isProjectGraphKeyboardShortcut = (
  event: ProjectGraphKeyboardShortcutEvent,
  physicalKey: 'KeyE' | 'KeyK',
  requiresShift = false,
): boolean => (event.ctrlKey || event.metaKey) && event.code === physicalKey && (!requiresShift || event.shiftKey);

const getDragGroupIds = (node: Node): string[] =>
  Array.isArray(node.data?.dragGroupIds) && node.data.dragGroupIds.every((id) => typeof id === 'string')
    ? (node.data.dragGroupIds as string[])
    : [node.id];

export const getProjectGraphHeaderDragGroupIds = (node: Node, nodes: Node[]): string[] => {
  const parent = node.parentId ? nodes.find((candidate) => candidate.id === node.parentId) : undefined;
  if (node.type === 'labelStart' && parent?.type === 'labelFrame') {
    return [parent.id];
  }

  return getDragGroupIds(node);
};

const DRAG_FRAME_X_PADDING = 32;
const DRAG_FILE_FRAME_TOP_PADDING = 48;
const DRAG_LABEL_FRAME_TOP_PADDING = 72;
const DRAG_DEFAULT_TOP_PADDING = 32;
const DRAG_FRAME_MIN_SIZE_BY_TYPE: Record<string, { width: number; height: number }> = {
  projectFrame: { width: 560, height: 260 },
  labelFrame: { width: 520, height: 180 },
};

const cloneNodeForDrag = (node: Node): Node => ({
  ...node,
  position: { ...node.position },
  style: node.style ? { ...node.style } : node.style,
});

const numericSize = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const getProjectGraphNodeAnchor = (nodes: Node[], nodeId: string): GraphPoint | null => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const position = getAbsoluteNodePosition(nodes, nodeId);
  if (!node || !position) {
    return null;
  }
  return {
    x: position.x + numericSize(node.width, numericSize(node.style?.width, 0)) / 2,
    y: position.y + numericSize(node.height, numericSize(node.style?.height, 0)) / 2,
  };
};

const setNodeVisualSize = (node: Node, width: number, height: number): void => {
  node.width = width;
  node.height = height;
  node.style = {
    ...(node.style ?? {}),
    width,
    height,
  };
};

const dragPaddingForParent = (parent: Node): { left: number; top: number; right: number; bottom: number } => ({
  left: parent.type === 'projectFrame' ? 48 : DRAG_FRAME_X_PADDING,
  top:
    parent.type === 'labelFrame'
      ? DRAG_LABEL_FRAME_TOP_PADDING
      : parent.type === 'projectFrame'
        ? DRAG_FILE_FRAME_TOP_PADDING
        : DRAG_DEFAULT_TOP_PADDING,
  right: DRAG_FRAME_X_PADDING,
  bottom: DRAG_FRAME_X_PADDING,
});

const dragFrameMinSize = (parent: Node): { width: number; height: number } =>
  DRAG_FRAME_MIN_SIZE_BY_TYPE[parent.type ?? ''] ?? {
    width: numericSize(parent.width, numericSize(parent.style?.width, 0)),
    height: numericSize(parent.height, numericSize(parent.style?.height, 0)),
  };

const nodeDepth = (node: Node, byId: Map<string, Node>): number => {
  let depth = 0;
  let current = node.parentId ? byId.get(node.parentId) : undefined;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return depth;
};

const isExpandableFrameNode = (node: Node | undefined): node is Node =>
  node?.type === 'projectFrame' || node?.type === 'labelFrame';

export const findProjectGraphNodeAtCanvasPoint = (nodes: Node[], point: GraphPoint): Node | null => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const candidates = nodes
    .map((node, index) => {
      const position = getAbsoluteNodePosition(nodes, node.id);
      const width = numericSize(node.width, numericSize(node.style?.width, 0));
      const height = numericSize(node.height, numericSize(node.style?.height, 0));

      if (
        !position ||
        point.x < position.x ||
        point.x > position.x + width ||
        point.y < position.y ||
        point.y > position.y + height
      ) {
        return null;
      }

      return {
        index,
        node,
        depth: nodeDepth(node, byId),
      };
    })
    .filter((candidate): candidate is { index: number; node: Node; depth: number } => candidate !== null)
    .sort((left, right) => right.depth - left.depth || right.index - left.index);

  return candidates[0]?.node ?? null;
};

export const expandAncestorFramesForMovedNodes = (nodes: Node[], movedNodeIds: Set<string>): Node[] => {
  if (movedNodeIds.size === 0) {
    return nodes;
  }

  const nextNodes = nodes.map(cloneNodeForDrag);
  const byId = new Map(nextNodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, Node[]>();

  for (const node of nextNodes) {
    if (!node.parentId) {
      continue;
    }
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const parentIds = new Set<string>();
  for (const movedNodeId of movedNodeIds) {
    let current = byId.get(movedNodeId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parentId);
      if (isExpandableFrameNode(parent)) {
        parentIds.add(parent.id);
      }
      current = parent;
    }
  }

  const parents = [...parentIds]
    .map((parentId) => byId.get(parentId))
    .filter(isExpandableFrameNode)
    .sort((left, right) => nodeDepth(right, byId) - nodeDepth(left, byId));

  for (const parent of parents) {
    const children = childrenByParent.get(parent.id) ?? [];
    if (children.length === 0) {
      continue;
    }

    const padding = dragPaddingForParent(parent);
    const minChildX = Math.min(...children.map((child) => child.position.x));
    const minChildY = Math.min(...children.map((child) => child.position.y));
    const shiftRight = Math.max(0, padding.left - minChildX);
    const shiftDown = Math.max(0, padding.top - minChildY);
    const minSize = dragFrameMinSize(parent);

    if (shiftRight > 0) {
      parent.position.x -= shiftRight;
      for (const child of children) {
        child.position.x += shiftRight;
      }
    }

    if (shiftDown > 0) {
      parent.position.y -= shiftDown;
      for (const child of children) {
        child.position.y += shiftDown;
      }
    }

    const requiredWidth = Math.max(
      minSize.width,
      ...children.map((child) => child.position.x + numericSize(child.width, 0) + padding.right),
    );
    const requiredHeight = Math.max(
      minSize.height,
      ...children.map((child) => child.position.y + numericSize(child.height, 0) + padding.bottom),
    );

    setNodeVisualSize(parent, requiredWidth, requiredHeight);
  }

  return nextNodes;
};

export const buildNestedDragPreviewNodes = (
  baselineNodes: Node[],
  movedNodeIds: Set<string>,
  baselineMovedPositionsById: Map<string, GraphPoint>,
  delta: GraphPoint,
): Node[] => {
  const movedNodes = baselineNodes.map((node) => {
    const baselinePosition = baselineMovedPositionsById.get(node.id);
    return baselinePosition
      ? {
          ...node,
          position: {
            x: baselinePosition.x + delta.x,
            y: baselinePosition.y + delta.y,
          },
        }
      : node;
  });

  return expandAncestorFramesForMovedNodes(movedNodes, movedNodeIds);
};

export interface ProjectGraphEntityPositionChange {
  entityId: string;
  position: GraphPoint;
  manual: boolean;
}

export interface ProjectGraphViewportMetrics {
  totalNodes: number;
  totalEdges: number;
  visibleNodes: number;
  crossingEdges: number;
  visibleNodeTypes: Record<string, number>;
  flowRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProjectGraphStaticMiniMapRect {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectGraphStaticMiniMapModel {
  width: number;
  height: number;
  frames: ProjectGraphStaticMiniMapRect[];
  viewportRect: ProjectGraphStaticMiniMapRect | null;
}

export interface ProjectGraphStaticMiniMapGeometry {
  width: number;
  height: number;
  frames: ProjectGraphStaticMiniMapRect[];
  transform: {
    minX: number;
    minY: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  } | null;
}

export interface ProjectGraphFrameMetrics {
  fps: number;
  averageFrameMs: number;
  maxFrameMs: number;
  longFrameCount: number;
  sampleFrames: number;
  sampleDurationMs: number;
}

export type ProjectGraphFramePhase = 'idle' | 'pan' | 'zoom' | 'nodeDrag';
export type ProjectGraphPhaseFrameMetrics = Record<ProjectGraphFramePhase, ProjectGraphFrameMetrics>;

export interface ProjectGraphFrameMetricsSnapshot extends ProjectGraphFrameMetrics {
  activePhase: ProjectGraphFramePhase;
  phases: ProjectGraphPhaseFrameMetrics;
}

export type ProjectGraphAdaptiveLightLevel = 0 | 1 | 2 | 3;

export interface ProjectGraphDevRenderToggles {
  edges: boolean;
  derivedEdges: boolean;
  minimap: boolean;
  background: boolean;
  nodeBody: boolean;
  nodeEffects: boolean;
  lod: boolean;
  nodeIdentityCache: boolean;
  projectionCache: boolean;
  spatialWindow: boolean;
}

const DEV_FRAME_SAMPLE_MS = 1000;
const DEV_LONG_FRAME_MS = 50;
const DEV_ADAPTIVE_PAN_FPS_LOW = 28;
const DEV_ADAPTIVE_PAN_FRAME_MS_HIGH = 36;
const DEV_ADAPTIVE_PAN_FPS_RECOVERED = 52;
const DEV_ADAPTIVE_PAN_FRAME_MS_RECOVERED = 22;
const PROJECT_GRAPH_MAX_ZOOM = 2.5;
const PROJECT_GRAPH_MIN_ZOOM = 0.08;
const PROJECT_GRAPH_DENSE_RELATION_EDGE_THRESHOLD = 20;
const PROJECT_GRAPH_RELATION_NAVIGATION_MS = 760;
const STATIC_MINIMAP_WIDTH = 172;
const STATIC_MINIMAP_HEIGHT = 116;
const STATIC_MINIMAP_PADDING = 7;
const PROJECT_GRAPH_FRAME_TITLE_BASE_FONT_SIZE = 15;
const PROJECT_GRAPH_FRAME_TITLE_MAX_SCALE = 3.4;
const projectGraphFramePhases: ProjectGraphFramePhase[] = ['idle', 'pan', 'zoom', 'nodeDrag'];

export const getDefaultProjectGraphDevRenderToggles = (): ProjectGraphDevRenderToggles => ({
  edges: true,
  derivedEdges: true,
  minimap: true,
  background: true,
  nodeBody: true,
  nodeEffects: true,
  lod: true,
  nodeIdentityCache: true,
  projectionCache: true,
  spatialWindow: true,
});

const emptyViewportMetrics: ProjectGraphViewportMetrics = {
  totalNodes: 0,
  totalEdges: 0,
  visibleNodes: 0,
  crossingEdges: 0,
  visibleNodeTypes: {},
  flowRect: { x: 0, y: 0, width: 0, height: 0 },
};

export const summarizeProjectGraphFrameMetrics = (
  frameDurationsMs: number[],
  sampleDurationMs: number,
): ProjectGraphFrameMetrics => {
  const sampleFrames = frameDurationsMs.length;
  if (sampleFrames === 0 || sampleDurationMs <= 0) {
    return {
      fps: 0,
      averageFrameMs: 0,
      maxFrameMs: 0,
      longFrameCount: 0,
      sampleFrames: 0,
      sampleDurationMs: Math.max(0, sampleDurationMs),
    };
  }

  const totalFrameMs = frameDurationsMs.reduce((sum, frameMs) => sum + frameMs, 0);
  return {
    fps: (sampleFrames * 1000) / sampleDurationMs,
    averageFrameMs: totalFrameMs / sampleFrames,
    maxFrameMs: Math.max(...frameDurationsMs),
    longFrameCount: frameDurationsMs.filter((frameMs) => frameMs >= DEV_LONG_FRAME_MS).length,
    sampleFrames,
    sampleDurationMs,
  };
};

const totalFrameDuration = (frameDurationsMs: number[]): number =>
  frameDurationsMs.reduce((sum, frameMs) => sum + frameMs, 0);

export const summarizeProjectGraphPhaseFrameMetrics = (
  frameDurationsByPhase: Record<ProjectGraphFramePhase, number[]>,
): ProjectGraphPhaseFrameMetrics =>
  Object.fromEntries(
    projectGraphFramePhases.map((phase) => [
      phase,
      summarizeProjectGraphFrameMetrics(frameDurationsByPhase[phase], totalFrameDuration(frameDurationsByPhase[phase])),
    ]),
  ) as ProjectGraphPhaseFrameMetrics;

export const getNextProjectGraphAdaptiveLightLevel = (
  currentLevel: ProjectGraphAdaptiveLightLevel,
  activePhase: ProjectGraphFramePhase,
  panMetrics: ProjectGraphFrameMetrics,
  visibleNodes: number,
): ProjectGraphAdaptiveLightLevel => {
  if (activePhase !== 'pan' || panMetrics.sampleFrames < 3 || visibleNodes < 100) {
    return currentLevel;
  }

  const shouldIncrease =
    panMetrics.fps > 0 &&
    (panMetrics.fps < DEV_ADAPTIVE_PAN_FPS_LOW ||
      panMetrics.averageFrameMs >= DEV_ADAPTIVE_PAN_FRAME_MS_HIGH ||
      panMetrics.longFrameCount > 0);
  if (shouldIncrease) {
    return Math.min(3, currentLevel + 1) as ProjectGraphAdaptiveLightLevel;
  }

  const shouldRecover =
    currentLevel > 0 &&
    panMetrics.fps >= DEV_ADAPTIVE_PAN_FPS_RECOVERED &&
    panMetrics.averageFrameMs <= DEV_ADAPTIVE_PAN_FRAME_MS_RECOVERED &&
    panMetrics.longFrameCount === 0;
  if (shouldRecover) {
    return Math.max(0, currentLevel - 1) as ProjectGraphAdaptiveLightLevel;
  }

  return currentLevel;
};

const rectsIntersect = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

const buildAbsoluteNodeBounds = (
  nodes: Node[],
): Map<string, { x: number; y: number; width: number; height: number }> => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
  const visiting = new Set<string>();

  const resolve = (node: Node | undefined): { x: number; y: number; width: number; height: number } | null => {
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
    const parentBounds = node.parentId ? resolve(byId.get(node.parentId)) : null;
    visiting.delete(node.id);
    if (node.parentId && !parentBounds) {
      return null;
    }

    const bounds = {
      x: (parentBounds?.x ?? 0) + node.position.x,
      y: (parentBounds?.y ?? 0) + node.position.y,
      width: numericSize(node.width, numericSize(node.style?.width, 0)),
      height: numericSize(node.height, numericSize(node.style?.height, 0)),
    };
    boundsById.set(node.id, bounds);
    return bounds;
  };

  for (const node of nodes) {
    resolve(node);
  }

  return boundsById;
};

export const calculateProjectGraphViewportMetrics = (
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
  canvasSize: { width: number; height: number },
): ProjectGraphViewportMetrics => {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const normalizeZero = (value: number): number => (Object.is(value, -0) ? 0 : value);
  const flowRect = {
    x: normalizeZero(-viewport.x / zoom),
    y: normalizeZero(-viewport.y / zoom),
    width: canvasSize.width / zoom,
    height: canvasSize.height / zoom,
  };
  const boundsById = buildAbsoluteNodeBounds(nodes);
  const visibleNodeTypes: Record<string, number> = {};
  const visibleNodeIds = new Set<string>();

  for (const node of nodes) {
    const bounds = boundsById.get(node.id);
    if (!bounds || !rectsIntersect(bounds, flowRect)) {
      continue;
    }
    visibleNodeIds.add(node.id);
    const type = node.type ?? 'default';
    visibleNodeTypes[type] = (visibleNodeTypes[type] ?? 0) + 1;
  }

  let crossingEdges = 0;
  for (const edge of edges) {
    const source = boundsById.get(edge.source);
    const target = boundsById.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const edgeBounds = {
      x: Math.min(sourceCenter.x, targetCenter.x),
      y: Math.min(sourceCenter.y, targetCenter.y),
      width: Math.abs(sourceCenter.x - targetCenter.x),
      height: Math.abs(sourceCenter.y - targetCenter.y),
    };

    if (visibleNodeIds.has(edge.source) || visibleNodeIds.has(edge.target) || rectsIntersect(edgeBounds, flowRect)) {
      crossingEdges += 1;
    }
  }

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    visibleNodes: visibleNodeIds.size,
    crossingEdges,
    visibleNodeTypes,
    flowRect,
  };
};

const isDashedProjectGraphEdge = (edge: Edge): boolean =>
  typeof edge.style?.strokeDasharray === 'string' || typeof edge.style?.strokeDasharray === 'number';

const isProjectGraphRelationEdge = (edge: Edge): boolean => edge.data?.kind === 'jump' || edge.data?.kind === 'call';

export const applySelectedDashedEdgeAnimation = (edges: Edge[], selectedNodeId: string | null): Edge[] =>
  edges.map((edge) => {
    const shouldAnimate =
      selectedNodeId !== null &&
      isDashedProjectGraphEdge(edge) &&
      (edge.source === selectedNodeId || edge.target === selectedNodeId);
    return edge.animated === shouldAnimate ? edge : { ...edge, animated: shouldAnimate };
  });

export const getProjectGraphRelationEdgeVisibility = (edges: Edge[], selectedNodeId: string | null): Edge[] => {
  const relationEdges = edges.filter(isProjectGraphRelationEdge);
  if (relationEdges.length <= PROJECT_GRAPH_DENSE_RELATION_EDGE_THRESHOLD) {
    return edges;
  }

  return edges.filter((edge) => !isProjectGraphRelationEdge(edge) || edge.source === selectedNodeId);
};

export interface ProjectGraphRelationNavigationKeyframeInput {
  canvasSize: { width: number; height: number };
  fromViewport: Viewport;
  targetCenter: GraphPoint;
  maxZoom: number;
  minZoom?: number;
}

export const buildProjectGraphRelationNavigationKeyframes = ({
  canvasSize,
  fromViewport,
  targetCenter,
  maxZoom,
  minZoom = PROJECT_GRAPH_MIN_ZOOM,
}: ProjectGraphRelationNavigationKeyframeInput): Viewport[] => {
  const startZoom = Math.min(maxZoom, Math.max(minZoom, fromViewport.zoom > 0 ? fromViewport.zoom : 1));
  const startCenter = {
    x: (canvasSize.width / 2 - fromViewport.x) / startZoom,
    y: (canvasSize.height / 2 - fromViewport.y) / startZoom,
  };
  const middleCenter = {
    x: startCenter.x + (targetCenter.x - startCenter.x) * 0.5,
    y: startCenter.y + (targetCenter.y - startCenter.y) * 0.5,
  };
  const zoomOutDelta = Math.min(0.22, Math.max(0.06, startZoom * 0.12), startZoom - minZoom);
  const middleZoom = Math.max(minZoom, startZoom - Math.max(0, zoomOutDelta));
  const viewportForCenter = (center: GraphPoint, zoom: number): Viewport => ({
    x: canvasSize.width / 2 - center.x * zoom,
    y: canvasSize.height / 2 - center.y * zoom,
    zoom,
  });

  return [
    { x: fromViewport.x, y: fromViewport.y, zoom: startZoom },
    viewportForCenter(middleCenter, middleZoom),
    viewportForCenter(targetCenter, startZoom),
  ];
};

export const getProjectGraphRenderEdges = (
  edges: Edge[],
  toggles: ProjectGraphDevRenderToggles,
  devTogglesEnabled: boolean,
): Edge[] => {
  if (!devTogglesEnabled) {
    return edges;
  }
  if (!toggles.edges) {
    return [];
  }
  if (!toggles.derivedEdges) {
    return edges.filter((edge) => edge.data?.derived !== true);
  }
  return edges;
};

export type ProjectGraphLodLevel = 'full' | 'compact' | 'bars' | 'map';

export const getProjectGraphLodLevel = (zoom: number): ProjectGraphLodLevel => {
  if (zoom >= 0.55) {
    return 'full';
  }
  if (zoom >= 0.25) {
    return 'compact';
  }
  if (zoom >= 0.12) {
    return 'bars';
  }
  return 'map';
};

export const getProjectGraphFrameTitleScale = (zoom: number): number => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  if (safeZoom >= 0.9) {
    return 1;
  }
  return Math.min(PROJECT_GRAPH_FRAME_TITLE_MAX_SCALE, Math.max(1, 1 / Math.max(0.3, safeZoom)));
};

export const getProjectGraphViewportStyleVariables = (zoom: number) => {
  const scale = getProjectGraphFrameTitleScale(zoom);
  return {
    '--pg-frame-title-font-size': `${Math.round(PROJECT_GRAPH_FRAME_TITLE_BASE_FONT_SIZE * scale * 10) / 10}px`,
    '--pg-frame-title-scale': String(scale),
    '--pg-frame-title-header-min-height': `${Math.round(38 + (scale - 1) * 18)}px`,
    '--pg-viewport-inverse-zoom': String(1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1)),
  };
};

const applyProjectGraphViewportStyleVariables = (element: HTMLElement | null, zoom: number): void => {
  if (!element) {
    return;
  }
  for (const [name, value] of Object.entries(getProjectGraphViewportStyleVariables(zoom))) {
    element.style.setProperty(name, value);
  }
};

export const shouldHideProjectGraphEdgeInLod = (edge: Edge, lodLevel: ProjectGraphLodLevel): boolean =>
  (lodLevel === 'bars' || lodLevel === 'map') && edge.type === 'straight' && edge.data?.kind === 'sequence';

export const applyProjectGraphEdgeLod = (edges: Edge[], lodLevel: ProjectGraphLodLevel): Edge[] => {
  if (lodLevel !== 'bars' && lodLevel !== 'map') {
    return edges;
  }

  return edges
    .filter((edge) => !shouldHideProjectGraphEdgeInLod(edge, lodLevel))
    .map((edge) =>
      edge.markerEnd === undefined && edge.interactionWidth === 0
        ? edge
        : {
            ...edge,
            markerEnd: undefined,
            interactionWidth: 0,
          },
    );
};

export const shouldRenderProjectGraphSimpleNodes = (
  lodLevel: ProjectGraphLodLevel,
  adaptiveLightLevel: ProjectGraphAdaptiveLightLevel,
  nodeType?: string | null,
): boolean => {
  if (nodeType === 'projectFrame' || nodeType === 'labelFrame') {
    return false;
  }
  return lodLevel === 'bars' || lodLevel === 'map' || adaptiveLightLevel >= 1;
};

const minimapNodeTypes = new Set(['projectFrame', 'labelFrame']);

export const buildProjectGraphStaticMiniMapGeometry = (nodes: Node[]): ProjectGraphStaticMiniMapGeometry => {
  const boundsById = buildAbsoluteNodeBounds(nodes);
  const frameBounds = nodes
    .filter((node) => minimapNodeTypes.has(String(node.type)))
    .map((node) => {
      const bounds = boundsById.get(node.id);
      return bounds
        ? {
            id: node.id,
            type: String(node.type ?? ''),
            ...bounds,
          }
        : null;
    })
    .filter((bounds): bounds is ProjectGraphStaticMiniMapRect => !!bounds);

  if (frameBounds.length === 0) {
    return { width: STATIC_MINIMAP_WIDTH, height: STATIC_MINIMAP_HEIGHT, frames: [], transform: null };
  }

  const minX = Math.min(...frameBounds.map((bounds) => bounds.x));
  const minY = Math.min(...frameBounds.map((bounds) => bounds.y));
  const maxX = Math.max(...frameBounds.map((bounds) => bounds.x + bounds.width));
  const maxY = Math.max(...frameBounds.map((bounds) => bounds.y + bounds.height));
  const flowWidth = Math.max(1, maxX - minX);
  const flowHeight = Math.max(1, maxY - minY);
  const scale = Math.min(
    (STATIC_MINIMAP_WIDTH - STATIC_MINIMAP_PADDING * 2) / flowWidth,
    (STATIC_MINIMAP_HEIGHT - STATIC_MINIMAP_PADDING * 2) / flowHeight,
  );
  const offsetX = STATIC_MINIMAP_PADDING + (STATIC_MINIMAP_WIDTH - STATIC_MINIMAP_PADDING * 2 - flowWidth * scale) / 2;
  const offsetY = STATIC_MINIMAP_PADDING + (STATIC_MINIMAP_HEIGHT - STATIC_MINIMAP_PADDING * 2 - flowHeight * scale) / 2;
  const transform = { minX, minY, offsetX, offsetY, scale };
  const toMiniRect = (rect: ProjectGraphStaticMiniMapRect): ProjectGraphStaticMiniMapRect => ({
    id: rect.id,
    type: rect.type,
    x: transform.offsetX + (rect.x - transform.minX) * transform.scale,
    y: transform.offsetY + (rect.y - transform.minY) * transform.scale,
    width: Math.max(rect.type === 'projectFrame' ? 2 : 1, rect.width * transform.scale),
    height: Math.max(rect.type === 'projectFrame' ? 2 : 1, rect.height * transform.scale),
  });

  return {
    width: STATIC_MINIMAP_WIDTH,
    height: STATIC_MINIMAP_HEIGHT,
    frames: frameBounds.map(toMiniRect),
    transform,
  };
};

export const buildProjectGraphStaticMiniMapViewportRect = (
  geometry: ProjectGraphStaticMiniMapGeometry,
  viewport: Viewport,
  canvasSize: { width: number; height: number },
): ProjectGraphStaticMiniMapRect | null => {
  if (!geometry.transform || canvasSize.width <= 0 || canvasSize.height <= 0) {
    return null;
  }

  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const { minX, minY, offsetX, offsetY, scale } = geometry.transform;
  return {
    id: 'viewport',
    type: 'viewport',
    x: offsetX + (-viewport.x / zoom - minX) * scale,
    y: offsetY + (-viewport.y / zoom - minY) * scale,
    width: Math.max(1, (canvasSize.width / zoom) * scale),
    height: Math.max(1, (canvasSize.height / zoom) * scale),
  };
};

export const buildProjectGraphStaticMiniMapModel = (
  nodes: Node[],
  viewport: Viewport,
  canvasSize: { width: number; height: number },
): ProjectGraphStaticMiniMapModel => {
  const geometry = buildProjectGraphStaticMiniMapGeometry(nodes);

  return {
    width: geometry.width,
    height: geometry.height,
    frames: geometry.frames,
    viewportRect: buildProjectGraphStaticMiniMapViewportRect(geometry, viewport, canvasSize),
  };
};

const SimpleNodeMockContent = ({ data }: { data: NodeProps['data'] }) => (
  <div className="pg-node__mock-hit pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
    <span className="pg-node__mock-line pg-node__mock-line--title" />
    <span className="pg-node__mock-line pg-node__mock-line--long" />
    <span className="pg-node__mock-line pg-node__mock-line--short" />
  </div>
);

const SimpleNodeMock = ({ className, data }: { className: string; data: NodeProps['data'] }) => (
  <div className={`pg-node ${className} pg-node--mock`}>
    <SimpleNodeMockContent data={data} />
  </div>
);

const FrameNodeHeader = ({ data, kind }: { data: NodeProps['data']; kind: string }) => (
  <div
    className="pg-node__drag-handle"
    onPointerDown={getHeaderPointerDownHandler(data)}
  >
    <div className="pg-node__eyebrow">{kind}</div>
    <div className="pg-node__title">{String(data.title ?? '')}</div>
    <div className="pg-node__frame-mock" aria-hidden="true">
      <span className="pg-node__mock-line pg-node__mock-line--title" />
      <span className="pg-node__mock-line pg-node__mock-line--short" />
    </div>
  </div>
);

const CODE_ONLY_SOURCE_PREVIEW_MAX_LINES = 12;
const CODE_ONLY_SOURCE_PREVIEW_MAX_CHARS = 1200;

export const getCodeOnlySourcePreview = (data: NodeProps['data']): string => {
  const content = typeof data.sourceContent === 'string' ? data.sourceContent.trimEnd() : '';
  if (content.trim()) {
    const lines = content.split('\n');
    let preview = lines.slice(0, CODE_ONLY_SOURCE_PREVIEW_MAX_LINES).join('\n');
    let truncated = lines.length > CODE_ONLY_SOURCE_PREVIEW_MAX_LINES;
    if (preview.length > CODE_ONLY_SOURCE_PREVIEW_MAX_CHARS) {
      preview = preview.slice(0, CODE_ONLY_SOURCE_PREVIEW_MAX_CHARS).trimEnd();
      truncated = true;
    }
    return truncated ? `${preview}\n…` : preview;
  }
  return `# ${String(data.path ?? data.title ?? 'code-only file')}`;
};

const getCodeOnlyFileOpenHandler = (data: NodeProps['data']): (() => void) | undefined =>
  typeof data.onCodeOnlyFileOpen === 'function' ? (data.onCodeOnlyFileOpen as () => void) : undefined;

const ProjectFrameNode = memo(function ProjectFrameNode({ data }: NodeProps) {
  const { t } = useTranslation();
  return (
  <div
    className={`pg-node pg-node--file${data.codeOnlyFile === true ? ' pg-node--file-code-only' : ''}`}
    data-code-only-file={data.codeOnlyFile === true ? 'true' : undefined}
  >
    <FrameNodeHeader data={data} kind={t('canvas.node.file')} />
    {data.codeOnlyFile === true ? (
      <button
        aria-label={t('canvas.node.openCode', { file: String(data.path ?? data.title ?? t('canvas.node.file')) })}
        className="pg-node__code-only-content nodrag"
        onClick={getCodeOnlyFileOpenHandler(data)}
        type="button"
      >
        <pre>{getCodeOnlySourcePreview(data)}</pre>
      </button>
    ) : null}
  </div>
  );
});

const LabelFrameNode = memo(function LabelFrameNode({ data }: NodeProps) {
  const { t } = useTranslation();
  return <div className="pg-node pg-node--label-frame"><FrameNodeHeader data={data} kind={t('canvas.node.label')} /></div>;
});

const LabelStartNode = memo(function LabelStartNode({ data }: NodeProps) {
  const { t } = useTranslation();
  return (
  <div className={`pg-node pg-node--label-start${data.renderMode === 'simple' ? ' pg-node--mock' : ''}`}>
    <Handle className="pg-node__handle pg-node__handle--relation" id="relation-in" type="target" position={Position.Left} />
    <Handle className="pg-node__handle pg-node__handle--flow" id="flow-in" type="target" position={Position.Top} />
    {data.renderMode === 'simple' ? (
      <SimpleNodeMockContent data={data} />
    ) : (
      <>
        <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
          <div className="pg-node__eyebrow">{t('canvas.node.start')}</div>
        </div>
        <div className="pg-node__body nodrag">
          <div className="pg-node__title">{String(data.qualifiedName ?? '')}</div>
          <div className="pg-node__content">{String(data.content ?? '')}</div>
        </div>
      </>
    )}
    <Handle className="pg-node__handle pg-node__handle--flow" id="flow-out" type="source" position={Position.Bottom} />
  </div>
  );
});

const ScenarioNode = memo(({ data }: NodeProps) => {
  const scenarioType = String(data.scenarioType ?? 'node');
  const visualRole = String(data.visualRole ?? '');
  const title = String(data.title ?? scenarioType);
  const showTitle = title.trim() && title !== scenarioType;
  const menuPrompt = String(data.menuPrompt ?? '');
  const content = scenarioType === 'menu' && menuPrompt.trim() ? menuPrompt : String(data.content ?? '');
  const isFlowControl = visualRole === 'flowControl';
  const shouldRenderSimple = data.renderMode === 'simple' && !isFlowControl;
  const flowControlDetail = content.replace(new RegExp(`^${scenarioType}\\b\\s*`, 'i'), '').trim();

  return (
    <div
      className={`pg-node pg-node--scenario${shouldRenderSimple ? ' pg-node--mock' : ''}`}
      data-scenario-type={scenarioType}
      data-visual-role={visualRole}
    >
      <Handle className="pg-node__handle pg-node__handle--relation" id="relation-in" type="target" position={Position.Left} />
      <Handle className="pg-node__handle pg-node__handle--flow" id="flow-in" type="target" position={Position.Top} />
      {shouldRenderSimple ? (
        <SimpleNodeMockContent data={data} />
      ) : isFlowControl ? (
        <div className="pg-node__drag-handle pg-node__drag-handle--flow-control" onPointerDown={getHeaderPointerDownHandler(data)}>
          <div className="pg-node__eyebrow">{scenarioType}</div>
          {flowControlDetail ? <div className="pg-node__flow-control-detail">{flowControlDetail}</div> : null}
        </div>
      ) : (
        <>
          <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
            <div className="pg-node__eyebrow">{scenarioType}</div>
          </div>
          <div className="pg-node__body nodrag">
            {showTitle ? <div className="pg-node__title pg-node__title--scenario">{title}</div> : null}
            <div className="pg-node__content">{content}</div>
          </div>
        </>
      )}
      <Handle className="pg-node__handle pg-node__handle--flow" id="flow-out" type="source" position={Position.Bottom} />
      <Handle className="pg-node__handle pg-node__handle--relation" id="relation-out" type="source" position={Position.Right} />
    </div>
  );
});

export const projectGraphNodeTypes: NodeTypes = {
  projectFrame: ProjectFrameNode,
  labelFrame: LabelFrameNode,
  labelStart: LabelStartNode,
  scenarioNode: ScenarioNode,
};

const ProjectGraphStaticMiniMap = memo(
  ({
    canvasSize,
    nodes,
    viewport,
  }: {
    canvasSize: { width: number; height: number };
    nodes: Node[];
    viewport: Viewport;
  }) => {
    const { t } = useTranslation();
    const geometry = useMemo(
      () => buildProjectGraphStaticMiniMapGeometry(nodes),
      [nodes],
    );
    const viewportRect = useMemo(
      () => buildProjectGraphStaticMiniMapViewportRect(geometry, viewport, canvasSize),
      [canvasSize, geometry, viewport],
    );

    return (
      <div className="project-graph-canvas__minimap" aria-label={t('canvas.minimap')}>
        <svg
          className="project-graph-canvas__minimap-svg"
          role="presentation"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        >
          {geometry.frames.map((frame) => (
            <rect
              className={`project-graph-canvas__minimap-frame project-graph-canvas__minimap-frame--${frame.type}`}
              height={frame.height}
              key={frame.id}
              rx={frame.type === 'projectFrame' ? 2 : 1}
              width={frame.width}
              x={frame.x}
              y={frame.y}
            />
          ))}
          {viewportRect ? (
            <rect
              className="project-graph-canvas__minimap-viewport"
              height={viewportRect.height}
              width={viewportRect.width}
              x={viewportRect.x}
              y={viewportRect.y}
            />
          ) : null}
        </svg>
      </div>
    );
  },
);

export const NEAR_TARGET_TURN_OFFSET = 24;
export const RELATION_CURVE_MIN_TENSION = 96;

export interface NearTargetStepPathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  targetOffset?: number;
  sourceOffset?: number;
  direction?: 'horizontal' | 'vertical' | 'source-vertical';
}

const formatPathNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export const buildNearTargetStepPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetOffset = NEAR_TARGET_TURN_OFFSET,
  sourceOffset = targetOffset,
  direction = 'horizontal',
}: NearTargetStepPathParams): string => {
  if (direction === 'source-vertical') {
    const verticalDirection = targetY >= sourceY ? 1 : -1;
    const requestedTurnY = targetY - verticalDirection * targetOffset;
    const minimumSourceClearance = 24;
    const turnY =
      verticalDirection > 0
        ? Math.max(sourceY + Math.max(minimumSourceClearance, sourceOffset), requestedTurnY)
        : Math.min(sourceY - Math.max(minimumSourceClearance, sourceOffset), requestedTurnY);

    return [
      'M',
      formatPathNumber(sourceX),
      formatPathNumber(sourceY),
      'L',
      formatPathNumber(sourceX),
      formatPathNumber(turnY),
      'L',
      formatPathNumber(targetX),
      formatPathNumber(turnY),
      'L',
      formatPathNumber(targetX),
      formatPathNumber(targetY),
    ].join(' ');
  }

  if (direction === 'vertical') {
    const verticalDirection = targetY >= sourceY ? 1 : -1;
    const requestedTurnY = targetY - verticalDirection * targetOffset;
    const minimumSourceClearance = 24;
    const turnY =
      verticalDirection > 0
        ? Math.max(sourceY + minimumSourceClearance, requestedTurnY)
        : Math.min(sourceY - minimumSourceClearance, requestedTurnY);

    return [
      'M',
      formatPathNumber(sourceX),
      formatPathNumber(sourceY),
      'L',
      formatPathNumber(sourceX),
      formatPathNumber(turnY),
      'L',
      formatPathNumber(targetX),
      formatPathNumber(turnY),
      'L',
      formatPathNumber(targetX),
      formatPathNumber(targetY),
    ].join(' ');
  }

  const horizontalDirection = targetX >= sourceX ? 1 : -1;
  const requestedTurnX = targetX - horizontalDirection * targetOffset;
  const minimumSourceClearance = 24;
  const turnX =
    horizontalDirection > 0
      ? Math.max(sourceX + minimumSourceClearance, requestedTurnX)
      : Math.min(sourceX - minimumSourceClearance, requestedTurnX);

  return [
    'M',
    formatPathNumber(sourceX),
    formatPathNumber(sourceY),
    'L',
    formatPathNumber(turnX),
    formatPathNumber(sourceY),
    'L',
    formatPathNumber(turnX),
    formatPathNumber(targetY),
    'L',
    formatPathNumber(targetX),
    formatPathNumber(targetY),
  ].join(' ');
};

export interface SoftRelationPathParams {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export const buildSoftRelationPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: SoftRelationPathParams): string => {
  const horizontalDistance = Math.abs(targetX - sourceX);
  const verticalDistance = Math.abs(targetY - sourceY);
  const sourceTension = Math.max(RELATION_CURVE_MIN_TENSION, horizontalDistance * 0.32);
  const targetTension = Math.max(RELATION_CURVE_MIN_TENSION, verticalDistance * 0.28);

  return [
    'M',
    formatPathNumber(sourceX),
    formatPathNumber(sourceY),
    'C',
    formatPathNumber(sourceX + sourceTension),
    formatPathNumber(sourceY),
    formatPathNumber(targetX),
    formatPathNumber(targetY - targetTension),
    formatPathNumber(targetX),
    formatPathNumber(targetY),
  ].join(' ');
};

const NearTargetStepEdge = memo(({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) => {
  const targetOffset =
    typeof data?.targetTurnOffset === 'number' ? data.targetTurnOffset : NEAR_TARGET_TURN_OFFSET;
  const sourceOffset = typeof data?.sourceTurnOffset === 'number' ? data.sourceTurnOffset : targetOffset;
  const direction =
    data?.direction === 'vertical' || data?.direction === 'source-vertical' ? data.direction : 'horizontal';
  const path = buildNearTargetStepPath({ sourceX, sourceY, targetX, targetY, targetOffset, sourceOffset, direction });

  return <BaseEdge markerEnd={markerEnd} path={path} style={style} />;
});

const RelationCurveEdge = memo(({ sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) => {
  const path = buildSoftRelationPath({ sourceX, sourceY, targetX, targetY });

  return <BaseEdge markerEnd={markerEnd} path={path} style={style} />;
});

export const projectGraphEdgeTypes: EdgeTypes = {
  nearTargetStep: NearTargetStepEdge,
  relationCurve: RelationCurveEdge,
};

export interface ProjectGraphCanvasProps {
  allowLandingInspector?: boolean;
  allowLandingActionEditor?: boolean;
  assetCatalog?: ProjectAssetCatalogPayload | null;
  graph: ProjectGraphSnapshot;
  className?: string;
  initialFocusNodeId?: string | null;
  presentationMode?: 'default' | 'landing';
  projectName?: string | null;
  participants?: ProjectGraphPresenceUser[];
  remoteCursors?: ProjectGraphRemoteCursor[];
  readModelUpdate?: ProjectGraphReadModelUpdate | null;
  readModelStats?: ProjectGraphReadModelStats | null;
  showDevPerformancePanel?: boolean;
  onlyRenderVisibleElements?: boolean;
  exportStatus?: string | null;
  exportedFiles?: Record<string, string> | null;
  localAssetUrls?: Record<string, string>;
  saveStatus?: string | null;
  onExportProjectGraph?: () => void;
  onEntityPositionChange?: (entityId: string, position: GraphPoint) => void;
  onEntityPositionsChange?: (changes: ProjectGraphEntityPositionChange[]) => void;
  onCanvasPointerActivity?: (position: GraphPoint) => void;
  onPresenceActivity?: (update: ProjectGraphPresenceActivityUpdate) => void;
  onInviteUser?: (targetUser: string) => void;
  onScenarioContentChange?: (nodeId: string, content: string) => void;
  onScenarioContentSplice?: (nodeId: string, splice: ActionEditorTextSplice) => void;
  onScenarioMetadataChange?: (nodeId: string, metadataPatch: Record<string, unknown>) => void;
  onActionEditorNextAction?: (sourceNodeId: string, request: ActionEditorNextActionRequest) => string | null | void | Promise<string | null | void>;
  onCreateStructure?: (command: ProjectGraphStructureCommand) => string | null | void | Promise<string | null | void>;
  onSourceFileContentChange?: (fileId: string, content: string) => void;
}

const deletionImpactFromCommandError = (reason: unknown): ProjectGraphDeletionImpact | null => {
  const impact = (reason as { response?: { data?: { detail?: { impact?: unknown } } } })?.response?.data?.detail?.impact;
  return impact && typeof impact === 'object' ? impact as ProjectGraphDeletionImpact : null;
};

export interface ProjectGraphPresenceActivityUpdate {
  activity: ProjectGraphPresenceActivity;
  position: GraphPoint;
  targetNodeId?: string;
}

const contentEditorLabelByType = new Map<string, string>([
  ['dialogue', 'canvas.inspector.content.dialogue'],
  ['comment', 'canvas.inspector.content.comment'],
  ['jump', 'canvas.inspector.content.jump'],
  ['call', 'canvas.inspector.content.call'],
  ['return', 'canvas.inspector.content.return'],
  ['raw_action', 'canvas.inspector.content.action'],
  ['raw_block', 'canvas.inspector.content.rawBlock'],
  ['menu_prompt', 'canvas.inspector.content.menuPrompt'],
  ['menu_choice', 'canvas.inspector.content.menuChoice'],
]);

const menuChoiceLineWithCondition = (content: string, condition: string): string => {
  const trimmedContent = content.trimEnd();
  const withoutExistingCondition = trimmedContent.replace(/\s+if\s+[^:]+:$/, ':');
  const base = withoutExistingCondition.endsWith(':') ? withoutExistingCondition.slice(0, -1) : withoutExistingCondition;
  const trimmedCondition = condition.trim();
  return trimmedCondition ? `${base} if ${trimmedCondition}:` : `${base}:`;
};

export interface ProjectGraphScenarioContentDraft {
  nodeId: string;
  content: string;
}

export interface ProjectGraphPendingScenarioContentCommit {
  nodeId: string;
  content: string;
}

export const SCENARIO_CONTENT_COMMIT_DEBOUNCE_MS = 120;

export const getProjectGraphScenarioContentEditorValue = (
  nodeId: string,
  authoritativeContent: string,
  draft: ProjectGraphScenarioContentDraft | null,
): string => (draft?.nodeId === nodeId ? draft.content : authoritativeContent);

export const reconcileProjectGraphScenarioContentDraft = (
  nodeId: string,
  authoritativeContent: string,
  draft: ProjectGraphScenarioContentDraft | null,
): ProjectGraphScenarioContentDraft | null => {
  if (!draft || draft.nodeId !== nodeId || draft.content === authoritativeContent) {
    return null;
  }
  return draft;
};

export const shouldFlushProjectGraphScenarioContentCommitForSelection = (
  pendingCommit: ProjectGraphPendingScenarioContentCommit | null,
  nextSelectedNodeId: string | null,
): boolean => pendingCommit !== null && pendingCommit.nodeId !== nextSelectedNodeId;

interface ProjectGraphScenarioContentEditorProps {
  content: string;
  nodeId: string;
  onBlur: () => void;
  onContentChange: (nodeId: string, content: string) => void;
}

const ProjectGraphScenarioContentEditor = memo(function ProjectGraphScenarioContentEditor({
  content,
  nodeId,
  onBlur,
  onContentChange,
}: ProjectGraphScenarioContentEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProjectGraphScenarioContentDraft>({ nodeId, content });
  const value = draft.nodeId === nodeId ? draft.content : content;

  useEffect(() => {
    setDraft((currentDraft) => {
      if (currentDraft.nodeId === nodeId && currentDraft.content === content) {
        return currentDraft;
      }
      return { nodeId, content };
    });
  }, [content, nodeId]);

  return (
    <textarea
      aria-label={t('canvas.inspector.editContent')}
      className="project-graph-canvas__node-editor-input"
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      onChange={(event) => {
        const nextContent = event.target.value;
        setDraft({ nodeId, content: nextContent });
        onContentChange(nodeId, nextContent);
      }}
      onBlur={onBlur}
      spellCheck={false}
      value={value}
    />
  );
});

const participantAccentColors = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#332288',
  '#882255',
  '#117733',
  '#44AA99',
  '#AA4499',
  '#661100',
  '#1F77B4',
  '#B05A00',
  '#2CA02C',
  '#6A3D9A',
  '#B2182B',
  '#2166AC',
  '#7B3294',
  '#008B8B',
  '#8C510A',
  '#4D9221',
  '#C51B7D',
  '#01665E',
  '#5E3C99',
  '#A50F15',
];

const getParticipantAccentColor = (participant: Pick<ProjectGraphPresenceUser, 'id' | 'username'>): string => {
  const seed = participant.id.trim() || participant.username.trim() || 'participant';
  const hash = [...seed].reduce((value, character) => {
    const mixed = value ^ character.charCodeAt(0);
    return Math.imul(mixed, 16777619) >>> 0;
  }, 2166136261);
  return participantAccentColors[Math.abs(hash) % participantAccentColors.length];
};

const getParticipantInitials = (participant: Pick<ProjectGraphPresenceUser, 'id' | 'username'>): string => {
  if (participant.id === 'local') {
    return 'ME';
  }

  const parts = participant.username
    .split(/[\s._@-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || '?';
};

const ProjectGraphCanvasInner = ({
  allowLandingInspector = false,
  allowLandingActionEditor = false,
  assetCatalog,
  graph,
  className,
  initialFocusNodeId = null,
  presentationMode = 'default',
  projectName,
  participants = [],
  remoteCursors = [],
  readModelUpdate = null,
  readModelStats = null,
  showDevPerformancePanel = false,
  onlyRenderVisibleElements = false,
  exportStatus,
  exportedFiles,
  localAssetUrls,
  saveStatus,
  onExportProjectGraph,
  onEntityPositionChange,
  onEntityPositionsChange,
  onCanvasPointerActivity,
  onPresenceActivity,
  onInviteUser,
  onScenarioContentChange,
  onScenarioContentSplice,
  onScenarioMetadataChange,
  onActionEditorNextAction,
  onCreateStructure,
  onSourceFileContentChange,
}: ProjectGraphCanvasProps) => {
  const { t } = useTranslation();
  const isLandingPresentation = presentationMode === 'landing';
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState('');
  const [isProblemsOpen, setIsProblemsOpen] = useState(false);
  const [isFramesOpen, setIsFramesOpen] = useState(false);
  const [isMinimapVisible, setIsMinimapVisible] = useState(true);
  const [isActionEditorOpen, setIsActionEditorOpen] = useState(false);
  const [isSourceFileEditorOpen, setIsSourceFileEditorOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [createMenu, setCreateMenu] = useState<ProjectGraphCreateMenuState | null>(null);
  const [deleteEntityId, setDeleteEntityId] = useState<string | null>(null);
  const [serverDeletionImpact, setServerDeletionImpact] = useState<ProjectGraphDeletionImpact | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [scenarioContentDraft, setScenarioContentDraft] = useState<ProjectGraphScenarioContentDraft | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [spatialRenderRect, setSpatialRenderRect] = useState<ProjectGraphSpatialRect | null>(null);
  const [frameMetrics, setFrameMetrics] = useState<ProjectGraphFrameMetricsSnapshot | null>(null);
  const [devRenderToggles, setDevRenderToggles] = useState<ProjectGraphDevRenderToggles>(() =>
    getDefaultProjectGraphDevRenderToggles(),
  );
  const [devOnlyRenderVisibleElements, setDevOnlyRenderVisibleElements] = useState(onlyRenderVisibleElements);
  const [devAutoLighten, setDevAutoLighten] = useState(true);
  const [devAdaptiveLightLevel, setDevAdaptiveLightLevel] = useState<ProjectGraphAdaptiveLightLevel>(0);
  const deletionImpact = useMemo(() => {
    if (!deleteEntityId) return null;
    if (serverDeletionImpact?.entity.id === deleteEntityId) return serverDeletionImpact;
    try {
      return analyzeProjectGraphDeletion(graph, deleteEntityId);
    } catch {
      return null;
    }
  }, [deleteEntityId, graph, serverDeletionImpact]);
  const initialViewportKeyRef = useRef<string | null>(null);
  const initialLandingFocusDoneRef = useRef<string | null>(null);
  const interactiveNodesRef = useRef<Node[]>([]);
  const renderedNodeCacheRef = useRef(createProjectGraphRenderedNodeCache());
  const projectionCacheRef = useRef<{
    graph: ProjectGraphSnapshot;
    projection: ProjectGraphProjection;
  } | null>(null);
  const spatialNodeIndexCacheRef = useRef<{
    edges: Edge[];
    index: ProjectGraphSpatialNodeIndex;
    nodes: Node[];
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const topActionsRef = useRef<HTMLDivElement | null>(null);
  const searchPopoverRef = useRef<HTMLDivElement | null>(null);
  const controlClusterRef = useRef<HTMLDivElement | null>(null);
  const interactionPhaseRef = useRef<ProjectGraphFramePhase>('idle');
  const moveViewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const spatialRenderRectRef = useRef<ProjectGraphSpatialRect | null>(null);
  const devSpatialWindowRebuildCountRef = useRef(0);
  const presentationZoomRef = useRef<number | null>(null);
  const devAdaptiveLightLevelRef = useRef<ProjectGraphAdaptiveLightLevel>(0);
  const devVisibleNodeCountRef = useRef(0);
  const scenarioContentCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScenarioContentCommitRef = useRef<ProjectGraphPendingScenarioContentCommit | null>(null);
  const relationNavigationAnimationRef = useRef<number | null>(null);
  const lastCanvasPointerPositionRef = useRef<GraphPoint | null>(null);
  const activePresenceActivityRef = useRef<ProjectGraphPresenceActivity>('viewing_canvas');
  const lastEditingPresenceKeyRef = useRef<string | null>(null);
  const applyViewportPresentation = useCallback((zoom: number) => {
    if (presentationZoomRef.current !== null && Math.abs(presentationZoomRef.current - zoom) < 0.0005) {
      return;
    }
    presentationZoomRef.current = zoom;
    applyProjectGraphViewportStyleVariables(canvasRef.current, zoom);
  }, []);
  useEffect(() => {
    applyViewportPresentation(moveViewportRef.current.zoom);
  }, [applyViewportPresentation]);
  const projectionSample = useMemo(() => {
    const start = showDevPerformancePanel ? performance.now() : 0;
    const previous = !showDevPerformancePanel || devRenderToggles.projectionCache
      ? projectionCacheRef.current
      : null;
    const reconciled = reconcileProjectGraphProjection(
      previous?.graph ?? null,
      previous?.projection ?? null,
      graph,
      previous ? readModelUpdate : null,
    );
    return {
      projection: reconciled.projection,
      projectionMode: reconciled.mode,
      projectionStats: reconciled.stats,
      projectionMs: showDevPerformancePanel ? performance.now() - start : null,
    };
  }, [devRenderToggles.projectionCache, graph, readModelUpdate, showDevPerformancePanel]);
  const projection = projectionSample.projection;
  useEffect(() => {
    projectionCacheRef.current = { graph, projection };
  }, [graph, projection]);
  const effectiveOnlyRenderVisibleElements = showDevPerformancePanel
    ? devOnlyRenderVisibleElements
    : onlyRenderVisibleElements;
  const lodLevel = showDevPerformancePanel && !devRenderToggles.lod ? 'full' : getProjectGraphLodLevel(viewport.zoom);
  const effectiveAdaptiveLightLevel: ProjectGraphAdaptiveLightLevel =
    showDevPerformancePanel && devAutoLighten ? devAdaptiveLightLevel : 0;
  const renderEdges = useMemo(
    () => {
      const edges = getProjectGraphRenderEdges(projection.edges, devRenderToggles, showDevPerformancePanel);
      return showDevPerformancePanel && devAutoLighten && devAdaptiveLightLevel >= 3
        ? edges.filter((edge) => edge.data?.derived !== true)
        : edges;
    },
    [devAdaptiveLightLevel, devAutoLighten, devRenderToggles, projection.edges, showDevPerformancePanel],
  );
  const visibleRelationEdges = useMemo(
    () => getProjectGraphRelationEdgeVisibility(renderEdges, selectedNodeId),
    [renderEdges, selectedNodeId],
  );
  const selectedAnimatedEdges = useMemo(
    () => applySelectedDashedEdgeAnimation(visibleRelationEdges, selectedNodeId),
    [visibleRelationEdges, selectedNodeId],
  );
  const displayedEdges = useMemo(
    () => applyProjectGraphEdgeLod(selectedAnimatedEdges, effectiveAdaptiveLightLevel >= 2 ? 'bars' : lodLevel),
    [effectiveAdaptiveLightLevel, selectedAnimatedEdges, lodLevel],
  );
  const spatialWindowEnabled = !isLandingPresentation && (!showDevPerformancePanel || devRenderToggles.spatialWindow);
  const spatialNodeIndex = useMemo(
    () => {
      const previous = spatialNodeIndexCacheRef.current;
      if (previous?.nodes === projection.nodes && previous.edges === projection.edges) {
        return previous.index;
      }
      if (previous && projectionSample.projectionMode === 'presentation') {
        return refreshProjectGraphSpatialNodeIndexNodes(previous.index, projection.nodes);
      }
      return buildProjectGraphSpatialNodeIndex(projection.nodes, projection.edges);
    },
    [projection.edges, projection.nodes, projectionSample.projectionMode],
  );
  useEffect(() => {
    spatialNodeIndexCacheRef.current = {
      edges: projection.edges,
      index: spatialNodeIndex,
      nodes: projection.nodes,
    };
  }, [projection.edges, projection.nodes, spatialNodeIndex]);
  const spatialNodeQuery = useMemo(
    () =>
      spatialWindowEnabled
        ? queryProjectGraphSpatialNodes(spatialNodeIndex, spatialRenderRect, {
            pinnedNodeIds: [selectedNodeId, initialFocusNodeId],
            pinConnectionsOfNodeIds: [selectedNodeId],
          })
        : {
            nodeIds: new Set(projection.nodes.map((node) => node.id)),
            nodes: projection.nodes,
          },
    [initialFocusNodeId, projection.nodes, selectedNodeId, spatialNodeIndex, spatialRenderRect, spatialWindowEnabled],
  );
  useEffect(() => {
    pruneProjectGraphRenderedNodeCache(renderedNodeCacheRef.current, spatialNodeIndex.nodesById.keys());
  }, [spatialNodeIndex]);
  const displayedEdgeIndex = useMemo(() => buildProjectGraphSpatialEdgeIndex(displayedEdges), [displayedEdges]);
  const spatialDisplayedEdges = useMemo(
    () =>
      spatialWindowEnabled
        ? queryProjectGraphSpatialEdges(displayedEdgeIndex, spatialNodeQuery.nodeIds)
        : displayedEdges,
    [displayedEdgeIndex, displayedEdges, spatialNodeQuery.nodeIds, spatialWindowEnabled],
  );
  const searchResults = useMemo(() => searchProjectGraph(graph, searchQuery), [graph, searchQuery]);
  const problems = useMemo(() => projectGraphDiagnosticsToProblems(graph), [graph]);
  const selectedScenario = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const selectedScenarioFile = useMemo(
    () => (selectedScenario ? graph.files.find((file) => file.id === selectedScenario.file_id) : undefined),
    [graph.files, selectedScenario],
  );
  const selectedScenarioLabel = useMemo(
    () => (selectedScenario ? graph.labels.find((label) => label.id === selectedScenario.label_id) : undefined),
    [graph.labels, selectedScenario],
  );
  const selectedRelationTargetNode = useMemo(() => {
    if (!selectedScenario || (selectedScenario.type !== 'jump' && selectedScenario.type !== 'call')) {
      return null;
    }

    const relationEdge = graph.edges.find(
      (edge) => edge.source_node_id === selectedScenario.id && edge.target_node_id && edge.kind === selectedScenario.type,
    );
    return relationEdge?.target_node_id
      ? projection.nodes.find((node) => node.id === relationEdge.target_node_id) ?? null
      : null;
  }, [graph.edges, projection.nodes, selectedScenario]);
  const selectedCodeOnlyFileNode = useMemo(
    () =>
      selectedNodeId
        ? projection.nodes.find((node) => node.id === selectedNodeId && node.type === 'projectFrame' && node.data?.codeOnlyFile === true) ?? null
        : null,
    [projection.nodes, selectedNodeId],
  );
  const selectedCodeOnlyFile = useMemo(
    () => (selectedCodeOnlyFileNode ? graph.files.find((file) => file.id === selectedCodeOnlyFileNode.id) ?? null : null),
    [graph.files, selectedCodeOnlyFileNode],
  );
  const refreshSpatialRenderRect = useCallback(
    (nextViewport: Viewport, force = false) => {
      if (!spatialWindowEnabled) {
        spatialRenderRectRef.current = null;
        setSpatialRenderRect(null);
        return;
      }

      const visibleRect = getProjectGraphViewportFlowRect(nextViewport, canvasSize);
      if (
        !force &&
        !shouldRefreshProjectGraphSpatialRenderRect(spatialRenderRectRef.current, visibleRect)
      ) {
        return;
      }
      const nextRenderRect = buildProjectGraphSpatialRenderRect(nextViewport, canvasSize);
      if (!nextRenderRect) {
        return;
      }

      const currentRenderRect = spatialRenderRectRef.current;
      const renderRectChanged =
        !currentRenderRect ||
        currentRenderRect.x !== nextRenderRect.x ||
        currentRenderRect.y !== nextRenderRect.y ||
        currentRenderRect.width !== nextRenderRect.width ||
        currentRenderRect.height !== nextRenderRect.height;
      if (!renderRectChanged) {
        return;
      }

      spatialRenderRectRef.current = nextRenderRect;
      if (showDevPerformancePanel) {
        devSpatialWindowRebuildCountRef.current += 1;
      }
      setSpatialRenderRect(nextRenderRect);
    },
    [canvasSize, showDevPerformancePanel, spatialWindowEnabled],
  );
  const handleNodeHeaderPointerDown = useCallback(
    (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const initialNode = interactiveNodesRef.current.find((node) => node.id === nodeId);
      if (!initialNode) {
        return;
      }
      const dragGroupIds = new Set(getProjectGraphHeaderDragGroupIds(initialNode, interactiveNodesRef.current));
      const initialPositionsById = new Map(
        interactiveNodesRef.current
          .filter((node) => dragGroupIds.has(node.id))
          .map((node) => [node.id, node.position]),
      );
      const initialAllPositionsById = new Map(
        interactiveNodesRef.current.map((node) => [node.id, { ...node.position }]),
      );
      const baselineNodes = interactiveNodesRef.current.map(cloneNodeForDrag);

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startPosition = initialNode.position;
      const zoom = reactFlowInstance?.getZoom() ?? 1;
      let latestPosition = startPosition;
      let latestChangedPositions: ProjectGraphEntityPositionChange[] = [];

      interactionPhaseRef.current = 'nodeDrag';
      setSelectedNodeId(nodeId);

      const moveNode = (clientX: number, clientY: number) => {
        const delta = {
          x: (clientX - startClientX) / zoom,
          y: (clientY - startClientY) / zoom,
        };
        latestPosition = {
          x: startPosition.x + delta.x,
          y: startPosition.y + delta.y,
        };
        setInteractiveNodes(() => {
          const expandedNodes = buildNestedDragPreviewNodes(baselineNodes, dragGroupIds, initialPositionsById, delta);
          const expandedDraggedNode = expandedNodes.find((node) => node.id === nodeId);
          latestPosition = expandedDraggedNode?.position ?? latestPosition;
          latestChangedPositions = expandedNodes
            .filter((node) => {
              const initialPosition = initialAllPositionsById.get(node.id);
              return (
                initialPosition &&
                (initialPosition.x !== node.position.x || initialPosition.y !== node.position.y)
              );
            })
            .map((node) => ({
              entityId: node.id,
              position: { ...node.position },
              manual: dragGroupIds.has(node.id),
            }));
          return expandedNodes;
        });
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        pointerEvent.preventDefault();
        moveNode(pointerEvent.clientX, pointerEvent.clientY);
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        pointerEvent.preventDefault();
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        interactionPhaseRef.current = 'idle';
        if (latestChangedPositions.length > 0) {
          if (onEntityPositionsChange) {
            onEntityPositionsChange(latestChangedPositions);
          } else {
            for (const change of latestChangedPositions) {
              onEntityPositionChange?.(change.entityId, change.position);
            }
          }
          return;
        }
        onEntityPositionChange?.(nodeId, latestPosition);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [onEntityPositionChange, onEntityPositionsChange, reactFlowInstance],
  );
  const handleCodeOnlyFileOpen = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setIsSourceFileEditorOpen(true);
  }, []);
  const renderedNodeSample = useMemo(
    () =>
      reconcileProjectGraphRenderedNodes(renderedNodeCacheRef.current, spatialNodeQuery.nodes, {
        getRenderMode: (node) =>
          shouldRenderProjectGraphSimpleNodes(lodLevel, effectiveAdaptiveLightLevel, String(node.type ?? ''))
            ? 'simple'
            : 'normal',
        onCodeOnlyFileOpen: handleCodeOnlyFileOpen,
        onHeaderPointerDown: handleNodeHeaderPointerDown,
        reuseEnabled: !showDevPerformancePanel || devRenderToggles.nodeIdentityCache,
        selectedNodeId,
      }),
    [
      devRenderToggles.nodeIdentityCache,
      effectiveAdaptiveLightLevel,
      handleCodeOnlyFileOpen,
      handleNodeHeaderPointerDown,
      lodLevel,
      selectedNodeId,
      showDevPerformancePanel,
      spatialNodeQuery.nodes,
    ],
  );
  const projectedNodes = renderedNodeSample.nodes;
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>(projectedNodes);
  useEffect(() => {
    setInteractiveNodes(projectedNodes);
  }, [projectedNodes]);
  useEffect(() => {
    interactiveNodesRef.current = interactiveNodes;
  }, [interactiveNodes]);
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setInteractiveNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);
  const flushScenarioContentCommit = useCallback(() => {
    const pendingCommit = pendingScenarioContentCommitRef.current;
    if (!pendingCommit) {
      return;
    }

    pendingScenarioContentCommitRef.current = null;
    if (scenarioContentCommitTimerRef.current) {
      clearTimeout(scenarioContentCommitTimerRef.current);
      scenarioContentCommitTimerRef.current = null;
    }
    setScenarioContentDraft({ nodeId: pendingCommit.nodeId, content: pendingCommit.content });
    onScenarioContentChange?.(pendingCommit.nodeId, pendingCommit.content);
  }, [onScenarioContentChange]);
  const scheduleScenarioContentCommit = useCallback(
    (nodeId: string, content: string) => {
      pendingScenarioContentCommitRef.current = { nodeId, content };
      if (scenarioContentCommitTimerRef.current) {
        clearTimeout(scenarioContentCommitTimerRef.current);
      }
      scenarioContentCommitTimerRef.current = setTimeout(() => {
        scenarioContentCommitTimerRef.current = null;
        flushScenarioContentCommit();
      }, SCENARIO_CONTENT_COMMIT_DEBOUNCE_MS);
    },
    [flushScenarioContentCommit],
  );
  const setScenarioContentDraftAndScheduleCommit = useCallback(
    (nodeId: string, content: string) => {
      setScenarioContentDraft({ nodeId, content });
      scheduleScenarioContentCommit(nodeId, content);
    },
    [scheduleScenarioContentCommit],
  );
  const handleExportProjectGraph = useCallback(() => {
    flushScenarioContentCommit();
    onExportProjectGraph?.();
  }, [flushScenarioContentCommit, onExportProjectGraph]);
  const handleNavigateToSelectedRelationTarget = useCallback(() => {
    if (!reactFlowInstance || !selectedRelationTargetNode) {
      return;
    }

    const targetPosition = getAbsoluteNodePosition(projection.nodes, selectedRelationTargetNode.id);
    if (!targetPosition) {
      return;
    }

    if (relationNavigationAnimationRef.current !== null) {
      cancelAnimationFrame(relationNavigationAnimationRef.current);
      relationNavigationAnimationRef.current = null;
    }

    const effectiveCanvasSize = {
      width: canvasSize.width || canvasRef.current?.clientWidth || window.innerWidth,
      height: canvasSize.height || canvasRef.current?.clientHeight || window.innerHeight,
    };
    const currentViewport = reactFlowInstance.getViewport();
    const keyframes = buildProjectGraphRelationNavigationKeyframes({
      canvasSize: effectiveCanvasSize,
      fromViewport: currentViewport,
      targetCenter: {
        x: targetPosition.x + Number(selectedRelationTargetNode.width ?? 0) / 2,
        y: targetPosition.y + Number(selectedRelationTargetNode.height ?? 0) / 2,
      },
      maxZoom: PROJECT_GRAPH_MAX_ZOOM,
      minZoom: PROJECT_GRAPH_MIN_ZOOM,
    });
    const startTime = performance.now();
    const interpolate = (from: Viewport, to: Viewport, progress: number): Viewport => ({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      zoom: from.zoom + (to.zoom - from.zoom) * progress,
    });
    const animate = (now: number) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / PROJECT_GRAPH_RELATION_NAVIGATION_MS);
      const segmentProgress = progress <= 0.5 ? progress / 0.5 : (progress - 0.5) / 0.5;
      const nextViewport =
        progress <= 0.5
          ? interpolate(keyframes[0], keyframes[1], segmentProgress)
          : interpolate(keyframes[1], keyframes[2], segmentProgress);

      reactFlowInstance.setViewport(nextViewport, { duration: 0 });
      setViewport(nextViewport);

      if (progress < 1) {
        relationNavigationAnimationRef.current = requestAnimationFrame(animate);
        return;
      }

      reactFlowInstance.setViewport(keyframes[2], { duration: 0 });
      setViewport(keyframes[2]);
      relationNavigationAnimationRef.current = null;
    };

    relationNavigationAnimationRef.current = requestAnimationFrame(animate);
  }, [canvasSize, projection.nodes, reactFlowInstance, selectedRelationTargetNode]);
  const selectedContentLabel = t(
    selectedScenario ? (contentEditorLabelByType.get(selectedScenario.type) ?? 'canvas.inspector.content.scenario') : 'canvas.inspector.content.scenario',
  );
  const selectedActionTitle = selectedScenario?.type === 'action'
    ? String(selectedScenario.metadata.title ?? selectedScenario.metadata.default_title ?? '')
    : '';
  const selectedChoiceCondition =
    selectedScenario?.type === 'menu_choice' ? String(selectedScenario.metadata.condition ?? '') : '';
  const displayedScenarioContent = selectedScenario
    ? getProjectGraphScenarioContentEditorValue(selectedScenario.id, selectedScenario.content, scenarioContentDraft)
    : '';
  const getLatestDisplayedScenarioContent = useCallback(() => {
    const pendingCommit = pendingScenarioContentCommitRef.current;
    return pendingCommit?.nodeId === selectedScenario?.id ? pendingCommit.content : displayedScenarioContent;
  }, [displayedScenarioContent, selectedScenario?.id]);
  const selectedActionEditorNode = useMemo(
    () =>
      selectedScenario?.type === 'action'
        ? {
            ...selectedScenario,
            content: onScenarioContentSplice ? selectedScenario.content : displayedScenarioContent,
          }
        : null,
    [displayedScenarioContent, onScenarioContentSplice, selectedScenario],
  );
  const selectedActionEditorNodeId = selectedActionEditorNode?.id ?? null;
  const selectedActionHasTail = useMemo(() => {
    if (!selectedActionEditorNode) {
      return false;
    }
    return graph.nodes.some(
      (candidate) =>
        candidate.label_id === selectedActionEditorNode.label_id &&
        candidate.parent_node_id === selectedActionEditorNode.parent_node_id &&
        candidate.order.localeCompare(selectedActionEditorNode.order) > 0,
    );
  }, [graph.nodes, selectedActionEditorNode]);
  const handleActionEditorContentChange = useCallback(
    (content: string) => {
      if (!selectedActionEditorNodeId) {
        return;
      }
      setScenarioContentDraftAndScheduleCommit(selectedActionEditorNodeId, content);
    },
    [selectedActionEditorNodeId, setScenarioContentDraftAndScheduleCommit],
  );
  const handleActionEditorContentSplice = useCallback(
    (splice: ActionEditorTextSplice) => {
      if (!selectedActionEditorNodeId) {
        return;
      }
      onScenarioContentSplice?.(selectedActionEditorNodeId, splice);
    },
    [onScenarioContentSplice, selectedActionEditorNodeId],
  );
  const handleActionEditorTitleChange = useCallback(
    (title: string) => {
      if (!selectedActionEditorNodeId) {
        return;
      }
      onScenarioMetadataChange?.(selectedActionEditorNodeId, {
        title: title.trim() ? title.trim() : null,
      });
    },
    [onScenarioMetadataChange, selectedActionEditorNodeId],
  );
  const actionEditorNextTargetLabels = useMemo<ActionEditorNextTargetLabel[]>(
    () =>
      graph.labels.map((label) => ({
        current: selectedScenarioLabel?.id === label.id,
        fileId: label.file_id,
        filePath: graph.files.find((file) => file.id === label.file_id)?.path,
        id: label.id,
        labelStartNodeId: label.label_start_node_id,
        qualifiedName: label.qualified_name,
        scope: label.scope,
      })),
    [graph.files, graph.labels, selectedScenarioLabel?.id],
  );
  const actionEditorNextTargetFiles = useMemo(
    () =>
      graph.files.map((file) => ({
        id: file.id,
        path: file.path,
        codeOnlyReason:
          file.metadata?.code_only_reason === 'renpy_template' || file.metadata?.code_only_reason === 'no_labels'
            ? file.metadata.code_only_reason
            : undefined,
      })),
    [graph.files],
  );
  const handleActionEditorNextAction = useCallback(
    async (request: ActionEditorNextActionRequest) => {
      if (!selectedActionEditorNodeId) {
        return;
      }
      flushScenarioContentCommit();
      const createdNodeId = await onActionEditorNextAction?.(selectedActionEditorNodeId, request) ?? null;
      if (createdNodeId) {
        setSelectedNodeId(createdNodeId);
        setIsActionEditorOpen(false);
      }
    },
    [flushScenarioContentCommit, onActionEditorNextAction, selectedActionEditorNodeId],
  );
  const selectedSourceFileEditorNode = useMemo<ScenarioNodeSnapshot | null>(() => {
    if (!selectedCodeOnlyFile || !selectedCodeOnlyFileNode) {
      return null;
    }

    return {
      id: `${selectedCodeOnlyFile.id}:source`,
      file_id: selectedCodeOnlyFile.id,
      label_id: selectedCodeOnlyFile.id,
      parent_node_id: null,
      type: 'action',
      content: String(selectedCodeOnlyFileNode.data?.sourceContent ?? ''),
      order: selectedCodeOnlyFile.order,
      source_span: null,
      metadata: {
        title: selectedCodeOnlyFile.path,
        default_title: selectedCodeOnlyFile.path,
        code_only_file: true,
      },
      visual: {
        position: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
      },
    };
  }, [selectedCodeOnlyFile, selectedCodeOnlyFileNode]);
  const handleSourceFileEditorContentChange = useCallback(
    (content: string) => {
      if (!selectedCodeOnlyFile) {
        return;
      }
      onSourceFileContentChange?.(selectedCodeOnlyFile.id, content);
    },
    [onSourceFileContentChange, selectedCodeOnlyFile],
  );
  const handleSourceFileEditorTitleChange = useCallback(() => undefined, []);
  const exportedFileEntries = useMemo(
    () => Object.entries(exportedFiles ?? {}).sort(([pathA], [pathB]) => pathA.localeCompare(pathB)),
    [exportedFiles],
  );
  useEffect(() => {
    const pendingCommit = pendingScenarioContentCommitRef.current;
    if (shouldFlushProjectGraphScenarioContentCommitForSelection(pendingCommit, selectedNodeId)) {
      flushScenarioContentCommit();
    }
  }, [flushScenarioContentCommit, selectedNodeId]);
  useEffect(() => {
    if (!selectedCodeOnlyFileNode) {
      setIsSourceFileEditorOpen(false);
    }
  }, [selectedCodeOnlyFileNode]);
  useEffect(() => () => flushScenarioContentCommit(), [flushScenarioContentCommit]);
  useEffect(
    () => () => {
      if (relationNavigationAnimationRef.current !== null) {
        cancelAnimationFrame(relationNavigationAnimationRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    setScenarioContentDraft((currentDraft) =>
      selectedScenario
        ? reconcileProjectGraphScenarioContentDraft(selectedScenario.id, selectedScenario.content, currentDraft)
        : null,
    );
  }, [selectedScenario?.content, selectedScenario?.id]);
  useEffect(() => {
    setIsActionEditorOpen(false);
  }, [selectedScenario?.id]);
  const displayedProjectName = projectName?.trim() || 'Untitled project';
  const participantsToShow = participants.length > 0 ? participants : [{ id: 'local', username: 'You' }];
  const shouldShowScenarioInspector = !isLandingPresentation || allowLandingInspector;
  const shouldAllowActionEditor = !isLandingPresentation || allowLandingActionEditor;
  const canvasClassName = [
    'project-graph-canvas',
    isLandingPresentation ? 'project-graph-canvas--landing-preview' : null,
    `project-graph-canvas--lod-${lodLevel}`,
    showDevPerformancePanel && !devRenderToggles.nodeBody ? 'project-graph-canvas--dev-hide-node-body' : null,
    showDevPerformancePanel && !devRenderToggles.nodeEffects ? 'project-graph-canvas--dev-flat-nodes' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const remoteCursorViews = useMemo(
    () =>
      remoteCursors.map((cursor) => {
        const anchoredPosition = cursor.targetNodeId
          ? getProjectGraphNodeAnchor(projection.nodes, cursor.targetNodeId) ?? cursor.position
          : cursor.position;
        return {
          ...cursor,
          anchoredPosition,
        };
      }),
    [projection.nodes, remoteCursors],
  );

  const editingPresence = useMemo<ProjectGraphPresenceActivityUpdate | null>(() => {
    const targetNodeId = isActionEditorOpen
      ? selectedActionEditorNode?.id
      : isSourceFileEditorOpen
        ? selectedCodeOnlyFileNode?.id
        : undefined;
    if (!targetNodeId) {
      return null;
    }
    const position = getProjectGraphNodeAnchor(projection.nodes, targetNodeId);
    if (!position) {
      return null;
    }
    return {
      activity: isActionEditorOpen ? 'editing_action' : 'editing_source_file',
      position,
      targetNodeId,
    };
  }, [isActionEditorOpen, isSourceFileEditorOpen, projection.nodes, selectedActionEditorNode?.id, selectedCodeOnlyFileNode?.id]);

  useEffect(() => {
    if (editingPresence) {
      const presenceKey = `${editingPresence.activity}:${editingPresence.targetNodeId}:${editingPresence.position.x}:${editingPresence.position.y}`;
      if (lastEditingPresenceKeyRef.current === presenceKey) {
        return;
      }
      lastEditingPresenceKeyRef.current = presenceKey;
      activePresenceActivityRef.current = editingPresence.activity;
      onPresenceActivity?.(editingPresence);
      return;
    }
    lastEditingPresenceKeyRef.current = null;
    if (activePresenceActivityRef.current !== 'viewing_canvas') {
      activePresenceActivityRef.current = 'viewing_canvas';
      onPresenceActivity?.({
        activity: 'viewing_canvas',
        position: lastCanvasPointerPositionRef.current ?? { x: 0, y: 0 },
      });
    }
  }, [editingPresence, onPresenceActivity]);
  const frameEntries = useMemo(
    () => [
      ...graph.files.map((file) => ({
        id: file.id,
        title: file.path,
        kind: 'file',
      })),
      ...graph.labels.map((label) => ({
        id: label.id,
        title: label.qualified_name,
        kind: 'label',
      })),
    ],
    [graph.files, graph.labels],
  );
  const saveStatusTitle = saveStatus ?? t('canvas.connected');
  const hasConnectionError = saveStatus?.toLocaleLowerCase().includes('fail') ?? false;
  const devMetrics = useMemo(
    () =>
      showDevPerformancePanel
        ? calculateProjectGraphViewportMetrics(projection.nodes, displayedEdges, viewport, canvasSize)
        : emptyViewportMetrics,
    [canvasSize, displayedEdges, projection.nodes, showDevPerformancePanel, viewport],
  );
  const derivedEdgeCount = useMemo(
    () => (showDevPerformancePanel ? displayedEdges.filter((edge) => edge.data?.derived === true).length : 0),
    [displayedEdges, showDevPerformancePanel],
  );
  const animatedEdgeCount = useMemo(
    () => (showDevPerformancePanel ? displayedEdges.filter((edge) => edge.animated === true).length : 0),
    [displayedEdges, showDevPerformancePanel],
  );
  useEffect(() => {
    devVisibleNodeCountRef.current = devMetrics.visibleNodes;
  }, [devMetrics.visibleNodes]);
  useEffect(() => {
    devAdaptiveLightLevelRef.current = devAdaptiveLightLevel;
  }, [devAdaptiveLightLevel]);
  useEffect(() => {
    if (!showDevPerformancePanel || !devAutoLighten) {
      setDevAdaptiveLightLevel(0);
      devAdaptiveLightLevelRef.current = 0;
    }
  }, [devAutoLighten, showDevPerformancePanel]);
  const updateDevRenderToggle = useCallback((key: keyof ProjectGraphDevRenderToggles, value: boolean) => {
    setDevRenderToggles((current) => ({ ...current, [key]: value }));
  }, []);
  const closeCanvasPopovers = useCallback(() => {
    setIsSearchOpen(false);
    setIsInviteOpen(false);
    setIsProblemsOpen(false);
    setIsFramesOpen(false);
  }, []);
  const openSearchPopover = useCallback(() => {
    setIsSearchOpen(true);
    setIsInviteOpen(false);
    setIsProblemsOpen(false);
    setIsFramesOpen(false);
  }, []);
  const toggleSearchPopover = useCallback(() => {
    setIsSearchOpen((isOpen) => !isOpen);
    setIsInviteOpen(false);
    setIsProblemsOpen(false);
    setIsFramesOpen(false);
  }, []);
  const toggleInvitePopover = useCallback(() => {
    setIsInviteOpen((isOpen) => !isOpen);
    setIsSearchOpen(false);
    setIsProblemsOpen(false);
    setIsFramesOpen(false);
  }, []);

  useEffect(() => {
    setDevOnlyRenderVisibleElements(onlyRenderVisibleElements);
  }, [onlyRenderVisibleElements]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () =>
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    refreshSpatialRenderRect(moveViewportRef.current, true);
  }, [graph.project_id, refreshSpatialRenderRect]);

  useEffect(() => {
    if (!showDevPerformancePanel) {
      setFrameMetrics(null);
      return undefined;
    }

    let active = true;
    let animationFrameId = 0;
    let sampleStartedAt = performance.now();
    let lastFrameAt = sampleStartedAt;
    const frameDurations: number[] = [];
    const frameDurationsByPhase: Record<ProjectGraphFramePhase, number[]> = {
      idle: [],
      pan: [],
      zoom: [],
      nodeDrag: [],
    };

    const sampleFrame = (now: number) => {
      if (!active) {
        return;
      }

      const frameMs = now - lastFrameAt;
      lastFrameAt = now;
      if (frameMs > 0) {
        frameDurations.push(frameMs);
        frameDurationsByPhase[interactionPhaseRef.current].push(frameMs);
      }

      const sampleDurationMs = now - sampleStartedAt;
      if (sampleDurationMs >= DEV_FRAME_SAMPLE_MS) {
        const nextFrameMetrics = {
          ...summarizeProjectGraphFrameMetrics(frameDurations, sampleDurationMs),
          activePhase: interactionPhaseRef.current,
          phases: summarizeProjectGraphPhaseFrameMetrics(frameDurationsByPhase),
        };
        setFrameMetrics(nextFrameMetrics);
        if (devAutoLighten) {
          const nextLightLevel = getNextProjectGraphAdaptiveLightLevel(
            devAdaptiveLightLevelRef.current,
            nextFrameMetrics.activePhase,
            nextFrameMetrics.phases.pan,
            devVisibleNodeCountRef.current,
          );
          if (nextLightLevel !== devAdaptiveLightLevelRef.current) {
            devAdaptiveLightLevelRef.current = nextLightLevel;
            setDevAdaptiveLightLevel(nextLightLevel);
          }
        }
        frameDurations.length = 0;
        for (const phase of projectGraphFramePhases) {
          frameDurationsByPhase[phase].length = 0;
        }
        sampleStartedAt = now;
      }

      animationFrameId = requestAnimationFrame(sampleFrame);
    };

    animationFrameId = requestAnimationFrame(sampleFrame);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [devAutoLighten, showDevPerformancePanel]);

  useEffect(() => {
    if (!onExportProjectGraph) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isProjectGraphKeyboardShortcut(event, 'KeyE', true)) {
        event.preventDefault();
        handleExportProjectGraph();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportProjectGraph, onExportProjectGraph]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCanvasPopovers();
        return;
      }
      if (isProjectGraphKeyboardShortcut(event, 'KeyK')) {
        event.preventDefault();
        openSearchPopover();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeCanvasPopovers, openSearchPopover]);

  useEffect(() => {
    if (!isSearchOpen && !isInviteOpen && !isProblemsOpen && !isFramesOpen) {
      return undefined;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (
        !target ||
        topActionsRef.current?.contains(target) ||
        searchPopoverRef.current?.contains(target) ||
        controlClusterRef.current?.contains(target)
      ) {
        return;
      }
      closeCanvasPopovers();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [closeCanvasPopovers, isFramesOpen, isInviteOpen, isProblemsOpen, isSearchOpen]);

  useEffect(() => {
    if (!reactFlowInstance || projection.nodes.length === 0) {
      return;
    }

    const viewportKey = graph.project_id;
    if (initialViewportKeyRef.current === viewportKey) {
      return;
    }

    if (isLandingPresentation) {
      initialViewportKeyRef.current = viewportKey;
      reactFlowInstance.fitView({ padding: 0.055, duration: 0, maxZoom: 0.76 });
      if (!initialFocusNodeId || initialLandingFocusDoneRef.current === `${viewportKey}:${initialFocusNodeId}`) {
        return;
      }

      const focusNode = projection.nodes.find((candidate) => candidate.id === initialFocusNodeId);
      const position = getAbsoluteNodePosition(projection.nodes, initialFocusNodeId);
      if (!focusNode || !position) {
        return;
      }

      initialLandingFocusDoneRef.current = `${viewportKey}:${initialFocusNodeId}`;
      const landingFocusTimer = window.setTimeout(() => {
        reactFlowInstance.setCenter(
          position.x + Number(focusNode.width ?? 0) / 2,
          position.y + Number(focusNode.height ?? 0) / 2,
          { zoom: 1.05, duration: 950 },
        );
      }, 180);

      return () => window.clearTimeout(landingFocusTimer);
    }

    const firstReadableNode = [...projection.nodes]
      .filter((node) => node.type === 'labelStart')
      .sort((left, right) => {
        const leftLine =
          typeof left.data?.layoutSourceLine === 'number' ? left.data.layoutSourceLine : Number.MAX_SAFE_INTEGER;
        const rightLine =
          typeof right.data?.layoutSourceLine === 'number' ? right.data.layoutSourceLine : Number.MAX_SAFE_INTEGER;
        return leftLine - rightLine;
      })[0];
    const position = firstReadableNode ? getAbsoluteNodePosition(projection.nodes, firstReadableNode.id) : null;

    if (!firstReadableNode || !position) {
      return;
    }

    initialViewportKeyRef.current = viewportKey;
    reactFlowInstance.setCenter(
      position.x + Number(firstReadableNode.width ?? 0) / 2,
      position.y + Number(firstReadableNode.height ?? 0) / 2,
      { zoom: 0.95, duration: 0 },
    );
  }, [
    graph.edges.length,
    graph.files.length,
    graph.labels.length,
    graph.nodes.length,
    graph.project_id,
    initialFocusNodeId,
    isLandingPresentation,
    projection.nodes,
    reactFlowInstance,
  ]);

  const focusNode = (nodeId: string) => {
    const node = projection.nodes.find((candidate) => candidate.id === nodeId);
    const position = getAbsoluteNodePosition(projection.nodes, nodeId);

    if (!node || !position) {
      return;
    }

    setSelectedNodeId(nodeId);
    setSearchQuery('');
    setIsSearchOpen(false);
    reactFlowInstance?.setCenter(
      position.x + Number(node.width ?? 0) / 2,
      position.y + Number(node.height ?? 0) / 2,
      { zoom: 1.05, duration: 320 },
    );
  };

  const closeDeleteDialog = useCallback(() => {
    if (deletePending) return;
    setDeleteEntityId(null);
    setServerDeletionImpact(null);
    setDeleteError(null);
  }, [deletePending]);

  const requestDelete = useCallback((entityId: string) => {
    setDeleteEntityId(entityId);
    setServerDeletionImpact(null);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteEntityId || !deletionImpact?.canDelete || !onCreateStructure) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const selectedEntityId = await onCreateStructure({ kind: 'delete', entityId: deleteEntityId });
      setSelectedNodeId(typeof selectedEntityId === 'string' ? selectedEntityId : null);
      setDeleteEntityId(null);
      setServerDeletionImpact(null);
    } catch (reason) {
      const authoritativeImpact = deletionImpactFromCommandError(reason);
      if (authoritativeImpact) setServerDeletionImpact(authoritativeImpact);
      setDeleteError(t('canvas.deleteDialog.failed'));
    } finally {
      setDeletePending(false);
    }
  }, [deleteEntityId, deletionImpact?.canDelete, onCreateStructure, t]);

  const goToDeletionBlocker = useCallback((nodeId: string) => {
    setDeleteEntityId(null);
    setServerDeletionImpact(null);
    setDeleteError(null);
    window.requestAnimationFrame(() => focusNode(nodeId));
  }, [focusNode]);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      const point = reactFlowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const hitNode = point ? findProjectGraphNodeAtCanvasPoint(interactiveNodesRef.current, point) : null;

      setSelectedNodeId(hitNode?.id ?? null);
      setCreateMenu(null);
    },
    [reactFlowInstance],
  );
  const handleNodeClick = useCallback((_: ReactMouseEvent<Element>, node: Node) => {
    setSelectedNodeId(node.id);
    setCreateMenu(null);
  }, []);
  const handlePaneContextMenu = useCallback((event: ReactMouseEvent<Element>) => {
    event.preventDefault();
    if (!reactFlowInstance || !onCreateStructure || isLandingPresentation) return;
    const flow = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (findProjectGraphNodeAtCanvasPoint(interactiveNodesRef.current, flow)) return;
    setCreateMenu({
      client: { x: event.clientX, y: event.clientY },
      flow,
      target: { kind: 'canvas' },
    });
  }, [isLandingPresentation, onCreateStructure, reactFlowInstance]);
  const handleNodeContextMenu = useCallback((event: ReactMouseEvent<Element>, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    const eventTarget = event.target instanceof Element ? event.target : null;
    const deepestNodeId = eventTarget?.closest('.react-flow__node')?.getAttribute('data-id');
    if (deepestNodeId && deepestNodeId !== node.id) return;
    if (!reactFlowInstance || !onCreateStructure || isLandingPresentation) return;
    const flow = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (node.type === 'labelFrame') {
      const label = graph.labels.find((candidate) => candidate.id === node.id);
      setCreateMenu(label ? {
        client: { x: event.clientX, y: event.clientY }, flow,
        target: { kind: 'label', labelId: label.id, qualifiedName: label.qualified_name },
      } : null);
    } else if (node.type === 'projectFrame') {
      const file = graph.files.find((candidate) => candidate.id === node.id);
      setCreateMenu(file ? {
        client: { x: event.clientX, y: event.clientY }, flow,
        target: { kind: 'file', fileId: file.id, path: file.path },
      } : null);
    } else if (node.type === 'scenarioNode') {
      const scenario = graph.nodes.find((candidate) => candidate.id === node.id);
      setCreateMenu(scenario ? {
        client: { x: event.clientX, y: event.clientY }, flow,
        target: { kind: 'scenario', nodeId: scenario.id, title: scenario.content.split('\n')[0] || scenario.type },
      } : null);
    } else {
      setCreateMenu(null);
    }
  }, [graph.files, graph.labels, graph.nodes, isLandingPresentation, onCreateStructure, reactFlowInstance]);
  const handleCreateStructure = useCallback(async (command: ProjectGraphStructureCommand) => {
    const selectedEntityId = await onCreateStructure?.(command);
    if (typeof selectedEntityId === 'string') setSelectedNodeId(selectedEntityId);
  }, [onCreateStructure]);
  const handleCanvasContextMenuCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isLandingPresentation) return;
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const nodeId = target?.closest('.react-flow__node')?.getAttribute('data-id');
    const node = nodeId ? interactiveNodesRef.current.find((candidate) => candidate.id === nodeId) : null;
    if (node?.type === 'labelStart') {
      event.stopPropagation();
      setCreateMenu(null);
    } else if (node?.type === 'scenarioNode' && reactFlowInstance && onCreateStructure) {
      const scenario = graph.nodes.find((candidate) => candidate.id === node.id);
      event.stopPropagation();
      setCreateMenu(scenario ? {
        client: { x: event.clientX, y: event.clientY },
        flow: reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        target: { kind: 'scenario', nodeId: scenario.id, title: scenario.content.split('\n')[0] || scenario.type },
      } : null);
    }
  }, [graph.nodes, isLandingPresentation, onCreateStructure, reactFlowInstance]);
  const handleNodeDragStop = useCallback(
    (_: ReactMouseEvent<Element>, node: Node) => {
      onEntityPositionChange?.(node.id, node.position);
    },
    [onEntityPositionChange],
  );
  const handleViewportMove = useCallback(
    (_: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      const previousViewport = moveViewportRef.current;
      interactionPhaseRef.current =
        Math.abs(nextViewport.zoom - previousViewport.zoom) > 0.0005 ? 'zoom' : 'pan';
      moveViewportRef.current = nextViewport;
      applyViewportPresentation(nextViewport.zoom);
      refreshSpatialRenderRect(nextViewport);
    },
    [applyViewportPresentation, refreshSpatialRenderRect],
  );
  const handleViewportMoveStart = useCallback((_: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
    moveViewportRef.current = nextViewport;
    applyViewportPresentation(nextViewport.zoom);
    interactionPhaseRef.current = 'pan';
  }, [applyViewportPresentation]);
  const handleViewportMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      moveViewportRef.current = nextViewport;
      applyViewportPresentation(nextViewport.zoom);
      refreshSpatialRenderRect(nextViewport, true);
      setViewport(nextViewport);
      interactionPhaseRef.current = 'idle';
    },
    [applyViewportPresentation, refreshSpatialRenderRect],
  );
  const handleCanvasMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !reactFlowInstance ||
        isActionEditorOpen ||
        isSourceFileEditorOpen ||
        target?.closest('.project-graph-canvas__overlay')
      ) {
        return;
      }
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      lastCanvasPointerPositionRef.current = position;
      activePresenceActivityRef.current = 'viewing_canvas';
      onCanvasPointerActivity?.(position);
      onPresenceActivity?.({ activity: 'viewing_canvas', position });
    },
    [isActionEditorOpen, isSourceFileEditorOpen, onCanvasPointerActivity, onPresenceActivity, reactFlowInstance],
  );

  return (
    <div
      className={canvasClassName}
      onContextMenuCapture={handleCanvasContextMenuCapture}
      onMouseMove={handleCanvasMouseMove}
      ref={canvasRef}
    >
      {!isLandingPresentation ? (
      <div className="project-graph-canvas__brand project-graph-canvas__overlay" aria-label={t('canvas.project')}>
        <img alt="" className="project-graph-canvas__brand-logo" src={brandLogoUrl} />
        <div className="project-graph-canvas__brand-name" title={displayedProjectName}>
          {displayedProjectName}
        </div>
      </div>
      ) : null}

      {!isLandingPresentation ? (
      <div className="project-graph-canvas__top-actions project-graph-canvas__overlay" ref={topActionsRef}>
        <button
          aria-label={t('canvas.search.open')}
          className="project-graph-canvas__icon-button"
          onClick={toggleSearchPopover}
          title={t('canvas.search.title')}
          type="button"
        >
          <SearchIcon aria-hidden="true" fontSize="small" />
        </button>
        <button
          aria-label={t('canvas.exportProject')}
          className="project-graph-canvas__icon-button"
          onClick={handleExportProjectGraph}
          title={t('canvas.exportProject')}
          type="button"
        >
          <FileDownloadOutlinedIcon aria-hidden="true" fontSize="small" />
        </button>
        <div className="project-graph-canvas__participant-stack" aria-label={t('canvas.participants.current')}>
          {participantsToShow.slice(0, 4).map((participant) => (
            <div
              className="project-graph-canvas__participant"
              key={participant.id}
              style={{ '--participant-color': getParticipantAccentColor(participant) } as CSSProperties}
              title={`${participant.username} - ${participant.id === 'local' ? t('canvas.participants.viewing') : t('canvas.connected')}`}
            >
              {getParticipantInitials(participant)}
            </div>
          ))}
        </div>
        <div className="project-graph-canvas__invite">
          <button
            className="project-graph-canvas__invite-button"
            aria-label={t('canvas.invite.title')}
            onClick={toggleInvitePopover}
            title={t('canvas.invite.title')}
            type="button"
          >
            <PersonAddAlt1Icon aria-hidden="true" fontSize="small" />
          </button>
          {isInviteOpen ? (
            <div className="project-graph-canvas__invite-popover">
              <div className="project-graph-canvas__panel-title">{t('canvas.invite.title')}</div>
              <label className="project-graph-canvas__field">
                <span>{t('canvas.invite.target')}</span>
                <input
                  className="project-graph-canvas__node-editor-line-input"
                  onChange={(event) => setInviteTarget(event.target.value)}
                  placeholder="teammate@example.com"
                  type="text"
                  value={inviteTarget}
                />
              </label>
              <button
                className="project-graph-canvas__invite-submit"
                disabled={!inviteTarget.trim()}
                onClick={() => {
                  const target = inviteTarget.trim();
                  if (!target) {
                    return;
                  }
                  onInviteUser?.(target);
                  setInviteTarget('');
                  setIsInviteOpen(false);
                }}
                type="button"
              >
                {t('canvas.invite.send')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}

      {!isLandingPresentation && isSearchOpen ? (
        <div className="project-graph-canvas__search-popover project-graph-canvas__overlay" ref={searchPopoverRef}>
          <input
            aria-label={t('canvas.search.aria')}
            autoFocus
            className="project-graph-canvas__search"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('canvas.search.placeholder')}
            type="search"
            value={searchQuery}
          />
          {searchQuery.trim() ? (
            <div className="project-graph-canvas__search-results">
              {searchResults.map((result) => (
                <button
                  className="project-graph-canvas__search-result"
                  key={result.nodeId}
                  onClick={() => focusNode(result.nodeId)}
                  type="button"
                >
                  <span>{result.title}</span>
                  <small>{result.content}</small>
                </button>
              ))}
              {searchResults.length === 0 ? <div className="project-graph-canvas__empty">{t('canvas.search.noMatches')}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {shouldShowScenarioInspector && selectedScenario ? (
        <div className="project-graph-canvas__node-editor project-graph-canvas__overlay">
          <div className="project-graph-canvas__panel-title">{t('canvas.inspector.title')}</div>
          <div className="project-graph-canvas__inspector-meta">
            <span className="project-graph-canvas__inspector-type">{selectedScenario.type}</span>
            <span className="project-graph-canvas__inspector-breadcrumb">
              {[selectedScenarioFile?.path, selectedScenarioLabel?.qualified_name].filter(Boolean).join(' > ')}
            </span>
          </div>
          <label className="project-graph-canvas__field">
            <span>{selectedContentLabel}</span>
            <ProjectGraphScenarioContentEditor
              content={displayedScenarioContent}
              nodeId={selectedScenario.id}
              onBlur={flushScenarioContentCommit}
              onContentChange={setScenarioContentDraftAndScheduleCommit}
            />
          </label>
          {selectedScenario.type === 'menu_choice' ? (
            <label className="project-graph-canvas__field">
              <span>{t('canvas.inspector.choiceCondition')}</span>
              <input
                aria-label={t('canvas.inspector.editChoiceCondition')}
                className="project-graph-canvas__node-editor-line-input"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onChange={(event) => {
                  const condition = event.target.value;
                  const content = menuChoiceLineWithCondition(getLatestDisplayedScenarioContent(), condition);
                  setScenarioContentDraftAndScheduleCommit(selectedScenario.id, content);
                  onScenarioMetadataChange?.(selectedScenario.id, {
                    condition: condition.trim() ? condition.trim() : null,
                  });
                }}
                onBlur={flushScenarioContentCommit}
                spellCheck={false}
                value={selectedChoiceCondition}
              />
            </label>
          ) : null}
          {selectedScenario.type === 'action' ? (
            <>
              <label className="project-graph-canvas__field">
                <span>{t('canvas.inspector.actionTitle')}</span>
                <input
                  aria-label={t('canvas.inspector.editActionTitle')}
                  className="project-graph-canvas__node-editor-line-input"
                  onChange={(event) => {
                    const title = event.target.value.trim();
                    onScenarioMetadataChange?.(selectedScenario.id, {
                      title: title ? title : null,
                    });
                  }}
                  value={selectedActionTitle}
                />
              </label>
              {shouldAllowActionEditor ? (
                <button
                  aria-label={t('canvas.inspector.openActionEditor')}
                  className="project-graph-canvas__node-editor-open-action"
                  onClick={() => {
                    flushScenarioContentCommit();
                    setIsActionEditorOpen(true);
                  }}
                  type="button"
                >
                  {t('canvas.inspector.openWritingRoom')}
                </button>
              ) : null}
            </>
          ) : null}
          {selectedScenario.type === 'jump' || selectedScenario.type === 'call' ? (
            <button
              aria-label={t('canvas.inspector.navigateTarget')}
              className="project-graph-canvas__node-editor-go-target"
              disabled={!selectedRelationTargetNode}
              onClick={handleNavigateToSelectedRelationTarget}
              type="button"
            >
              <span aria-hidden="true" className="project-graph-canvas__node-editor-go-target-icon">
                &gt;
              </span>
              <span>{t('canvas.inspector.goToTarget')}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {shouldAllowActionEditor && isActionEditorOpen && selectedActionEditorNode ? (
        <ActionEditorOverlay
          assetCatalog={assetCatalog}
          filePath={selectedScenarioFile?.path ?? t('canvas.unknownFile')}
          hasExistingTail={selectedActionHasTail}
          labelPath={selectedScenarioLabel?.qualified_name ?? t('canvas.unknownLabel')}
          localAssetUrls={localAssetUrls}
          nextTargetFiles={actionEditorNextTargetFiles}
          nextTargetLabels={actionEditorNextTargetLabels}
          node={selectedActionEditorNode}
          onClose={() => {
            flushScenarioContentCommit();
            setIsActionEditorOpen(false);
          }}
          onContentChange={handleActionEditorContentChange}
          onContentSplice={onScenarioContentSplice ? handleActionEditorContentSplice : undefined}
          onNextAction={handleActionEditorNextAction}
          onTitleChange={handleActionEditorTitleChange}
          saveStatus={saveStatus}
        />
      ) : null}

      {!isLandingPresentation && isSourceFileEditorOpen && selectedCodeOnlyFile && selectedSourceFileEditorNode ? (
        <ActionEditorOverlay
          assetCatalog={assetCatalog}
          filePath={selectedCodeOnlyFile.path}
          initialMode="raw"
          labelPath={t('canvas.codeOnlyFile')}
          localAssetUrls={localAssetUrls}
          node={selectedSourceFileEditorNode}
          onClose={() => setIsSourceFileEditorOpen(false)}
          onContentChange={handleSourceFileEditorContentChange}
          onTitleChange={handleSourceFileEditorTitleChange}
          saveStatus={saveStatus}
        />
      ) : null}

      {!isLandingPresentation && (exportStatus || exportedFileEntries.length > 0) ? (
        <div className="project-graph-canvas__export-results project-graph-canvas__overlay">
          <div className="project-graph-canvas__panel-title">{t('canvas.exportedFiles')}</div>
          {exportStatus ? <div className="project-graph-canvas__status">{exportStatus}</div> : null}
          {exportedFileEntries.map(([path, content]) => (
            <section className="project-graph-canvas__export-file" key={path}>
              <div className="project-graph-canvas__export-file-name">{path}</div>
              <pre>{content}</pre>
            </section>
          ))}
        </div>
      ) : null}

      {!isLandingPresentation ? (
      <div className="project-graph-canvas__control-cluster project-graph-canvas__overlay" ref={controlClusterRef}>
        {isProblemsOpen ? (
          <div className="project-graph-canvas__problems-popover">
            <div className="project-graph-canvas__panel-title">{t('canvas.problems.title')}</div>
            {problems.length > 0 ? (
              problems.map((problem) => (
                <button
                  className={`project-graph-canvas__problem project-graph-canvas__problem--${problem.severity}`}
                  key={problem.id}
                  onClick={() => (problem.nodeId ? focusNode(problem.nodeId) : undefined)}
                  type="button"
                >
                  <span>{problem.code}</span>
                  <small>{problem.message}</small>
                </button>
              ))
            ) : (
              <div className="project-graph-canvas__empty">{t('canvas.problems.none')}</div>
            )}
          </div>
        ) : null}
        {isFramesOpen ? (
          <div className="project-graph-canvas__frames-popover">
            <div className="project-graph-canvas__panel-title">{t('canvas.frames')}</div>
            {frameEntries.map((frame) => (
              <button
                className="project-graph-canvas__frame-result"
                key={frame.id}
                onClick={() => focusNode(frame.id)}
                type="button"
              >
                <span>{frame.title}</span>
                <small>{frame.kind}</small>
              </button>
            ))}
          </div>
        ) : null}
        <div className="project-graph-canvas__control-toolbar" aria-label={t('canvas.controls')}>
          <button
            aria-label={t('canvas.problems.count', { count: problems.length })}
            className="project-graph-canvas__control-button project-graph-canvas__control-button--problems"
            onClick={() => {
              setIsProblemsOpen((isOpen) => !isOpen);
              setIsFramesOpen(false);
            }}
            type="button"
          >
            <WarningAmberIcon aria-hidden="true" fontSize="small" />
            <span>{problems.length}</span>
          </button>
          <span
            className={`project-graph-canvas__connection${hasConnectionError ? ' project-graph-canvas__connection--error' : ''}`}
            title={saveStatusTitle}
          >
            {hasConnectionError ? (
              <WarningAmberIcon aria-hidden="true" fontSize="small" />
            ) : (
              <CheckIcon aria-hidden="true" fontSize="small" />
            )}
          </span>
          <button
            className="project-graph-canvas__frames-button"
            onClick={() => {
              setIsFramesOpen((isOpen) => !isOpen);
              setIsProblemsOpen(false);
            }}
            type="button"
          >
            {t('canvas.frames')}
          </button>
          <button
            aria-label={t('canvas.zoomOut')}
            className="project-graph-canvas__control-button"
            onClick={() => reactFlowInstance?.zoomOut({ duration: 160 })}
            type="button"
          >
            <RemoveIcon aria-hidden="true" fontSize="small" />
          </button>
          <span className="project-graph-canvas__zoom-label">{Math.round(viewport.zoom * 100)}%</span>
          <button
            aria-label={t('canvas.zoomIn')}
            className="project-graph-canvas__control-button"
            onClick={() => reactFlowInstance?.zoomIn({ duration: 160 })}
            type="button"
          >
            <AddIcon aria-hidden="true" fontSize="small" />
          </button>
          <a
            aria-label={t('canvas.help')}
            className="project-graph-canvas__control-button"
            href={PROJECT_HELP_URL}
            rel="noreferrer"
            target="_blank"
            title={t('canvas.help')}
          >
            <HelpOutlineIcon aria-hidden="true" fontSize="small" />
          </a>
          <a
            aria-label={t('canvas.reportBug')}
            className="project-graph-canvas__control-button"
            href={PROJECT_BUG_REPORT_URL}
            rel="noreferrer"
            target="_blank"
            title={t('canvas.reportBug')}
          >
            <BugReportOutlinedIcon aria-hidden="true" fontSize="small" />
          </a>
          <button
            aria-label={t('canvas.toggleMinimap')}
            className="project-graph-canvas__control-button"
            onClick={() => setIsMinimapVisible((isVisible) => !isVisible)}
            type="button"
          >
            <WidgetsOutlinedIcon aria-hidden="true" fontSize="small" />
          </button>
        </div>
      </div>
      ) : null}

      {showDevPerformancePanel ? (
        <div className="project-graph-canvas__dev-perf project-graph-canvas__overlay" data-testid="project-graph-dev-perf">
          <div className="project-graph-canvas__panel-title">Dev Performance</div>
          <div className="project-graph-canvas__dev-grid">
            <span>Graph</span>
            <strong>
              {graph.files.length} files / {graph.labels.length} labels / {graph.nodes.length} scenario
            </strong>
            <span>React Flow payload</span>
            <strong>
              {interactiveNodes.length} nodes / {spatialDisplayedEdges.length} edges
            </strong>
            <span>Node identity reuse</span>
            <strong>
              {renderedNodeSample.stats.reused}/{projectedNodes.length}
            </strong>
            <span>Spatial window rebuilds</span>
            <strong>{devSpatialWindowRebuildCountRef.current}</strong>
            <span>Visible estimate</span>
            <strong>
              {devMetrics.visibleNodes} nodes / {devMetrics.crossingEdges} crossing edges
            </strong>
            <span>FPS</span>
            <strong>{frameMetrics ? frameMetrics.fps.toFixed(1) : 'sampling...'}</strong>
            <span>Active phase</span>
            <strong>{frameMetrics?.activePhase ?? interactionPhaseRef.current}</strong>
            <span>Frame time</span>
            <strong>
              {frameMetrics
                ? `${frameMetrics.averageFrameMs.toFixed(1)} ms avg / ${frameMetrics.maxFrameMs.toFixed(1)} ms max`
                : 'sampling...'}
            </strong>
            <span>Long frames</span>
            <strong>
              {frameMetrics
                ? `${frameMetrics.longFrameCount}/${frameMetrics.sampleFrames} over ${DEV_LONG_FRAME_MS} ms`
                : 'sampling...'}
            </strong>
            <span>Pan FPS</span>
            <strong>{frameMetrics ? frameMetrics.phases.pan.fps.toFixed(1) : 'sampling...'}</strong>
            <span>Pan long frames</span>
            <strong>
              {frameMetrics
                ? `${frameMetrics.phases.pan.longFrameCount}/${frameMetrics.phases.pan.sampleFrames}`
                : 'sampling...'}
            </strong>
            <span>Idle / zoom / drag FPS</span>
            <strong>
              {frameMetrics
                ? `${frameMetrics.phases.idle.fps.toFixed(1)} / ${frameMetrics.phases.zoom.fps.toFixed(1)} / ${frameMetrics.phases.nodeDrag.fps.toFixed(1)}`
                : 'sampling...'}
            </strong>
            <span>Projection</span>
            <strong>{projectionSample.projectionMs?.toFixed(1) ?? 'off'} ms</strong>
            <span>Loro read model</span>
            <strong>
              {readModelUpdate
                ? `${readModelUpdate.mode} / ${readModelUpdate.durationMs.toFixed(2)} ms / ${readModelUpdate.dirtyEntityIds.length} dirty`
                : 'initial'}
            </strong>
            <span>Read fallback</span>
            <strong>{readModelUpdate?.fallbackReason ?? 'none'}</strong>
            <span>Read materializations</span>
            <strong>
              {readModelStats
                ? `${readModelStats.fullMaterializationCount} full / ${readModelStats.incrementalUpdateCount} incremental`
                : 'initial'}
            </strong>
            <span>Full read fallbacks</span>
            <strong>{readModelStats?.fullFallbackCount ?? 0}</strong>
            <span>Projection update</span>
            <strong>
              {projectionSample.projectionMode} / {projectionSample.projectionStats.changedNodes} nodes /{' '}
              {projectionSample.projectionStats.changedEdges} edges
            </strong>
            <span>Viewport</span>
            <strong>
              z {viewport.zoom.toFixed(2)} / {Math.round(devMetrics.flowRect.width)}x{Math.round(devMetrics.flowRect.height)}
            </strong>
            <span>LOD</span>
            <strong>{lodLevel}</strong>
            <span>Auto light</span>
            <strong>{devAutoLighten ? `L${devAdaptiveLightLevel}` : 'off'}</strong>
            <span>Derived edges</span>
            <strong>{derivedEdgeCount}</strong>
            <span>Animated edges</span>
            <strong>{animatedEdgeCount}</strong>
            <span>Visible rendering</span>
            <strong>{effectiveOnlyRenderVisibleElements ? 'on' : 'off'}</strong>
            <span>MiniMap</span>
            <strong>{isMinimapVisible && devRenderToggles.minimap ? 'frames' : 'off'}</strong>
          </div>
          <div className="project-graph-canvas__dev-toggles" aria-label="Dev performance toggles">
            <label className="project-graph-canvas__dev-toggle">
              <input
                checked={effectiveOnlyRenderVisibleElements}
                onChange={(event) => setDevOnlyRenderVisibleElements(event.target.checked)}
                type="checkbox"
              />
              <span>Visible only</span>
            </label>
            <label className="project-graph-canvas__dev-toggle">
              <input
                checked={devAutoLighten}
                onChange={(event) => setDevAutoLighten(event.target.checked)}
                type="checkbox"
              />
              <span>Auto light</span>
            </label>
            {(
              [
                ['edges', 'Edges'],
                ['derivedEdges', 'Derived edges'],
                ['minimap', 'MiniMap'],
                ['background', 'Background'],
                ['nodeBody', 'Node body'],
                ['nodeEffects', 'Node effects'],
                ['lod', 'Text LOD'],
                ['nodeIdentityCache', 'Node identity cache'],
                ['projectionCache', 'Projection cache'],
                ['spatialWindow', 'Spatial window'],
              ] as const
            ).map(([key, label]) => (
              <label className="project-graph-canvas__dev-toggle" key={key}>
                <input
                  checked={devRenderToggles[key]}
                  onChange={(event) => updateDevRenderToggle(key, event.target.checked)}
                  type="checkbox"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="project-graph-canvas__dev-note">
            Visible rendering is on by default. Open with <code>&amp;visibleOnly=0</code> to compare full rendering.
            {' '}Use <code>&amp;incrementalReadModel=0</code> for the full-materialization read-model oracle.
          </div>
          <div className="project-graph-canvas__dev-types">
            {Object.entries(devMetrics.visibleNodeTypes).map(([type, count]) => (
              <span key={type}>
                {type}: {count}
              </span>
            ))}
            {Object.keys(devMetrics.visibleNodeTypes).length === 0 ? <span>empty viewport</span> : null}
          </div>
        </div>
      ) : null}

      <ReactFlow
        edges={spatialDisplayedEdges}
        elementsSelectable
        maxZoom={PROJECT_GRAPH_MAX_ZOOM}
        minZoom={PROJECT_GRAPH_MIN_ZOOM}
        nodes={interactiveNodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onlyRenderVisibleElements={effectiveOnlyRenderVisibleElements}
        edgeTypes={projectGraphEdgeTypes}
        nodeTypes={projectGraphNodeTypes}
        onInit={setReactFlowInstance}
        onMove={handleViewportMove}
        onMoveEnd={handleViewportMoveEnd}
        onMoveStart={handleViewportMoveStart}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
      >
        {(!showDevPerformancePanel || devRenderToggles.background) ? <Background gap={32} size={1} /> : null}
        {!isLandingPresentation ? (
          <ViewportPortal>
            <div className="project-graph-canvas__remote-cursors" aria-hidden="true">
              {remoteCursorViews.map((cursor) => (
                <div
                  className="project-graph-canvas__remote-cursor"
                  key={cursor.userId}
                  style={{
                    '--remote-cursor-color': getParticipantAccentColor({ id: cursor.userId, username: cursor.username }),
                    transform: `translate(${cursor.anchoredPosition.x}px, ${cursor.anchoredPosition.y}px) scale(var(--pg-viewport-inverse-zoom, 1))`,
                  } as CSSProperties}
                >
                  <span className="project-graph-canvas__remote-cursor-pointer">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M3 2L3 20L8.2 15.2L11.2 22L15.2 20.35L12.25 13.8H19.5L3 2Z" />
                    </svg>
                  </span>
                  <span className="project-graph-canvas__remote-cursor-label">
                    {cursor.username}
                    {cursor.activity
                      ? ` - ${t(`canvas.participants.${cursor.activity === 'editing_action'
                          ? 'editingAction'
                          : cursor.activity === 'editing_source_file'
                            ? 'editingSourceFile'
                            : 'viewing'}`)}`
                      : ''}
                  </span>
                </div>
              ))}
            </div>
          </ViewportPortal>
        ) : null}
      </ReactFlow>
      {createMenu ? (
        <ProjectGraphCreateMenu
          files={graph.files.map((file) => ({ id: file.id, path: file.path }))}
          labels={graph.labels.map((label) => ({ id: label.id, fileId: label.file_id, qualifiedName: label.qualified_name }))}
          menu={createMenu}
          onCancel={() => setCreateMenu(null)}
          onCreate={handleCreateStructure}
          onRequestDelete={requestDelete}
        />
      ) : null}
      {deletionImpact ? (
        <ProjectGraphDeleteDialog
          error={deleteError}
          impact={deletionImpact}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDelete}
          onGoToNode={goToDeletionBlocker}
          pending={deletePending}
        />
      ) : null}
      {!isLandingPresentation && isMinimapVisible && (!showDevPerformancePanel || devRenderToggles.minimap) ? (
        <ProjectGraphStaticMiniMap canvasSize={canvasSize} nodes={projection.nodes} viewport={viewport} />
      ) : null}
    </div>
  );
};

export const ProjectGraphCanvas = (props: ProjectGraphCanvasProps) => (
  <ReactFlowProvider>
    <ProjectGraphCanvasInner
      key={props.graph.project_id}
      {...props}
    />
  </ReactFlowProvider>
);

export default ProjectGraphCanvas;
