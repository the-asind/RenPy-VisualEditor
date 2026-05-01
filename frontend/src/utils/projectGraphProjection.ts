import { MarkerType, type Edge, type Node } from '@xyflow/react';

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

type LayoutNode = Node & {
  position: GraphPoint;
  width: number;
  height: number;
  parentId?: string;
};

const FRAME_PADDING = 32;
const SIBLING_GAP = 40;

const clonePoint = (point: GraphPoint): GraphPoint => ({ x: point.x, y: point.y });

const normalizeSize = (size: GraphSize): GraphSize => ({
  width: Math.max(size.width, 160),
  height: Math.max(size.height, 80),
});

const overlaps = (a: LayoutNode, b: LayoutNode): boolean =>
  a.position.x < b.position.x + b.width &&
  a.position.x + a.width > b.position.x &&
  a.position.y < b.position.y + b.height &&
  a.position.y + a.height > b.position.y;

const buildChildrenByParent = (nodes: LayoutNode[]): Map<string, LayoutNode[]> => {
  const childrenByParent = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    const parentKey = node.parentId ?? '__root__';
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(node);
    childrenByParent.set(parentKey, children);
  }
  return childrenByParent;
};

const shiftOverlappingSiblings = (siblings: LayoutNode[], direction: 'horizontal' | 'vertical'): void => {
  const placed: LayoutNode[] = [];

  for (const sibling of siblings) {
    while (placed.some((placedSibling) => overlaps(sibling, placedSibling))) {
      if (direction === 'horizontal') {
        sibling.position.x = Math.max(
          sibling.position.x,
          ...placed.map((placedSibling) => placedSibling.position.x + placedSibling.width + SIBLING_GAP),
        );
      } else {
        sibling.position.y = Math.max(
          sibling.position.y,
          ...placed.map((placedSibling) => placedSibling.position.y + placedSibling.height + SIBLING_GAP),
        );
      }
    }
    placed.push(sibling);
  }
};

const expandParentsToFitChildren = (nodes: LayoutNode[]): void => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenByParent(nodes);

  const expand = (parent: LayoutNode): void => {
    const children = childrenByParent.get(parent.id) ?? [];
    for (const child of children) {
      expand(child);
    }

    const requiredWidth = Math.max(
      parent.width,
      ...children.map((child) => child.position.x + child.width + FRAME_PADDING),
    );
    const requiredHeight = Math.max(
      parent.height,
      ...children.map((child) => child.position.y + child.height + FRAME_PADDING),
    );

    parent.width = requiredWidth;
    parent.height = requiredHeight;
  };

  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) {
      expand(node);
    }
  }
};

const normalizeLayout = (nodes: LayoutNode[]): LayoutNode[] => {
  const arrangeSiblings = (): void => {
    const childrenByParent = buildChildrenByParent(nodes);
    for (const [parentId, siblings] of childrenByParent.entries()) {
      shiftOverlappingSiblings(siblings, parentId === '__root__' ? 'horizontal' : 'vertical');
    }
  };

  arrangeSiblings();
  expandParentsToFitChildren(nodes);
  arrangeSiblings();
  expandParentsToFitChildren(nodes);

  return nodes;
};

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
  const nodes: LayoutNode[] = [];

  for (const file of [...graph.files].sort((a, b) => a.order.localeCompare(b.order))) {
    const size = normalizeSize(file.visual.size);
    nodes.push({
      id: file.id,
      type: 'projectFrame',
      position: clonePoint(file.visual.position),
      data: {
        kind: 'file',
        path: file.path,
        title: file.path,
        original: file,
      },
      draggable: true,
      selectable: true,
      width: size.width,
      height: size.height,
    });
  }

  for (const label of [...graph.labels].sort(compareSourceOrder)) {
    const size = normalizeSize(label.visual.size);
    nodes.push({
      id: label.id,
      type: 'labelFrame',
      parentId: label.parent_label_id ?? label.file_id,
      extent: 'parent',
      position: clonePoint(label.visual.position),
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
      width: size.width,
      height: size.height,
    });
  }

  for (const start of graph.label_starts) {
    const size = normalizeSize(start.visual.size);
    nodes.push({
      id: start.id,
      type: 'labelStart',
      parentId: start.label_id,
      extent: 'parent',
      position: clonePoint(start.visual.position),
      data: {
        kind: 'labelStart',
        qualifiedName: start.qualified_name,
        content: start.content,
        title: start.qualified_name,
        original: start,
      },
      draggable: true,
      selectable: true,
      width: size.width,
      height: size.height,
    });
  }

  for (const scenario of [...graph.nodes].sort(compareSourceOrder)) {
    const size = normalizeSize(scenario.visual.size);
    nodes.push({
      id: scenario.id,
      type: 'scenarioNode',
      parentId: scenario.parent_node_id ?? scenario.label_id,
      extent: 'parent',
      position: clonePoint(scenario.visual.position),
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
      width: size.width,
      height: size.height,
    });
  }

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    type: 'smoothstep',
    animated: edge.kind === 'call',
    label: edge.kind,
    className: `project-edge project-edge--${edge.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      opacity: edge.kind === 'call' ? 0.72 : 0.52,
      strokeWidth: 2,
      strokeDasharray: edge.kind === 'jump' ? '8 6' : undefined,
    },
    data: {
      kind: edge.kind,
      metadata: edge.metadata,
      original: edge,
    },
  }));

  return { nodes: normalizeLayout(nodes), edges };
};
