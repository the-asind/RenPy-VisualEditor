import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';

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

  it('renders mockup-aligned accessible header control groups', () => {
    const html = renderToStaticMarkup(
      <ActionEditorOverlay
        filePath="script-ch20.rpy"
        labelPath="ch20_main2"
        node={actionNode}
        saveStatus="Saved"
        onClose={vi.fn()}
        onContentChange={vi.fn()}
        onTitleChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Action editor mode"');
    expect(html).toContain('action-editor__mode-history-cluster');
    expect(html).not.toContain('action-editor__header-divider');
    expect(html).toContain('action-editor__history-actions');
    expect(html).toContain('aria-label="Undo"');
    expect(html).toContain('aria-label="Redo"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Autosave status"');
    expect(html).toContain('aria-label="Close action editor"');
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

  it('does not expose active-looking Next controls when no graph executor is available', () => {
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

    expect(html).not.toContain('Player Choice');
    expect(html).not.toContain('Conditional Path');
    expect(html).not.toContain('Go to Label');
    expect(html).not.toContain('Call Sub-scene');
    expect(html).not.toContain('Return to the previous label');
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
    expect(html).toContain('action-editor__raw-codemirror');
    expect(html).toContain('scene bg club_day with dissolve');
    expect(html).not.toContain('action-editor-writer');
    expect(html).not.toContain('Scene preview');
    expect(html).not.toContain('Player Choice');
    expect(html).not.toContain('Audio');
  });

  it('uses CodeMirror with a lightweight RenPy syntax highlighter for raw mode', () => {
    const overlaySource = readFileSync(new URL('../ActionEditorOverlay.tsx', import.meta.url), 'utf-8');
    const rawEditorSource = readFileSync(new URL('../ActionEditorRawCodeEditor.tsx', import.meta.url), 'utf-8');

    expect(overlaySource).toContain('ActionEditorRawCodeEditor');
    expect(rawEditorSource).toContain('@uiw/react-codemirror');
    expect(rawEditorSource).toContain('ViewPlugin.fromClass');
    expect(rawEditorSource).toContain('rpy-token--');
    expect(rawEditorSource).toContain('label|menu|jump|call|return|scene|show|hide|with');
    expect(rawEditorSource).toContain('play|music|sound|voice');
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
    expect(source).toContain("aria-label={t('canvas.inspector.openActionEditor')}");
    expect(source).toContain('onTitleChange');
    expect(source).toContain('flushScenarioContentCommit');
  });

  it('keeps fullscreen Action editor text authoritative in canvas draft before scheduling CRDT commits', () => {
    const overlaySource = readFileSync(new URL('../ActionEditorOverlay.tsx', import.meta.url), 'utf-8');
    const canvasSource = readFileSync(new URL('../../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(overlaySource).toContain('draftContent');
    expect(overlaySource).toContain('setDraftContentState');
    expect(overlaySource).toContain('content={draftContent}');
    expect(canvasSource).toContain('handleActionEditorContentChange');
    expect(canvasSource).toContain('setScenarioContentDraftAndScheduleCommit(selectedActionEditorNodeId, content)');
    expect(canvasSource).toContain('onContentChange={handleActionEditorContentChange}');
  });

  it('owns continuation constructor and relation modal state above the editor', () => {
    const overlaySource = readFileSync(new URL('../ActionEditorOverlay.tsx', import.meta.url), 'utf-8');

    expect(overlaySource).toContain('ActionEditorContinuationModal');
    expect(overlaySource).toContain('ActionEditorRelationModal');
    expect(overlaySource).toContain('continuationModal');
    expect(overlaySource).toContain('onNextAction?.({ action:');
  });

  it('keeps compact inspector text authoritative in canvas draft before scheduling CRDT commits', () => {
    const canvasSource = readFileSync(new URL('../../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(canvasSource).toContain('const ProjectGraphScenarioContentEditor = memo');
    expect(canvasSource).toContain('setDraft({ nodeId, content: nextContent })');
    expect(canvasSource).toContain('onContentChange(nodeId, nextContent)');
    expect(canvasSource).toContain('onContentChange={setScenarioContentDraftAndScheduleCommit}');
    expect(canvasSource).toContain('setScenarioContentDraft({ nodeId, content })');
  });

  it('disables browser text assistance in raw and compact RenPy content editors', () => {
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
    const canvasSource = readFileSync(new URL('../../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(html).toContain('spellcheck="false"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('autoCapitalize="off"');
    expect(html).toContain('autoComplete="off"');
    expect(canvasSource).toContain('spellCheck={false}');
    expect(canvasSource).toContain('autoCorrect="off"');
  });
});
