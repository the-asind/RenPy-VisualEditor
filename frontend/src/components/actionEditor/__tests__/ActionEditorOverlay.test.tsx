import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorOverlay } from '../ActionEditorOverlay';
import type { ScenarioNodeSnapshot } from '../../../utils/projectGraphProjection';

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-sayori-help',
  file_id: 'file-script-ch3',
  label_id: 'label-ch3-end-sayori',
  parent_node_id: null,
  type: 'action',
  content: [
    'scene bg club_day with dissolve',
    'show monika happy at left',
    'show sayori smile at right',
    'play music t2.ogg fadein 1.0',
    '',
    '"The clubroom gets quiet for a moment."',
  ].join('\n'),
  order: '0001',
  source_span: { start_line: 8, end_line: 14 },
  metadata: { title: 'Sayori help scene' },
  visual: { position: { x: 100, y: 160 }, size: { width: 360, height: 120 } },
};

describe('ActionEditorOverlay Sprint 1 shell', () => {
  it('renders the fullscreen writing room header from ProjectGraph context', () => {
    const html = renderToStaticMarkup(
      <ActionEditorOverlay
        filePath="script-ch3.rpy"
        labelPath="ch3_end_sayori"
        node={actionNode}
        saveStatus="Autosaved just now"
        onClose={vi.fn()}
        onContentChange={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Action editor"');
    expect(html).toContain('script-ch3.rpy');
    expect(html).toContain('ch3_end_sayori');
    expect(html).toContain('value="Sayori help scene"');
    expect(html).toContain('Writer view');
    expect(html).toContain('Raw Ren');
    expect(html).toContain('Undo');
    expect(html).toContain('Redo');
    expect(html).toContain('Autosaved just now');
  });

  it('connects the fullscreen shell to writer rows parsed from Action content', () => {
    const html = renderToStaticMarkup(
      <ActionEditorOverlay
        filePath="script-ch3.rpy"
        labelPath="ch3_end_sayori"
        node={actionNode}
        saveStatus="Saved"
        onClose={vi.fn()}
        onContentChange={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    );

    expect(html).toContain('action-editor-writer');
    expect(html).toContain('[Scene]');
    expect(html).toContain('bg club_day');
    expect(html).toContain('[Show]');
    expect(html).toContain('monika happy');
    expect(html).toContain('[Music]');
    expect(html).toContain('t2.ogg');
    expect(html).toContain('Narrator');
    expect(html).toContain('The clubroom gets quiet for a moment.');
  });

  it('renders Raw RenPy mode as a full-width code editor without writer aids', () => {
    const html = renderToStaticMarkup(
      <ActionEditorOverlay
        filePath="script-ch3.rpy"
        initialMode="raw"
        labelPath="ch3_end_sayori"
        node={actionNode}
        saveStatus="Saved"
        onClose={vi.fn()}
        onContentChange={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    );

    expect(html).toContain('action-editor__body--raw');
    expect(html).toContain('aria-label="Raw RenPy action content"');
    expect(html).toContain('scene bg club_day with dissolve');
    expect(html).not.toContain('action-editor-writer');
    expect(html).not.toContain('Scene preview');
    expect(html).not.toContain('Player Choice');
    expect(html).not.toContain('Audio');
  });

  it('shows a raw-mode review panel when structural RenPy appears in Action text', () => {
    const html = renderToStaticMarkup(
      <ActionEditorOverlay
        filePath="script-ch3.rpy"
        initialMode="raw"
        labelPath="ch3_end_sayori"
        node={{ ...actionNode, content: 'menu:\n    "Help Sayori":\n        jump sayori_help' }}
        saveStatus="Saved"
        onClose={vi.fn()}
        onContentChange={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    );

    expect(html).toContain('Review structural Ren');
    expect(html).toContain('Create Player Choice from menu');
    expect(html).toContain('Keep as raw text');
  });

  it('is connected from the ProjectGraph canvas action-node selection path', () => {
    const source = readFileSync(new URL('../../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('ActionEditorOverlay');
    expect(source).toContain('isActionEditorOpen');
    expect(source).toContain('aria-label="Open fullscreen action editor"');
    expect(source).toContain('onTitleChange');
    expect(source).toContain('flushScenarioContentCommit');
  });
});
