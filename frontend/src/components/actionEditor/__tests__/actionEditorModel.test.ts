import { describe, expect, it } from 'vitest';

import {
  applyActionEditorTextTag,
  changeActionEditorEmptyRowSpeaker,
  commitActionEditorEmptyRowDraft,
  deriveActionEditorTitle,
  deriveActionEditorSpeakerPool,
  detectActionEditorStructuralStatement,
  parseActionEditorContent,
  serializeActionEditorRows,
  speakerAccentForId,
  splitActionEditorTextRow,
  updateActionEditorDialogueImageAttributes,
  updateActionEditorCommandClause,
  updateActionEditorCommandExtraClauses,
  updateActionEditorCommandPrimary,
  updateActionEditorCommandSuffix,
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
        clauses: { with: 'dissolve' },
        source: 'scene bg club_day with dissolve',
      },
      {
        id: 'row-0001',
        kind: 'show',
        command: 'show',
        primary: 'monika happy',
        suffix: 'at left',
        clauses: { at: 'left' },
        source: 'show monika happy at left',
      },
      {
        id: 'row-0002',
        kind: 'show',
        command: 'show',
        primary: 'sayori smile',
        suffix: 'at right',
        clauses: { at: 'right' },
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

  it('keeps show command image name, at clause, and with clause independently editable', () => {
    const rows = parseActionEditorContent('show monika happy at left with dissolve');

    expect(rows[0]).toMatchObject({
      id: 'row-0000',
      kind: 'show',
      primary: 'monika happy',
      suffix: 'at left with dissolve',
      clauses: { at: 'left', with: 'dissolve' },
    });

    const renamedRows = updateActionEditorCommandPrimary(rows, 'row-0000', 'monika 4c');
    const movedRows = updateActionEditorCommandClause(renamedRows, 'row-0000', 'at', 't31');
    const transitionedRows = updateActionEditorCommandClause(movedRows, 'row-0000', 'with', 'fade');

    expect(serializeActionEditorRows(transitionedRows)).toBe('show monika 4c at t31 with fade');
  });

  it('omits empty command clauses instead of serializing placeholder text', () => {
    const rows = parseActionEditorContent('show monika happy at left with dissolve');
    const editedRows = updateActionEditorCommandClause(rows, 'row-0000', 'with', '');

    expect(serializeActionEditorRows(editedRows)).toBe('show monika happy at left');
  });

  it('keeps show image modifiers editable without folding them into the image name', () => {
    const rows = parseActionEditorContent('show monika 1 zorder 2 at t21');

    expect(rows[0]).toMatchObject({
      id: 'row-0000',
      kind: 'show',
      primary: 'monika 1',
      extraClauses: 'zorder 2',
      suffix: 'zorder 2 at t21',
      clauses: { at: 't21' },
    });

    const editedRows = updateActionEditorCommandExtraClauses(rows, 'row-0000', 'zorder 3 behind sayori');

    expect(serializeActionEditorRows(editedRows)).toBe('show monika 1 zorder 3 behind sayori at t21');
  });

  it('keeps audio command options editable after the audio filename', () => {
    const rows = parseActionEditorContent('play music t2.ogg fadein 1.0');
    const editedRows = updateActionEditorCommandSuffix(rows, 'row-0000', 'fadeout 1.0 fadein 2.0 loop');

    expect(serializeActionEditorRows(editedRows)).toBe('play music t2.ogg fadeout 1.0 fadein 2.0 loop');
  });

  it('recognizes RenPy say image attributes as part of dialogue rows', () => {
    const rows = parseActionEditorContent('m 2d "Sayori helps lighten the mood."');

    expect(rows).toEqual([
      {
        id: 'row-0000',
        kind: 'dialogue',
        speaker: 'm',
        imageAttributes: ['2d'],
        text: 'Sayori helps lighten the mood.',
        source: 'm 2d "Sayori helps lighten the mood."',
      },
    ]);
    expect(serializeActionEditorRows(rows)).toBe('m 2d "Sayori helps lighten the mood."');
  });

  it('serializes edited say image attributes back into one dialogue line', () => {
    const rows = parseActionEditorContent('m 2d "Sayori helps lighten the mood."');
    const editedRows = updateActionEditorDialogueImageAttributes(rows, 'row-0000', ['3b']);

    expect(serializeActionEditorRows(editedRows)).toBe('m 3b "Sayori helps lighten the mood."');
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

  it('applies configured toolbar style tag values instead of fixed defaults', () => {
    const rows = parseActionEditorContent('m "Monika picks the quiet route."');
    const coloredRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'color', {
      value: '#ef4444',
    });
    const sizedRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'size', {
      value: '+8',
    });
    const cpsRows = applyActionEditorTextTag(rows, 'row-0000', { start: 7, end: 12 }, 'cps', {
      value: '40',
    });

    expect(serializeActionEditorRows(coloredRows)).toBe('m "Monika {color=#ef4444}picks{/color} the quiet route."');
    expect(serializeActionEditorRows(sizedRows)).toBe('m "Monika {size=+8}picks{/size} the quiet route."');
    expect(serializeActionEditorRows(cpsRows)).toBe('m "Monika {cps=40}picks{/cps} the quiet route."');
  });

  it('inserts RenPy wait commands at the caret when no text is selected', () => {
    const rows = parseActionEditorContent('s "Ehehe thank you."');
    const editedRows = applyActionEditorTextTag(rows, 'row-0000', { start: 5, end: 5 }, 'wait');

    expect(serializeActionEditorRows(editedRows)).toBe('s "Ehehe{w} thank you."');
  });

  it('splits dialogue Enter into a new writer row instead of a multiline quoted string', () => {
    const rows = parseActionEditorContent('m "Monika picks the quiet route."');
    const editedRows = splitActionEditorTextRow(rows, 'row-0000', { start: 30, end: 30 });

    expect(serializeActionEditorRows(editedRows)).toBe('m "Monika picks the quiet route."\nm ""');
    expect(serializeActionEditorRows(editedRows)).not.toContain('\n"');
  });

  it('splits narration Enter by carrying trailing text into the next narrator row', () => {
    const rows = parseActionEditorContent('"The room gets quieter."');
    const editedRows = splitActionEditorTextRow(rows, 'row-0000', { start: 9, end: 9 });

    expect(serializeActionEditorRows(editedRows)).toBe('"The room "\n"gets quieter."');
  });

  it('cycles empty row speakers through the speakers already present in the action block', () => {
    const rows = parseActionEditorContent(['m "Hi."', 's "Hi."', '""'].join('\n'));
    const speakerPool = deriveActionEditorSpeakerPool(rows);
    const editedRows = changeActionEditorEmptyRowSpeaker(rows, 'row-0002', 1, speakerPool);

    expect(speakerPool).toEqual(['m', 's', 'Narrator']);
    expect(serializeActionEditorRows(editedRows)).toBe('m "Hi."\ns "Hi."\nm ""');
  });

  it('commits an empty draft row into a concrete command row without creating raw text', () => {
    const rows = parseActionEditorContent(['m "Hi."', 'm ""'].join('\n'));
    const sceneRows = commitActionEditorEmptyRowDraft(rows, 'row-0001', 'scene');
    const showRows = commitActionEditorEmptyRowDraft(rows, 'row-0001', 'show');

    expect(serializeActionEditorRows(sceneRows)).toBe('m "Hi."\nscene black');
    expect(serializeActionEditorRows(showRows)).toBe('m "Hi."\nshow m');
    expect(parseActionEditorContent(serializeActionEditorRows(sceneRows)).at(-1)?.kind).toBe('scene');
    expect(parseActionEditorContent(serializeActionEditorRows(showRows)).at(-1)?.kind).toBe('show');
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

  it('assigns stable distinct speaker accents for dense dialogue scanning', () => {
    const speakers = ['y', 'n', 'Monika', 'mc', 'Narrator'];
    const accents = speakers.map((speaker) => speakerAccentForId(speaker));

    expect(speakerAccentForId('Monika')).toBe(speakerAccentForId('Monika'));
    expect(new Set(accents).size).toBeGreaterThanOrEqual(4);
    expect(accents.every((accent) => /^#[0-9a-f]{6}$/i.test(accent))).toBe(true);
  });
});
