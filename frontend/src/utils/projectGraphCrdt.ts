import { LoroDoc, type LoroText, type LoroTreeNode, type TreeID, type VersionVector } from 'loro-crdt/base64';
import type {
  FileFrameSnapshot,
  FlowEdgeSnapshot,
  GraphDiagnosticSnapshot,
  GraphPoint,
  GraphVisual,
  LabelFrameSnapshot,
  LabelStartNodeSnapshot,
  ProjectGraphSnapshot,
  ScenarioNodeSnapshot,
  SourceSpan,
} from './projectGraphProjection';
import type {
  ConditionalContinuationDraft,
  ContinuationLeafDraft,
  MenuContinuationDraft,
} from '../components/actionEditor/actionEditorContinuation';
import {
  validateNewRelationTargetDraft,
  type NewRelationTargetDraft,
  type RelationTargetContext,
  type RelationTargetSelection,
} from '../components/actionEditor/relationTargetModel';
import {
  validateProjectGraphStructureCommand,
  type ProjectGraphStructureCommand,
} from './projectGraphStructure';

export const PROJECT_GRAPH_CRDT_CONTAINERS = {
  tree: 'project_graph_tree',
  meta: 'project_graph_meta',
  entityIndex: 'project_graph_entity_tree_ids',
  edges: 'project_graph_edges',
} as const;

const TREE_CONTAINER = PROJECT_GRAPH_CRDT_CONTAINERS.tree;
const META_CONTAINER = PROJECT_GRAPH_CRDT_CONTAINERS.meta;
const ENTITY_INDEX_CONTAINER = PROJECT_GRAPH_CRDT_CONTAINERS.entityIndex;
const EDGE_CONTAINER = PROJECT_GRAPH_CRDT_CONTAINERS.edges;
const PROJECT_GRAPH_SCHEMA_VERSION = 2;

export type ProjectGraphEntityKind = 'file' | 'label' | 'labelStart' | 'scenario';
export type ProjectGraphEntitySnapshot =
  | FileFrameSnapshot
  | LabelFrameSnapshot
  | LabelStartNodeSnapshot
  | ScenarioNodeSnapshot;

export interface MaterializedProjectGraphEntity {
  kind: ProjectGraphEntityKind;
  entity: ProjectGraphEntitySnapshot;
}

export type ProjectGraphCrdtDoc = LoroDoc;

export interface ProjectGraphEntityPositionChange {
  entityId: string;
  position: GraphPoint;
  manual?: boolean;
}

export interface ProjectGraphScenarioTextSplice {
  nodeId: string;
  index: number;
  deleteCount: number;
  insertText: string;
}

type ProjectGraphTreeJsonNode = {
  id: TreeID;
  parent: TreeID | null;
  index: number;
  meta: Record<string, unknown>;
  children: ProjectGraphTreeJsonNode[];
};

export interface ProjectGraphCrdtOptions {
  peerId?: number | bigint | `${number}`;
}

const configureDoc = (doc: LoroDoc, options: ProjectGraphCrdtOptions = {}): LoroDoc => {
  if (options.peerId !== undefined) {
    doc.setPeerId(options.peerId);
  }
  return doc;
};

const setVisual = (node: LoroTreeNode, visual: GraphVisual): void => {
  node.data.set('position_x', visual.position.x);
  node.data.set('position_y', visual.position.y);
  node.data.set('size_width', visual.size.width);
  node.data.set('size_height', visual.size.height);
};

const getVisual = (meta: Record<string, unknown>): GraphVisual => ({
  position: {
    x: Number(meta.position_x ?? 0),
    y: Number(meta.position_y ?? 0),
  },
  size: {
    width: Number(meta.size_width ?? 0),
    height: Number(meta.size_height ?? 0),
  },
});

const sourceSpanOrNull = (value: unknown): SourceSpan | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const span = value as Partial<SourceSpan>;
  return {
    start_line: Number(span.start_line ?? 0),
    end_line: Number(span.end_line ?? 0),
  };
};

const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

const scenarioContentTextKey = (nodeId: string): string => `scenario_content:${nodeId}`;

const writeCommonEntityData = (
  node: LoroTreeNode,
  kind: ProjectGraphEntityKind,
  entityId: string,
  visual: GraphVisual,
): void => {
  node.data.set('kind', kind);
  node.data.set('entity_id', entityId);
  setVisual(node, visual);
};

const writeFileData = (node: LoroTreeNode, file: FileFrameSnapshot): void => {
  writeCommonEntityData(node, 'file', file.id, file.visual);
  node.data.set('path', file.path);
  node.data.set('order', file.order);
  if (file.metadata && Object.keys(file.metadata).length > 0) {
    node.data.set('metadata', file.metadata);
  }
};

const writeLabelData = (node: LoroTreeNode, label: LabelFrameSnapshot): void => {
  writeCommonEntityData(node, 'label', label.id, label.visual);
  node.data.set('file_id', label.file_id);
  node.data.set('parent_label_id', label.parent_label_id);
  node.data.set('name', label.name);
  node.data.set('qualified_name', label.qualified_name);
  node.data.set('scope', label.scope);
  node.data.set('label_start_node_id', label.label_start_node_id);
  node.data.set('source_span', label.source_span);
};

const writeLabelStartData = (node: LoroTreeNode, start: LabelStartNodeSnapshot): void => {
  writeCommonEntityData(node, 'labelStart', start.id, start.visual);
  node.data.set('file_id', start.file_id);
  node.data.set('label_id', start.label_id);
  node.data.set('qualified_name', start.qualified_name);
  node.data.set('content', start.content);
};

const writeScenarioData = (doc: LoroDoc, node: LoroTreeNode, scenario: ScenarioNodeSnapshot): void => {
  writeCommonEntityData(node, 'scenario', scenario.id, scenario.visual);
  const contentTextKey = scenarioContentTextKey(scenario.id);
  node.data.set('file_id', scenario.file_id);
  node.data.set('label_id', scenario.label_id);
  node.data.set('parent_node_id', scenario.parent_node_id);
  node.data.set('type', scenario.type);
  node.data.set('content_text_key', contentTextKey);
  node.data.set('order', scenario.order);
  node.data.set('source_span', scenario.source_span);
  node.data.set('metadata', scenario.metadata);
  doc.getText(contentTextKey).update(scenario.content);
};

const createIndexedTreeNode = (
  doc: LoroDoc,
  entityId: string,
  parentEntityId?: string | null,
  index?: number,
): LoroTreeNode => {
  const tree = doc.getTree(TREE_CONTAINER);
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
  const parentTreeId = parentEntityId ? (entityIndex.get(parentEntityId) as TreeID | undefined) : undefined;

  if (parentEntityId && !parentTreeId) {
    throw new Error(`Missing CRDT parent for entity ${entityId}: ${parentEntityId}`);
  }

  const node = tree.createNode(parentTreeId, index);
  entityIndex.set(entityId, node.id);
  return node;
};

const createChildrenWhenParentsExist = <T>(
  pending: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null,
  create: (item: T) => void,
): void => {
  let remaining = [...pending];
  const createdIds = new Set<string>();

  while (remaining.length > 0) {
    const ready = remaining.filter((item) => {
      const parentId = getParentId(item);
      return !parentId || createdIds.has(parentId) || !remaining.some((candidate) => getId(candidate) === parentId);
    });
    if (ready.length === 0) {
      throw new Error('ProjectGraph contains cyclic or missing parent references');
    }
    for (const item of ready) {
      create(item);
      createdIds.add(getId(item));
    }
    const readyIds = new Set(ready.map(getId));
    remaining = remaining.filter((item) => !readyIds.has(getId(item)));
  }
};

export const createProjectGraphCrdtDoc = (
  graph: ProjectGraphSnapshot,
  options: ProjectGraphCrdtOptions = {},
): LoroDoc => {
  const doc = configureDoc(new LoroDoc(), options);
  const meta = doc.getMap(META_CONTAINER);
  doc.getTree(TREE_CONTAINER).enableFractionalIndex(1);

  meta.set('schema_version', PROJECT_GRAPH_SCHEMA_VERSION);
  meta.set('project_id', graph.project_id);
  meta.set('diagnostics', graph.diagnostics);
  meta.set('source_index', graph.source_index);
  const edgeMap = doc.getMap(EDGE_CONTAINER);
  for (const edge of graph.edges) {
    edgeMap.set(edge.id, edge);
  }

  for (const file of [...graph.files].sort((a, b) => a.order.localeCompare(b.order))) {
    writeFileData(createIndexedTreeNode(doc, file.id), file);
  }

  createChildrenWhenParentsExist(
    [...graph.labels].sort((a, b) => (a.source_span?.start_line ?? 0) - (b.source_span?.start_line ?? 0)),
    (label) => label.id,
    (label) => label.parent_label_id ?? label.file_id,
    (label) => writeLabelData(createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id), label),
  );

  for (const start of graph.label_starts) {
    writeLabelStartData(createIndexedTreeNode(doc, start.id, start.label_id), start);
  }

  createChildrenWhenParentsExist(
    [...graph.nodes].sort((a, b) => a.order.localeCompare(b.order)),
    (scenario) => scenario.id,
    (scenario) => scenario.parent_node_id ?? scenario.label_id,
    (scenario) =>
      writeScenarioData(
        doc,
        createIndexedTreeNode(doc, scenario.id, scenario.parent_node_id ?? scenario.label_id),
        scenario,
      ),
  );

  doc.commit({ origin: 'project-graph-import', message: 'Import ProjectGraph snapshot into Loro' });
  return doc;
};

export const exportProjectGraphCrdtSnapshot = (doc: LoroDoc): Uint8Array => doc.export({ mode: 'snapshot' });

const migrateProjectGraphCrdtDoc = (doc: LoroDoc): LoroDoc => {
  const meta = doc.getMap(META_CONTAINER);
  const schemaVersion = Number(meta.get('schema_version') ?? 1);
  const tree = doc.getTree(TREE_CONTAINER);
  tree.enableFractionalIndex(1);
  if (schemaVersion >= PROJECT_GRAPH_SCHEMA_VERSION) {
    return doc;
  }

  const reorderScenarioChildren = (nodes: ProjectGraphTreeJsonNode[], parentId?: TreeID): void => {
    const scenarioSlots = nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.meta.kind === 'scenario');
    const sortedScenarios = scenarioSlots
      .map(({ node }) => node)
      .sort((left, right) => String(left.meta.order ?? '').localeCompare(String(right.meta.order ?? '')));
    sortedScenarios.forEach((node, index) => tree.move(node.id, parentId, scenarioSlots[index].index));
    for (const node of nodes) {
      reorderScenarioChildren(node.children ?? [], node.id);
    }
  };

  reorderScenarioChildren(tree.toJSON() as ProjectGraphTreeJsonNode[]);
  const edgeMap = doc.getMap(EDGE_CONTAINER);
  const legacyEdges = (meta.get('edges') as FlowEdgeSnapshot[] | undefined) ?? [];
  for (const edge of legacyEdges) {
    if (!edgeMap.get(edge.id)) {
      edgeMap.set(edge.id, edge);
    }
  }
  meta.set('schema_version', PROJECT_GRAPH_SCHEMA_VERSION);
  doc.commit({ origin: 'project-graph-schema-migration', message: 'Migrate ProjectGraph CRDT schema to v2' });
  return doc;
};

export const importProjectGraphCrdtSnapshot = (
  snapshot: Uint8Array,
  options: ProjectGraphCrdtOptions = {},
): LoroDoc => migrateProjectGraphCrdtDoc(configureDoc(LoroDoc.fromSnapshot(snapshot), options));

export const getProjectGraphCrdtVersion = (doc: LoroDoc): VersionVector => doc.oplogVersion();

export const exportProjectGraphCrdtUpdate = (doc: LoroDoc, from: VersionVector): Uint8Array =>
  doc.export({ mode: 'update', from });

export const importProjectGraphCrdtUpdate = (doc: LoroDoc, update: Uint8Array): void => {
  doc.import(update);
};

const getEntityNode = (doc: LoroDoc, entityId: string): LoroTreeNode => {
  const treeId = doc.getMap(ENTITY_INDEX_CONTAINER).get(entityId) as TreeID | undefined;
  const node = treeId ? doc.getTree(TREE_CONTAINER).getNodeByID(treeId) : undefined;

  if (!node) {
    throw new Error(`Missing CRDT entity: ${entityId}`);
  }

  return node;
};

export const getScenarioNodeContentText = (doc: LoroDoc, nodeId: string): LoroText => {
  const node = getEntityNode(doc, nodeId);
  if (node.data.get('kind') !== 'scenario') {
    throw new Error(`Entity is not a scenario node: ${nodeId}`);
  }
  const contentTextKey = String(node.data.get('content_text_key') ?? scenarioContentTextKey(nodeId));
  node.data.set('content_text_key', contentTextKey);
  return doc.getText(contentTextKey);
};

export const updateScenarioNodeContent = (doc: LoroDoc, nodeId: string, content: string): void => {
  getScenarioNodeContentText(doc, nodeId).update(content);
  doc.commit({ origin: 'project-graph-content', message: `Update scenario ${nodeId} content` });
};

export const spliceScenarioNodeContent = (doc: LoroDoc, edit: ProjectGraphScenarioTextSplice): void => {
  getScenarioNodeContentText(doc, edit.nodeId).splice(edit.index, edit.deleteCount, edit.insertText);
  doc.commit({ origin: 'project-graph-content', message: `Splice scenario ${edit.nodeId} content` });
};

export const updateScenarioNodeMetadata = (
  doc: LoroDoc,
  nodeId: string,
  metadataPatch: Record<string, unknown>,
): void => {
  const node = getEntityNode(doc, nodeId);
  if (node.data.get('kind') !== 'scenario') {
    throw new Error(`Entity is not a scenario node: ${nodeId}`);
  }
  node.data.set('metadata', {
    ...recordOrEmpty(node.data.get('metadata')),
    ...metadataPatch,
  });
  doc.commit({ origin: 'project-graph-metadata', message: `Update scenario ${nodeId} metadata` });
};

export const updateSourceFileContent = (doc: LoroDoc, fileId: string, content: string): void => {
  const meta = doc.getMap(META_CONTAINER);
  const sourceIndex = recordOrEmpty(meta.get('source_index'));
  const files = recordOrEmpty(sourceIndex.files);
  const fileEntry = recordOrEmpty(files[fileId]);
  files[fileId] = {
    ...fileEntry,
    content,
  };
  meta.set('source_index', {
    ...sourceIndex,
    files,
  });
  doc.commit({ origin: 'project-graph-source-file', message: `Update source file ${fileId}` });
};

export type ProjectGraphNextScenarioAction = 'menu' | 'conditional' | 'jump' | 'call' | 'return';

export interface InsertProjectGraphNextScenarioOptions {
  sourceNodeId: string;
  action: ProjectGraphNextScenarioAction;
  targetLabelId?: string;
  target?: RelationTargetSelection;
  conditionalDraft?: ConditionalContinuationDraft;
  menuDraft?: MenuContinuationDraft;
  idFactory?: (prefix: string) => string;
}

export interface InsertProjectGraphNextScenarioResult {
  createdNodeIds: string[];
  selectedNodeId: string;
  createdTargetIds: {
    files: string[];
    labels: string[];
    labelStarts: string[];
  };
}

export type CreateProjectGraphStructureOptions = ProjectGraphStructureCommand & {
  idFactory?: (prefix: string) => string;
};

export interface CreateProjectGraphStructureResult {
  selectedEntityId: string;
  createdEntityIds: {
    files: string[];
    labels: string[];
    labelStarts: string[];
    nodes: string[];
  };
}

const ORDER_SEGMENT_WIDTH = 4;

const orderSegment = (index: number): string => String(index).padStart(ORDER_SEGMENT_WIDTH, '0');

const randomIdSegment = (): string => {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const createUniqueEntityId = (
  doc: LoroDoc,
  prefix: string,
  idFactory?: (prefix: string) => string,
): string => {
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rawId = idFactory?.(prefix) ?? `${prefix}-${randomIdSegment()}`;
    const candidateId = rawId.startsWith(`${prefix}-`) ? rawId : `${prefix}-${rawId}`;
    if (!entityIndex.get(candidateId)) {
      return candidateId;
    }
  }

  throw new Error(`Unable to create unique ProjectGraph entity id for prefix ${prefix}`);
};

const createRelationEdgeId = (
  edges: FlowEdgeSnapshot[],
  kind: 'jump' | 'call',
  sourceNodeId: string,
  targetNodeId: string,
): string => {
  const baseId = `edge-${kind}-${sourceNodeId}-to-${targetNodeId}`.replace(/[^A-Za-z0-9_.-]+/g, '-');
  const existingIds = new Set(edges.map((edge) => edge.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to create unique ProjectGraph edge id for ${sourceNodeId}`);
};

export const projectGraphRelationEdgesFromCrdtDoc = (doc: LoroDoc): FlowEdgeSnapshot[] => {
  const legacyEdges = (doc.getMap(META_CONTAINER).get('edges') as FlowEdgeSnapshot[] | undefined) ?? [];
  const keyedEdges = Object.values(recordOrEmpty(doc.getMap(EDGE_CONTAINER).toJSON())) as FlowEdgeSnapshot[];
  const byId = new Map(legacyEdges.map((edge) => [edge.id, edge]));
  for (const edge of keyedEdges) {
    if (edge && typeof edge.id === 'string') {
      byId.set(edge.id, edge);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
};

export const projectGraphRelationEdgeFromCrdtDoc = (
  doc: LoroDoc,
  edgeId: string,
): FlowEdgeSnapshot | undefined => {
  const keyedEdge = doc.getMap(EDGE_CONTAINER).get(edgeId) as FlowEdgeSnapshot | undefined;
  if (keyedEdge && keyedEdge.id === edgeId) {
    return keyedEdge;
  }
  return ((doc.getMap(META_CONTAINER).get('edges') as FlowEdgeSnapshot[] | undefined) ?? []).find(
    (edge) => edge.id === edgeId,
  );
};

const scenarioVisualForType = (type: ScenarioNodeSnapshot['type']): GraphVisual => {
  if (type === 'menu') {
    return { position: { x: 64, y: 0 }, size: { width: 360, height: 220 } };
  }
  if (type === 'menu_choice' || type === 'menu_prompt') {
    return { position: { x: 32, y: 0 }, size: { width: 300, height: 72 } };
  }
  if (type === 'if' || type === 'elif' || type === 'else') {
    return { position: { x: 64, y: 0 }, size: { width: 320, height: 88 } };
  }
  if (type === 'jump' || type === 'call' || type === 'return') {
    return { position: { x: 64, y: 0 }, size: { width: 280, height: 72 } };
  }
  return { position: { x: 32, y: 0 }, size: { width: 340, height: 80 } };
};

const scenarioWithDefaults = (
  source: ScenarioNodeSnapshot,
  id: string,
  type: ScenarioNodeSnapshot['type'],
  content: string,
  parentNodeId: string | null,
  metadata: Record<string, unknown> = {},
): ScenarioNodeSnapshot => ({
  id,
  file_id: source.file_id,
  label_id: source.label_id,
  parent_node_id: parentNodeId,
  type,
  content,
  order: '',
  source_span: null,
  metadata,
  visual: scenarioVisualForType(type),
});

const scenarioChildrenByParent = (nodes: ScenarioNodeSnapshot[]): Map<string, ScenarioNodeSnapshot[]> => {
  const childrenByParent = new Map<string, ScenarioNodeSnapshot[]>();
  for (const node of nodes) {
    if (!node.parent_node_id) {
      continue;
    }
    const children = childrenByParent.get(node.parent_node_id) ?? [];
    children.push(node);
    childrenByParent.set(node.parent_node_id, children);
  }
  return childrenByParent;
};

const assignTopLevelInsertionOrders = (
  graph: ProjectGraphSnapshot,
  source: ScenarioNodeSnapshot,
  topLevelNodes: ScenarioNodeSnapshot[],
): void => {
  const scenarioById = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentOrderPrefix = source.parent_node_id ? `${scenarioById.get(source.parent_node_id)?.order ?? ''}.` : '';
  const siblings = graph.nodes
    .filter((node) => node.label_id === source.label_id && node.parent_node_id === source.parent_node_id)
    .sort((a, b) => a.order.localeCompare(b.order));
  const sourceIndex = siblings.findIndex((node) => node.id === source.id);
  if (sourceIndex === -1) {
    throw new Error(`Missing source scenario sibling: ${source.id}`);
  }

  topLevelNodes.forEach((node, index) => {
    node.order = `${parentOrderPrefix}${orderSegment(sourceIndex + 1 + index)}`;
  });
};

const assignChildInsertionOrders = (
  parent: ScenarioNodeSnapshot,
  childrenByParent: Map<string, ScenarioNodeSnapshot[]>,
): void => {
  const children = childrenByParent.get(parent.id) ?? [];
  children.forEach((child, index) => {
    child.order = `${parent.order}.${orderSegment(index)}`;
    assignChildInsertionOrders(child, childrenByParent);
  });
};

const arrangeInsertedScenarioVisuals = (
  source: ScenarioNodeSnapshot,
  topLevelNodes: ScenarioNodeSnapshot[],
  childrenByParent: Map<string, ScenarioNodeSnapshot[]>,
): void => {
  topLevelNodes.forEach((node, index) => {
    node.visual = {
      ...node.visual,
      position: {
        x: source.visual.position.x,
        y: source.visual.position.y + source.visual.size.height + 96 + index * 112,
      },
    };
  });

  const arrangeChildren = (parent: ScenarioNodeSnapshot): void => {
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((child, index) => {
      child.visual = {
        ...child.visual,
        position: {
          x: child.type === 'action' ? 56 : 32,
          y: 72 + index * 96,
        },
      };
      arrangeChildren(child);
    });
  };

  topLevelNodes.forEach(arrangeChildren);
};

const appendRelationEdge = (
  doc: LoroDoc,
  kind: 'jump' | 'call',
  sourceNode: ScenarioNodeSnapshot,
  targetLabel: LabelFrameSnapshot,
): string => {
  const edges = projectGraphRelationEdgesFromCrdtDoc(doc);
  const edge: FlowEdgeSnapshot = {
    id: createRelationEdgeId(edges, kind, sourceNode.id, targetLabel.label_start_node_id),
    source_node_id: sourceNode.id,
    target_node_id: targetLabel.label_start_node_id,
    kind,
    metadata: { target: targetLabel.qualified_name },
  };
  doc.getMap(EDGE_CONTAINER).set(edge.id, edge);
  return edge.id;
};

const clearNoLabelFileMetadata = (doc: LoroDoc, fileId: string): void => {
  const fileNode = getEntityNode(doc, fileId);
  const metadata = recordOrEmpty(fileNode.data.get('metadata'));
  delete metadata.code_only;
  delete metadata.code_only_reason;
  fileNode.data.set('metadata', metadata);
};

const canonicalLabelPlaceholder = (
  fileId: string,
  labelId: string,
  nodeId: string,
): ScenarioNodeSnapshot => ({
  id: nodeId,
  file_id: fileId,
  label_id: labelId,
  parent_node_id: null,
  type: 'action',
  content: 'pass',
  order: '0000',
  source_span: null,
  metadata: { default_title: 'pass' },
  visual: { position: { x: 64, y: 136 }, size: { width: 340, height: 80 } },
});

export const createProjectGraphStructure = (
  doc: LoroDoc,
  options: CreateProjectGraphStructureOptions,
): CreateProjectGraphStructureResult => {
  const graph = projectGraphFromCrdtDoc(doc);
  const command = validateProjectGraphStructureCommand(graph, options);
  const createId = (prefix: string): string => createUniqueEntityId(doc, prefix, options.idFactory);

  if (command.kind === 'file') {
    const file: FileFrameSnapshot = {
      id: createId('file'),
      path: command.path,
      order: orderSegment(graph.files.length),
      metadata: { code_only: true, code_only_reason: 'no_labels' },
      visual: { position: { ...command.position }, size: { width: 1200, height: 800 } },
    };
    writeFileData(createIndexedTreeNode(doc, file.id), file);
    const meta = doc.getMap(META_CONTAINER);
    const sourceIndex = recordOrEmpty(meta.get('source_index'));
    const files = recordOrEmpty(sourceIndex.files);
    files[file.id] = { path: file.path, content: '' };
    meta.set('source_index', { ...sourceIndex, files });
    doc.commit({ origin: 'project-graph-create-structure', message: `Create file ${file.path}` });
    return {
      selectedEntityId: file.id,
      createdEntityIds: { files: [file.id], labels: [], labelStarts: [], nodes: [] },
    };
  }

  const siblingCount = graph.labels.filter((label) => label.parent_label_id === command.parentLabelId && label.file_id === command.fileId).length;
  const labelId = createId('label');
  const startId = createId('label-start');
  const placeholderId = createId('node-action');
  const label: LabelFrameSnapshot = {
    id: labelId,
    file_id: command.fileId,
    parent_label_id: command.parentLabelId,
    name: command.labelHeader,
    qualified_name: command.qualifiedName,
    scope: command.scope,
    label_start_node_id: startId,
    source_span: null,
    visual: {
      position: { x: 48, y: 48 + siblingCount * 456 },
      size: { width: 960, height: 360 },
    },
  };
  const start: LabelStartNodeSnapshot = {
    id: startId,
    file_id: command.fileId,
    label_id: labelId,
    qualified_name: command.qualifiedName,
    content: `label ${command.labelHeader}:`,
    visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
  };
  const placeholder = canonicalLabelPlaceholder(command.fileId, labelId, placeholderId);

  writeLabelData(createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id), label);
  writeLabelStartData(createIndexedTreeNode(doc, start.id, label.id), start);
  writeScenarioData(doc, createIndexedTreeNode(doc, placeholder.id, label.id), placeholder);
  const file = graph.files.find((candidate) => candidate.id === command.fileId);
  if (file?.metadata?.code_only_reason === 'no_labels') {
    clearNoLabelFileMetadata(doc, file.id);
  }
  doc.commit({ origin: 'project-graph-create-structure', message: `Create label ${label.qualified_name}` });
  return {
    selectedEntityId: label.id,
    createdEntityIds: { files: [], labels: [label.id], labelStarts: [start.id], nodes: [placeholder.id] },
  };
};

export const insertProjectGraphNextScenario = (
  doc: LoroDoc,
  options: InsertProjectGraphNextScenarioOptions,
): InsertProjectGraphNextScenarioResult => {
  const graph = projectGraphFromCrdtDoc(doc);
  const source = graph.nodes.find((node) => node.id === options.sourceNodeId);
  if (!source) {
    throw new Error(`Missing source scenario node: ${options.sourceNodeId}`);
  }

  const createId = (prefix: string): string => createUniqueEntityId(doc, prefix, options.idFactory);
  const createdTargetFiles: FileFrameSnapshot[] = [];
  const createdTargetLabels: LabelFrameSnapshot[] = [];
  const createdTargetStarts: LabelStartNodeSnapshot[] = [];
  const createdTargetActions: ScenarioNodeSnapshot[] = [];
  const targetByDraftId = new Map<string, LabelFrameSnapshot>();
  const noLabelFileIdsToActivate = new Set<string>();
  const targetContext: RelationTargetContext = {
    files: graph.files.map((file) => ({
      id: file.id,
      path: file.path,
      codeOnlyReason:
        file.metadata?.code_only_reason === 'renpy_template' || file.metadata?.code_only_reason === 'no_labels'
          ? file.metadata.code_only_reason
          : undefined,
    })),
    labels: graph.labels.map((label) => ({
      id: label.id,
      fileId: label.file_id,
      qualifiedName: label.qualified_name,
      scope: label.scope,
    })),
  };
  const existingTarget = (labelId: string): RelationTargetSelection => ({ kind: 'existing', labelId });
  const targetFromLegacyLeaf = (leaf: ContinuationLeafDraft): RelationTargetSelection =>
    leaf.kind === 'action'
      ? existingTarget('')
      : leaf.target ?? existingTarget(String((leaf as unknown as { targetLabelId?: string }).targetLabelId ?? ''));
  const fileVisual = (): GraphVisual => {
    const rightEdge = graph.files.reduce(
      (maximum, file) => Math.max(maximum, file.visual.position.x + file.visual.size.width),
      -160,
    );
    return {
      position: { x: rightEdge + 160 + createdTargetFiles.length * 1360, y: 0 },
      size: { width: 1200, height: 800 },
    };
  };
  const labelVisual = (fileId: string, parentLabelId: string | null): GraphVisual => {
    const siblingCount = [
      ...graph.labels,
      ...createdTargetLabels,
    ].filter((label) => label.file_id === fileId && label.parent_label_id === parentLabelId).length;
    return {
      position: { x: 48, y: 48 + siblingCount * 456 },
      size: { width: 960, height: 360 },
    };
  };
  const resolveRelationTarget = (target: RelationTargetSelection): LabelFrameSnapshot => {
    if (target.kind === 'existing') {
      const label = graph.labels.find((candidate) => candidate.id === target.labelId);
      if (!label || !graph.label_starts.some((start) => start.id === label.label_start_node_id)) {
        throw new Error(`Missing target label: ${target.labelId}`);
      }
      return label;
    }

    const cached = targetByDraftId.get(target.draftId);
    if (cached) {
      return cached;
    }
    const validation = validateNewRelationTargetDraft(target as NewRelationTargetDraft, targetContext);
    if (!validation.ok) {
      const firstError = Object.entries(validation.errors)[0];
      if (firstError?.[1] === 'duplicate') {
        throw new Error(`Relation target ${target.name || target.draftId} already exists`);
      }
      throw new Error(`Invalid new relation target ${firstError?.[0] ?? 'target'}: ${firstError?.[1] ?? 'invalid'}`);
    }

    const normalized = validation.value;
    let fileId: string;
    if (normalized.file.kind === 'new') {
      const file: FileFrameSnapshot = {
        id: createId('file'),
        path: normalized.file.path,
        order: orderSegment(graph.files.length + createdTargetFiles.length),
        visual: fileVisual(),
      };
      createdTargetFiles.push(file);
      targetContext.files.push({ id: file.id, path: file.path });
      fileId = file.id;
    } else {
      fileId = normalized.file.fileId;
      const file = graph.files.find((candidate) => candidate.id === fileId);
      if (file?.metadata?.code_only_reason === 'no_labels') {
        noLabelFileIdsToActivate.add(fileId);
      }
    }

    const owner = normalized.scope === 'local'
      ? graph.labels.find((label) => label.id === normalized.ownerLabelId)
      : null;
    const labelId = createId('label');
    const startId = createId('label-start');
    const label: LabelFrameSnapshot = {
      id: labelId,
      file_id: fileId,
      parent_label_id: owner?.id ?? null,
      name: normalized.scope === 'local' ? `.${normalized.name}` : normalized.name,
      qualified_name: normalized.qualifiedName,
      scope: normalized.scope,
      label_start_node_id: startId,
      source_span: null,
      visual: labelVisual(fileId, owner?.id ?? null),
    };
    const start: LabelStartNodeSnapshot = {
      id: startId,
      file_id: fileId,
      label_id: labelId,
      qualified_name: normalized.qualifiedName,
      content: `label ${label.name}:`,
      visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
    };
    createdTargetLabels.push(label);
    createdTargetStarts.push(start);
    createdTargetActions.push(canonicalLabelPlaceholder(fileId, label.id, createId('node-action')));
    targetByDraftId.set(target.draftId, label);
    targetContext.labels.push({
      id: label.id,
      fileId: label.file_id,
      qualifiedName: label.qualified_name,
      scope: label.scope,
    });
    return label;
  };
  const topLevelNodes: ScenarioNodeSnapshot[] = [];
  const createdNodes: ScenarioNodeSnapshot[] = [];
  const pushCreatedNode = (node: ScenarioNodeSnapshot): ScenarioNodeSnapshot => {
    createdNodes.push(node);
    return node;
  };
  let selectedNode: ScenarioNodeSnapshot | null = null;
  let relationTargetLabel: LabelFrameSnapshot | null = null;
  const nestedRelations: Array<{ kind: 'call' | 'jump'; node: ScenarioNodeSnapshot; target: LabelFrameSnapshot }> = [];

  const placeholderContent = (comment: string): string => {
    const comments = comment.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => `# ${line}`);
    return [...comments, 'pass'].join('\n');
  };
  const quoteRenpy = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const continuationNode = (parentNodeId: string, leaf: ContinuationLeafDraft): ScenarioNodeSnapshot => {
    if (leaf.kind === 'action') {
      return pushCreatedNode(
        scenarioWithDefaults(
          source,
          createId('node-action'),
          'action',
          leaf.content?.trim() || placeholderContent(leaf.comment),
          parentNodeId,
        ),
      );
    }
    const target = resolveRelationTarget(targetFromLegacyLeaf(leaf));
    const node = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId(`node-${leaf.kind}`),
        leaf.kind,
        `${leaf.kind} ${target.qualified_name}`,
        parentNodeId,
        { target: target.qualified_name },
      ),
    );
    nestedRelations.push({ kind: leaf.kind, node, target });
    return node;
  };

  if (options.action === 'menu' && options.menuDraft) {
    const menuNode = pushCreatedNode(scenarioWithDefaults(source, createId('node-menu'), 'menu', 'menu:', source.parent_node_id));
    if (options.menuDraft.prompt.trim()) {
      pushCreatedNode(
        scenarioWithDefaults(
          source,
          createId('node-menu-prompt'),
          'menu_prompt',
          quoteRenpy(options.menuDraft.prompt.trim()),
          menuNode.id,
          { prompt_text: options.menuDraft.prompt.trim() },
        ),
      );
    }
    for (const choice of options.menuDraft.choices) {
      const text = choice.text.trim();
      const condition = choice.condition.trim();
      const choiceNode = pushCreatedNode(
        scenarioWithDefaults(
          source,
          createId('node-menu-choice'),
          'menu_choice',
          `${quoteRenpy(text)}${condition ? ` if ${condition}` : ''}:`,
          menuNode.id,
          { choice_text: text, ...(condition ? { condition } : {}) },
        ),
      );
      continuationNode(choiceNode.id, choice.continuation);
    }
    topLevelNodes.push(menuNode);
    selectedNode = menuNode;
  } else if (options.action === 'conditional' && options.conditionalDraft) {
    const draft = options.conditionalDraft;
    const ifCondition = draft.ifBranch.condition.trim();
    const ifNode = pushCreatedNode(
      scenarioWithDefaults(source, createId('node-if'), 'if', `if ${ifCondition}:`, source.parent_node_id, { condition: ifCondition }),
    );
    continuationNode(ifNode.id, draft.ifBranch.continuation);
    topLevelNodes.push(ifNode);
    for (const branch of draft.elifBranches) {
      const condition = branch.condition.trim();
      const elifNode = pushCreatedNode(
        scenarioWithDefaults(source, createId('node-elif'), 'elif', `elif ${condition}:`, source.parent_node_id, { condition }),
      );
      continuationNode(elifNode.id, branch.continuation);
      topLevelNodes.push(elifNode);
    }
    if (draft.elseBranch) {
      const elseNode = pushCreatedNode(
        scenarioWithDefaults(source, createId('node-else'), 'else', 'else:', source.parent_node_id),
      );
      continuationNode(elseNode.id, draft.elseBranch.continuation);
      topLevelNodes.push(elseNode);
    }
    selectedNode = ifNode;
  } else if (options.action === 'menu') {
    const menuNode = pushCreatedNode(scenarioWithDefaults(source, createId('node-menu'), 'menu', 'menu:', source.parent_node_id));
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-menu-prompt'),
        'menu_prompt',
        '"What should RenPy Mouse do next?"',
        menuNode.id,
        { prompt_text: 'What should RenPy Mouse do next?' },
      ),
    );
    const firstChoiceNode = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-menu-choice'),
        'menu_choice',
        '"Follow the cheese trail":',
        menuNode.id,
        { choice_text: 'Follow the cheese trail' },
      ),
    );
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-action'),
        'action',
        'r "RenPy Mouse follows the cheese trail."',
        firstChoiceNode.id,
        { default_title: 'r "RenPy Mouse follows the cheese trail."' },
      ),
    );
    const secondChoiceNode = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-menu-choice'),
        'menu_choice',
        '"Check another crumb":',
        menuNode.id,
        { choice_text: 'Check another crumb' },
      ),
    );
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-action'),
        'action',
        'r "RenPy Mouse checks another crumb."',
        secondChoiceNode.id,
        { default_title: 'r "RenPy Mouse checks another crumb."' },
      ),
    );
    topLevelNodes.push(menuNode);
    selectedNode = menuNode;
  } else if (options.action === 'conditional') {
    const ifNode = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-if'),
        'if',
        'if renpy_mouse_has_cheese:',
        source.parent_node_id,
        { condition: 'renpy_mouse_has_cheese' },
      ),
    );
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-action'),
        'action',
        'r "RenPy Mouse chooses the cheesy route."',
        ifNode.id,
        { default_title: 'r "RenPy Mouse chooses the cheesy route."' },
      ),
    );
    const elifNode = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-elif'),
        'elif',
        'elif renpy_mouse_sees_crumbs:',
        source.parent_node_id,
        { condition: 'renpy_mouse_sees_crumbs' },
      ),
    );
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-action'),
        'action',
        'r "RenPy Mouse follows the crumb clue."',
        elifNode.id,
        { default_title: 'r "RenPy Mouse follows the crumb clue."' },
      ),
    );
    const elseNode = pushCreatedNode(scenarioWithDefaults(source, createId('node-else'), 'else', 'else:', source.parent_node_id));
    pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId('node-action'),
        'action',
        'r "RenPy Mouse waits for a better clue."',
        elseNode.id,
        { default_title: 'r "RenPy Mouse waits for a better clue."' },
      ),
    );
    topLevelNodes.push(ifNode, elifNode, elseNode);
    selectedNode = ifNode;
  } else if (options.action === 'jump' || options.action === 'call') {
    const targetLabel = resolveRelationTarget(options.target ?? existingTarget(options.targetLabelId ?? ''));
    const relationNode = pushCreatedNode(
      scenarioWithDefaults(
        source,
        createId(`node-${options.action}`),
        options.action,
        `${options.action} ${targetLabel.qualified_name}`,
        source.parent_node_id,
        { target: targetLabel.qualified_name },
      ),
    );
    topLevelNodes.push(relationNode);
    selectedNode = relationNode;
    relationTargetLabel = targetLabel;
  } else {
    const returnNode = pushCreatedNode(
      scenarioWithDefaults(source, createId('node-return'), 'return', 'return', source.parent_node_id),
    );
    topLevelNodes.push(returnNode);
    selectedNode = returnNode;
  }

  assignTopLevelInsertionOrders(graph, source, topLevelNodes);
  const childrenByParent = scenarioChildrenByParent(createdNodes);
  topLevelNodes.forEach((node) => assignChildInsertionOrders(node, childrenByParent));
  arrangeInsertedScenarioVisuals(source, topLevelNodes, childrenByParent);

  if (createdTargetFiles.length > 0) {
    const meta = doc.getMap(META_CONTAINER);
    const sourceIndex = recordOrEmpty(meta.get('source_index'));
    const sourceFiles = recordOrEmpty(sourceIndex.files);
    for (const file of createdTargetFiles) {
      writeFileData(createIndexedTreeNode(doc, file.id), file);
      sourceFiles[file.id] = { path: file.path, content: '' };
    }
    meta.set('source_index', { ...sourceIndex, files: sourceFiles });
  }

  for (const fileId of noLabelFileIdsToActivate) {
    const fileNode = getEntityNode(doc, fileId);
    const metadata = recordOrEmpty(fileNode.data.get('metadata'));
    delete metadata.code_only;
    delete metadata.code_only_reason;
    fileNode.data.set('metadata', metadata);
  }

  for (const label of createdTargetLabels) {
    writeLabelData(createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id), label);
  }
  for (const start of createdTargetStarts) {
    writeLabelStartData(createIndexedTreeNode(doc, start.id, start.label_id), start);
  }
  for (const action of createdTargetActions) {
    writeScenarioData(doc, createIndexedTreeNode(doc, action.id, action.label_id), action);
  }

  const sourceTreeIndex = getEntityNode(doc, source.id).index();
  if (sourceTreeIndex === undefined) {
    throw new Error(`Missing source scenario tree index: ${source.id}`);
  }
  const topLevelTreeIndexes = new Map(topLevelNodes.map((node, index) => [node.id, sourceTreeIndex + 1 + index]));
  for (const node of createdNodes) {
    writeScenarioData(
      doc,
      createIndexedTreeNode(
        doc,
        node.id,
        node.parent_node_id ?? node.label_id,
        topLevelTreeIndexes.get(node.id),
      ),
      node,
    );
  }

  for (const relation of nestedRelations) {
    appendRelationEdge(doc, relation.kind, relation.node, relation.target);
  }

  if ((options.action === 'jump' || options.action === 'call') && selectedNode && relationTargetLabel) {
    appendRelationEdge(doc, options.action, selectedNode, relationTargetLabel);
  }

  doc.commit({
    origin: 'project-graph-next-scenario',
    message: `Insert ${options.action} scenario after ${source.id}`,
  });

  return {
    createdNodeIds: createdNodes.map((node) => node.id),
    selectedNodeId: selectedNode?.id ?? createdNodes[0]?.id ?? source.id,
    createdTargetIds: {
      files: createdTargetFiles.map((file) => file.id),
      labels: createdTargetLabels.map((label) => label.id),
      labelStarts: createdTargetStarts.map((start) => start.id),
    },
  };
};

export const replaceProjectGraphDiagnostics = (
  doc: LoroDoc,
  diagnostics: GraphDiagnosticSnapshot[],
): void => {
  doc.getMap(META_CONTAINER).set('diagnostics', diagnostics);
  doc.commit({ origin: 'project-graph-diagnostics', message: 'Replace ProjectGraph diagnostics' });
};

export const moveProjectGraphEntities = (doc: LoroDoc, changes: ProjectGraphEntityPositionChange[]): void => {
  if (changes.length === 0) {
    return;
  }

  for (const change of changes) {
    const node = getEntityNode(doc, change.entityId);
    node.data.set('position_x', change.position.x);
    node.data.set('position_y', change.position.y);
    if (change.manual && node.data.get('kind') === 'scenario') {
      node.data.set('metadata', {
        ...recordOrEmpty(node.data.get('metadata')),
        _manual_position: true,
      });
    }
  }
  doc.commit({ origin: 'project-graph-position', message: `Move ${changes.length} ProjectGraph entities` });
};

export const moveProjectGraphEntity = (doc: LoroDoc, entityId: string, position: GraphPoint): void => {
  moveProjectGraphEntities(doc, [{ entityId, position, manual: true }]);
};

const updateScenarioDescendantScope = (node: LoroTreeNode, fileId: string, labelId: string): void => {
  for (const child of node.children() ?? []) {
    if (child.data.get('kind') === 'scenario') {
      child.data.set('file_id', fileId);
      child.data.set('label_id', labelId);
      updateScenarioDescendantScope(child, fileId, labelId);
    }
  }
};

export const reparentScenarioNode = (doc: LoroDoc, nodeId: string, parentEntityId: string): void => {
  const node = getEntityNode(doc, nodeId);
  const parent = getEntityNode(doc, parentEntityId);

  if (node.data.get('kind') !== 'scenario') {
    throw new Error(`Entity is not a scenario node: ${nodeId}`);
  }

  const parentKind = parent.data.get('kind');
  if (parentKind !== 'label' && parentKind !== 'scenario') {
    throw new Error(`Scenario node parent must be a label or scenario node: ${parentEntityId}`);
  }

  const fileId = String(parent.data.get('file_id'));
  const labelId = parentKind === 'label' ? parentEntityId : String(parent.data.get('label_id'));
  const parentNodeId = parentKind === 'scenario' ? parentEntityId : null;

  node.move(parent);
  node.data.set('file_id', fileId);
  node.data.set('label_id', labelId);
  node.data.set('parent_node_id', parentNodeId);
  updateScenarioDescendantScope(node, fileId, labelId);
  doc.commit({ origin: 'project-graph-containment', message: `Reparent scenario ${nodeId}` });
};

const getScenarioContent = (doc: LoroDoc, meta: Record<string, unknown>): string => {
  const contentTextKey = String(meta.content_text_key ?? scenarioContentTextKey(String(meta.entity_id)));
  return doc.getText(contentTextKey).toString();
};

export const projectGraphEntityTreeIdsFromCrdtDoc = (doc: LoroDoc): Record<string, TreeID> =>
  Object.fromEntries(
    Object.entries(recordOrEmpty(doc.getMap(ENTITY_INDEX_CONTAINER).toJSON())).map(([entityId, treeId]) => [
      entityId,
      String(treeId) as TreeID,
    ]),
  );

export const projectGraphMetaValueFromCrdtDoc = (doc: LoroDoc, key: string): unknown =>
  doc.getMap(META_CONTAINER).get(key);

export const projectGraphEntityFromCrdtDoc = (
  doc: LoroDoc,
  entityId: string,
  scenarioOrder?: string,
): MaterializedProjectGraphEntity | null => {
  const treeId = doc.getMap(ENTITY_INDEX_CONTAINER).get(entityId) as TreeID | undefined;
  const node = treeId ? doc.getTree(TREE_CONTAINER).getNodeByID(treeId) : undefined;
  if (!node || node.isDeleted()) {
    return null;
  }

  const meta = recordOrEmpty(node.data.toJSON());
  const kind = meta.kind as ProjectGraphEntityKind | undefined;
  if (kind === 'file') {
    const file: FileFrameSnapshot = {
      id: String(meta.entity_id),
      path: String(meta.path),
      order: String(meta.order),
      visual: getVisual(meta),
    };
    const metadata = recordOrEmpty(meta.metadata);
    if (Object.keys(metadata).length > 0) {
      file.metadata = metadata;
    }
    return { kind, entity: file };
  }
  if (kind === 'label') {
    return {
      kind,
      entity: {
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        parent_label_id: meta.parent_label_id === null ? null : String(meta.parent_label_id),
        name: String(meta.name),
        qualified_name: String(meta.qualified_name),
        scope: meta.scope as LabelFrameSnapshot['scope'],
        label_start_node_id: String(meta.label_start_node_id),
        source_span: sourceSpanOrNull(meta.source_span),
        visual: getVisual(meta),
      },
    };
  }
  if (kind === 'labelStart') {
    return {
      kind,
      entity: {
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        qualified_name: String(meta.qualified_name),
        content: String(meta.content),
        visual: getVisual(meta),
      },
    };
  }
  if (kind === 'scenario') {
    return {
      kind,
      entity: {
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        parent_node_id: meta.parent_node_id === null ? null : String(meta.parent_node_id),
        type: String(meta.type),
        content: getScenarioContent(doc, meta),
        order: scenarioOrder ?? String(meta.order),
        source_span: sourceSpanOrNull(meta.source_span),
        metadata: recordOrEmpty(meta.metadata),
        visual: getVisual(meta),
      },
    };
  }
  return null;
};

const collectTreeEntities = (doc: LoroDoc, nodes: ProjectGraphTreeJsonNode[]) => {
  const files: FileFrameSnapshot[] = [];
  const labels: LabelFrameSnapshot[] = [];
  const labelStarts: LabelStartNodeSnapshot[] = [];
  const scenarios: ScenarioNodeSnapshot[] = [];

  const visit = (node: ProjectGraphTreeJsonNode, scenarioOrder?: string) => {
    const meta = node.meta;
    const kind = meta.kind as ProjectGraphEntityKind | undefined;

    if (kind === 'file') {
      const file: FileFrameSnapshot = {
        id: String(meta.entity_id),
        path: String(meta.path),
        order: String(meta.order),
        visual: getVisual(meta),
      };
      const metadata = recordOrEmpty(meta.metadata);
      if (Object.keys(metadata).length > 0) {
        file.metadata = metadata;
      }
      files.push(file);
    } else if (kind === 'label') {
      labels.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        parent_label_id: meta.parent_label_id === null ? null : String(meta.parent_label_id),
        name: String(meta.name),
        qualified_name: String(meta.qualified_name),
        scope: meta.scope as LabelFrameSnapshot['scope'],
        label_start_node_id: String(meta.label_start_node_id),
        source_span: sourceSpanOrNull(meta.source_span),
        visual: getVisual(meta),
      });
    } else if (kind === 'labelStart') {
      labelStarts.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        qualified_name: String(meta.qualified_name),
        content: String(meta.content),
        visual: getVisual(meta),
      });
    } else if (kind === 'scenario') {
      scenarios.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        parent_node_id: meta.parent_node_id === null ? null : String(meta.parent_node_id),
        type: String(meta.type),
        content: getScenarioContent(doc, meta),
        order: scenarioOrder ?? String(meta.order),
        source_span: sourceSpanOrNull(meta.source_span),
        metadata: recordOrEmpty(meta.metadata),
        visual: getVisual(meta),
      });
    }

    const scenarioChildren = (node.children ?? []).filter((child) => child.meta.kind === 'scenario');
    const scenarioOrderByTreeId = new Map(
      scenarioChildren.map((child, index) => [
        child.id,
        `${kind === 'scenario' && scenarioOrder ? `${scenarioOrder}.` : ''}${orderSegment(index)}`,
      ]),
    );
    for (const child of node.children ?? []) {
      visit(child, scenarioOrderByTreeId.get(child.id));
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return { files, labels, labelStarts, scenarios };
};

export const projectGraphFromCrdtDoc = (doc: LoroDoc): ProjectGraphSnapshot => {
  const meta = doc.getMap(META_CONTAINER);
  const treeJson = doc.getTree(TREE_CONTAINER).toJSON() as ProjectGraphTreeJsonNode[];
  const { files, labels, labelStarts, scenarios } = collectTreeEntities(doc, treeJson);
  const fileOrder = new Map(files.map((file, index) => [file.id, `${file.order}:${index}`]));
  const labelOrder = new Map(
    labels
      .sort((a, b) => {
        const fileCompare = String(fileOrder.get(a.file_id)).localeCompare(String(fileOrder.get(b.file_id)));
        if (fileCompare !== 0) {
          return fileCompare;
        }
        return (a.source_span?.start_line ?? 0) - (b.source_span?.start_line ?? 0);
      })
      .map((label, index) => [label.id, index]),
  );

  return {
    project_id: String(meta.get('project_id')),
    files: files.sort((a, b) => a.order.localeCompare(b.order)),
    labels: labels.sort((a, b) => Number(labelOrder.get(a.id)) - Number(labelOrder.get(b.id))),
    label_starts: labelStarts.sort((a, b) => Number(labelOrder.get(a.label_id)) - Number(labelOrder.get(b.label_id))),
    nodes: scenarios.sort((a, b) => {
      const fileCompare = String(fileOrder.get(a.file_id)).localeCompare(String(fileOrder.get(b.file_id)));
      if (fileCompare !== 0) {
        return fileCompare;
      }
      return a.order.localeCompare(b.order);
    }),
    edges: projectGraphRelationEdgesFromCrdtDoc(doc),
    diagnostics: [...((meta.get('diagnostics') as GraphDiagnosticSnapshot[] | undefined) ?? [])],
    source_index: recordOrEmpty(meta.get('source_index')),
  };
};
