import { isValidRenpyNameComponent, normalizeRelationTargetFilePath } from '../components/actionEditor/relationTargetModel';
import type { ProjectGraphDeleteCommand } from './projectGraphDeletion';
import type { GraphPoint, ProjectGraphSnapshot } from './projectGraphProjection';

export type ProjectGraphStructureCommand =
  | { kind: 'file'; path: string; position: GraphPoint }
  | { kind: 'label'; fileId: string; name: string }
  | { kind: 'sublabel'; parentLabelId: string; name: string }
  | ProjectGraphDeleteCommand;

export type ValidatedProjectGraphStructureCommand =
  | { kind: 'file'; path: string; position: GraphPoint }
  | {
      kind: 'label' | 'sublabel';
      fileId: string;
      name: string;
      parentLabelId: string | null;
      qualifiedName: string;
      scope: 'global' | 'local' | 'nested';
      labelHeader: string;
    };

const assertUniqueQualifiedName = (graph: ProjectGraphSnapshot, qualifiedName: string): void => {
  if (graph.labels.some((label) => label.qualified_name === qualifiedName)) {
    throw new Error(`ProjectGraph label ${qualifiedName} already exists`);
  }
};

export const validateProjectGraphStructureCommand = (
  graph: ProjectGraphSnapshot,
  command: ProjectGraphStructureCommand,
): ValidatedProjectGraphStructureCommand => {
  if (command.kind === 'delete') {
    throw new Error('Delete commands require ProjectGraph deletion analysis');
  }
  if (command.kind === 'file') {
    const path = normalizeRelationTargetFilePath(command.path);
    if (!path) {
      throw new Error('Invalid ProjectGraph file path');
    }
    if (graph.files.some((file) => file.path.replace(/\\/g, '/').toLocaleLowerCase() === path.toLocaleLowerCase())) {
      throw new Error(`ProjectGraph file ${path} already exists`);
    }
    if (!Number.isFinite(command.position.x) || !Number.isFinite(command.position.y)) {
      throw new Error('Invalid ProjectGraph file position');
    }
    return { kind: 'file', path, position: { ...command.position } };
  }

  if (!isValidRenpyNameComponent(command.name)) {
    throw new Error('Invalid ProjectGraph label name');
  }

  if (command.kind === 'label') {
    const file = graph.files.find((candidate) => candidate.id === command.fileId);
    if (!file) {
      throw new Error(`Missing ProjectGraph file: ${command.fileId}`);
    }
    if (file.metadata?.code_only_reason === 'renpy_template') {
      throw new Error(`Cannot add a label to technical Ren'Py template ${file.path}`);
    }
    assertUniqueQualifiedName(graph, command.name);
    return {
      kind: 'label',
      fileId: file.id,
      name: command.name,
      parentLabelId: null,
      qualifiedName: command.name,
      scope: 'global',
      labelHeader: command.name,
    };
  }

  const parent = graph.labels.find((candidate) => candidate.id === command.parentLabelId);
  if (!parent) {
    throw new Error(`Missing ProjectGraph parent label: ${command.parentLabelId}`);
  }
  const qualifiedName = `${parent.qualified_name}.${command.name}`;
  assertUniqueQualifiedName(graph, qualifiedName);
  return {
    kind: 'sublabel',
    fileId: parent.file_id,
    name: command.name,
    parentLabelId: parent.id,
    qualifiedName,
    scope: parent.scope === 'global' ? 'local' : 'nested',
    labelHeader: parent.scope === 'global' ? `.${command.name}` : qualifiedName,
  };
};
