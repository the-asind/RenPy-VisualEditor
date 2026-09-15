import { describe, expect, it } from 'vitest';

import { validateProjectGraphStructureCommand } from '../projectGraphStructure';
import type { ProjectGraphSnapshot } from '../projectGraphProjection';

const graph = {
  project_id: 'structure-validation',
  files: [
    { id: 'file-main', path: 'script.rpy', order: '0000', visual: { position: { x: 0, y: 0 }, size: { width: 1200, height: 800 } } },
    { id: 'file-gui', path: 'gui.rpy', order: '0001', metadata: { code_only: true, code_only_reason: 'renpy_template' }, visual: { position: { x: 1400, y: 0 }, size: { width: 1200, height: 800 } } },
  ],
  labels: [
    { id: 'label-start', file_id: 'file-main', parent_label_id: null, name: 'start', qualified_name: 'start', scope: 'global', label_start_node_id: 'start-start', source_span: null, visual: { position: { x: 48, y: 48 }, size: { width: 960, height: 360 } } },
  ],
  label_starts: [],
  nodes: [],
  edges: [],
  diagnostics: [],
  source_index: { files: {} },
} satisfies ProjectGraphSnapshot;

describe('ProjectGraph standalone structure validation', () => {
  it('normalizes safe file paths and rejects duplicate or unsafe paths', () => {
    expect(validateProjectGraphStructureCommand(graph, { kind: 'file', path: 'chapters\\vault.rpy', position: { x: 10, y: 20 } })).toEqual({
      kind: 'file', path: 'chapters/vault.rpy', position: { x: 10, y: 20 },
    });
    expect(validateProjectGraphStructureCommand(graph, { kind: 'file', path: 'chapters\\bonus', position: { x: 10, y: 20 } })).toEqual({
      kind: 'file', path: 'chapters/bonus.rpy', position: { x: 10, y: 20 },
    });
    expect(() => validateProjectGraphStructureCommand(graph, { kind: 'file', path: 'bonus.txt', position: { x: 0, y: 0 } })).toThrow('Invalid ProjectGraph file path');
    expect(() => validateProjectGraphStructureCommand(graph, { kind: 'file', path: '../vault.rpy', position: { x: 0, y: 0 } })).toThrow('Invalid ProjectGraph file path');
    expect(() => validateProjectGraphStructureCommand(graph, { kind: 'file', path: 'SCRIPT.RPY', position: { x: 0, y: 0 } })).toThrow('already exists');
  });

  it('validates global and nested label ownership without allowing template files', () => {
    expect(validateProjectGraphStructureCommand(graph, { kind: 'label', fileId: 'file-main', name: 'vault' })).toMatchObject({
      kind: 'label', fileId: 'file-main', qualifiedName: 'vault', scope: 'global', parentLabelId: null,
    });
    expect(validateProjectGraphStructureCommand(graph, { kind: 'sublabel', parentLabelId: 'label-start', name: 'vault' })).toMatchObject({
      kind: 'sublabel', fileId: 'file-main', qualifiedName: 'start.vault', scope: 'local', parentLabelId: 'label-start', labelHeader: '.vault',
    });
    expect(() => validateProjectGraphStructureCommand(graph, { kind: 'label', fileId: 'file-gui', name: 'vault' })).toThrow('technical Ren\'Py template');
    expect(() => validateProjectGraphStructureCommand(graph, { kind: 'label', fileId: 'file-main', name: 'start' })).toThrow('already exists');
  });
});
