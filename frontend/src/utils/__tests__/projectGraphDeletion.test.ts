import { describe, expect, it } from 'vitest';

import { analyzeProjectGraphDeletion } from '../projectGraphDeletion';
import type { ProjectGraphSnapshot } from '../projectGraphProjection';

const visual = { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } };
const graph: ProjectGraphSnapshot = {
  project_id: 'delete-mouse',
  files: [
    { id: 'file-main', path: 'script.rpy', order: '0000', visual },
    { id: 'file-ending', path: 'ending.rpy', order: '0001', visual },
  ],
  labels: [
    { id: 'label-start', file_id: 'file-main', parent_label_id: null, name: 'start', qualified_name: 'start', scope: 'global', label_start_node_id: 'start-start', source_span: null, visual },
    { id: 'label-ending', file_id: 'file-ending', parent_label_id: null, name: 'ending', qualified_name: 'ending', scope: 'global', label_start_node_id: 'start-ending', source_span: null, visual },
    { id: 'label-cheese', file_id: 'file-ending', parent_label_id: 'label-ending', name: '.cheese', qualified_name: 'ending.cheese', scope: 'local', label_start_node_id: 'start-cheese', source_span: null, visual },
  ],
  label_starts: [
    { id: 'start-start', file_id: 'file-main', label_id: 'label-start', qualified_name: 'start', content: 'label start:', visual },
    { id: 'start-ending', file_id: 'file-ending', label_id: 'label-ending', qualified_name: 'ending', content: 'label ending:', visual },
    { id: 'start-cheese', file_id: 'file-ending', label_id: 'label-cheese', qualified_name: 'ending.cheese', content: 'label .cheese:', visual },
  ],
  nodes: [
    { id: 'node-jump', file_id: 'file-main', label_id: 'label-start', parent_node_id: null, type: 'jump', content: 'jump ending', order: '0000', source_span: { start_line: 3, end_line: 3 }, metadata: {}, visual },
    { id: 'node-ending', file_id: 'file-ending', label_id: 'label-ending', parent_node_id: null, type: 'dialogue', content: 'r "The mouse finds cheese."', order: '0000', source_span: null, metadata: {}, visual },
    { id: 'node-cheese', file_id: 'file-ending', label_id: 'label-cheese', parent_node_id: null, type: 'return', content: 'return', order: '0000', source_span: null, metadata: {}, visual },
  ],
  edges: [{ id: 'edge-ending', source_node_id: 'node-jump', target_node_id: 'start-ending', kind: 'jump', metadata: { target: 'ending' } }],
  diagnostics: [], source_index: { files: {} },
};

describe('ProjectGraph safe deletion analysis', () => {
  it('blocks deleting a label subtree referenced from outside and describes the source for navigation', () => {
    const impact = analyzeProjectGraphDeletion(graph, 'label-ending');
    expect(impact.canDelete).toBe(false);
    expect(impact.deleteEntityIds.labels).toEqual(['label-ending', 'label-cheese']);
    expect(impact.incomingReferences).toEqual([expect.objectContaining({
      edgeId: 'edge-ending', kind: 'jump', sourceNodeId: 'node-jump', sourceFilePath: 'script.rpy',
      sourceLabelQualifiedName: 'start', targetLabelQualifiedName: 'ending',
    })]);
  });

  it('allows deleting the source jump and keeps its label valid with a replacement pass', () => {
    const impact = analyzeProjectGraphDeletion(graph, 'node-jump');
    expect(impact.canDelete).toBe(true);
    expect(impact.outgoingReferences).toHaveLength(1);
    expect(impact.replacementPassParents).toEqual([{ kind: 'label', id: 'label-start' }]);
    expect(impact.deleteEntityIds.edges).toEqual(['edge-ending']);
  });

  it('protects LabelStartNode, the global start label and the final project file', () => {
    expect(analyzeProjectGraphDeletion(graph, 'start-ending').blockers).toContainEqual({ code: 'protected_label_start', nodeId: 'start-ending' });
    expect(analyzeProjectGraphDeletion(graph, 'label-start').blockers).toContainEqual({ code: 'protected_start_label', nodeId: 'start-start' });
    const singleFile = { ...graph, files: graph.files.slice(0, 1), labels: graph.labels.slice(0, 1), label_starts: graph.label_starts.slice(0, 1), nodes: graph.nodes.slice(0, 1), edges: [] };
    expect(analyzeProjectGraphDeletion(singleFile, 'file-main').blockers).toContainEqual({ code: 'last_file', nodeId: null });
  });
});
