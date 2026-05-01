import { memo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  projectGraphToReactFlow,
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
}

export const ProjectGraphCanvas = ({ graph, className }: ProjectGraphCanvasProps) => {
  const projection = projectGraphToReactFlow(graph);

  return (
    <ReactFlowProvider>
      <div className={className ? `project-graph-canvas ${className}` : 'project-graph-canvas'}>
        <ReactFlow
          nodes={projection.nodes}
          edges={projection.edges}
          nodeTypes={projectGraphNodeTypes}
          fitView
          minZoom={0.08}
          maxZoom={2.5}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background gap={32} size={1} />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
};

export default ProjectGraphCanvas;
