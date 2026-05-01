import { ProjectGraphCanvas } from './projectGraph/ProjectGraphCanvas';
import type { ProjectGraphSnapshot } from '../utils/projectGraphProjection';

const demoGraph: ProjectGraphSnapshot = {
  project_id: 'editor-2-demo',
  files: [
    {
      id: 'file-demo',
      path: 'script.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 1180, height: 760 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-demo',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 56 }, size: { width: 980, height: 430 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-demo',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 36 }, size: { width: 280, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-dialogue',
      file_id: 'file-demo',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "The new canvas starts here."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 96, y: 136 }, size: { width: 340, height: 92 } },
    },
    {
      id: 'node-jump',
      file_id: 'file-demo',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'jump',
      content: 'jump start',
      order: '0001',
      source_span: { start_line: 2, end_line: 2 },
      metadata: {},
      visual: { position: { x: 500, y: 136 }, size: { width: 260, height: 92 } },
    },
  ],
  edges: [
    {
      id: 'edge-demo',
      source_node_id: 'node-jump',
      target_node_id: 'label-start-node',
      kind: 'jump',
      metadata: { target: 'start', resolved_qualified_name: 'start' },
    },
  ],
  diagnostics: [],
  source_index: { files: {} },
};

const EditorPage = () => (
  <div style={{ width: '100%', height: '100vh', minHeight: 0 }}>
    <ProjectGraphCanvas graph={demoGraph} />
  </div>
);

export default EditorPage;
