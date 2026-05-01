import { LoroDoc } from 'loro-crdt/base64/index.js';

const TREE_CONTAINER = 'project_graph_tree';
const META_CONTAINER = 'project_graph_meta';
const ENTITY_INDEX_CONTAINER = 'project_graph_entity_tree_ids';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const setVisual = (node, visual) => {
  node.data.set('position_x', Number(visual?.position?.x ?? 0));
  node.data.set('position_y', Number(visual?.position?.y ?? 0));
  node.data.set('size_width', Number(visual?.size?.width ?? 0));
  node.data.set('size_height', Number(visual?.size?.height ?? 0));
};

const getVisual = (meta) => ({
  position: {
    x: Number(meta.position_x ?? 0),
    y: Number(meta.position_y ?? 0),
  },
  size: {
    width: Number(meta.size_width ?? 0),
    height: Number(meta.size_height ?? 0),
  },
});

const sourceSpanOrNull = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    start_line: Number(value.start_line ?? 0),
    end_line: Number(value.end_line ?? 0),
  };
};

const recordOrEmpty = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};

const writeCommonEntityData = (node, kind, entityId, visual) => {
  node.data.set('kind', kind);
  node.data.set('entity_id', entityId);
  setVisual(node, visual);
};

const createIndexedTreeNode = (doc, entityId, parentEntityId = null) => {
  const tree = doc.getTree(TREE_CONTAINER);
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
  const parentTreeId = parentEntityId ? entityIndex.get(parentEntityId) : undefined;

  if (parentEntityId && !parentTreeId) {
    throw new Error(`Missing CRDT parent for entity ${entityId}: ${parentEntityId}`);
  }

  const node = tree.createNode(parentTreeId);
  entityIndex.set(entityId, node.id);
  return node;
};

const createChildrenWhenParentsExist = (pending, getId, getParentId, create) => {
  const remaining = [...pending];
  const createdIds = new Set();

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

const createProjectGraphCrdtDoc = (graph) => {
  const doc = new LoroDoc();
  const meta = doc.getMap(META_CONTAINER);

  meta.set('schema_version', 1);
  meta.set('project_id', graph.project_id);
  meta.set('edges', graph.edges ?? []);
  meta.set('diagnostics', graph.diagnostics ?? []);
  meta.set('source_index', graph.source_index ?? {});

  for (const file of [...(graph.files ?? [])].sort((a, b) => a.order.localeCompare(b.order))) {
    const node = createIndexedTreeNode(doc, file.id);
    writeCommonEntityData(node, 'file', file.id, file.visual);
    node.data.set('path', file.path);
    node.data.set('order', file.order);
  }

  createChildrenWhenParentsExist(
    [...(graph.labels ?? [])].sort((a, b) => (a.source_span?.start_line ?? 0) - (b.source_span?.start_line ?? 0)),
    (label) => label.id,
    (label) => label.parent_label_id ?? label.file_id,
    (label) => {
      const node = createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id);
      writeCommonEntityData(node, 'label', label.id, label.visual);
      node.data.set('file_id', label.file_id);
      node.data.set('parent_label_id', label.parent_label_id);
      node.data.set('name', label.name);
      node.data.set('qualified_name', label.qualified_name);
      node.data.set('scope', label.scope);
      node.data.set('label_start_node_id', label.label_start_node_id);
      node.data.set('source_span', label.source_span);
    },
  );

  for (const start of graph.label_starts ?? []) {
    const node = createIndexedTreeNode(doc, start.id, start.label_id);
    writeCommonEntityData(node, 'labelStart', start.id, start.visual);
    node.data.set('file_id', start.file_id);
    node.data.set('label_id', start.label_id);
    node.data.set('qualified_name', start.qualified_name);
    node.data.set('content', start.content);
  }

  createChildrenWhenParentsExist(
    [...(graph.nodes ?? [])].sort((a, b) => a.order.localeCompare(b.order)),
    (scenario) => scenario.id,
    (scenario) => scenario.parent_node_id ?? scenario.label_id,
    (scenario) => {
      const node = createIndexedTreeNode(doc, scenario.id, scenario.parent_node_id ?? scenario.label_id);
      writeCommonEntityData(node, 'scenario', scenario.id, scenario.visual);
      node.data.set('file_id', scenario.file_id);
      node.data.set('label_id', scenario.label_id);
      node.data.set('parent_node_id', scenario.parent_node_id);
      node.data.set('type', scenario.type);
      node.data.set('content', scenario.content);
      node.data.set('order', scenario.order);
      node.data.set('source_span', scenario.source_span);
      node.data.set('metadata', scenario.metadata ?? {});
    },
  );

  doc.commit({ origin: 'project-graph-import', message: 'Import ProjectGraph snapshot into Loro' });
  return doc;
};

const collectTreeEntities = (nodes) => {
  const files = [];
  const labels = [];
  const labelStarts = [];
  const scenarios = [];

  const visit = (node) => {
    const meta = node.meta ?? {};

    if (meta.kind === 'file') {
      files.push({
        id: String(meta.entity_id),
        path: String(meta.path),
        order: String(meta.order),
        visual: getVisual(meta),
      });
    } else if (meta.kind === 'label') {
      labels.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        parent_label_id: meta.parent_label_id === null ? null : String(meta.parent_label_id),
        name: String(meta.name),
        qualified_name: String(meta.qualified_name),
        scope: String(meta.scope),
        label_start_node_id: String(meta.label_start_node_id),
        source_span: sourceSpanOrNull(meta.source_span),
        visual: getVisual(meta),
      });
    } else if (meta.kind === 'labelStart') {
      labelStarts.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        qualified_name: String(meta.qualified_name),
        content: String(meta.content),
        visual: getVisual(meta),
      });
    } else if (meta.kind === 'scenario') {
      scenarios.push({
        id: String(meta.entity_id),
        file_id: String(meta.file_id),
        label_id: String(meta.label_id),
        parent_node_id: meta.parent_node_id === null ? null : String(meta.parent_node_id),
        type: String(meta.type),
        content: String(meta.content),
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

const projectGraphFromCrdtDoc = (doc) => {
  const meta = doc.getMap(META_CONTAINER);
  const treeJson = doc.getTree(TREE_CONTAINER).toJSON();
  const { files, labels, labelStarts, scenarios } = collectTreeEntities(treeJson);
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
    edges: [...(meta.get('edges') ?? [])],
    diagnostics: [...(meta.get('diagnostics') ?? [])],
    source_index: recordOrEmpty(meta.get('source_index')),
  };
};

const command = process.argv[2];
const input = await readStdin();

if (command === 'encode') {
  const graph = JSON.parse(input.toString('utf-8'));
  const doc = createProjectGraphCrdtDoc(graph);
  process.stdout.write(Buffer.from(doc.export({ mode: 'snapshot' })));
} else if (command === 'decode') {
  const doc = LoroDoc.fromSnapshot(new Uint8Array(input));
  process.stdout.write(JSON.stringify(projectGraphFromCrdtDoc(doc)));
} else {
  console.error('Usage: node scripts/project-graph-snapshot-cli.mjs <encode|decode>');
  process.exit(2);
}
