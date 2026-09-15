import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';

declare global {
  interface Window {
    actionEditorLargeInputHarness?: {
      contentChanges: number;
      latestContent: string;
    };
  }
}

const largeActionContent = [
  'mc "RenPy Mouse starts with a stable local sentence."',
  ...Array.from({ length: 180 }, (_, index) => {
    const lineNumber = String(index + 1).padStart(3, '0');
    if (index % 9 === 0) {
      return `scene bg mouse_room_${lineNumber} with dissolve`;
    }
    if (index % 9 === 1) {
      return `show monika ${lineNumber} zorder 2 at t21`;
    }
    if (index % 9 === 2) {
      return `play music mouse_theme_${lineNumber}.ogg fadein 1.0`;
    }
    if (index % 9 === 3) {
      return `s "RenPy Mouse keeps line ${lineNumber} in the giant cheese notebook."`;
    }
    if (index % 9 === 4) {
      return `"The editor carries enough rows to make every full-content reparse visible."`;
    }
    if (index % 9 === 5) {
      return `mc "Local input must not be overwritten by row ${lineNumber}."`;
    }
    if (index % 9 === 6) {
      return `show sayori ${lineNumber} zorder 3 at t32`;
    }
    if (index % 9 === 7) {
      return `with wipeleft_scene`;
    }
    return `$ renpy_mouse_counter_${lineNumber} = ${index}`;
  }),
].join('\n');

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-large-input',
  file_id: 'file-large-input',
  label_id: 'label-large-input',
  parent_node_id: null,
  type: 'action',
  content: largeActionContent,
  order: '0001',
  source_span: { start_line: 2, end_line: 220 },
  metadata: {
    default_title: 'RenPy Mouse starts with a stable local sentence.',
    title: 'RenPy Mouse starts with a stable local sentence.',
  },
  visual: { position: { x: 120, y: 120 }, size: { width: 420, height: 140 } },
};

const Harness = () => {
  const [node, setNode] = useState(actionNode);

  window.actionEditorLargeInputHarness = window.actionEditorLargeInputHarness ?? {
    contentChanges: 0,
    latestContent: node.content,
  };
  window.actionEditorLargeInputHarness.latestContent = node.content;

  return (
    <ActionEditorOverlay
      filePath="script-large-input.rpy"
      labelPath="renpy_mouse_large_input"
      node={node}
      onClose={() => undefined}
      onContentChange={(content) => {
        window.actionEditorLargeInputHarness!.contentChanges += 1;
        window.actionEditorLargeInputHarness!.latestContent = content;
        setNode((current) => ({ ...current, content }));
      }}
      onTitleChange={(title) =>
        setNode((current) => ({
          ...current,
          metadata: {
            ...current.metadata,
            title,
          },
        }))
      }
      saveStatus="Autosaved just now"
    />
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
