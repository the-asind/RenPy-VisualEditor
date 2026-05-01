import type { Edge, Node } from '@xyflow/react';

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphSize {
  width: number;
  height: number;
}

export interface GraphVisual {
  position: GraphPoint;
  size: GraphSize;
}

export interface SourceSpan {
  start_line: number;
  end_line: number;
}

export interface FileFrameSnapshot {
  id: string;
  path: string;
  order: string;
  visual: GraphVisual;
}

export interface LabelFrameSnapshot {
  id: string;
  file_id: string;
  parent_label_id: string | null;
  name: string;
  qualified_name: string;
  scope: 'global' | 'local' | 'nested';
  label_start_node_id: string;
  source_span: SourceSpan | null;
  visual: GraphVisual;
}

export interface LabelStartNodeSnapshot {
  id: string;
  file_id: string;
  label_id: string;
  qualified_name: string;
  content: string;
  visual: GraphVisual;
}

export interface ScenarioNodeSnapshot {
  id: string;
  file_id: string;
  label_id: string;
  parent_node_id: string | null;
  type: string;
  content: string;
  order: string;
  source_span: SourceSpan | null;
  metadata: Record<string, unknown>;
  visual: GraphVisual;
}

export interface FlowEdgeSnapshot {
  id: string;
  source_node_id: string;
  target_node_id: string;
  kind: 'jump' | 'call';
  metadata: Record<string, unknown>;
}

export interface GraphDiagnosticSnapshot {
  id: string;
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  blocking: boolean;
  file_id: string | null;
  label_id: string | null;
  node_id: string | null;
  source_span: SourceSpan | null;
  metadata: Record<string, unknown>;
}

export interface ProjectGraphSnapshot {
  project_id: string;
  files: FileFrameSnapshot[];
  labels: LabelFrameSnapshot[];
  label_starts: LabelStartNodeSnapshot[];
  nodes: ScenarioNodeSnapshot[];
  edges: FlowEdgeSnapshot[];
  diagnostics: GraphDiagnosticSnapshot[];
  source_index: Record<string, unknown>;
}

export interface ProjectGraphProjection {
  nodes: Node[];
  edges: Edge[];
}


const sourceOrder = (item: { source_span: SourceSpan | null; order?: string }): [number, string] => [
  item.source_span?.start_line ?? Number.MAX_SAFE_INTEGER,
  item.order ?? '',
];

const compareSourceOrder = <T extends { source_span: SourceSpan | null; order?: string }>(a: T, b: T): number => {
  const [aLine, aOrder] = sourceOrder(a);
  const [bLine, bOrder] = sourceOrder(b);
  if (aLine !== bLine) {
    return aLine - bLine;
  }
  return aOrder.localeCompare(bOrder);
};

export const projectGraphToReactFlow = (graph: ProjectGraphSnapshot): ProjectGraphProjection => {
  const nodes: Node[] = [];

  for (const file of [...graph.files].sort((a, b) => a.order.localeCompare(b.order))) {
    nodes.push({
      id: file.id,
      type: 'projectFrame',
      position: file.visual.position,
      data: {
        kind: 'file',
        path: file.path,
        title: file.path,
        original: file,
      },
      draggable: true,
      selectable: true,
      width: file.visual.size.width,
      height: file.visual.size.height,
    });
  }

  for (const label of [...graph.labels].sort(compareSourceOrder)) {
    nodes.push({
      id: label.id,
      type: 'labelFrame',
      parentId: label.parent_label_id ?? label.file_id,
      extent: 'parent',
      position: label.visual.position,
      data: {
        kind: 'label',
        name: label.name,
        qualifiedName: label.qualified_name,
        title: label.qualified_name,
        scope: label.scope,
        original: label,
      },
      draggable: true,
      selectable: true,
      width: label.visual.size.width,
      height: label.visual.size.height,
    });
  }

  for (const start of graph.label_starts) {
    nodes.push({
      id: start.id,
      type: 'labelStart',
      parentId: start.label_id,
      extent: 'parent',
      position: start.visual.position,
      data: {
        kind: 'labelStart',
        qualifiedName: start.qualified_name,
        content: start.content,
        title: start.qualified_name,
        original: start,
      },
      draggable: true,
      selectable: true,
      width: start.visual.size.width,
      height: start.visual.size.height,
    });
  }

  for (const scenario of [...graph.nodes].sort(compareSourceOrder)) {
    nodes.push({
      id: scenario.id,
      type: 'scenarioNode',
      parentId: scenario.parent_node_id ?? scenario.label_id,
      extent: 'parent',
      position: scenario.visual.position,
      data: {
        kind: 'scenario',
        scenarioType: scenario.type,
        content: scenario.content,
        title: scenario.type,
        metadata: scenario.metadata,
        original: scenario,
      },
      draggable: true,
      selectable: true,
      width: scenario.visual.size.width,
      height: scenario.visual.size.height,
    });
  }

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    type: 'smoothstep',
    animated: edge.kind === 'call',
    label: edge.kind,
    data: {
      kind: edge.kind,
      metadata: edge.metadata,
      original: edge,
    },
  }));

  return { nodes, edges };
};
