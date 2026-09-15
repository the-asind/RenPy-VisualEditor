import type { LoroEventBatch } from 'loro-crdt/base64';

import {
  projectGraphEntityFromCrdtDoc,
  projectGraphFromCrdtDoc,
  projectGraphMetaValueFromCrdtDoc,
  projectGraphRelationEdgeFromCrdtDoc,
  type ProjectGraphCrdtDoc,
  type ProjectGraphEntityKind,
  type ProjectGraphEntitySnapshot,
} from './projectGraphCrdt';
import { ProjectGraphDirtyEventAdapter, type ProjectGraphDirtyBatch } from './projectGraphDirtyEvents';
import type {
  FileFrameSnapshot,
  FlowEdgeSnapshot,
  GraphDiagnosticSnapshot,
  LabelFrameSnapshot,
  LabelStartNodeSnapshot,
  ProjectGraphSnapshot,
  ScenarioNodeSnapshot,
} from './projectGraphProjection';

export type ProjectGraphReadModelMode = 'no-change' | 'incremental' | 'full';

export interface ProjectGraphReadModelDirtyEntity {
  kind: ProjectGraphEntityKind;
  entity: ProjectGraphEntitySnapshot;
  previousEntity: ProjectGraphEntitySnapshot;
}

export interface ProjectGraphReadModelUpdate {
  graph: ProjectGraphSnapshot;
  mode: ProjectGraphReadModelMode;
  by: LoroEventBatch['by'][];
  origins: string[];
  dirtyEntityIds: string[];
  dirtyEdgeIds: string[];
  dirtyMetaKeys: string[];
  dirtySourceFileIds: string[];
  dirtyDiagnosticIds: string[];
  entityFieldsById: Record<string, string[]>;
  dirtyEntities: ProjectGraphReadModelDirtyEntity[];
  dirtyEdges: FlowEdgeSnapshot[];
  dirtyContainerCount: number;
  incrementalEntityReadCount: number;
  fallbackReason: string | null;
  durationMs: number;
}

export interface ProjectGraphReadModelStats {
  fullMaterializationCount: number;
  fullFallbackCount: number;
  incrementalUpdateCount: number;
  noChangeCount: number;
  incrementallyMaterializedEntityCount: number;
}

export interface ProjectGraphReadModelOptions {
  enabled?: boolean;
  fullMaterialize?: (doc: ProjectGraphCrdtDoc) => ProjectGraphSnapshot;
}

const now = (): number => globalThis.performance?.now?.() ?? Date.now();

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

const diagnosticsOrEmpty = (value: unknown): GraphDiagnosticSnapshot[] =>
  Array.isArray(value) ? [...(value as GraphDiagnosticSnapshot[])] : [];

const orderingFieldsByKind: Record<ProjectGraphEntityKind, ReadonlySet<string>> = {
  file: new Set(['entity_id', 'kind', 'order']),
  label: new Set(['entity_id', 'kind', 'file_id', 'source_span']),
  labelStart: new Set(['entity_id', 'kind', 'label_id']),
  scenario: new Set(['entity_id', 'kind', 'file_id', 'order']),
};

interface EntityState {
  kind: ProjectGraphEntityKind;
  entity: ProjectGraphEntitySnapshot;
}

interface AggregatedDirtyBatch {
  by: LoroEventBatch['by'][];
  origins: string[];
  dirtyEntityIds: string[];
  dirtyEdgeIds: string[];
  dirtyMetaKeys: string[];
  dirtySourceFileIds: string[];
  dirtyDiagnosticIds: string[];
  dirtyContainerCount: number;
  entityFieldsById: Record<string, string[]>;
  fallbackReasons: string[];
}

const aggregateDirtyBatches = (batches: ProjectGraphDirtyBatch[]): AggregatedDirtyBatch => {
  const fieldsByEntity = new Map<string, Set<string>>();
  for (const batch of batches) {
    for (const [entityId, fields] of Object.entries(batch.entityFieldsById)) {
      const aggregated = fieldsByEntity.get(entityId) ?? new Set<string>();
      fields.forEach((field) => aggregated.add(field));
      fieldsByEntity.set(entityId, aggregated);
    }
  }
  return {
    by: [...new Set(batches.map((batch) => batch.by))],
    origins: sorted(batches.map((batch) => batch.origin).filter((origin): origin is string => origin !== null)),
    dirtyEntityIds: sorted(batches.flatMap((batch) => batch.dirtyEntityIds)),
    dirtyEdgeIds: sorted(batches.flatMap((batch) => batch.dirtyEdgeIds)),
    dirtyMetaKeys: sorted(batches.flatMap((batch) => batch.dirtyMetaKeys)),
    dirtySourceFileIds: sorted(batches.flatMap((batch) => batch.dirtySourceFileIds)),
    dirtyDiagnosticIds: sorted(batches.flatMap((batch) => batch.dirtyDiagnosticIds)),
    dirtyContainerCount: new Set(batches.flatMap((batch) => batch.dirtyContainerIds)).size,
    entityFieldsById: Object.fromEntries(
      [...fieldsByEntity]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entityId, fields]) => [entityId, sorted(fields)]),
    ),
    fallbackReasons: sorted(batches.flatMap((batch) => batch.fallbackReasons)),
  };
};

export class ProjectGraphReadModel {
  private readonly adapter: ProjectGraphDirtyEventAdapter;
  private readonly enabled: boolean;
  private readonly fullMaterialize: (doc: ProjectGraphCrdtDoc) => ProjectGraphSnapshot;
  private currentGraph: ProjectGraphSnapshot;
  private readonly entityStateById = new Map<string, EntityState>();
  private readonly fileIndexById = new Map<string, number>();
  private readonly labelIndexById = new Map<string, number>();
  private readonly labelStartIndexById = new Map<string, number>();
  private readonly scenarioIndexById = new Map<string, number>();
  private readonly edgeIndexById = new Map<string, number>();
  private readonly mutableStats: ProjectGraphReadModelStats = {
    fullMaterializationCount: 0,
    fullFallbackCount: 0,
    incrementalUpdateCount: 0,
    noChangeCount: 0,
    incrementallyMaterializedEntityCount: 0,
  };

  constructor(
    private readonly doc: ProjectGraphCrdtDoc,
    options: ProjectGraphReadModelOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.fullMaterialize = options.fullMaterialize ?? projectGraphFromCrdtDoc;
    this.currentGraph = this.fullMaterialize(doc);
    this.mutableStats.fullMaterializationCount += 1;
    this.rebuildIndexes();
    this.adapter = new ProjectGraphDirtyEventAdapter(doc);
  }

  get graph(): ProjectGraphSnapshot {
    return this.currentGraph;
  }

  get stats(): ProjectGraphReadModelStats {
    return { ...this.mutableStats };
  }

  flush(): ProjectGraphReadModelUpdate {
    const startedAt = now();
    const batches = this.adapter.drain();
    if (batches.length === 0) {
      this.mutableStats.noChangeCount += 1;
      return {
        graph: this.currentGraph,
        mode: 'no-change',
        by: [],
        origins: [],
        dirtyEntityIds: [],
        dirtyEdgeIds: [],
        dirtyMetaKeys: [],
        dirtySourceFileIds: [],
        dirtyDiagnosticIds: [],
        entityFieldsById: {},
        dirtyEntities: [],
        dirtyEdges: [],
        dirtyContainerCount: 0,
        incrementalEntityReadCount: 0,
        fallbackReason: null,
        durationMs: now() - startedAt,
      };
    }

    const dirty = aggregateDirtyBatches(batches);
    const fallbackReason = this.findFallbackReason(dirty);
    if (fallbackReason) {
      return this.fullFallback(dirty, fallbackReason, startedAt);
    }

    const result = this.applyIncremental(dirty);
    if (typeof result === 'string') {
      return this.fullFallback(dirty, result, startedAt);
    }
    this.currentGraph = result.graph;
    this.mutableStats.incrementalUpdateCount += 1;
    this.mutableStats.incrementallyMaterializedEntityCount += result.entityReadCount;
    return {
      graph: this.currentGraph,
      mode: 'incremental',
      by: dirty.by,
      origins: dirty.origins,
      dirtyEntityIds: dirty.dirtyEntityIds,
      dirtyEdgeIds: dirty.dirtyEdgeIds,
      dirtyMetaKeys: dirty.dirtyMetaKeys,
      dirtySourceFileIds: dirty.dirtySourceFileIds,
      dirtyDiagnosticIds: dirty.dirtyDiagnosticIds,
      entityFieldsById: dirty.entityFieldsById,
      dirtyEntities: result.dirtyEntities,
      dirtyEdges: result.dirtyEdges,
      dirtyContainerCount: dirty.dirtyContainerCount,
      incrementalEntityReadCount: result.entityReadCount,
      fallbackReason: null,
      durationMs: now() - startedAt,
    };
  }

  dispose(): void {
    this.adapter.dispose();
  }

  private findFallbackReason(dirty: AggregatedDirtyBatch): string | null {
    if (!this.enabled) {
      return 'feature-disabled';
    }
    if (dirty.fallbackReasons.length > 0) {
      return dirty.fallbackReasons[0];
    }
    for (const entityId of dirty.dirtyEntityIds) {
      const previous = this.entityStateById.get(entityId);
      const fields = dirty.entityFieldsById[entityId] ?? [];
      if (!previous) {
        return `entity:${entityId}:missing-from-read-model`;
      }
      const orderingField = fields.find((field) => orderingFieldsByKind[previous.kind].has(field));
      if (orderingField) {
        return `entity:${entityId}:ordering-field:${orderingField}`;
      }
    }
    return null;
  }

  private applyIncremental(
    dirty: AggregatedDirtyBatch,
  ): {
    graph: ProjectGraphSnapshot;
    entityReadCount: number;
    dirtyEntities: ProjectGraphReadModelDirtyEntity[];
    dirtyEdges: FlowEdgeSnapshot[];
  } | string {
    let files = this.currentGraph.files;
    let labels = this.currentGraph.labels;
    let labelStarts = this.currentGraph.label_starts;
    let nodes = this.currentGraph.nodes;
    let edges = this.currentGraph.edges;
    let diagnostics = this.currentGraph.diagnostics;
    let sourceIndex = this.currentGraph.source_index;
    let projectId = this.currentGraph.project_id;
    let entityReadCount = 0;
    const dirtyEntities: ProjectGraphReadModelDirtyEntity[] = [];
    const dirtyEdges: FlowEdgeSnapshot[] = [];

    for (const entityId of dirty.dirtyEntityIds) {
      const previous = this.entityStateById.get(entityId);
      if (!previous) {
        return `entity:${entityId}:missing-from-read-model`;
      }
      const scenarioOrder = previous.kind === 'scenario' ? (previous.entity as ScenarioNodeSnapshot).order : undefined;
      const materialized = projectGraphEntityFromCrdtDoc(this.doc, entityId, scenarioOrder);
      entityReadCount += 1;
      if (!materialized || materialized.kind !== previous.kind) {
        return `entity:${entityId}:materialization-mismatch`;
      }
      this.entityStateById.set(entityId, materialized);
      dirtyEntities.push({ ...materialized, previousEntity: previous.entity });
      if (materialized.kind === 'file') {
        const index = this.fileIndexById.get(entityId);
        if (index === undefined) return `entity:${entityId}:missing-file-index`;
        if (files === this.currentGraph.files) files = files.slice();
        files[index] = materialized.entity as FileFrameSnapshot;
      } else if (materialized.kind === 'label') {
        const index = this.labelIndexById.get(entityId);
        if (index === undefined) return `entity:${entityId}:missing-label-index`;
        if (labels === this.currentGraph.labels) labels = labels.slice();
        labels[index] = materialized.entity as LabelFrameSnapshot;
      } else if (materialized.kind === 'labelStart') {
        const index = this.labelStartIndexById.get(entityId);
        if (index === undefined) return `entity:${entityId}:missing-label-start-index`;
        if (labelStarts === this.currentGraph.label_starts) labelStarts = labelStarts.slice();
        labelStarts[index] = materialized.entity as LabelStartNodeSnapshot;
      } else {
        const index = this.scenarioIndexById.get(entityId);
        if (index === undefined) return `entity:${entityId}:missing-scenario-index`;
        if (nodes === this.currentGraph.nodes) nodes = nodes.slice();
        nodes[index] = materialized.entity as ScenarioNodeSnapshot;
      }
    }

    for (const edgeId of dirty.dirtyEdgeIds) {
      const materialized = projectGraphRelationEdgeFromCrdtDoc(this.doc, edgeId);
      const currentIndex = this.edgeIndexById.get(edgeId);
      if (materialized && currentIndex !== undefined) {
        if (edges === this.currentGraph.edges) edges = edges.slice();
        edges[currentIndex] = materialized;
        dirtyEdges.push(materialized);
      } else if (materialized) {
        edges = [...edges, materialized].sort((left, right) => left.id.localeCompare(right.id));
        this.rebuildEdgeIndexes(edges);
        dirtyEdges.push(materialized);
      } else if (currentIndex !== undefined) {
        edges = edges.filter((edge) => edge.id !== edgeId);
        this.rebuildEdgeIndexes(edges);
      }
    }

    if (dirty.dirtyMetaKeys.includes('diagnostics')) {
      diagnostics = diagnosticsOrEmpty(projectGraphMetaValueFromCrdtDoc(this.doc, 'diagnostics'));
    }
    if (dirty.dirtyMetaKeys.includes('source_index')) {
      sourceIndex = recordOrEmpty(projectGraphMetaValueFromCrdtDoc(this.doc, 'source_index'));
    }
    if (dirty.dirtyMetaKeys.includes('project_id')) {
      projectId = String(projectGraphMetaValueFromCrdtDoc(this.doc, 'project_id'));
    }

    return {
      graph: {
        project_id: projectId,
        files,
        labels,
        label_starts: labelStarts,
        nodes,
        edges,
        diagnostics,
        source_index: sourceIndex,
      },
      entityReadCount,
      dirtyEntities,
      dirtyEdges,
    };
  }

  private fullFallback(
    dirty: AggregatedDirtyBatch,
    fallbackReason: string,
    startedAt: number,
  ): ProjectGraphReadModelUpdate {
    this.currentGraph = this.fullMaterialize(this.doc);
    this.mutableStats.fullMaterializationCount += 1;
    this.mutableStats.fullFallbackCount += 1;
    this.rebuildIndexes();
    this.adapter.resync();
    return {
      graph: this.currentGraph,
      mode: 'full',
      by: dirty.by,
      origins: dirty.origins,
      dirtyEntityIds: dirty.dirtyEntityIds,
      dirtyEdgeIds: dirty.dirtyEdgeIds,
      dirtyMetaKeys: dirty.dirtyMetaKeys,
      dirtySourceFileIds: dirty.dirtySourceFileIds,
      dirtyDiagnosticIds: dirty.dirtyDiagnosticIds,
      entityFieldsById: dirty.entityFieldsById,
      dirtyEntities: [],
      dirtyEdges: [],
      dirtyContainerCount: dirty.dirtyContainerCount,
      incrementalEntityReadCount: 0,
      fallbackReason,
      durationMs: now() - startedAt,
    };
  }

  private rebuildIndexes(): void {
    this.entityStateById.clear();
    this.fileIndexById.clear();
    this.labelIndexById.clear();
    this.labelStartIndexById.clear();
    this.scenarioIndexById.clear();
    this.currentGraph.files.forEach((entity, index) => {
      this.entityStateById.set(entity.id, { kind: 'file', entity });
      this.fileIndexById.set(entity.id, index);
    });
    this.currentGraph.labels.forEach((entity, index) => {
      this.entityStateById.set(entity.id, { kind: 'label', entity });
      this.labelIndexById.set(entity.id, index);
    });
    this.currentGraph.label_starts.forEach((entity, index) => {
      this.entityStateById.set(entity.id, { kind: 'labelStart', entity });
      this.labelStartIndexById.set(entity.id, index);
    });
    this.currentGraph.nodes.forEach((entity, index) => {
      this.entityStateById.set(entity.id, { kind: 'scenario', entity });
      this.scenarioIndexById.set(entity.id, index);
    });
    this.rebuildEdgeIndexes(this.currentGraph.edges);
  }

  private rebuildEdgeIndexes(edges: FlowEdgeSnapshot[]): void {
    this.edgeIndexById.clear();
    edges.forEach((edge, index) => this.edgeIndexById.set(edge.id, index));
  }
}
