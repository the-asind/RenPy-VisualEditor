import { memo, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
  type Node,
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

const ProjectFrameNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--file">
    <div className="pg-node__eyebrow">file</div>
    <div className="pg-node__title">{String(data.title ?? '')}</div>
  </div>
));

const LabelFrameNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--label-frame">
    <div className="pg-node__eyebrow">label</div>
    <div className="pg-node__title">{String(data.title ?? '')}</div>
  </div>
));

const LabelStartNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--label-start">
    <Handle type="target" position={Position.Left} />
    <div className="pg-node__eyebrow">start</div>
    <div className="pg-node__title">{String(data.qualifiedName ?? '')}</div>
    <div className="pg-node__content">{String(data.content ?? '')}</div>
    <Handle type="source" position={Position.Right} />
  </div>
));

const ScenarioNode = memo(({ data }: NodeProps) => (
  <div className="pg-node pg-node--scenario" data-scenario-type={String(data.scenarioType ?? '')}>
    <Handle type="target" position={Position.Left} />
    <div className="pg-node__eyebrow">{String(data.scenarioType ?? 'node')}</div>
    <div className="pg-node__content">{String(data.content ?? '')}</div>
    <Handle type="source" position={Position.Right} />
  </div>
));

export const projectGraphNodeTypes: NodeTypes = {
  projectFrame: ProjectFrameNode,
  labelFrame: LabelFrameNode,
  labelStart: LabelStartNode,
  scenarioNode: ScenarioNode,
};

export interface ProjectGraphCanvasProps {
  graph: ProjectGraphSnapshot;
  className?: string;
  exportStatus?: string | null;
  saveStatus?: string | null;
  onExportProjectGraph?: () => void;
  onEntityPositionChange?: (entityId: string, position: GraphPoint) => void;
  onScenarioContentChange?: (nodeId: string, content: string) => void;
}

const ProjectGraphCanvasInner = ({
  graph,
  className,
  exportStatus,
  saveStatus,
  onExportProjectGraph,
  onEntityPositionChange,
  onScenarioContentChange,
}: ProjectGraphCanvasProps) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const projection = useMemo(() => projectGraphToReactFlow(graph), [graph]);
  const searchResults = useMemo(() => searchProjectGraph(graph, searchQuery), [graph, searchQuery]);
  const problems = useMemo(() => projectGraphDiagnosticsToProblems(graph), [graph]);
  const selectedScenario = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const nodes = useMemo(
    () =>
      projection.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [projection.nodes, selectedNodeId],
  );

  const focusNode = (nodeId: string) => {
    const node = projection.nodes.find((candidate) => candidate.id === nodeId);
    const position = getAbsoluteNodePosition(projection.nodes, nodeId);

    if (!node || !position) {
      return;
    }

    setSelectedNodeId(nodeId);
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
          <textarea
            aria-label="Edit scenario node content"
            className="project-graph-canvas__node-editor-input"
            onChange={(event) => onScenarioContentChange?.(selectedScenario.id, event.target.value)}
            value={selectedScenario.content}
          />
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

      <ReactFlow
        edges={projection.edges}
        elementsSelectable
        fitView
        maxZoom={2.5}
        minZoom={0.08}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable
        nodeTypes={projectGraphNodeTypes}
        onInit={setReactFlowInstance}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDragStop={(_, node: Node) => onEntityPositionChange?.(node.id, node.position)}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background gap={32} size={1} />
        <MiniMap pannable zoomable />
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
