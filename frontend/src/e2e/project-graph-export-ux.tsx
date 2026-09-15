import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import { ProjectGraphCanvas } from '../components/projectGraph/ProjectGraphCanvas';
import type { ProjectGraphSnapshot } from '../utils/projectGraphProjection';

declare global {
  interface Window {
    resolveExport?: () => void;
    lastInviteTarget?: string;
  }
}

const graph: ProjectGraphSnapshot = {
  project_id: 'sprint-10-export-ux',
  files: [
    {
      id: 'file-day-1',
      path: 'renpy_mouse_day_1.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 600 } },
    },
    {
      id: 'file-gui',
      path: 'gui.rpy',
      order: '0001',
      visual: { position: { x: 880, y: 0 }, size: { width: 520, height: 360 } },
      metadata: { code_only: true, code_only_reason: 'renpy_template' },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-day-1',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 0, end_line: 0 },
      visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 420 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-intro',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'dialogue',
      content: 'r "RenPy Mouse previews exported files."',
      order: '0000',
      source_span: { start_line: 1, end_line: 1 },
      metadata: {},
      visual: { position: { x: 64, y: 136 }, size: { width: 360, height: 88 } },
    },
    {
      id: 'node-jump',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'jump',
      content: 'jump day_two',
      order: '0001',
      source_span: { start_line: 2, end_line: 2 },
      metadata: {},
      visual: { position: { x: 64, y: 248 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'node-call',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'call',
      content: 'call mouse_helper',
      order: '0002',
      source_span: { start_line: 3, end_line: 3 },
      metadata: {},
      visual: { position: { x: 64, y: 360 }, size: { width: 320, height: 88 } },
    },
    {
      id: 'node-return',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'return',
      content: 'return',
      order: '0003',
      source_span: { start_line: 4, end_line: 4 },
      metadata: {},
      visual: { position: { x: 64, y: 472 }, size: { width: 320, height: 88 } },
    },
  ],
  edges: [],
  diagnostics: [],
  source_index: {
    files: {
      'file-gui': {
        path: 'gui.rpy',
        content: 'init python:\n    gui.init(1920, 1080)\n\ndefine gui.accent_color = "#c8ffc8"\n',
      },
    },
  },
};

const exportedFiles = {
  'renpy_mouse_day_1.rpy': 'label start:\n    r "RenPy Mouse previews exported files."\n',
  'renpy_mouse_day_2.rpy': 'label day_two:\n    return\n',
};

const Harness = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, string> | null>(null);

  const exportProject = async () => {
    setStatus('Exporting...');
    setFiles(null);
    const result = await new Promise<Record<string, string>>((resolve) => {
      window.resolveExport = () => resolve(exportedFiles);
    });
    setFiles(result);
    setStatus(`Exported ${Object.keys(result).length} file(s).`);
  };

  return (
    <ProjectGraphCanvas
      exportedFiles={files}
      exportStatus={status}
      graph={graph}
      participants={[
        { id: 'local', username: 'You' },
        { id: 'u-lena', username: 'Lena Petrova' },
        { id: 'u-max', username: 'Max Chen' },
      ]}
      projectName="RenPy Mouse Project"
      remoteCursors={[
        {
          userId: 'u-lena',
          username: 'Lena',
          activity: 'editing_action',
          targetNodeId: 'node-intro',
          position: { x: 420, y: 260 },
        },
        {
          userId: 'u-max',
          username: 'Max',
          activity: 'viewing_canvas',
          position: { x: 200_000, y: 200_000 },
        },
      ]}
      onExportProjectGraph={exportProject}
      onInviteUser={(target) => {
        window.lastInviteTarget = target;
      }}
    />
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
