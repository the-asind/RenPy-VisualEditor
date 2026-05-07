import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  direction?: 'horizontal' | 'vertical';
}

const formatPathNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export const buildNearTargetStepPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetOffset = NEAR_TARGET_TURN_OFFSET,
  direction = 'horizontal',
}: NearTargetStepPathParams): string => {
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
  const direction = data?.direction === 'vertical' ? 'vertical' : 'horizontal';
  const path = buildNearTargetStepPath({ sourceX, sourceY, targetX, targetY, targetOffset, direction });

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
      const dragGroupIds = new Set(getDragGroupIds(initialNode));
      const initialPositionsById = new Map(
        interactiveNodesRef.current
          .filter((node) => dragGroupIds.has(node.id))
          .map((node) => [node.id, node.position]),
      );

      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startPosition = initialNode.position;
      const zoom = reactFlowInstance?.getZoom() ?? 1;
      let latestPosition = startPosition;

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
        setInteractiveNodes((currentNodes) =>
          currentNodes.map((node) => {
            const initialPosition = initialPositionsById.get(node.id);
            return initialPosition
              ? { ...node, position: { x: initialPosition.x + delta.x, y: initialPosition.y + delta.y } }
              : node;
          }),
        );
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
        onEntityPositionChange?.(nodeId, latestPosition);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [onEntityPositionChange, reactFlowInstance],
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
        onPaneClick={() => setSelectedNodeId(null)}
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
