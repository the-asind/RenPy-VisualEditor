import { LoroDoc, type LoroTreeNode, type TreeID, type VersionVector } from 'loro-crdt/base64';
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

const TREE_CONTAINER = 'project_graph_tree';
const META_CONTAINER = 'project_graph_meta';
const ENTITY_INDEX_CONTAINER = 'project_graph_entity_tree_ids';

type ProjectGraphEntityKind = 'file' | 'label' | 'labelStart' | 'scenario';

export type ProjectGraphCrdtDoc = LoroDoc;

export interface ProjectGraphEntityPositionChange {
  entityId: string;
  position: GraphPoint;
  manual?: boolean;
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
): LoroTreeNode => {
  const tree = doc.getTree(TREE_CONTAINER);
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
  const parentTreeId = parentEntityId ? (entityIndex.get(parentEntityId) as TreeID | undefined) : undefined;

  if (parentEntityId && !parentTreeId) {
    throw new Error(`Missing CRDT parent for entity ${entityId}: ${parentEntityId}`);
  }

  const node = tree.createNode(parentTreeId);
  entityIndex.set(entityId, node.id);
  return node;
};

const createChildrenWhenParentsExist = <T>(
  pending: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null,
  create: (item: T) => void,
): void => {
  const remaining = [...pending];
  const createdIds = new Set<string>();

  while (remaining.length > 0) {
    const before = remaining.length;

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const item = remaining[index];
      const parentId = getParentId(item);

      if (!parentId || createdIds.has(parentId) || !remaining.some((candidate) => getId(candidate) === parentId)) {
        create(item);
        createdIds.add(getId(item));
        remaining.splice(index, 1);
      }
    }

    if (remaining.length === before) {
      throw new Error('ProjectGraph contains cyclic or missing parent references');
    }
  }
};

export const createProjectGraphCrdtDoc = (
  graph: ProjectGraphSnapshot,
  options: ProjectGraphCrdtOptions = {},
): LoroDoc => {
  const doc = configureDoc(new LoroDoc(), options);
  const meta = doc.getMap(META_CONTAINER);

  meta.set('schema_version', 1);
  meta.set('project_id', graph.project_id);
  meta.set('edges', graph.edges);
  meta.set('diagnostics', graph.diagnostics);
  meta.set('source_index', graph.source_index);

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

export const importProjectGraphCrdtSnapshot = (
  snapshot: Uint8Array,
  options: ProjectGraphCrdtOptions = {},
): LoroDoc => configureDoc(LoroDoc.fromSnapshot(snapshot), options);

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

export const updateScenarioNodeContent = (doc: LoroDoc, nodeId: string, content: string): void => {
  const node = getEntityNode(doc, nodeId);
  if (node.data.get('kind') !== 'scenario') {
    throw new Error(`Entity is not a scenario node: ${nodeId}`);
  }
  const contentTextKey = String(node.data.get('content_text_key') ?? scenarioContentTextKey(nodeId));
  node.data.set('content_text_key', contentTextKey);
  doc.getText(contentTextKey).update(content);
  doc.commit({ origin: 'project-graph-content', message: `Update scenario ${nodeId} content` });
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

const collectTreeEntities = (doc: LoroDoc, nodes: ProjectGraphTreeJsonNode[]) => {
  const files: FileFrameSnapshot[] = [];
  const labels: LabelFrameSnapshot[] = [];
  const labelStarts: LabelStartNodeSnapshot[] = [];
  const scenarios: ScenarioNodeSnapshot[] = [];

  const visit = (node: ProjectGraphTreeJsonNode) => {
    const meta = node.meta;
    const kind = meta.kind as ProjectGraphEntityKind | undefined;

    if (kind === 'file') {
      files.push({
        id: String(meta.entity_id),
        path: String(meta.path),
        order: String(meta.order),
        visual: getVisual(meta),
      });
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
        order: String(meta.order),
        source_span: sourceSpanOrNull(meta.source_span),
        metadata: recordOrEmpty(meta.metadata),
        visual: getVisual(meta),
      });
    }

    for (const child of node.children ?? []) {
      visit(child);
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
    edges: [...((meta.get('edges') as FlowEdgeSnapshot[] | undefined) ?? [])],
    diagnostics: [...((meta.get('diagnostics') as GraphDiagnosticSnapshot[] | undefined) ?? [])],
    source_index: recordOrEmpty(meta.get('source_index')),
  };
};
