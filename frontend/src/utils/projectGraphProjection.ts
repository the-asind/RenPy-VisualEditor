import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';

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

export interface ProjectGraphSearchResult {
  nodeId: string;
  fileId: string;
  labelId: string;
  kind: 'labelStart' | 'scenario';
  title: string;
  content: string;
}

export interface ProjectGraphProblem {
  id: string;
  code: string;
  severity: GraphDiagnosticSnapshot['severity'];
  message: string;
  blocking: boolean;
  nodeId: string | null;
  fileId: string | null;
  labelId: string | null;
}

const PROJECT_GRAPH_REACT_FLOW_NODE_CLASS = 'project-graph-rf-node';

type LayoutNode = Node & {
  position: GraphPoint;
  width: number;
  height: number;
  parentId?: string;
};

const FRAME_PADDING = 32;
const SIBLING_GAP = 40;
const COMPACT_SIBLING_GAP = 24;
const COMPACT_SCENARIO_CHILD_GAP = 8;
const BRANCH_LANE_GAP = 64;
const FLOW_COLUMN_GAP = 96;
const BRANCH_ROW_GAP = 72;
const TOP_DOWN_MAIN_CENTER_X = 520;
const TOP_DOWN_LABEL_TOP_PADDING = 96;
const LABEL_FRAME_CONTENT_TOP_PADDING = 72;
const TOP_DOWN_FLOW_ROW_GAP = 84;
const TOP_DOWN_BRANCH_HEADER_GAP = 0;
const TOP_DOWN_BRANCH_COLUMN_GAP = 420;
const TOP_DOWN_REJOIN_TURN_OFFSET = 24;
const BRANCH_HEADER_HEIGHT = 40;
const COMPACT_FRAME_MIN_SIZE: Record<string, GraphSize> = {
  projectFrame: { width: 560, height: 260 },
  labelFrame: { width: 520, height: 180 },
  scenarioNode: { width: 320, height: 88 },
  labelStart: { width: 280, height: 72 },
};

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

const scenarioKind = (node: LayoutNode): string =>
  node.type === 'scenarioNode' && typeof node.data?.scenarioType === 'string' ? node.data.scenarioType : '';

const isConditionalBranchNode = (node: LayoutNode): boolean => ['if', 'elif', 'else'].includes(scenarioKind(node));

const isBranchHeaderNode = (node: LayoutNode): boolean => ['elif', 'else'].includes(scenarioKind(node));

const isMenuNode = (node: LayoutNode): boolean => scenarioKind(node) === 'menu';

const isMenuChoiceNode = (node: LayoutNode): boolean => scenarioKind(node) === 'menu_choice';

const isBranchingParentNode = (node: LayoutNode | undefined): boolean =>
  !!node && node.type === 'scenarioNode' && ['if', 'elif', 'else', 'menu'].includes(scenarioKind(node));

const isConditionalScenario = (node: ScenarioNodeSnapshot | undefined): boolean =>
  !!node && ['if', 'elif', 'else'].includes(node.type);

const isBranchHeaderScenario = (node: ScenarioNodeSnapshot | undefined): boolean =>
  !!node && ['elif', 'else'].includes(node.type);

const isMenuScenario = (node: ScenarioNodeSnapshot | undefined): boolean => node?.type === 'menu';

const isMenuChoiceScenario = (node: ScenarioNodeSnapshot | undefined): boolean => node?.type === 'menu_choice';

const isMenuPromptScenario = (node: ScenarioNodeSnapshot | undefined): boolean => node?.type === 'menu_prompt';

const isVisualBranchContainerScenario = (node: ScenarioNodeSnapshot | undefined): boolean =>
  isConditionalScenario(node) || isMenuScenario(node) || isMenuChoiceScenario(node);

const hasManualScenarioPosition = (node: ScenarioNodeSnapshot): boolean => node.metadata?._manual_position === true;

const scenarioParentNodeId = (node: LayoutNode): string | null => {
  const original = node.data?.original;
  return typeof original === 'object' &&
    original !== null &&
    'parent_node_id' in original &&
    (typeof original.parent_node_id === 'string' || original.parent_node_id === null)
    ? original.parent_node_id
    : null;
};

const hasManualLayoutPosition = (node: LayoutNode): boolean => {
  const original = node.data?.original;
  return (
    typeof original === 'object' &&
    original !== null &&
    'metadata' in original &&
    typeof original.metadata === 'object' &&
    original.metadata !== null &&
    '_manual_position' in original.metadata &&
    original.metadata._manual_position === true
  );
};

const hasAutoBranchLayout = (node: LayoutNode): boolean => node.data?.autoBranchLayout === true;

const withFixedSize = <T extends LayoutNode>(node: T): T => ({
  ...node,
  style: {
    ...(node.style ?? {}),
    width: node.width,
    height: node.height,
  },
});

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

const reserveFrameHeaderSpace = (siblings: LayoutNode[], parent: LayoutNode | undefined): void => {
  if (parent?.type !== 'labelFrame') {
    return;
  }

  for (const sibling of siblings) {
    sibling.position.y = Math.max(sibling.position.y, LABEL_FRAME_CONTENT_TOP_PADDING);
  }
};

const hasSiblingOverlap = (siblings: LayoutNode[]): boolean => {
  for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < siblings.length; rightIndex += 1) {
      if (overlaps(siblings[leftIndex], siblings[rightIndex])) {
        return true;
      }
    }
  }
  return false;
};

const hasStackedSiblingPositions = (siblings: LayoutNode[]): boolean => {
  const seenPositions = new Set<string>();
  for (const sibling of siblings) {
    const positionKey = `${sibling.position.x}:${sibling.position.y}`;
    if (seenPositions.has(positionKey)) {
      return true;
    }
    seenPositions.add(positionKey);
  }
  return false;
};

const hasNegativePosition = (siblings: LayoutNode[]): boolean =>
  siblings.some((sibling) => sibling.position.x < 0 || sibling.position.y < 0);

const hasImportedScenarioSpread = (siblings: LayoutNode[], parent: LayoutNode | undefined): boolean => {
  if (parent?.type !== 'scenarioNode') {
    return false;
  }

  if (siblings.length === 1) {
    const [child] = siblings;
    return child.position.x > 80 || child.position.y > 180;
  }

  const minY = Math.min(...siblings.map((sibling) => sibling.position.y));
  const maxY = Math.max(...siblings.map((sibling) => sibling.position.y + sibling.height));
  const expectedHeight =
    siblings.reduce((height, sibling) => height + sibling.height, 0) + SIBLING_GAP * Math.max(0, siblings.length - 1);

  return maxY - minY > expectedHeight + 160;
};

const isLabelStartFirst = (siblings: LayoutNode[], parent: LayoutNode | undefined): boolean => {
  if (parent?.type !== 'labelFrame') {
    return true;
  }

  const start = siblings.find((sibling) => sibling.type === 'labelStart');
  if (!start) {
    return true;
  }

  return siblings.every(
    (sibling) => sibling.id === start.id || start.position.y < sibling.position.y || start.position.x < sibling.position.x,
  );
};

const groupNeedsCompaction = (
  siblings: LayoutNode[],
  parent: LayoutNode | undefined,
  direction: 'horizontal' | 'vertical',
): boolean => {
  if (siblings.length === 0) {
    return false;
  }

  if (hasNegativePosition(siblings) || hasStackedSiblingPositions(siblings)) {
    return true;
  }

  if (!isLabelStartFirst(siblings, parent)) {
    return true;
  }

  return direction === 'vertical' && hasImportedScenarioSpread(siblings, parent);
};

const layoutSourceLine = (node: LayoutNode): number =>
  typeof node.data?.layoutSourceLine === 'number' ? node.data.layoutSourceLine : Number.MAX_SAFE_INTEGER;

const layoutOrder = (node: LayoutNode): string =>
  typeof node.data?.layoutOrder === 'string' ? node.data.layoutOrder : '';

const compareLayoutSiblings = (parent: LayoutNode | undefined) => (a: LayoutNode, b: LayoutNode): number => {
  if (parent?.type === 'labelFrame') {
    if (a.type === 'labelStart' && b.type !== 'labelStart') {
      return -1;
    }
    if (b.type === 'labelStart' && a.type !== 'labelStart') {
      return 1;
    }
  }

  const aLine = layoutSourceLine(a);
  const bLine = layoutSourceLine(b);
  if (aLine !== bLine) {
    return aLine - bLine;
  }

  return layoutOrder(a).localeCompare(layoutOrder(b));
};

const compactSiblings = (
  siblings: LayoutNode[],
  parent: LayoutNode | undefined,
  direction: 'horizontal' | 'vertical',
): void => {
  siblings.sort(compareLayoutSiblings(parent));

  if (direction === 'horizontal') {
    let cursorX = 0;
    for (const sibling of siblings) {
      sibling.position.x = cursorX;
      sibling.position.y = Math.max(0, sibling.position.y);
      cursorX += sibling.width + SIBLING_GAP;
    }
    return;
  }

  const startX = parent?.type === 'projectFrame' ? 48 : parent?.type === 'labelFrame' ? 32 : 24;
  const startY =
    parent?.type === 'scenarioNode'
      ? 40
      : parent?.type === 'labelFrame'
        ? LABEL_FRAME_CONTENT_TOP_PADDING
        : parent?.type === 'projectFrame'
          ? 48
          : 32;
  const gap = parent?.type === 'scenarioNode' ? COMPACT_SCENARIO_CHILD_GAP : COMPACT_SIBLING_GAP;
  let cursorY = startY;
  let index = 0;

  while (index < siblings.length) {
    const sibling = siblings[index];
    if (isConditionalBranchNode(sibling)) {
      const group = [sibling];
      let nextIndex = index + 1;
      while (nextIndex < siblings.length && isConditionalBranchNode(siblings[nextIndex])) {
        group.push(siblings[nextIndex]);
        nextIndex += 1;
      }

      let cursorX = startX;
      let rowHeight = 0;
      for (const branch of group) {
        branch.position.x = cursorX;
        branch.position.y = cursorY;
        cursorX += branch.width + BRANCH_LANE_GAP;
        rowHeight = Math.max(rowHeight, branch.height);
      }
      cursorY += rowHeight + gap;
      index = nextIndex;
      continue;
    }

    sibling.position.x = startX;
    sibling.position.y = cursorY;
    cursorY += sibling.height + gap;
    index += 1;
  }
};

const shiftOverlappingSiblings = (
  siblings: LayoutNode[],
  parent: LayoutNode | undefined,
  direction: 'horizontal' | 'vertical',
): void => {
  siblings.sort(compareLayoutSiblings(parent));
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

const compactMinSize = (node: LayoutNode): GraphSize => COMPACT_FRAME_MIN_SIZE[node.type ?? ''] ?? {
  width: node.width,
  height: node.height,
};

const addParentAndAncestors = (nodeId: string, byId: Map<string, LayoutNode>, parentIds: Set<string>): void => {
  let current = byId.get(nodeId);
  while (current) {
    parentIds.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
};

const expandParentsToFitChildren = (nodes: LayoutNode[], compactParentIds: Set<string>): void => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenByParent(nodes);

  const expand = (parent: LayoutNode): void => {
    const children = childrenByParent.get(parent.id) ?? [];
    for (const child of children) {
      expand(child);
    }

    const baseSize = compactParentIds.has(parent.id) ? compactMinSize(parent) : parent;
    const requiredWidth = Math.max(
      baseSize.width,
      ...children.map((child) => child.position.x + child.width + FRAME_PADDING),
    );
    const requiredHeight = Math.max(
      baseSize.height,
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
  const compactParentIds = new Set<string>();
  const compactGroupIds = new Set<string>();

  const arrangeSiblings = (): void => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const childrenByParent = buildChildrenByParent(nodes);
    for (const [parentId, siblings] of childrenByParent.entries()) {
      const direction = parentId === '__root__' ? 'horizontal' : 'vertical';
      const parent = parentId === '__root__' ? undefined : byId.get(parentId);
      const groupKey = parent?.id ?? '__root__';
      reserveFrameHeaderSpace(siblings, parent);

      if (siblings.some(hasAutoBranchLayout)) {
        const autoLaidOutSiblings = siblings.filter(hasAutoBranchLayout);
        const remainingSiblings = siblings.filter((sibling) => !hasAutoBranchLayout(sibling));
        const placed: LayoutNode[] = [...autoLaidOutSiblings];
        let cursorY =
          Math.max(
            0,
            ...autoLaidOutSiblings.map((sibling) => sibling.position.y + sibling.height),
          ) + COMPACT_SIBLING_GAP;

        for (const sibling of remainingSiblings.sort(compareLayoutSiblings(parent))) {
          if (sibling.type === 'labelFrame') {
            sibling.position.y = Math.max(sibling.position.y, cursorY);
            cursorY = sibling.position.y + sibling.height + COMPACT_SIBLING_GAP;
            placed.push(sibling);
            continue;
          }

          while (placed.some((placedSibling) => overlaps(sibling, placedSibling))) {
            sibling.position.y = Math.max(sibling.position.y, cursorY);
          }
          cursorY = Math.max(cursorY, sibling.position.y + sibling.height + COMPACT_SIBLING_GAP);
          placed.push(sibling);
        }

        if (parent?.type === 'projectFrame' || parent?.type === 'labelFrame') {
          addParentAndAncestors(parent.id, byId, compactParentIds);
        }
        continue;
      }

      if (siblings.some(hasManualLayoutPosition)) {
        if (parent?.type === 'projectFrame' || parent?.type === 'labelFrame') {
          addParentAndAncestors(parent.id, byId, compactParentIds);
        }
        continue;
      }

      if (compactGroupIds.has(groupKey) || groupNeedsCompaction(siblings, parent, direction)) {
        compactGroupIds.add(groupKey);
        compactSiblings(siblings, parent, direction);
        if (parent) {
          addParentAndAncestors(parent.id, byId, compactParentIds);
        }
      } else {
        shiftOverlappingSiblings(siblings, parent, direction);
      }

      if (parent?.type === 'projectFrame' || parent?.type === 'labelFrame') {
        addParentAndAncestors(parent.id, byId, compactParentIds);
      }
    }
  };

  for (let pass = 0; pass < 4; pass += 1) {
    arrangeSiblings();
    expandParentsToFitChildren(nodes, compactParentIds);
  }

  return nodes;
};

export const getAbsoluteNodePosition = (nodes: Node[], nodeId: string): GraphPoint | null => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  let current = byId.get(nodeId);

  if (!current) {
    return null;
  }

  const position = { x: 0, y: 0 };

  while (current) {
    if (visited.has(current.id)) {
      return null;
    }
    visited.add(current.id);
    position.x += current.position.x;
    position.y += current.position.y;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return position;
};

export const searchProjectGraph = (graph: ProjectGraphSnapshot, query: string): ProjectGraphSearchResult[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const labelStartResults = graph.label_starts
    .filter((node) => `${node.qualified_name}\n${node.content}`.toLocaleLowerCase().includes(normalizedQuery))
    .map<ProjectGraphSearchResult>((node) => ({
      nodeId: node.id,
      fileId: node.file_id,
      labelId: node.label_id,
      kind: 'labelStart',
      title: node.qualified_name,
      content: node.content,
    }));

  const scenarioResults = graph.nodes
    .filter((node) => `${node.type}\n${node.content}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort(compareSourceOrder)
    .map<ProjectGraphSearchResult>((node) => ({
      nodeId: node.id,
      fileId: node.file_id,
      labelId: node.label_id,
      kind: 'scenario',
      title: node.type,
      content: node.content,
    }));

  return [...labelStartResults, ...scenarioResults];
};

export const projectGraphDiagnosticsToProblems = (graph: ProjectGraphSnapshot): ProjectGraphProblem[] =>
  graph.diagnostics.map((diagnostic) => ({
    id: diagnostic.id,
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    blocking: diagnostic.blocking,
    nodeId: diagnostic.node_id,
    fileId: diagnostic.file_id,
    labelId: diagnostic.label_id,
  }));

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

const domainChildrenKey = (labelId: string, parentNodeId: string | null): string =>
  `${labelId}:${parentNodeId ?? '__label__'}`;

const buildScenarioChildrenByDomainParent = (graph: ProjectGraphSnapshot): Map<string, ScenarioNodeSnapshot[]> => {
  const childrenByDomainParent = new Map<string, ScenarioNodeSnapshot[]>();
  for (const scenario of graph.nodes) {
    const key = domainChildrenKey(scenario.label_id, scenario.parent_node_id);
    childrenByDomainParent.set(key, [...(childrenByDomainParent.get(key) ?? []), scenario]);
  }

  for (const children of childrenByDomainParent.values()) {
    children.sort(compareSourceOrder);
  }

  return childrenByDomainParent;
};

const buildScenarioDragGroups = (graph: ProjectGraphSnapshot): Map<string, string[]> => {
  const scenariosById = new Map(graph.nodes.map((scenario) => [scenario.id, scenario]));
  const childrenByDomainParent = buildScenarioChildrenByDomainParent(graph);
  const visibleChildrenByParentId = new Map<string, ScenarioNodeSnapshot[]>();

  for (const scenario of graph.nodes) {
    visibleChildrenByParentId.set(
      scenario.id,
      (childrenByDomainParent.get(domainChildrenKey(scenario.label_id, scenario.id)) ?? []).filter(
        (child) => !isMenuPromptScenario(child),
      ),
    );
  }

  const collectDescendants = (scenarioId: string, target: Set<string>): void => {
    for (const child of visibleChildrenByParentId.get(scenarioId) ?? []) {
      target.add(child.id);
      collectDescendants(child.id, target);
    }
  };

  const nearestAttachedBranchHeaderId = (scenario: ScenarioNodeSnapshot): string | null => {
    let parent = scenario.parent_node_id ? scenariosById.get(scenario.parent_node_id) : undefined;
    while (parent) {
      if (isBranchHeaderScenario(parent)) {
        return parent.id;
      }
      parent = parent.parent_node_id ? scenariosById.get(parent.parent_node_id) : undefined;
    }
    return null;
  };

  const groups = new Map<string, string[]>();
  for (const scenario of graph.nodes) {
    if (isMenuPromptScenario(scenario)) {
      continue;
    }

    const groupIds = new Set<string>([scenario.id]);
    collectDescendants(scenario.id, groupIds);

    const attachedHeaderId = nearestAttachedBranchHeaderId(scenario);
    if (attachedHeaderId) {
      groupIds.add(attachedHeaderId);
    }

    groups.set(scenario.id, [...groupIds]);
  }

  return groups;
};

const resolveScenarioVisualParentId = (
  scenario: ScenarioNodeSnapshot,
  scenariosById: Map<string, ScenarioNodeSnapshot>,
): string => {
  const parentScenario = scenario.parent_node_id ? scenariosById.get(scenario.parent_node_id) : undefined;

  if (!parentScenario) {
    return scenario.label_id;
  }

  if (isVisualBranchContainerScenario(parentScenario)) {
    return resolveScenarioVisualParentId(parentScenario, scenariosById);
  }

  return parentScenario.id;
};

const applyConditionalStoryLayout = (nodes: LayoutNode[], graph: ProjectGraphSnapshot): void => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const scenarioLayoutsById = new Map(
    nodes.filter((node) => node.type === 'scenarioNode').map((node) => [node.id, node]),
  );
  const childrenByDomainParent = buildScenarioChildrenByDomainParent(graph);
  const labelsWithBranching = new Set(
    graph.nodes
      .filter(
        (scenario) =>
          isConditionalScenario(scenario) || isMenuScenario(scenario),
      )
      .map((scenario) => scenario.label_id),
  );

  const getChildren = (labelId: string, parentNodeId: string | null): ScenarioNodeSnapshot[] =>
    (childrenByDomainParent.get(domainChildrenKey(labelId, parentNodeId)) ?? []).filter(
      (scenario) => !isMenuPromptScenario(scenario),
    );

  const nodeLeft = (node: LayoutNode): number => node.position.x;
  const nodeRight = (node: LayoutNode): number => node.position.x + node.width;
  const nodeTop = (node: LayoutNode): number => node.position.y;
  const nodeBottom = (node: LayoutNode): number => node.position.y + node.height;
  const placeNodeAtCenter = (node: LayoutNode, centerX: number, y: number): void => {
    node.position.x = centerX - node.width / 2;
    node.position.y = y;
  };

  const combineBounds = (
    current: { leftX: number; rightX: number; topY: number; bottomY: number },
    next: { leftX: number; rightX: number; topY: number; bottomY: number },
  ): { leftX: number; rightX: number; topY: number; bottomY: number } => ({
    leftX: Math.min(current.leftX, next.leftX),
    rightX: Math.max(current.rightX, next.rightX),
    topY: Math.min(current.topY, next.topY),
    bottomY: Math.max(current.bottomY, next.bottomY),
  });

  const layoutList = (
    labelId: string,
    parentNodeId: string | null,
    centerX: number,
    y: number,
  ): { nextY: number; leftX: number; rightX: number; topY: number; bottomY: number; terminals: LayoutNode[] } => {
    const items = getChildren(labelId, parentNodeId);
    let cursorY = y;
    let leftX = centerX;
    let rightX = centerX;
    let topY = y;
    let bottomY = y;
    let terminals: LayoutNode[] = [];
    let index = 0;

    const includeNodeBounds = (node: LayoutNode): void => {
      leftX = Math.min(leftX, nodeLeft(node));
      rightX = Math.max(rightX, nodeRight(node));
      topY = Math.min(topY, nodeTop(node));
      bottomY = Math.max(bottomY, nodeBottom(node));
    };

    const includeResultBounds = (result: { leftX: number; rightX: number; topY: number; bottomY: number }): void => {
      leftX = Math.min(leftX, result.leftX);
      rightX = Math.max(rightX, result.rightX);
      topY = Math.min(topY, result.topY);
      bottomY = Math.max(bottomY, result.bottomY);
    };

    const layoutBranchHead = (
      branch: ScenarioNodeSnapshot,
      branchCenterX: number,
      branchY: number,
    ): { nextY: number; leftX: number; rightX: number; topY: number; bottomY: number; terminals: LayoutNode[] } | null => {
      const branchNode = scenarioLayoutsById.get(branch.id);
      if (!branchNode) {
        return null;
      }

      const branchChildren = getChildren(labelId, branch.id);
      const firstChildNode = branchChildren[0] ? scenarioLayoutsById.get(branchChildren[0].id) : undefined;
      if (isBranchHeaderScenario(branch) && firstChildNode) {
        branchNode.width = firstChildNode.width;
      }
      placeNodeAtCenter(branchNode, branchCenterX, branchY);
      let result = {
        nextY: nodeBottom(branchNode) + TOP_DOWN_FLOW_ROW_GAP,
        leftX: nodeLeft(branchNode),
        rightX: nodeRight(branchNode),
        topY: nodeTop(branchNode),
        bottomY: nodeBottom(branchNode),
        terminals: [branchNode],
      };
      if (branchChildren.length > 0) {
        const childGap = isBranchHeaderScenario(branch) ? TOP_DOWN_BRANCH_HEADER_GAP : TOP_DOWN_FLOW_ROW_GAP;
        const childrenResult = layoutList(
          labelId,
          branch.id,
          branchCenterX,
          nodeBottom(branchNode) + childGap,
        );
        result = {
          nextY: childrenResult.nextY,
          ...combineBounds(result, childrenResult),
          terminals: childrenResult.terminals.length > 0 ? childrenResult.terminals : [branchNode],
        };
      }

      return result;
    };

    const layoutMenuBranches = (
      menu: ScenarioNodeSnapshot,
      menuNode: LayoutNode,
      centerX: number,
      branchStartY: number,
    ): { nextY: number; leftX: number; rightX: number; topY: number; bottomY: number; terminals: LayoutNode[] } => {
      const choices = getChildren(labelId, menu.id).filter(isMenuChoiceScenario);
      let groupBounds = {
        leftX: nodeLeft(menuNode),
        rightX: nodeRight(menuNode),
        topY: nodeTop(menuNode),
        bottomY: nodeBottom(menuNode),
      };
      const branchTerminals: LayoutNode[] = [];

      if (choices.length === 0) {
        return {
          nextY: nodeBottom(menuNode) + TOP_DOWN_FLOW_ROW_GAP,
          ...groupBounds,
          terminals: [menuNode],
        };
      }

      for (const [choiceIndex, choice] of choices.entries()) {
        const choiceCenterX = centerX + (choiceIndex - (choices.length - 1) / 2) * TOP_DOWN_BRANCH_COLUMN_GAP;
        const choiceResult = layoutBranchHead(choice, choiceCenterX, branchStartY);
        if (!choiceResult) {
          continue;
        }

        groupBounds = combineBounds(groupBounds, choiceResult);
        branchTerminals.push(...choiceResult.terminals);
      }

      return {
        nextY: groupBounds.bottomY + TOP_DOWN_FLOW_ROW_GAP,
        ...groupBounds,
        terminals: branchTerminals.length > 0 ? branchTerminals : [menuNode],
      };
    };

    while (index < items.length) {
      const scenario = items[index];
      const layoutNode = scenarioLayoutsById.get(scenario.id);

      if (!layoutNode) {
        index += 1;
        continue;
      }

      if (isConditionalScenario(scenario)) {
        const branches: ScenarioNodeSnapshot[] = [scenario];
        let nextIndex = index + 1;
        while (nextIndex < items.length && isConditionalScenario(items[nextIndex])) {
          branches.push(items[nextIndex]);
          nextIndex += 1;
        }

        placeNodeAtCenter(layoutNode, centerX, cursorY);
        let groupBounds = {
          leftX: nodeLeft(layoutNode),
          rightX: nodeRight(layoutNode),
          topY: nodeTop(layoutNode),
          bottomY: nodeBottom(layoutNode),
        };
        const branchStartY = nodeBottom(layoutNode) + TOP_DOWN_FLOW_ROW_GAP;
        const branchTerminals: LayoutNode[] = [];

        const trueResult = layoutList(
          labelId,
          scenario.id,
          centerX + TOP_DOWN_BRANCH_COLUMN_GAP,
          branchStartY,
        );
        if (trueResult.terminals.length > 0) {
          groupBounds = combineBounds(groupBounds, trueResult);
          branchTerminals.push(...trueResult.terminals);
        } else {
          branchTerminals.push(layoutNode);
        }

        for (const [alternativeIndex, branch] of branches.slice(1).entries()) {
          const branchResult = layoutBranchHead(
            branch,
            centerX - TOP_DOWN_BRANCH_COLUMN_GAP * (alternativeIndex + 1),
            branchStartY,
          );
          if (!branchResult) {
            continue;
          }

          groupBounds = combineBounds(groupBounds, branchResult);
          branchTerminals.push(...branchResult.terminals);
        }

        terminals = branchTerminals;
        cursorY = groupBounds.bottomY + TOP_DOWN_FLOW_ROW_GAP;
        leftX = Math.min(leftX, groupBounds.leftX);
        rightX = Math.max(rightX, groupBounds.rightX);
        topY = Math.min(topY, groupBounds.topY);
        bottomY = Math.max(bottomY, groupBounds.bottomY);
        index = nextIndex;
        continue;
      }

      if (isMenuScenario(scenario)) {
        placeNodeAtCenter(layoutNode, centerX, cursorY);
        const groupResult = layoutMenuBranches(
          scenario,
          layoutNode,
          centerX,
          nodeBottom(layoutNode) + TOP_DOWN_FLOW_ROW_GAP,
        );

        terminals = groupResult.terminals;
        cursorY = groupResult.nextY;
        includeResultBounds(groupResult);
        index += 1;
        continue;
      }

      placeNodeAtCenter(layoutNode, centerX, cursorY);
      includeNodeBounds(layoutNode);

      const childResult = layoutList(
            labelId,
        scenario.id,
        centerX,
        nodeBottom(layoutNode) + TOP_DOWN_FLOW_ROW_GAP,
      );
      const hasChildren = getChildren(labelId, scenario.id).length > 0;
      terminals = hasChildren ? childResult.terminals : [layoutNode];
      if (hasChildren) {
        includeResultBounds(childResult);
        cursorY = childResult.nextY;
      } else {
        cursorY = nodeBottom(layoutNode) + TOP_DOWN_FLOW_ROW_GAP;
      }
      index += 1;
    }

    return { nextY: cursorY, leftX, rightX, topY, bottomY, terminals };
  };

  for (const labelId of labelsWithBranching) {
    const labelNode = byId.get(labelId);
    const labelStart = graph.label_starts.find((start) => start.label_id === labelId);
    const startNode = labelStart ? byId.get(labelStart.id) : undefined;

    if (!labelNode || labelNode.type !== 'labelFrame' || !startNode) {
      continue;
    }

    placeNodeAtCenter(startNode, TOP_DOWN_MAIN_CENTER_X, TOP_DOWN_LABEL_TOP_PADDING);
    layoutList(labelId, null, TOP_DOWN_MAIN_CENTER_X, nodeBottom(startNode) + TOP_DOWN_FLOW_ROW_GAP);

    const labelScenarioNodes = graph.nodes
      .filter((scenario) => scenario.label_id === labelId)
      .map((scenario) => scenarioLayoutsById.get(scenario.id))
      .filter((node): node is LayoutNode => !!node);
    const labelFlowNodes = [startNode, ...labelScenarioNodes];
    for (const node of labelFlowNodes) {
      node.data = {
        ...(node.data ?? {}),
        autoBranchLayout: true,
      };
    }
    const minX = Math.min(...labelFlowNodes.map((node) => node.position.x));
    const minY = Math.min(...labelFlowNodes.map((node) => node.position.y));
    const shiftX = Number.isFinite(minX) && minX < FRAME_PADDING ? FRAME_PADDING - minX : 0;
    const shiftY = Number.isFinite(minY) && minY < TOP_DOWN_LABEL_TOP_PADDING ? TOP_DOWN_LABEL_TOP_PADDING - minY : 0;
    if (shiftX || shiftY) {
      for (const node of labelFlowNodes) {
        node.position.x += shiftX;
        node.position.y += shiftY;
      }
    }
  }
};

const deriveFlowEdges = (nodes: LayoutNode[], graph: ProjectGraphSnapshot): Edge[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByDomainParent = buildScenarioChildrenByDomainParent(graph);
  const edges: Edge[] = [];
  const seen = new Set<string>();

  const addEdge = (
    source: LayoutNode,
    target: LayoutNode,
    kind: 'sequence' | 'branch',
    flowRole: 'forward' | 'alternative' | 'rejoin' = 'forward',
  ): void => {
    if (source.id === target.id) {
      return;
    }

    const id = `derived-${kind}-${source.id}-${target.id}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);

    const useNearTargetRouting = flowRole === 'rejoin' || kind === 'branch';

    edges.push({
      id,
      source: source.id,
      target: target.id,
      type: useNearTargetRouting ? 'nearTargetStep' : 'step',
      className: `project-edge project-edge--${kind}${flowRole === 'rejoin' ? ' project-edge--rejoin' : ''}`,
      markerEnd: { type: MarkerType.ArrowClosed },
      selectable: false,
      focusable: false,
      interactionWidth: 8,
      zIndex: flowRole === 'rejoin' ? 0 : 1,
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      pathOptions: {
        borderRadius: 8,
        offset: flowRole === 'rejoin' ? 48 : 32,
      },
      style: {
        opacity: flowRole === 'rejoin' ? 0.32 : kind === 'branch' ? 0.72 : 0.62,
        strokeWidth: flowRole === 'rejoin' ? 1.35 : kind === 'branch' ? 2.15 : 2,
      },
      data: {
        derived: true,
        kind,
        flowRole,
        targetTurnOffset: useNearTargetRouting ? TOP_DOWN_REJOIN_TURN_OFFSET : undefined,
        direction: useNearTargetRouting ? 'vertical' : undefined,
      },
    });
  };

  const isAttachedBranchHeaderEdge = (source: LayoutNode, target: LayoutNode): boolean =>
    isBranchHeaderNode(source) && scenarioParentNodeId(target) === source.id;

  const getChildren = (labelId: string, parentNodeId: string | null): ScenarioNodeSnapshot[] =>
    (childrenByDomainParent.get(domainChildrenKey(labelId, parentNodeId)) ?? []).filter(
      (scenario) => !isMenuPromptScenario(scenario),
    );

  const deriveList = (
    labelId: string,
    parentNodeId: string | null,
    incomingSources: LayoutNode[],
  ): LayoutNode[] => {
    const scenarioSiblings = getChildren(labelId, parentNodeId)
      .map((scenario) => byId.get(scenario.id))
      .filter((node): node is LayoutNode => !!node);
    let sources = incomingSources;
    let index = 0;

    while (index < scenarioSiblings.length) {
      const sibling = scenarioSiblings[index];
      if (isConditionalBranchNode(sibling)) {
        const branches = [sibling];
        let afterBranchIndex = index + 1;
        while (afterBranchIndex < scenarioSiblings.length && isConditionalBranchNode(scenarioSiblings[afterBranchIndex])) {
          branches.push(scenarioSiblings[afterBranchIndex]);
          afterBranchIndex += 1;
        }

        for (const source of sources) {
          addEdge(source, branches[0], isBranchingParentNode(source) ? 'branch' : 'sequence');
        }

        for (const branch of branches.slice(1)) {
          addEdge(branches[0], branch, 'branch', 'alternative');
        }

        sources = branches.flatMap((branch) => {
          const branchChildren = getChildren(
            typeof branch.data?.original === 'object' &&
              branch.data.original !== null &&
              'label_id' in branch.data.original &&
              typeof branch.data.original.label_id === 'string'
              ? branch.data.original.label_id
              : labelId,
            branch.id,
          );
          if (branchChildren.length === 0) {
            return [branch];
          }
          return deriveList(labelId, branch.id, [branch]);
        });
        index = afterBranchIndex;
        continue;
      }

      if (isMenuNode(sibling)) {
        for (const source of sources) {
          addEdge(
            source,
            sibling,
            isBranchingParentNode(source) ? 'branch' : 'sequence',
            sources.length > 1 ? 'rejoin' : 'forward',
          );
        }

        const choiceNodes = getChildren(labelId, sibling.id)
          .map((scenario) => byId.get(scenario.id))
          .filter((node): node is LayoutNode => !!node && isMenuChoiceNode(node));

        for (const choice of choiceNodes) {
          addEdge(sibling, choice, 'branch', 'alternative');
        }

        sources = choiceNodes.flatMap((choice) => {
          const choiceChildren = getChildren(labelId, choice.id);
          if (choiceChildren.length === 0) {
            return [choice];
          }
          return deriveList(labelId, choice.id, [choice]);
        });
        index += 1;
        continue;
      }

      for (const source of sources) {
        if (isAttachedBranchHeaderEdge(source, sibling)) {
          continue;
        }
        addEdge(
          source,
          sibling,
          isBranchingParentNode(source) ? 'branch' : 'sequence',
          sources.length > 1 ? 'rejoin' : 'forward',
        );
      }
      const childSnapshots = getChildren(labelId, sibling.id);
      sources = childSnapshots.length > 0 ? deriveList(labelId, sibling.id, [sibling]) : [sibling];
      index += 1;
    }

    return sources;
  };

  for (const label of graph.labels) {
    const labelStart = graph.label_starts.find((start) => start.label_id === label.id);
    const startNode = labelStart ? byId.get(labelStart.id) : undefined;
    if (!startNode) {
      continue;
    }

    deriveList(label.id, null, [startNode]);
  }

  return edges;
};

export const projectGraphToReactFlow = (graph: ProjectGraphSnapshot): ProjectGraphProjection => {
  const nodes: LayoutNode[] = [];
  const labelsById = new Map(graph.labels.map((label) => [label.id, label]));
  const scenariosById = new Map(graph.nodes.map((scenario) => [scenario.id, scenario]));
  const scenarioDragGroups = buildScenarioDragGroups(graph);
  const menuPromptByParentId = new Map<string, ScenarioNodeSnapshot>();
  for (const scenario of graph.nodes) {
    if (isMenuPromptScenario(scenario) && scenario.parent_node_id) {
      menuPromptByParentId.set(scenario.parent_node_id, scenario);
    }
  }

  for (const file of [...graph.files].sort((a, b) => a.order.localeCompare(b.order))) {
    const size = normalizeSize(file.visual.size);
    nodes.push({
      id: file.id,
      type: 'projectFrame',
      className: PROJECT_GRAPH_REACT_FLOW_NODE_CLASS,
      position: clonePoint(file.visual.position),
      data: {
        kind: 'file',
        path: file.path,
        title: file.path,
        original: file,
        layoutOrder: file.order,
        layoutSourceLine: Number.MAX_SAFE_INTEGER,
      },
      draggable: true,
      selectable: true,
      dragHandle: '.pg-node__drag-handle',
      width: size.width,
      height: size.height,
    });
  }

  for (const label of [...graph.labels].sort(compareSourceOrder)) {
    const size = normalizeSize(label.visual.size);
    nodes.push({
      id: label.id,
      type: 'labelFrame',
      className: PROJECT_GRAPH_REACT_FLOW_NODE_CLASS,
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
        layoutOrder: label.qualified_name,
        layoutSourceLine: label.source_span?.start_line ?? Number.MAX_SAFE_INTEGER,
      },
      draggable: true,
      selectable: true,
      dragHandle: '.pg-node__drag-handle',
      width: size.width,
      height: size.height,
    });
  }

  for (const start of graph.label_starts) {
    const size = normalizeSize(start.visual.size);
    const label = labelsById.get(start.label_id);
    nodes.push({
      id: start.id,
      type: 'labelStart',
      className: PROJECT_GRAPH_REACT_FLOW_NODE_CLASS,
      parentId: start.label_id,
      extent: 'parent',
      position: clonePoint(start.visual.position),
      data: {
        kind: 'labelStart',
        qualifiedName: start.qualified_name,
        content: start.content,
        title: start.qualified_name,
        original: start,
        layoutOrder: start.qualified_name,
        layoutSourceLine: label?.source_span?.start_line ?? Number.MAX_SAFE_INTEGER,
      },
      draggable: true,
      selectable: true,
      dragHandle: '.pg-node__drag-handle',
      width: size.width,
      height: size.height,
    });
  }

  for (const scenario of [...graph.nodes].sort(compareSourceOrder)) {
    if (isMenuPromptScenario(scenario)) {
      continue;
    }

    const size = isBranchHeaderScenario(scenario)
      ? { width: Math.max(scenario.visual.size.width, 260), height: BRANCH_HEADER_HEIGHT }
      : normalizeSize(scenario.visual.size);
    const menuPrompt = isMenuScenario(scenario) ? menuPromptByParentId.get(scenario.id) : undefined;
    const scenarioTitle =
      typeof scenario.metadata.title === 'string' && scenario.metadata.title.trim()
        ? scenario.metadata.title
        : typeof scenario.metadata.default_title === 'string' && scenario.metadata.default_title.trim()
          ? scenario.metadata.default_title
          : scenario.type;
    nodes.push({
      id: scenario.id,
      type: 'scenarioNode',
      className: PROJECT_GRAPH_REACT_FLOW_NODE_CLASS,
      parentId: resolveScenarioVisualParentId(scenario, scenariosById),
      extent: 'parent',
      position: clonePoint(scenario.visual.position),
      data: {
        kind: 'scenario',
        scenarioType: scenario.type,
        visualRole: isBranchHeaderScenario(scenario) ? 'branchHeader' : undefined,
        content: scenario.content,
        dragGroupIds: scenarioDragGroups.get(scenario.id) ?? [scenario.id],
        menuPrompt: menuPrompt?.content,
        title: scenarioTitle,
        metadata: scenario.metadata,
        original: scenario,
        layoutOrder: scenario.order,
        layoutSourceLine: scenario.source_span?.start_line ?? Number.MAX_SAFE_INTEGER,
      },
      draggable: true,
      selectable: true,
      dragHandle: '.pg-node__drag-handle',
      width: size.width,
      height: size.height,
    });
  }

  applyConditionalStoryLayout(nodes, graph);
  const normalizedNodes = normalizeLayout(nodes).map((node) => withFixedSize(node));
  const derivedEdges = deriveFlowEdges(normalizedNodes, graph);
  const relationEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    type: 'smoothstep',
    animated: edge.kind === 'call',
    className: `project-edge project-edge--${edge.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed },
    selectable: false,
    focusable: false,
    interactionWidth: 10,
    zIndex: 3,
    sourceHandle: 'relation-out',
    targetHandle: 'flow-in',
    sourcePosition: Position.Right,
    targetPosition: Position.Top,
    style: {
      opacity: edge.kind === 'call' ? 0.38 : 0.34,
      strokeWidth: 1.8,
      strokeDasharray: edge.kind === 'jump' ? '6 8' : '5 7',
    },
    data: {
      kind: edge.kind,
      metadata: edge.metadata,
      original: edge,
    },
  }));

  return { nodes: normalizedNodes, edges: [...derivedEdges, ...relationEdges] };
};
