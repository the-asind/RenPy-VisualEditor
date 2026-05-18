import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type EdgeProps,
  type EdgeTypes,
  type ReactFlowInstance,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  type GraphPoint,
  getAbsoluteNodePosition,
  projectGraphDiagnosticsToProblems,
  projectGraphToReactFlow,
  searchProjectGraph,
  type ProjectGraphSnapshot,
} from '../../utils/projectGraphProjection';
import './ProjectGraphCanvas.css';

type HeaderPointerDownHandler = (event: ReactPointerEvent<HTMLDivElement>) => void;

const getHeaderPointerDownHandler = (data: NodeProps['data']): HeaderPointerDownHandler | undefined =>
  typeof data.onHeaderPointerDown === 'function' ? (data.onHeaderPointerDown as HeaderPointerDownHandler) : undefined;

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

const ProjectFrameNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--file">
    <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
      <div className="pg-node__eyebrow">file</div>
      <div className="pg-node__title">{String(data.title ?? '')}</div>
    </div>
  </div>
));

const LabelFrameNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--label-frame">
    <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
      <div className="pg-node__eyebrow">label</div>
      <div className="pg-node__title">{String(data.title ?? '')}</div>
    </div>
  </div>
));

const LabelStartNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--label-start">
    <Handle className="pg-node__handle pg-node__handle--relation" id="relation-in" type="target" position={Position.Left} />
    <Handle className="pg-node__handle pg-node__handle--flow" id="flow-in" type="target" position={Position.Top} />
    <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
      <div className="pg-node__eyebrow">start</div>
    </div>
    <div className="pg-node__body nodrag">
      <div className="pg-node__title">{String(data.qualifiedName ?? '')}</div>
      <div className="pg-node__content">{String(data.content ?? '')}</div>
    </div>
    <Handle className="pg-node__handle pg-node__handle--flow" id="flow-out" type="source" position={Position.Bottom} />
  </div>
));

const ScenarioNode = memo(({ data }: NodeProps) => {
  const scenarioType = String(data.scenarioType ?? 'node');
  const visualRole = String(data.visualRole ?? '');
  const title = String(data.title ?? scenarioType);
  const showTitle = title.trim() && title !== scenarioType;
  const menuPrompt = String(data.menuPrompt ?? '');
  const content = scenarioType === 'menu' && menuPrompt.trim() ? menuPrompt : String(data.content ?? '');

  return (
    <div className="pg-node pg-node--scenario" data-scenario-type={scenarioType} data-visual-role={visualRole}>
      <Handle className="pg-node__handle pg-node__handle--relation" id="relation-in" type="target" position={Position.Left} />
      <Handle className="pg-node__handle pg-node__handle--flow" id="flow-in" type="target" position={Position.Top} />
      <div className="pg-node__drag-handle" onPointerDown={getHeaderPointerDownHandler(data)}>
        <div className="pg-node__eyebrow">{scenarioType}</div>
      </div>
      <div className="pg-node__body nodrag">
        {showTitle ? <div className="pg-node__title pg-node__title--scenario">{title}</div> : null}
        <div className="pg-node__content">{content}</div>
      </div>
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

export const NEAR_TARGET_TURN_OFFSET = 24;

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
    const minimumSourceClearance = 24;
    const turnY = sourceY + verticalDirection * Math.max(minimumSourceClearance, sourceOffset);

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

const NearTargetStepEdge = memo(({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) => {
  const targetOffset =
    typeof data?.targetTurnOffset === 'number' ? data.targetTurnOffset : NEAR_TARGET_TURN_OFFSET;
  const sourceOffset = typeof data?.sourceTurnOffset === 'number' ? data.sourceTurnOffset : targetOffset;
  const direction =
    data?.direction === 'vertical' || data?.direction === 'source-vertical' ? data.direction : 'horizontal';
  const path = buildNearTargetStepPath({ sourceX, sourceY, targetX, targetY, targetOffset, sourceOffset, direction });

  return <BaseEdge markerEnd={markerEnd} path={path} style={style} />;
});

export const projectGraphEdgeTypes: EdgeTypes = {
  nearTargetStep: NearTargetStepEdge,
};

export interface ProjectGraphCanvasProps {
  graph: ProjectGraphSnapshot;
  className?: string;
  exportStatus?: string | null;
  exportedFiles?: Record<string, string> | null;
  saveStatus?: string | null;
  onExportProjectGraph?: () => void;
  onEntityPositionChange?: (entityId: string, position: GraphPoint) => void;
  onEntityPositionsChange?: (changes: ProjectGraphEntityPositionChange[]) => void;
  onScenarioContentChange?: (nodeId: string, content: string) => void;
  onScenarioMetadataChange?: (nodeId: string, metadataPatch: Record<string, unknown>) => void;
}

const contentEditorLabelByType = new Map<string, string>([
  ['dialogue', 'Dialogue or narration'],
  ['comment', 'Comment'],
  ['jump', 'Jump statement'],
  ['call', 'Call statement'],
  ['return', 'Return statement'],
  ['raw_action', 'Action statement'],
  ['raw_block', 'Raw block'],
  ['menu_prompt', 'Menu prompt'],
  ['menu_choice', 'Menu choice line'],
]);

const menuChoiceLineWithCondition = (content: string, condition: string): string => {
  const trimmedContent = content.trimEnd();
  const withoutExistingCondition = trimmedContent.replace(/\s+if\s+[^:]+:$/, ':');
  const base = withoutExistingCondition.endsWith(':') ? withoutExistingCondition.slice(0, -1) : withoutExistingCondition;
  const trimmedCondition = condition.trim();
  return trimmedCondition ? `${base} if ${trimmedCondition}:` : `${base}:`;
};

const ProjectGraphCanvasInner = ({
  graph,
  className,
  exportStatus,
  exportedFiles,
  saveStatus,
  onExportProjectGraph,
  onEntityPositionChange,
  onEntityPositionsChange,
  onScenarioContentChange,
  onScenarioMetadataChange,
}: ProjectGraphCanvasProps) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const initialViewportKeyRef = useRef<string | null>(null);
  const interactiveNodesRef = useRef<Node[]>([]);
  const projection = useMemo(() => projectGraphToReactFlow(graph), [graph]);
  const searchResults = useMemo(() => searchProjectGraph(graph, searchQuery), [graph, searchQuery]);
  const problems = useMemo(() => projectGraphDiagnosticsToProblems(graph), [graph]);
  const selectedScenario = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
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
  const projectedNodes = useMemo(
    () =>
      projection.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onHeaderPointerDown: (event: ReactPointerEvent<HTMLDivElement>) =>
            handleNodeHeaderPointerDown(node.id, event),
        },
        selected: node.id === selectedNodeId,
      })),
    [handleNodeHeaderPointerDown, projection.nodes, selectedNodeId],
  );
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
  const selectedContentLabel = selectedScenario
    ? (contentEditorLabelByType.get(selectedScenario.type) ?? 'Scenario content')
    : 'Scenario content';
  const selectedActionTitle = selectedScenario?.type === 'action'
    ? String(selectedScenario.metadata.title ?? selectedScenario.metadata.default_title ?? '')
    : '';
  const selectedChoiceCondition =
    selectedScenario?.type === 'menu_choice' ? String(selectedScenario.metadata.condition ?? '') : '';
  const exportedFileEntries = useMemo(
    () => Object.entries(exportedFiles ?? {}).sort(([pathA], [pathB]) => pathA.localeCompare(pathB)),
    [exportedFiles],
  );

  useEffect(() => {
    if (!reactFlowInstance || projection.nodes.length === 0) {
      return;
    }

    const viewportKey = `${graph.project_id}:${projection.nodes.length}:${projection.edges.length}`;
    if (initialViewportKeyRef.current === viewportKey) {
      return;
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
  }, [graph.project_id, projection.edges.length, projection.nodes, reactFlowInstance]);

  const focusNode = (nodeId: string) => {
    const node = projection.nodes.find((candidate) => candidate.id === nodeId);
    const position = getAbsoluteNodePosition(projection.nodes, nodeId);

    if (!node || !position) {
      return;
    }

    setSelectedNodeId(nodeId);
    setSearchQuery('');
    reactFlowInstance?.setCenter(
      position.x + Number(node.width ?? 0) / 2,
      position.y + Number(node.height ?? 0) / 2,
      { zoom: 1.05, duration: 320 },
    );
  };

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      const point = reactFlowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const hitNode = point ? findProjectGraphNodeAtCanvasPoint(interactiveNodesRef.current, point) : null;

      setSelectedNodeId(hitNode?.id ?? null);
    },
    [reactFlowInstance],
  );

  return (
    <div className={className ? `project-graph-canvas ${className}` : 'project-graph-canvas'}>
      <div className="project-graph-canvas__toolbar">
        {onExportProjectGraph ? (
          <button className="project-graph-canvas__command" onClick={onExportProjectGraph} type="button">
            Export
          </button>
        ) : null}
        {exportStatus ? <div className="project-graph-canvas__status">{exportStatus}</div> : null}
        {saveStatus ? <div className="project-graph-canvas__status">{saveStatus}</div> : null}
        <input
          aria-label="Search nodes"
          className="project-graph-canvas__search"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search nodes"
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
            {searchResults.length === 0 ? <div className="project-graph-canvas__empty">No matches</div> : null}
          </div>
        ) : null}
      </div>

      {selectedScenario ? (
        <div className="project-graph-canvas__node-editor">
          <div className="project-graph-canvas__panel-title">{selectedScenario.type}</div>
          <label className="project-graph-canvas__field">
            <span>{selectedContentLabel}</span>
            <textarea
              aria-label="Edit scenario node content"
              className="project-graph-canvas__node-editor-input"
              onChange={(event) => onScenarioContentChange?.(selectedScenario.id, event.target.value)}
              value={selectedScenario.content}
            />
          </label>
          {selectedScenario.type === 'menu_choice' ? (
            <label className="project-graph-canvas__field">
              <span>Choice condition</span>
              <input
                aria-label="Edit menu choice condition"
                className="project-graph-canvas__node-editor-line-input"
                onChange={(event) => {
                  const condition = event.target.value;
                  onScenarioContentChange?.(
                    selectedScenario.id,
                    menuChoiceLineWithCondition(selectedScenario.content, condition),
                  );
                  onScenarioMetadataChange?.(selectedScenario.id, {
                    condition: condition.trim() ? condition.trim() : null,
                  });
                }}
                value={selectedChoiceCondition}
              />
            </label>
          ) : null}
          {selectedScenario.type === 'action' ? (
            <label className="project-graph-canvas__field">
              <span>Action title</span>
              <input
                aria-label="Edit action block title"
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
          ) : null}
        </div>
      ) : null}

      {problems.length > 0 ? (
        <div className="project-graph-canvas__problems">
          <div className="project-graph-canvas__panel-title">Problems</div>
          {problems.map((problem) => (
            <button
              className={`project-graph-canvas__problem project-graph-canvas__problem--${problem.severity}`}
              key={problem.id}
              onClick={() => (problem.nodeId ? focusNode(problem.nodeId) : undefined)}
              type="button"
            >
              <span>{problem.code}</span>
              <small>{problem.message}</small>
            </button>
          ))}
        </div>
      ) : null}

      {exportedFileEntries.length > 0 ? (
        <div className="project-graph-canvas__export-results">
          <div className="project-graph-canvas__panel-title">Exported Files</div>
          {exportedFileEntries.map(([path, content]) => (
            <section className="project-graph-canvas__export-file" key={path}>
              <div className="project-graph-canvas__export-file-name">{path}</div>
              <pre>{content}</pre>
            </section>
          ))}
        </div>
      ) : null}

      <ReactFlow
        edges={projection.edges}
        elementsSelectable
        maxZoom={2.5}
        minZoom={0.08}
        nodes={interactiveNodes}
        nodesConnectable={false}
        nodesDraggable={false}
        edgeTypes={projectGraphEdgeTypes}
        nodeTypes={projectGraphNodeTypes}
        onInit={setReactFlowInstance}
        onNodesChange={handleNodesChange}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDragStop={(_, node: Node) => onEntityPositionChange?.(node.id, node.position)}
        onPaneClick={handlePaneClick}
      >
        <Background gap={32} size={1} />
        <MiniMap
          className="project-graph-canvas__minimap"
          maskColor="rgba(148, 163, 184, 0.16)"
          pannable
          zoomable
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export const ProjectGraphCanvas = (props: ProjectGraphCanvasProps) => (
  <ReactFlowProvider>
    <ProjectGraphCanvasInner {...props} />
  </ReactFlowProvider>
);

export default ProjectGraphCanvas;
