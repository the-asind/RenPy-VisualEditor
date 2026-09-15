import type { LoroDoc, LoroEvent, LoroEventBatch, TreeDiffItem, TreeID } from 'loro-crdt/base64';

import {
  PROJECT_GRAPH_CRDT_CONTAINERS,
  projectGraphEntityTreeIdsFromCrdtDoc,
  projectGraphMetaValueFromCrdtDoc,
  type ProjectGraphCrdtDoc,
} from './projectGraphCrdt';
import type { GraphDiagnosticSnapshot } from './projectGraphProjection';

export interface ProjectGraphDirtyTreeChange {
  action: TreeDiffItem['action'];
  treeId: TreeID;
  entityId: string | null;
  affectedEntityIds: string[];
  parentEntityId: string | null;
  oldParentEntityId: string | null;
}

export interface ProjectGraphDirtyBatch {
  by: LoroEventBatch['by'];
  origin: string | null;
  dirtyEntityIds: string[];
  dirtyContainerIds: string[];
  dirtyEdgeIds: string[];
  dirtyMetaKeys: string[];
  dirtySourceFileIds: string[];
  dirtyDiagnosticIds: string[];
  entityFieldsById: Record<string, string[]>;
  treeChanges: ProjectGraphDirtyTreeChange[];
  fallbackReasons: string[];
}

const scenarioContentPrefix = 'scenario_content:';

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const sourceFilesFromIndex = (sourceIndex: unknown): Record<string, unknown> =>
  recordOrEmpty(recordOrEmpty(sourceIndex).files);

const diagnosticsFromValue = (value: unknown): GraphDiagnosticSnapshot[] =>
  Array.isArray(value) ? (value as GraphDiagnosticSnapshot[]) : [];

const equalJsonValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const changedRecordKeys = (before: Record<string, unknown>, after: Record<string, unknown>): string[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return sorted([...keys].filter((key) => !equalJsonValue(before[key], after[key])));
};

const changedDiagnosticIds = (
  before: GraphDiagnosticSnapshot[],
  after: GraphDiagnosticSnapshot[],
): string[] => {
  const beforeById = new Map(before.map((diagnostic) => [diagnostic.id, diagnostic]));
  const afterById = new Map(after.map((diagnostic) => [diagnostic.id, diagnostic]));
  return sorted(
    new Set([...beforeById.keys(), ...afterById.keys()]).values(),
  ).filter((id) => !equalJsonValue(beforeById.get(id), afterById.get(id)));
};

const isRootPath = (event: LoroEvent, container: string): boolean =>
  event.path.length === 1 && event.path[0] === container;

const addEntityField = (fieldsByEntity: Map<string, Set<string>>, entityId: string, field: string): void => {
  const fields = fieldsByEntity.get(entityId) ?? new Set<string>();
  fields.add(field);
  fieldsByEntity.set(entityId, fields);
};

export class ProjectGraphDirtyEventAdapter {
  private readonly unsubscribe: () => void;
  private readonly pending: ProjectGraphDirtyBatch[] = [];
  private readonly treeIdByEntityId = new Map<string, TreeID>();
  private readonly entityIdByTreeId = new Map<TreeID, string>();
  private readonly parentByTreeId = new Map<TreeID, TreeID | null>();
  private readonly childrenByTreeId = new Map<TreeID | null, TreeID[]>();
  private sourceFiles: Record<string, unknown> = {};
  private diagnostics: GraphDiagnosticSnapshot[] = [];

  constructor(private readonly doc: ProjectGraphCrdtDoc) {
    this.resync();
    this.unsubscribe = doc.subscribe((batch) => this.pending.push(this.adapt(batch)));
  }

  resync(): void {
    this.treeIdByEntityId.clear();
    this.entityIdByTreeId.clear();
    this.parentByTreeId.clear();
    this.childrenByTreeId.clear();
    for (const [entityId, treeId] of Object.entries(projectGraphEntityTreeIdsFromCrdtDoc(this.doc))) {
      this.treeIdByEntityId.set(entityId, treeId);
      this.entityIdByTreeId.set(treeId, entityId);
    }
    const nodes = this.doc.getTree(PROJECT_GRAPH_CRDT_CONTAINERS.tree).getNodes();
    for (const node of nodes) {
      const parentId = node.parent()?.id ?? null;
      this.parentByTreeId.set(node.id, parentId);
    }
    for (const node of nodes.sort((left, right) => (left.index() ?? 0) - (right.index() ?? 0))) {
      this.addTreeChild(this.parentByTreeId.get(node.id) ?? null, node.id);
    }
    this.sourceFiles = sourceFilesFromIndex(
      projectGraphMetaValueFromCrdtDoc(this.doc, 'source_index'),
    );
    this.diagnostics = diagnosticsFromValue(projectGraphMetaValueFromCrdtDoc(this.doc, 'diagnostics'));
  }

  drain(): ProjectGraphDirtyBatch[] {
    return this.pending.splice(0, this.pending.length);
  }

  dispose(): void {
    this.unsubscribe();
    this.pending.length = 0;
  }

  private adapt(batch: LoroEventBatch): ProjectGraphDirtyBatch {
    const dirtyEntityIds = new Set<string>();
    const dirtyContainerIds = new Set<string>();
    const dirtyEdgeIds = new Set<string>();
    const dirtyMetaKeys = new Set<string>();
    const dirtySourceFileIds = new Set<string>();
    const dirtyDiagnosticIds = new Set<string>();
    const entityFieldsById = new Map<string, Set<string>>();
    const treeChanges: ProjectGraphDirtyTreeChange[] = [];
    const fallbackReasons = new Set<string>();
    const entityIdByTreeIdBefore = new Map(this.entityIdByTreeId);

    for (const event of batch.events) {
      dirtyContainerIds.add(event.target);
      if (!isRootPath(event, PROJECT_GRAPH_CRDT_CONTAINERS.entityIndex) || event.diff.type !== 'map') {
        continue;
      }
      for (const [entityId, value] of Object.entries(event.diff.updated)) {
        dirtyEntityIds.add(entityId);
        const previousTreeId = this.treeIdByEntityId.get(entityId);
        if (typeof value === 'string') {
          const treeId = value as TreeID;
          if (previousTreeId && previousTreeId !== treeId) {
            this.entityIdByTreeId.delete(previousTreeId);
          }
          this.treeIdByEntityId.set(entityId, treeId);
          this.entityIdByTreeId.set(treeId, entityId);
        } else if (previousTreeId) {
          this.treeIdByEntityId.delete(entityId);
          this.entityIdByTreeId.delete(previousTreeId);
        }
      }
    }

    const entityIdForTreeId = (treeId: TreeID | undefined): string | null =>
      treeId ? this.entityIdByTreeId.get(treeId) ?? entityIdByTreeIdBefore.get(treeId) ?? null : null;
    const addEntityForTreeId = (treeId: TreeID | undefined): void => {
      const entityId = entityIdForTreeId(treeId);
      if (entityId) {
        dirtyEntityIds.add(entityId);
      }
    };
    const subtreeBefore = (rootId: TreeID): TreeID[] => {
      const result: TreeID[] = [];
      const stack = [rootId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        result.push(current);
        for (const child of this.childrenByTreeId.get(current) ?? []) {
          stack.push(child);
        }
      }
      return result;
    };

    for (const event of batch.events) {
      if (isRootPath(event, PROJECT_GRAPH_CRDT_CONTAINERS.tree) && event.diff.type === 'tree') {
        for (const change of event.diff.diff) {
          fallbackReasons.add(`tree:${change.action}`);
          const entityId = entityIdForTreeId(change.target);
          const oldParentTreeId = change.action === 'create' ? undefined : change.oldParent;
          const newParentTreeId = change.action === 'delete' ? undefined : change.parent;
          const oldParentKey = oldParentTreeId ?? null;
          const newParentKey = newParentTreeId ?? null;
          const oldSiblings = [...(this.childrenByTreeId.get(oldParentKey) ?? [])];
          const newSiblings = oldParentKey === newParentKey
            ? oldSiblings
            : [...(this.childrenByTreeId.get(newParentKey) ?? [])];
          const affectedTreeIds = change.action === 'delete'
            ? [...subtreeBefore(change.target), ...oldSiblings.slice(change.oldIndex + 1)]
            : change.action === 'create'
              ? [change.target, ...newSiblings.slice(change.index)]
              : oldParentKey === newParentKey
                ? oldSiblings.slice(Math.min(change.oldIndex, change.index), Math.max(change.oldIndex, change.index) + 1)
                : [
                    change.target,
                    ...oldSiblings.slice(change.oldIndex + 1),
                    ...newSiblings.slice(change.index),
                  ];
          const affectedEntityIds = sorted(
            affectedTreeIds
              .map((treeId) => entityIdForTreeId(treeId))
              .filter((id): id is string => id !== null),
          );
          for (const id of affectedEntityIds) {
            dirtyEntityIds.add(id);
          }
          addEntityForTreeId(oldParentTreeId);
          addEntityForTreeId(newParentTreeId);

          if (change.action === 'delete') {
            this.removeTreeChild(oldParentKey, change.target);
            for (const treeId of subtreeBefore(change.target)) {
              this.parentByTreeId.delete(treeId);
              this.childrenByTreeId.delete(treeId);
              const removedEntityId = entityIdByTreeIdBefore.get(treeId);
              if (removedEntityId) {
                this.entityIdByTreeId.delete(treeId);
                this.treeIdByEntityId.delete(removedEntityId);
              }
            }
          } else {
            const previousParent = this.parentByTreeId.get(change.target) ?? null;
            this.removeTreeChild(previousParent, change.target);
            const nextParent = change.parent ?? null;
            this.parentByTreeId.set(change.target, nextParent);
            this.addTreeChild(nextParent, change.target, change.index);
          }

          treeChanges.push({
            action: change.action,
            treeId: change.target,
            entityId,
            affectedEntityIds,
            parentEntityId: entityIdForTreeId(newParentTreeId),
            oldParentEntityId: entityIdForTreeId(oldParentTreeId),
          });
          if (!entityId) {
            fallbackReasons.add(`tree:${change.action}:unmapped`);
          }
        }
        continue;
      }

      if (event.path[0] === PROJECT_GRAPH_CRDT_CONTAINERS.tree && event.path.length === 2) {
        if (event.diff.type !== 'map' || typeof event.path[1] !== 'string') {
          fallbackReasons.add('tree-data:unknown-diff');
          continue;
        }
        const entityId = entityIdForTreeId(event.path[1] as TreeID);
        if (!entityId) {
          fallbackReasons.add('tree-data:unmapped');
          continue;
        }
        dirtyEntityIds.add(entityId);
        for (const key of Object.keys(event.diff.updated)) {
          addEntityField(entityFieldsById, entityId, key);
        }
        continue;
      }

      if (isRootPath(event, PROJECT_GRAPH_CRDT_CONTAINERS.entityIndex)) {
        if (event.diff.type !== 'map') {
          fallbackReasons.add('entity-index:unknown-diff');
        }
        continue;
      }

      if (isRootPath(event, PROJECT_GRAPH_CRDT_CONTAINERS.meta)) {
        if (event.diff.type !== 'map') {
          fallbackReasons.add('meta:unknown-diff');
          continue;
        }
        for (const [key, value] of Object.entries(event.diff.updated)) {
          dirtyMetaKeys.add(key);
          if (key === 'source_index') {
            const nextSourceFiles = sourceFilesFromIndex(value);
            for (const fileId of changedRecordKeys(this.sourceFiles, nextSourceFiles)) {
              dirtySourceFileIds.add(fileId);
            }
            this.sourceFiles = nextSourceFiles;
          } else if (key === 'diagnostics') {
            const nextDiagnostics = diagnosticsFromValue(value);
            for (const diagnosticId of changedDiagnosticIds(this.diagnostics, nextDiagnostics)) {
              dirtyDiagnosticIds.add(diagnosticId);
            }
            this.diagnostics = nextDiagnostics;
          } else if (key === 'schema_version' || key === 'edges') {
            fallbackReasons.add(`meta:${key}`);
          } else if (key !== 'project_id') {
            fallbackReasons.add(`meta:${key}:unknown`);
          }
        }
        continue;
      }

      if (isRootPath(event, PROJECT_GRAPH_CRDT_CONTAINERS.edges)) {
        if (event.diff.type !== 'map') {
          fallbackReasons.add('edges:unknown-diff');
          continue;
        }
        for (const edgeId of Object.keys(event.diff.updated)) {
          dirtyEdgeIds.add(edgeId);
        }
        continue;
      }

      if (
        event.path.length === 1 &&
        typeof event.path[0] === 'string' &&
        event.path[0].startsWith(scenarioContentPrefix)
      ) {
        if (event.diff.type !== 'text') {
          fallbackReasons.add('scenario-content:unknown-diff');
          continue;
        }
        const entityId = event.path[0].slice(scenarioContentPrefix.length);
        dirtyEntityIds.add(entityId);
        addEntityField(entityFieldsById, entityId, 'content');
        continue;
      }

      fallbackReasons.add(`unknown:${String(event.path[0] ?? event.target)}:${event.diff.type}`);
    }

    return {
      by: batch.by,
      origin: batch.origin?.trim() ? batch.origin : null,
      dirtyEntityIds: sorted(dirtyEntityIds),
      dirtyContainerIds: sorted(dirtyContainerIds),
      dirtyEdgeIds: sorted(dirtyEdgeIds),
      dirtyMetaKeys: sorted(dirtyMetaKeys),
      dirtySourceFileIds: sorted(dirtySourceFileIds),
      dirtyDiagnosticIds: sorted(dirtyDiagnosticIds),
      entityFieldsById: Object.fromEntries(
        [...entityFieldsById]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([entityId, fields]) => [entityId, sorted(fields)]),
      ),
      treeChanges,
      fallbackReasons: sorted(fallbackReasons),
    };
  }

  private addTreeChild(parentId: TreeID | null, childId: TreeID, index?: number): void {
    const children = this.childrenByTreeId.get(parentId) ?? [];
    const insertionIndex = Math.max(0, Math.min(index ?? children.length, children.length));
    children.splice(insertionIndex, 0, childId);
    this.childrenByTreeId.set(parentId, children);
  }

  private removeTreeChild(parentId: TreeID | null, childId: TreeID): void {
    const children = this.childrenByTreeId.get(parentId);
    const index = children?.indexOf(childId) ?? -1;
    if (children && index >= 0) {
      children.splice(index, 1);
    }
  }
}
