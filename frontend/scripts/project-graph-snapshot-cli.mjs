import * as loroCrdt from 'loro-crdt';

const { LoroDoc } = loroCrdt.default ?? loroCrdt;

const TREE_CONTAINER = 'project_graph_tree';
const META_CONTAINER = 'project_graph_meta';
const ENTITY_INDEX_CONTAINER = 'project_graph_entity_tree_ids';
const EDGE_CONTAINER = 'project_graph_edges';
const PROJECT_GRAPH_SCHEMA_VERSION = 2;
const orderSegment = (index) => String(index).padStart(4, '0');

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

const scenarioContentTextKey = (nodeId) => `scenario_content:${nodeId}`;

const writeCommonEntityData = (node, kind, entityId, visual) => {
  node.data.set('kind', kind);
  node.data.set('entity_id', entityId);
  setVisual(node, visual);
};

const writeFileData = (node, file) => {
  writeCommonEntityData(node, 'file', file.id, file.visual);
  node.data.set('path', file.path);
  node.data.set('order', file.order);
  if (file.metadata && Object.keys(file.metadata).length > 0) {
    node.data.set('metadata', file.metadata);
  }
};

const writeLabelData = (node, label) => {
  writeCommonEntityData(node, 'label', label.id, label.visual);
  node.data.set('file_id', label.file_id);
  node.data.set('parent_label_id', label.parent_label_id);
  node.data.set('name', label.name);
  node.data.set('qualified_name', label.qualified_name);
  node.data.set('scope', label.scope);
  node.data.set('label_start_node_id', label.label_start_node_id);
  node.data.set('source_span', label.source_span);
};

const writeLabelStartData = (node, start) => {
  writeCommonEntityData(node, 'labelStart', start.id, start.visual);
  node.data.set('file_id', start.file_id);
  node.data.set('label_id', start.label_id);
  node.data.set('qualified_name', start.qualified_name);
  node.data.set('content', start.content);
};

const writeScenarioData = (doc, node, scenario) => {
  writeCommonEntityData(node, 'scenario', scenario.id, scenario.visual);
  const contentTextKey = scenarioContentTextKey(scenario.id);
  node.data.set('file_id', scenario.file_id);
  node.data.set('label_id', scenario.label_id);
  node.data.set('parent_node_id', scenario.parent_node_id);
  node.data.set('type', scenario.type);
  node.data.set('content_text_key', contentTextKey);
  node.data.set('order', scenario.order);
  node.data.set('source_span', scenario.source_span);
  node.data.set('metadata', scenario.metadata ?? {});
  doc.getText(contentTextKey).update(scenario.content);
};

const createIndexedTreeNode = (doc, entityId, parentEntityId = null, index = undefined) => {
  const tree = doc.getTree(TREE_CONTAINER);
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
  const parentTreeId = parentEntityId ? entityIndex.get(parentEntityId) : undefined;

  if (parentEntityId && !parentTreeId) {
    throw new Error(`Missing CRDT parent for entity ${entityId}: ${parentEntityId}`);
  }

  const node = tree.createNode(parentTreeId, index);
  entityIndex.set(entityId, node.id);
  return node;
};

const getEntityNode = (doc, entityId) => {
  const treeId = doc.getMap(ENTITY_INDEX_CONTAINER).get(entityId);
  const node = treeId ? doc.getTree(TREE_CONTAINER).getNodeByID(treeId) : undefined;
  if (!node) {
    throw new Error(`Missing CRDT entity: ${entityId}`);
  }
  return node;
};

const createChildrenWhenParentsExist = (pending, getId, getParentId, create) => {
  let remaining = [...pending];
  const createdIds = new Set();

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

const createProjectGraphCrdtDoc = (graph) => {
  const doc = new LoroDoc();
  const meta = doc.getMap(META_CONTAINER);
  doc.getTree(TREE_CONTAINER).enableFractionalIndex(1);

  meta.set('schema_version', PROJECT_GRAPH_SCHEMA_VERSION);
  meta.set('project_id', graph.project_id);
  meta.set('diagnostics', graph.diagnostics ?? []);
  meta.set('source_index', graph.source_index ?? {});
  const edgeMap = doc.getMap(EDGE_CONTAINER);
  for (const edge of graph.edges ?? []) {
    edgeMap.set(edge.id, edge);
  }

  for (const file of [...(graph.files ?? [])].sort((a, b) => a.order.localeCompare(b.order))) {
    const node = createIndexedTreeNode(doc, file.id);
    writeCommonEntityData(node, 'file', file.id, file.visual);
    node.data.set('path', file.path);
    node.data.set('order', file.order);
    if (file.metadata && Object.keys(file.metadata).length > 0) {
      node.data.set('metadata', file.metadata);
    }
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
      const contentTextKey = scenarioContentTextKey(scenario.id);
      writeCommonEntityData(node, 'scenario', scenario.id, scenario.visual);
      node.data.set('file_id', scenario.file_id);
      node.data.set('label_id', scenario.label_id);
      node.data.set('parent_node_id', scenario.parent_node_id);
      node.data.set('type', scenario.type);
      node.data.set('content_text_key', contentTextKey);
      node.data.set('order', scenario.order);
      node.data.set('source_span', scenario.source_span);
      node.data.set('metadata', scenario.metadata ?? {});
      doc.getText(contentTextKey).update(scenario.content);
    },
  );

  doc.commit({ origin: 'project-graph-import', message: 'Import ProjectGraph snapshot into Loro' });
  return doc;
};

const getScenarioContent = (doc, meta) => {
  const contentTextKey = String(meta.content_text_key ?? scenarioContentTextKey(String(meta.entity_id)));
  return doc.getText(contentTextKey).toString();
};

const collectTreeEntities = (doc, nodes, useTreeOrder) => {
  const files = [];
  const labels = [];
  const labelStarts = [];
  const scenarios = [];

  const visit = (node, scenarioOrder) => {
    const meta = node.meta ?? {};

    if (meta.kind === 'file') {
      const file = {
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
        content: getScenarioContent(doc, meta),
        order: useTreeOrder ? scenarioOrder ?? String(meta.order) : String(meta.order),
        source_span: sourceSpanOrNull(meta.source_span),
        metadata: recordOrEmpty(meta.metadata),
        visual: getVisual(meta),
      });
    }

    const scenarioChildren = (node.children ?? []).filter((child) => child.meta?.kind === 'scenario');
    const scenarioOrderByTreeId = new Map(
      scenarioChildren.map((child, index) => [
        child.id,
        `${meta.kind === 'scenario' && scenarioOrder ? `${scenarioOrder}.` : ''}${orderSegment(index)}`,
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

const projectGraphFromCrdtDoc = (doc) => {
  const meta = doc.getMap(META_CONTAINER);
  const treeJson = doc.getTree(TREE_CONTAINER).toJSON();
  const useTreeOrder = Number(meta.get('schema_version') ?? 1) >= PROJECT_GRAPH_SCHEMA_VERSION;
  const { files, labels, labelStarts, scenarios } = collectTreeEntities(doc, treeJson, useTreeOrder);
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
    edges: (() => {
      const byId = new Map([...(meta.get('edges') ?? [])].map((edge) => [edge.id, edge]));
      for (const edge of Object.values(recordOrEmpty(doc.getMap(EDGE_CONTAINER).toJSON()))) {
        if (edge && typeof edge.id === 'string') byId.set(edge.id, edge);
      }
      return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
    })(),
    diagnostics: [...(meta.get('diagnostics') ?? [])],
    source_index: recordOrEmpty(meta.get('source_index')),
  };
};

const sanitizeIdSegment = (value) =>
  String(value ?? 'id')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'id';

const createUniqueId = (doc, prefix, seed, fallback) => {
  const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
  const base = `${prefix}-${sanitizeIdSegment(seed)}-${sanitizeIdSegment(fallback)}`;
  if (!entityIndex.get(base)) {
    return base;
  }
  for (let index = 1; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!entityIndex.get(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to create unique id for ${prefix}`);
};

const createRelationEdgeId = (edges, kind, sourceNodeId, targetNodeId) => {
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
  throw new Error(`Unable to create relation edge id for ${sourceNodeId}`);
};

const nextFileOrder = (graph) => orderSegment(graph.files.length);

const fileVisualAfterGraph = (graph) => {
  const rightEdge = graph.files.reduce(
    (maximum, file) => Math.max(maximum, file.visual.position.x + file.visual.size.width),
    -160,
  );
  return { position: { x: rightEdge + 160, y: 0 }, size: { width: 1200, height: 800 } };
};

const mutateContinuation = (payload) => {
  const command = payload.command ?? {};
  if (!payload.snapshotBase64) {
    throw new Error('snapshotBase64 is required');
  }

  const doc = LoroDoc.fromSnapshot(new Uint8Array(Buffer.from(payload.snapshotBase64, 'base64')));
  const from = doc.oplogVersion();
  const graph = projectGraphFromCrdtDoc(doc);
  const source = graph.nodes.find((node) => node.id === command.sourceNodeId);
  if (!source) {
    throw new Error(`Missing source scenario node: ${command.sourceNodeId}`);
  }

  const idSeed = command.idSeed ?? command.target?.draftId ?? command.target?.name ?? command.action;
  const createdFiles = [];
  const createdLabels = [];
  const createdStarts = [];
  const createdNodes = [];
  const relations = [];
  const targetByDraftId = new Map();
  const noLabelFileIdsToActivate = new Set();
  const scenarioVisual = (type, topLevelIndex = 0) => ({
    position: {
      x: type === 'action' ? 56 : source.visual.position.x,
      y: source.visual.position.y + source.visual.size.height + 96 + topLevelIndex * 112,
    },
    size:
      type === 'if' || type === 'elif' || type === 'else'
        ? { width: 320, height: 88 }
        : type === 'menu'
          ? { width: 360, height: 220 }
          : type === 'menu_choice' || type === 'menu_prompt'
            ? { width: 300, height: 72 }
            : { width: 280, height: 72 },
  });
  const quoteRenpy = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  const resolveTarget = (target) => {
    if (!target || typeof target !== 'object') {
      throw new Error('Relation target is required');
    }
    if (target.kind === 'existing') {
      const label = graph.labels.find((candidate) => candidate.id === target.labelId);
      if (!label) throw new Error(`Missing target label: ${target.labelId}`);
      return label;
    }
    if (target.kind !== 'new') {
      throw new Error(`Unsupported relation target kind: ${target.kind}`);
    }
    const cached = targetByDraftId.get(target.draftId);
    if (cached) return cached;

    let fileId;
    if (target.file?.kind === 'new') {
      const path = String(target.file.path ?? '').replace(/\\/g, '/');
      const file = {
        id: createUniqueId(doc, 'file', idSeed, path),
        path,
        order: nextFileOrder({ files: [...graph.files, ...createdFiles] }),
        visual: fileVisualAfterGraph({ files: [...graph.files, ...createdFiles] }),
      };
      writeFileData(createIndexedTreeNode(doc, file.id), file);
      const meta = doc.getMap(META_CONTAINER);
      const sourceIndex = recordOrEmpty(meta.get('source_index'));
      const files = recordOrEmpty(sourceIndex.files);
      files[file.id] = { path: file.path, content: '' };
      meta.set('source_index', { ...sourceIndex, files });
      createdFiles.push(file);
      fileId = file.id;
    } else if (target.file?.kind === 'existing') {
      fileId = target.file.fileId;
      const destinationFile = graph.files.find((file) => file.id === fileId);
      if (!destinationFile) throw new Error(`Missing target file: ${fileId}`);
      if (destinationFile.metadata?.code_only_reason === 'no_labels') noLabelFileIdsToActivate.add(fileId);
    } else {
      throw new Error('Invalid relation target file');
    }

    const owner = target.scope === 'local' ? graph.labels.find((label) => label.id === target.ownerLabelId) : null;
    const qualifiedName = owner ? `${owner.qualified_name}.${target.name}` : target.name;
    const label = {
      id: createUniqueId(doc, 'label', idSeed, qualifiedName),
      file_id: fileId,
      parent_label_id: owner?.id ?? null,
      name: owner ? `.${target.name}` : target.name,
      qualified_name: qualifiedName,
      scope: target.scope ?? 'global',
      label_start_node_id: '',
      source_span: null,
      visual: { position: { x: 48, y: 48 + createdLabels.length * 456 }, size: { width: 960, height: 360 } },
    };
    const start = {
      id: createUniqueId(doc, 'label-start', idSeed, qualifiedName),
      file_id: fileId,
      label_id: label.id,
      qualified_name: qualifiedName,
      content: `label ${label.name}:`,
      visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
    };
    label.label_start_node_id = start.id;
    writeLabelData(createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id), label);
    writeLabelStartData(createIndexedTreeNode(doc, start.id, label.id), start);
    const placeholder = {
      id: createUniqueId(doc, 'node-action', idSeed, `${qualifiedName}-pass`),
      file_id: fileId,
      label_id: label.id,
      parent_node_id: null,
      type: 'action',
      content: 'pass',
      order: '0000',
      source_span: null,
      metadata: { default_title: 'pass' },
      visual: { position: { x: 64, y: 136 }, size: { width: 340, height: 80 } },
    };
    writeScenarioData(doc, createIndexedTreeNode(doc, placeholder.id, label.id), placeholder);
    createdLabels.push(label);
    createdStarts.push(start);
    targetByDraftId.set(target.draftId, label);
    return label;
  };

  const makeNode = (type, content, parentNodeId, metadata = {}, topLevelIndex = 0) => {
    const node = {
      id: createUniqueId(doc, `node-${type}`, idSeed, `${source.id}-${createdNodes.length}`),
      file_id: source.file_id,
      label_id: source.label_id,
      parent_node_id: parentNodeId,
      type,
      content,
      order: '',
      source_span: null,
      metadata,
      visual: scenarioVisual(type, topLevelIndex),
    };
    createdNodes.push(node);
    return node;
  };
  const makeContinuation = (parentNodeId, leaf) => {
    if (leaf.kind === 'action') {
      const content = String(leaf.content ?? '').trim() || 'pass';
      return makeNode('action', content, parentNodeId);
    }
    const targetLabel = resolveTarget(leaf.target ?? { kind: 'existing', labelId: leaf.targetLabelId });
    const node = makeNode(leaf.kind, `${leaf.kind} ${targetLabel.qualified_name}`, parentNodeId, { target: targetLabel.qualified_name });
    relations.push({ kind: leaf.kind, node, label: targetLabel });
    return node;
  };

  const topLevelNodes = [];
  if (command.action === 'jump' || command.action === 'call') {
    const targetLabel = resolveTarget(command.target ?? { kind: 'existing', labelId: command.targetLabelId });
    const node = makeNode(command.action, `${command.action} ${targetLabel.qualified_name}`, source.parent_node_id, { target: targetLabel.qualified_name });
    topLevelNodes.push(node);
    relations.push({ kind: command.action, node, label: targetLabel });
  } else if (command.action === 'conditional') {
    const draft = command.conditionalDraft;
    const ifCondition = String(draft?.ifBranch?.condition ?? '').trim();
    const ifNode = makeNode('if', `if ${ifCondition}:`, source.parent_node_id, { condition: ifCondition }, 0);
    topLevelNodes.push(ifNode);
    makeContinuation(ifNode.id, draft.ifBranch.continuation);
    for (const branch of draft.elifBranches ?? []) {
      const condition = String(branch.condition ?? '').trim();
      const elifNode = makeNode('elif', `elif ${condition}:`, source.parent_node_id, { condition }, topLevelNodes.length);
      topLevelNodes.push(elifNode);
      makeContinuation(elifNode.id, branch.continuation);
    }
    if (draft.elseBranch) {
      const elseNode = makeNode('else', 'else:', source.parent_node_id, {}, topLevelNodes.length);
      topLevelNodes.push(elseNode);
      makeContinuation(elseNode.id, draft.elseBranch.continuation);
    }
  } else if (command.action === 'menu') {
    const draft = command.menuDraft;
    const menuNode = makeNode('menu', 'menu:', source.parent_node_id, {}, 0);
    topLevelNodes.push(menuNode);
    if (String(draft?.prompt ?? '').trim()) {
      makeNode('menu_prompt', quoteRenpy(String(draft.prompt).trim()), menuNode.id, { prompt_text: String(draft.prompt).trim() });
    }
    for (const choice of draft?.choices ?? []) {
      const text = String(choice.text ?? '').trim();
      const condition = String(choice.condition ?? '').trim();
      const choiceNode = makeNode('menu_choice', `${quoteRenpy(text)}${condition ? ` if ${condition}` : ''}:`, menuNode.id, {
        choice_text: text,
        ...(condition ? { condition } : {}),
      });
      makeContinuation(choiceNode.id, choice.continuation);
    }
  } else if (command.action === 'return') {
    topLevelNodes.push(makeNode('return', 'return', source.parent_node_id));
  } else {
    throw new Error(`Unsupported continuation action: ${command.action}`);
  }

  for (const fileId of noLabelFileIdsToActivate) {
    const fileNode = getEntityNode(doc, fileId);
    const metadata = recordOrEmpty(fileNode.data.get('metadata'));
    delete metadata.code_only;
    delete metadata.code_only_reason;
    fileNode.data.set('metadata', metadata);
  }

  const sourceTreeIndex = getEntityNode(doc, source.id).index();
  for (const [index, node] of topLevelNodes.entries()) {
    writeScenarioData(doc, createIndexedTreeNode(doc, node.id, node.parent_node_id ?? node.label_id, sourceTreeIndex + 1 + index), node);
  }
  for (const node of createdNodes.filter((candidate) => !topLevelNodes.some((topLevel) => topLevel.id === candidate.id))) {
    writeScenarioData(doc, createIndexedTreeNode(doc, node.id, node.parent_node_id ?? node.label_id), node);
  }
  for (const relation of relations) {
    const edges = projectGraphFromCrdtDoc(doc).edges;
    const edge = {
      id: createRelationEdgeId(edges, relation.kind, relation.node.id, relation.label.label_start_node_id),
      source_node_id: relation.node.id,
      target_node_id: relation.label.label_start_node_id,
      kind: relation.kind,
      metadata: { target: relation.label.qualified_name },
    };
    doc.getMap(EDGE_CONTAINER).set(edge.id, edge);
  }
  doc.commit({ origin: 'project-graph-continuation', message: `Insert ${command.action} continuation` });

  return {
    snapshotBase64: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
    updateBase64: Buffer.from(doc.export({ mode: 'update', from })).toString('base64'),
    result: {
      createdNodeIds: createdNodes.map((node) => node.id),
      selectedNodeId: topLevelNodes[0]?.id ?? createdNodes[0]?.id ?? source.id,
      createdTargetIds: {
        files: createdFiles.map((file) => file.id),
        labels: createdLabels.map((label) => label.id),
        labelStarts: createdStarts.map((start) => start.id),
      },
    },
  };
};

const mutateStructure = (payload) => {
  const command = payload.command ?? {};
  if (!payload.snapshotBase64) throw new Error('snapshotBase64 is required');

  const doc = LoroDoc.fromSnapshot(new Uint8Array(Buffer.from(payload.snapshotBase64, 'base64')));
  const from = doc.oplogVersion();
  const graph = projectGraphFromCrdtDoc(doc);
  const seed = command.idSeed ?? command.path ?? command.name ?? command.kind;

  if (command.kind === 'delete') {
    const deletion = command.deleteEntityIds ?? {};
    const deleteIds = new Set([
      ...(deletion.files ?? []),
      ...(deletion.labels ?? []),
      ...(deletion.labelStarts ?? []),
      ...(deletion.nodes ?? []),
    ]);
    if (!deleteIds.has(command.entityId)) throw new Error('Delete plan does not include the requested entity');

    const parentById = new Map([
      ...graph.files.map((file) => [file.id, null]),
      ...graph.labels.map((label) => [label.id, label.parent_label_id ?? label.file_id]),
      ...graph.label_starts.map((start) => [start.id, start.label_id]),
      ...graph.nodes.map((node) => [node.id, node.parent_node_id ?? node.label_id]),
    ]);
    const tree = doc.getTree(TREE_CONTAINER);
    const entityIndex = doc.getMap(ENTITY_INDEX_CONTAINER);
    const deleteRoots = [...deleteIds].filter((id) => !deleteIds.has(parentById.get(id)));
    for (const id of deleteRoots) {
      const treeId = entityIndex.get(id);
      if (!treeId) throw new Error(`Missing CRDT entity in delete plan: ${id}`);
      tree.delete(treeId);
    }
    for (const id of deleteIds) entityIndex.delete(id);

    const edgeIds = new Set(deletion.edges ?? []);
    const edgeMap = doc.getMap(EDGE_CONTAINER);
    for (const edgeId of edgeIds) edgeMap.delete(edgeId);
    const meta = doc.getMap(META_CONTAINER);
    const legacyEdges = [...(meta.get('edges') ?? [])].filter((edge) => !edgeIds.has(edge?.id));
    if (meta.get('edges')) meta.set('edges', legacyEdges);
    const diagnosticIds = new Set(deletion.diagnostics ?? []);
    meta.set('diagnostics', [...(meta.get('diagnostics') ?? [])].filter((diagnostic) => !diagnosticIds.has(diagnostic?.id)));
    const sourceIndex = recordOrEmpty(meta.get('source_index'));
    const sourceFiles = recordOrEmpty(sourceIndex.files);
    for (const fileId of deletion.files ?? []) delete sourceFiles[fileId];
    meta.set('source_index', { ...sourceIndex, files: sourceFiles });

    const createdNodes = [];
    for (const [index, parent] of (command.replacementPassParents ?? []).entries()) {
      const label = parent.kind === 'label' ? graph.labels.find((candidate) => candidate.id === parent.id) : null;
      const parentNode = parent.kind === 'scenario' ? graph.nodes.find((candidate) => candidate.id === parent.id) : null;
      const fileId = label?.file_id ?? parentNode?.file_id;
      const labelId = label?.id ?? parentNode?.label_id;
      if (!fileId || !labelId || deleteIds.has(parent.id)) throw new Error(`Invalid replacement pass parent: ${parent.id}`);
      const passId = createUniqueId(doc, 'node-action', `${command.entityId}-delete`, `${parent.id}-pass-${index}`);
      const passNode = {
        id: passId,
        file_id: fileId,
        label_id: labelId,
        parent_node_id: parent.kind === 'scenario' ? parent.id : null,
        type: 'action',
        content: 'pass',
        order: '9999',
        source_span: null,
        metadata: { default_title: 'pass' },
        visual: { position: { x: 64, y: 136 }, size: { width: 340, height: 80 } },
      };
      writeScenarioData(doc, createIndexedTreeNode(doc, passId, parent.id), passNode);
      createdNodes.push(passNode);
    }

    doc.commit({ origin: 'project-graph-delete-structure', message: `Delete ${command.entityId}` });
    return {
      snapshotBase64: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
      updateBase64: Buffer.from(doc.export({ mode: 'update', from })).toString('base64'),
      result: {
        selectedEntityId: command.replacementPassParents?.[0]?.id ?? null,
        deletedEntityIds: deletion,
        createdEntityIds: { files: [], labels: [], labelStarts: [], nodes: createdNodes.map((node) => node.id) },
      },
    };
  }

  if (command.kind === 'file') {
    const path = String(command.path ?? '').replace(/\\/g, '/');
    const file = {
      id: createUniqueId(doc, 'file', seed, path),
      path,
      order: nextFileOrder(graph),
      metadata: { code_only: true, code_only_reason: 'no_labels' },
      visual: {
        position: { x: Number(command.position?.x ?? 0), y: Number(command.position?.y ?? 0) },
        size: { width: 1200, height: 800 },
      },
    };
    writeFileData(createIndexedTreeNode(doc, file.id), file);
    const meta = doc.getMap(META_CONTAINER);
    const sourceIndex = recordOrEmpty(meta.get('source_index'));
    const files = recordOrEmpty(sourceIndex.files);
    files[file.id] = { path: file.path, content: '' };
    meta.set('source_index', { ...sourceIndex, files });
    doc.commit({ origin: 'project-graph-create-structure', message: `Create file ${file.path}` });
    return {
      snapshotBase64: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
      updateBase64: Buffer.from(doc.export({ mode: 'update', from })).toString('base64'),
      result: { selectedEntityId: file.id, createdEntityIds: { files: [file.id], labels: [], labelStarts: [], nodes: [] } },
    };
  }

  if (command.kind !== 'label' && command.kind !== 'sublabel') {
    throw new Error(`Unsupported structure command: ${command.kind}`);
  }
  const parent = command.parentLabelId
    ? graph.labels.find((label) => label.id === command.parentLabelId)
    : null;
  const fileId = String(command.fileId ?? parent?.file_id ?? '');
  const qualifiedName = String(command.qualifiedName ?? (parent ? `${parent.qualified_name}.${command.name}` : command.name));
  const labelHeader = String(command.labelHeader ?? (parent?.scope === 'global' ? `.${command.name}` : qualifiedName));
  const scope = String(command.scope ?? (parent ? (parent.scope === 'global' ? 'local' : 'nested') : 'global'));
  const siblingCount = graph.labels.filter((label) => label.file_id === fileId && label.parent_label_id === (parent?.id ?? null)).length;
  const labelId = createUniqueId(doc, 'label', seed, qualifiedName);
  const startId = createUniqueId(doc, 'label-start', seed, qualifiedName);
  const placeholderId = createUniqueId(doc, 'node-action', seed, `${qualifiedName}-pass`);
  const label = {
    id: labelId,
    file_id: fileId,
    parent_label_id: parent?.id ?? null,
    name: labelHeader,
    qualified_name: qualifiedName,
    scope,
    label_start_node_id: startId,
    source_span: null,
    visual: { position: { x: 48, y: 48 + siblingCount * 456 }, size: { width: 960, height: 360 } },
  };
  const start = {
    id: startId,
    file_id: fileId,
    label_id: labelId,
    qualified_name: qualifiedName,
    content: `label ${labelHeader}:`,
    visual: { position: { x: 32, y: 32 }, size: { width: 280, height: 72 } },
  };
  const placeholder = {
    id: placeholderId,
    file_id: fileId,
    label_id: labelId,
    parent_node_id: null,
    type: 'action',
    content: 'pass',
    order: '0000',
    source_span: null,
    metadata: { default_title: 'pass' },
    visual: { position: { x: 64, y: 136 }, size: { width: 340, height: 80 } },
  };
  writeLabelData(createIndexedTreeNode(doc, label.id, label.parent_label_id ?? label.file_id), label);
  writeLabelStartData(createIndexedTreeNode(doc, start.id, label.id), start);
  writeScenarioData(doc, createIndexedTreeNode(doc, placeholder.id, label.id), placeholder);
  const fileNode = getEntityNode(doc, fileId);
  const fileMetadata = recordOrEmpty(fileNode.data.get('metadata'));
  delete fileMetadata.code_only;
  delete fileMetadata.code_only_reason;
  fileNode.data.set('metadata', fileMetadata);
  doc.commit({ origin: 'project-graph-create-structure', message: `Create label ${qualifiedName}` });
  return {
    snapshotBase64: Buffer.from(doc.export({ mode: 'snapshot' })).toString('base64'),
    updateBase64: Buffer.from(doc.export({ mode: 'update', from })).toString('base64'),
    result: {
      selectedEntityId: label.id,
      createdEntityIds: { files: [], labels: [label.id], labelStarts: [start.id], nodes: [placeholder.id] },
    },
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
} else if (command === 'mutate-continuation') {
  const payload = JSON.parse(input.toString('utf-8'));
  process.stdout.write(JSON.stringify(mutateContinuation(payload)));
} else if (command === 'mutate-structure') {
  const payload = JSON.parse(input.toString('utf-8'));
  process.stdout.write(JSON.stringify(mutateStructure(payload)));
} else {
  console.error('Usage: node scripts/project-graph-snapshot-cli.mjs <encode|decode|mutate-continuation|mutate-structure>');
  process.exit(2);
}
