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
  const selectedContentLabel = selectedScenario
    ? (contentEditorLabelByType.get(selectedScenario.type) ?? 'Scenario content')
    : 'Scenario content';
  const selectedChoiceCondition =
    selectedScenario?.type === 'menu_choice' ? String(selectedScenario.metadata.condition ?? '') : '';
  const exportedFileEntries = useMemo(
    () => Object.entries(exportedFiles ?? {}).sort(([pathA], [pathB]) => pathA.localeCompare(pathB)),
    [exportedFiles],
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
