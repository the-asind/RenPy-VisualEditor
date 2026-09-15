import type {
  FlowEdgeSnapshot,
  ProjectGraphSnapshot,
  ScenarioNodeSnapshot,
} from './projectGraphProjection';

export type ProjectGraphDeletableEntityKind = 'file' | 'label' | 'scenario';

export interface ProjectGraphDeleteCommand {
  kind: 'delete';
  entityId: string;
}

export interface ProjectGraphDeletionReference {
  edgeId: string;
  kind: 'jump' | 'call';
  sourceNodeId: string;
  sourceNodeContent: string;
  sourceFileId: string;
  sourceFilePath: string;
  sourceLabelId: string;
  sourceLabelQualifiedName: string;
  targetNodeId: string;
  targetLabelId: string | null;
  targetLabelQualifiedName: string | null;
}

export interface ProjectGraphDeletionBlocker {
  code: 'protected_label_start' | 'protected_start_label' | 'last_file' | 'empty_menu' | 'dynamic_reference';
  nodeId: string | null;
  diagnosticId?: string;
}

export interface ProjectGraphDeletionWarning {
  code: 'nested_entities' | 'outgoing_references' | 'diagnostics_removed' | 'pass_inserted' | 'opaque_code';
  count: number;
}

export interface ProjectGraphDeletionEntityIds {
  files: string[];
  labels: string[];
  labelStarts: string[];
  nodes: string[];
  edges: string[];
  diagnostics: string[];
}

export interface ProjectGraphDeletionPassParent {
  kind: 'label' | 'scenario';
  id: string;
}

export interface ProjectGraphDeletionImpact {
  entity: { id: string; kind: ProjectGraphDeletableEntityKind; title: string };
  canDelete: boolean;
  deleteEntityIds: ProjectGraphDeletionEntityIds;
  incomingReferences: ProjectGraphDeletionReference[];
  outgoingReferences: ProjectGraphDeletionReference[];
  blockers: ProjectGraphDeletionBlocker[];
  warnings: ProjectGraphDeletionWarning[];
  replacementPassParents: ProjectGraphDeletionPassParent[];
}

const BLOCK_PARENT_TYPES = new Set(['menu_choice', 'if', 'elif', 'else']);

const scenarioDescendants = (graph: ProjectGraphSnapshot, roots: Iterable<string>): Set<string> => {
  const result = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      if (node.parent_node_id && result.has(node.parent_node_id) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
};

const labelDescendants = (graph: ProjectGraphSnapshot, rootId: string): Set<string> => {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const label of graph.labels) {
      if (label.parent_label_id && result.has(label.parent_label_id) && !result.has(label.id)) {
        result.add(label.id);
        changed = true;
      }
    }
  }
  return result;
};

const conditionalSiblingRoots = (graph: ProjectGraphSnapshot, node: ScenarioNodeSnapshot): string[] => {
  if (node.type !== 'if') return [node.id];
  const siblings = graph.nodes
    .filter((candidate) => candidate.label_id === node.label_id && candidate.parent_node_id === node.parent_node_id)
    .sort((left, right) => left.order.localeCompare(right.order));
  const start = siblings.findIndex((candidate) => candidate.id === node.id);
  const roots = [node.id];
  for (let index = start + 1; index < siblings.length; index += 1) {
    if (siblings[index].type !== 'elif' && siblings[index].type !== 'else') break;
    roots.push(siblings[index].id);
  }
  return roots;
};

const describeReference = (graph: ProjectGraphSnapshot, edge: FlowEdgeSnapshot): ProjectGraphDeletionReference => {
  const source = graph.nodes.find((node) => node.id === edge.source_node_id);
  const sourceFile = graph.files.find((file) => file.id === source?.file_id);
  const sourceLabel = graph.labels.find((label) => label.id === source?.label_id);
  const targetStart = graph.label_starts.find((start) => start.id === edge.target_node_id);
  const targetLabel = graph.labels.find((label) => label.id === targetStart?.label_id);
  return {
    edgeId: edge.id,
    kind: edge.kind,
    sourceNodeId: edge.source_node_id,
    sourceNodeContent: source?.content ?? '',
    sourceFileId: source?.file_id ?? '',
    sourceFilePath: sourceFile?.path ?? '',
    sourceLabelId: source?.label_id ?? '',
    sourceLabelQualifiedName: sourceLabel?.qualified_name ?? '',
    targetNodeId: edge.target_node_id,
    targetLabelId: targetLabel?.id ?? null,
    targetLabelQualifiedName: targetLabel?.qualified_name ?? null,
  };
};

export const analyzeProjectGraphDeletion = (
  graph: ProjectGraphSnapshot,
  entityId: string,
): ProjectGraphDeletionImpact => {
  const file = graph.files.find((candidate) => candidate.id === entityId);
  const label = graph.labels.find((candidate) => candidate.id === entityId);
  const labelStart = graph.label_starts.find((candidate) => candidate.id === entityId);
  const scenario = graph.nodes.find((candidate) => candidate.id === entityId);
  if (!file && !label && !labelStart && !scenario) throw new Error(`Unknown ProjectGraph entity: ${entityId}`);

  const fileIds = new Set<string>();
  const labelIds = new Set<string>();
  let nodeIds = new Set<string>();
  const blockers: ProjectGraphDeletionBlocker[] = [];
  let kind: ProjectGraphDeletableEntityKind = 'scenario';
  let title = scenario?.content.split('\n')[0] || entityId;

  if (labelStart) {
    blockers.push({ code: 'protected_label_start', nodeId: labelStart.id });
    title = labelStart.qualified_name;
  } else if (file) {
    kind = 'file';
    title = file.path;
    fileIds.add(file.id);
    for (const candidate of graph.labels) if (candidate.file_id === file.id) labelIds.add(candidate.id);
  } else if (label) {
    kind = 'label';
    title = label.qualified_name;
    for (const id of labelDescendants(graph, label.id)) labelIds.add(id);
  } else if (scenario) {
    nodeIds = scenarioDescendants(graph, conditionalSiblingRoots(graph, scenario));
  }

  for (const candidate of graph.nodes) if (labelIds.has(candidate.label_id)) nodeIds.add(candidate.id);
  const labelStartIds = new Set(graph.label_starts.filter((start) => labelIds.has(start.label_id)).map((start) => start.id));
  const runtimeNodeIds = new Set([...nodeIds, ...labelStartIds]);

  if (fileIds.size === graph.files.length && fileIds.size > 0) blockers.push({ code: 'last_file', nodeId: null });
  if (graph.labels.some((candidate) => labelIds.has(candidate.id) && candidate.scope === 'global' && candidate.qualified_name === 'start')) {
    blockers.push({ code: 'protected_start_label', nodeId: graph.labels.find((candidate) => candidate.qualified_name === 'start')?.label_start_node_id ?? null });
  }

  const incomingEdges = graph.edges.filter((edge) => runtimeNodeIds.has(edge.target_node_id) && !nodeIds.has(edge.source_node_id));
  const outgoingEdges = graph.edges.filter((edge) => nodeIds.has(edge.source_node_id) && !runtimeNodeIds.has(edge.target_node_id));
  const deletedEdges = graph.edges.filter((edge) => runtimeNodeIds.has(edge.target_node_id) || nodeIds.has(edge.source_node_id));
  const incomingReferences = incomingEdges.map((edge) => describeReference(graph, edge));
  const outgoingReferences = outgoingEdges.map((edge) => describeReference(graph, edge));

  if (labelIds.size > 0) {
    for (const diagnostic of graph.diagnostics) {
      if (diagnostic.code === 'dynamic_target' && diagnostic.node_id && !nodeIds.has(diagnostic.node_id)) {
        blockers.push({ code: 'dynamic_reference', nodeId: diagnostic.node_id, diagnosticId: diagnostic.id });
      }
    }
  }

  const replacementPassParents: ProjectGraphDeletionPassParent[] = [];
  for (const candidate of graph.labels) {
    if (labelIds.has(candidate.id)) continue;
    const before = graph.nodes.filter((node) => node.label_id === candidate.id && node.parent_node_id === null);
    const after = before.filter((node) => !nodeIds.has(node.id));
    if (before.some((node) => nodeIds.has(node.id)) && after.length === 0) {
      replacementPassParents.push({ kind: 'label', id: candidate.id });
    }
  }
  for (const parent of graph.nodes) {
    if (nodeIds.has(parent.id) || !BLOCK_PARENT_TYPES.has(parent.type)) continue;
    const before = graph.nodes.filter((node) => node.parent_node_id === parent.id);
    const after = before.filter((node) => !nodeIds.has(node.id));
    if (before.some((node) => nodeIds.has(node.id)) && after.length === 0) {
      replacementPassParents.push({ kind: 'scenario', id: parent.id });
    }
  }
  for (const menu of graph.nodes.filter((node) => node.type === 'menu' && !nodeIds.has(node.id))) {
    const choices = graph.nodes.filter((node) => node.parent_node_id === menu.id && node.type === 'menu_choice');
    if (choices.length > 0 && choices.every((choice) => nodeIds.has(choice.id))) {
      blockers.push({ code: 'empty_menu', nodeId: menu.id });
    }
  }

  const diagnosticIds = graph.diagnostics
    .filter((diagnostic) =>
      (diagnostic.file_id !== null && fileIds.has(diagnostic.file_id))
      || (diagnostic.label_id !== null && labelIds.has(diagnostic.label_id))
      || (diagnostic.node_id !== null && runtimeNodeIds.has(diagnostic.node_id)))
    .map((diagnostic) => diagnostic.id);
  const warnings: ProjectGraphDeletionWarning[] = [];
  const nestedCount = fileIds.size + labelIds.size + labelStartIds.size + nodeIds.size - 1;
  if (nestedCount > 0) warnings.push({ code: 'nested_entities', count: nestedCount });
  if (outgoingReferences.length > 0) warnings.push({ code: 'outgoing_references', count: outgoingReferences.length });
  if (diagnosticIds.length > 0) warnings.push({ code: 'diagnostics_removed', count: diagnosticIds.length });
  if (replacementPassParents.length > 0) warnings.push({ code: 'pass_inserted', count: replacementPassParents.length });
  const affectedFileIds = new Set([...fileIds, ...graph.labels.filter((candidate) => labelIds.has(candidate.id)).map((candidate) => candidate.file_id)]);
  const hasOpaqueCode = [...affectedFileIds].some((id) => {
    const entry = (graph.source_index.files as Record<string, unknown> | undefined)?.[id];
    return typeof entry === 'object' && entry !== null && String((entry as { content?: unknown }).content ?? '').trim().length > 0;
  });
  if (hasOpaqueCode) warnings.push({ code: 'opaque_code', count: 1 });

  return {
    entity: { id: entityId, kind, title },
    canDelete: blockers.length === 0 && incomingReferences.length === 0,
    deleteEntityIds: {
      files: [...fileIds], labels: [...labelIds], labelStarts: [...labelStartIds], nodes: [...nodeIds],
      edges: deletedEdges.map((edge) => edge.id), diagnostics: diagnosticIds,
    },
    incomingReferences,
    outgoingReferences,
    blockers,
    warnings,
    replacementPassParents,
  };
};
