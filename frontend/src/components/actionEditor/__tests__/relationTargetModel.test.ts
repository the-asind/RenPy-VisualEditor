import { describe, expect, it } from 'vitest';

import {
  createDefaultNewRelationTargetDraft,
  validateNewRelationTargetDraft,
  type RelationTargetContext,
} from '../relationTargetModel';

const context: RelationTargetContext = {
  files: [
    { id: 'file-script', path: 'script.rpy' },
    { id: 'file-empty', path: 'chapters/empty.rpy', codeOnlyReason: 'no_labels' },
    { id: 'file-gui', path: 'gui.rpy', codeOnlyReason: 'renpy_template' },
  ],
  labels: [
    { id: 'label-start', fileId: 'file-script', qualifiedName: 'start', scope: 'global' },
    { id: 'label-pantry', fileId: 'file-script', qualifiedName: 'start.pantry', scope: 'local' },
    { id: 'label-day-two', fileId: 'file-empty', qualifiedName: 'day_two', scope: 'global' },
  ],
};

const existingFileGlobal = (name: string) => ({
  ...createDefaultNewRelationTargetDraft('draft-target'),
  file: { kind: 'existing' as const, fileId: 'file-script' },
  name,
});

describe('relation target draft validation', () => {
  it.each(['renpy_mouse', 'Сыр', 'chapter_2'])("accepts the official Ren'Py name component %s", (name) => {
    const result = validateNewRelationTargetDraft(existingFileGlobal(name), context);

    expect(result).toEqual({
      ok: true,
      errors: {},
      value: {
        kind: 'new',
        draftId: 'draft-target',
        file: { kind: 'existing', fileId: 'file-script' },
        scope: 'global',
        ownerLabelId: null,
        name,
        filePath: 'script.rpy',
        qualifiedName: name,
      },
    });
  });

  it.each(['.local', 'global.local', 'if', 'mouse-tail', ' mouse', 'mouse '])(
    'rejects ambiguous or invalid component %s without correcting it',
    (name) => {
      const result = validateNewRelationTargetDraft(existingFileGlobal(name), context);

      expect(result.ok).toBe(false);
      expect(result.errors.name).toBe('invalid');
    },
  );

  it('constructs a local qualified name from an existing global owner in the destination file', () => {
    const result = validateNewRelationTargetDraft(
      {
        ...existingFileGlobal('cheese_cache'),
        scope: 'local',
        ownerLabelId: 'label-start',
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      errors: {},
      value: expect.objectContaining({
        filePath: 'script.rpy',
        ownerLabelId: 'label-start',
        qualifiedName: 'start.cheese_cache',
        scope: 'local',
      }),
    });
  });

  it('normalizes a safe new-file path and limits new files to global labels', () => {
    const draft = {
      ...existingFileGlobal('cheese_heist'),
      file: { kind: 'new' as const, path: 'chapters\\cheese_heist.rpy' },
    };

    expect(validateNewRelationTargetDraft(draft, context)).toEqual({
      ok: true,
      errors: {},
      value: expect.objectContaining({
        file: { kind: 'new', path: 'chapters/cheese_heist.rpy' },
        filePath: 'chapters/cheese_heist.rpy',
        qualifiedName: 'cheese_heist',
      }),
    });

    const localResult = validateNewRelationTargetDraft(
      { ...draft, scope: 'local', ownerLabelId: 'label-start' },
      context,
    );
    expect(localResult.ok).toBe(false);
    expect(localResult.errors.scope).toBe('invalid');
  });

  it('adds the only supported .rpy extension and enforces Windows filename limits', () => {
    const extensionless = validateNewRelationTargetDraft(
      { ...existingFileGlobal('bonus'), file: { kind: 'new', path: 'chapters\\bonus' } },
      context,
    );
    expect(extensionless).toMatchObject({
      ok: true,
      value: { file: { kind: 'new', path: 'chapters/bonus.rpy' }, filePath: 'chapters/bonus.rpy' },
    });

    for (const path of ['.rpy', 'bonus.txt', 'COM¹', 'LPT².rpy', 'trailing. ', `${'a'.repeat(256)}.rpy`]) {
      expect(
        validateNewRelationTargetDraft(
          { ...existingFileGlobal('bonus'), file: { kind: 'new', path } },
          context,
        ).errors.filePath,
        path,
      ).toBe('invalid');
    }
  });

  it.each(['../escape.rpy', 'C:/game/evil.rpy', '/absolute.rpy', 'CON.rpy', 'story.txt', 'bad?/story.rpy'])(
    'rejects unsafe project path %s',
    (path) => {
      const result = validateNewRelationTargetDraft(
        { ...existingFileGlobal('cheese_heist'), file: { kind: 'new', path } },
        context,
      );

      expect(result.ok).toBe(false);
      expect(result.errors.filePath).toBe('invalid');
    },
  );

  it('rejects duplicate global/local names, case-insensitive file collisions, and template files', () => {
    expect(validateNewRelationTargetDraft(existingFileGlobal('start'), context).errors.name).toBe('duplicate');
    expect(
      validateNewRelationTargetDraft(
        { ...existingFileGlobal('pantry'), scope: 'local', ownerLabelId: 'label-start' },
        context,
      ).errors.name,
    ).toBe('duplicate');
    expect(
      validateNewRelationTargetDraft(
        {
          ...existingFileGlobal('new_chapter'),
          file: { kind: 'new', path: 'CHAPTERS/EMPTY.RPY' },
        },
        context,
      ).errors.filePath,
    ).toBe('duplicate');
    expect(
      validateNewRelationTargetDraft(
        {
          ...existingFileGlobal('gui_story'),
          file: { kind: 'existing', fileId: 'file-gui' },
        },
        context,
      ).errors.fileId,
    ).toBe('invalid');
  });

  it('requires every field and a global local-label owner in the selected file', () => {
    const emptyResult = validateNewRelationTargetDraft(createDefaultNewRelationTargetDraft('draft-empty'), context);
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.errors).toMatchObject({ fileId: 'required', name: 'required' });

    const wrongOwner = validateNewRelationTargetDraft(
      {
        ...existingFileGlobal('cache'),
        scope: 'local',
        ownerLabelId: 'label-day-two',
      },
      context,
    );
    expect(wrongOwner.ok).toBe(false);
    expect(wrongOwner.errors.ownerLabelId).toBe('invalid');
  });
});
