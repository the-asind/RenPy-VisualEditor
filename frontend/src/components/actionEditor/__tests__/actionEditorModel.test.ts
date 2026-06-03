import { describe, expect, it } from 'vitest';

import {
  applyActionEditorTextTag,
  deriveActionEditorTitle,
  detectActionEditorStructuralStatement,
  parseActionEditorContent,
  serializeActionEditorRows,
  updateActionEditorRowText,
} from '../actionEditorModel';

describe('action editor content model', () => {
  const mockupContent = [
    'scene bg club_day with dissolve',
    'show monika happy at left',
    'show sayori smile at right',
    'play music t2.ogg fadein 1.0',
    '',
    '"The clubroom gets quiet for a moment."',
    'm "If it\\\'s going to be anyone, then I prefer helping Sayori."',
    's "Ehehe... thank you, Monika."',
  ].join('\n');

  it('projects action content into writer rows without making them durable state', () => {
    const rows = parseActionEditorContent(mockupContent);

    expect(rows).toEqual([
      {
        id: 'row-0000',
        kind: 'scene',
        command: 'scene',
        primary: 'bg club_day',
        suffix: 'with dissolve',
        source: 'scene bg club_day with dissolve',
      },
      {
        id: 'row-0001',
        kind: 'show',
        command: 'show',
        primary: 'monika happy',
        suffix: 'at left',
        source: 'show monika happy at left',
      },
      {
        id: 'row-0002',
        kind: 'show',
        command: 'show',
        primary: 'sayori smile',
        suffix: 'at right',
        source: 'show sayori smile at right',
      },
      {
        id: 'row-0003',
        kind: 'music',
        command: 'music',
        primary: 't2.ogg',
        suffix: 'fadein 1.0',
        source: 'play music t2.ogg fadein 1.0',
      },
      {
        id: 'row-0005',
        kind: 'narration',
        speaker: 'Narrator',
        text: 'The clubroom gets quiet for a moment.',
        source: '"The clubroom gets quiet for a moment."',
      },
      {
        id: 'row-0006',
        kind: 'dialogue',
        speaker: 'm',
        text: "If it's going to be anyone, then I prefer helping Sayori.",
        source: 'm "If it\\\'s going to be anyone, then I prefer helping Sayori."',
      },
      {
        id: 'row-0007',
        kind: 'dialogue',
        speaker: 's',
        text: 'Ehehe... thank you, Monika.',
        source: 's "Ehehe... thank you, Monika."',
      },
    ]);
  });

  it('serializes writer rows back to normalized RenPy action text', () => {
    const rows = parseActionEditorContent(mockupContent);

    expect(serializeActionEditorRows(rows)).toBe(mockupContent);
  });

  it('keeps unsupported safe lines as raw fallback rows', () => {
    const rows = parseActionEditorContent('camera master at gentle_zoom\n$ renpy_mouse_notes.append("crumb")');

    expect(rows).toEqual([
      {
        id: 'row-0000',
        kind: 'rawLine',
        source: 'camera master at gentle_zoom',
        text: 'camera master at gentle_zoom',
      },
      {
        id: 'row-0001',
        kind: 'rawLine',
        source: '$ renpy_mouse_notes.append("crumb")',
        text: '$ renpy_mouse_notes.append("crumb")',
      },
    ]);
    expect(serializeActionEditorRows(rows)).toBe('camera master at gentle_zoom\n$ renpy_mouse_notes.append("crumb")');
  });

  it('derives a user-facing title without exposing the internal ACTION type', () => {
    expect(deriveActionEditorTitle({ title: 'Sayori help scene' }, mockupContent)).toBe('Sayori help scene');
    expect(deriveActionEditorTitle({ default_title: 'scene bg club_day with dissolve' }, mockupContent)).toBe(
      'scene bg club_day with dissolve',
    );
    expect(deriveActionEditorTitle({}, mockupContent)).toBe('scene bg club_day with dissolve');
    expect(deriveActionEditorTitle({}, '   \n')).toBe('Untitled scene');
  });

  it('updates writer row text by clearing stale source text before serialization', () => {
    const rows = parseActionEditorContent(mockupContent);
    const editedRows = updateActionEditorRowText(rows, 'row-0006', 'Monika picks the quiet route.');

    expect(serializeActionEditorRows(editedRows)).toContain('m "Monika picks the quiet route."');
    expect(serializeActionEditorRows(editedRows)).not.toContain('m "If it\\\'s going to be anyone');
  });

  it('applies RenPy text tags to selected writer text', () => {
    const rows = parseActionEditorContent('m "Monika picks the quiet route."');
    const editedRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'bold');

    expect(serializeActionEditorRows(editedRows)).toBe('m "Monika {b}picks{/b} the quiet route."');
  });

  it('applies mockup toolbar style tags as normalized RenPy text tags', () => {
    const rows = parseActionEditorContent('m "Monika picks the quiet route."');
    const coloredRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'color');
    const sizedRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'size');
    const cpsRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'cps');

    expect(serializeActionEditorRows(coloredRows)).toBe('m "Monika {color=#2563eb}picks{/color} the quiet route."');
    expect(serializeActionEditorRows(sizedRows)).toBe('m "Monika {size=+4}picks{/size} the quiet route."');
    expect(serializeActionEditorRows(cpsRows)).toBe('m "Monika {cps=28}picks{/cps} the quiet route."');
  });

  it('inserts RenPy wait commands at the caret when no text is selected', () => {
    const rows = parseActionEditorContent('s "Ehehe thank you."');
    const editedRows = applyActionEditorTextTag(rows, 'row-0000', { start: 5, end: 5 }, 'wait');

    expect(serializeActionEditorRows(editedRows)).toBe('s "Ehehe{w} thank you."');
  });

  it('detects structural RenPy statements that should become graph nodes', () => {
    expect(detectActionEditorStructuralStatement('menu:')).toEqual({ kind: 'menu', statement: 'menu:' });
    expect(detectActionEditorStructuralStatement('if has_cheese:')).toEqual({
      kind: 'conditional',
      statement: 'if has_cheese:',
    });
    expect(detectActionEditorStructuralStatement('jump day_two')).toEqual({ kind: 'jump', statement: 'jump day_two' });
    expect(detectActionEditorStructuralStatement('call snack_scene')).toEqual({
      kind: 'call',
      statement: 'call snack_scene',
    });
    expect(detectActionEditorStructuralStatement('return')).toEqual({ kind: 'return', statement: 'return' });
  });

  it('does not intercept ordinary action statements in Raw RenPy mode', () => {
    expect(detectActionEditorStructuralStatement('scene bg club_day with dissolve')).toBeNull();
    expect(detectActionEditorStructuralStatement('show monika happy at left')).toBeNull();
    expect(detectActionEditorStructuralStatement('play music t2.ogg fadein 1.0')).toBeNull();
    expect(detectActionEditorStructuralStatement('"The clubroom gets quiet."')).toBeNull();
  });
});
