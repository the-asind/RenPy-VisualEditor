import { describe, expect, it } from 'vitest';

import {
  actionLeaf,
  existingRelationTarget,
  parseConditionalContinuationRaw,
  parseMenuContinuationRaw,
  serializeActionPlaceholder,
  validateConditionalContinuationDraft,
  validateMenuContinuationDraft,
  type ConditionalContinuationDraft,
  type MenuContinuationDraft,
} from '../actionEditorContinuation';

describe('Action Editor continuation drafts', () => {
  it('accepts if with no elif or else and validates required conditions', () => {
    const draft: ConditionalContinuationDraft = {
      mode: 'structured',
      ifBranch: { condition: '', continuation: actionLeaf() },
      elifBranches: [],
      elseBranch: null,
      raw: '',
    };

    expect(validateConditionalContinuationDraft(draft)).toEqual({
      ok: false,
      errors: { 'if.condition': 'required' },
    });

    draft.ifBranch.condition = 'renpy_mouse_has_cheese';
    expect(validateConditionalContinuationDraft(draft)).toEqual({ ok: true, errors: {} });
  });

  it('supports arbitrary elif branches, optional else, and required relation targets', () => {
    const draft: ConditionalContinuationDraft = {
      mode: 'structured',
      ifBranch: { condition: 'hungry', continuation: actionLeaf('Follow up later') },
      elifBranches: [
        { id: 'elif-a', condition: 'curious', continuation: { kind: 'call', target: existingRelationTarget('') } },
        { id: 'elif-b', condition: '', continuation: { kind: 'jump', target: existingRelationTarget('label-end') } },
      ],
      elseBranch: { continuation: actionLeaf() },
      raw: '',
    };

    expect(validateConditionalContinuationDraft(draft)).toEqual({
      ok: false,
      errors: {
        'elif.elif-a.target': 'required',
        'elif.elif-b.condition': 'required',
      },
    });
  });

  it('allows an absent menu prompt but requires a choice and choice text', () => {
    const empty: MenuContinuationDraft = { mode: 'structured', prompt: '', choices: [], raw: '' };
    expect(validateMenuContinuationDraft(empty)).toEqual({ ok: false, errors: { choices: 'required' } });

    const valid: MenuContinuationDraft = {
      mode: 'structured',
      prompt: '',
      choices: [{ id: 'choice-a', text: 'Follow the cheese', condition: '', continuation: actionLeaf() }],
      raw: '',
    };
    expect(validateMenuContinuationDraft(valid)).toEqual({ ok: true, errors: {} });
  });

  it('serializes every plain-text comment line before one pass', () => {
    expect(serializeActionPlaceholder('')).toBe('pass');
    expect(serializeActionPlaceholder('Add animation\nthen check timing')).toBe(
      '# Add animation\n# then check timing\npass',
    );
    expect(serializeActionPlaceholder('# cannot inject\njump ending')).toBe(
      '# # cannot inject\n# jump ending\npass',
    );
  });

  it('parses supported raw IF/MENU leaves and rejects nested structural actions', () => {
    const labels = [{ id: 'label-end', qualifiedName: 'ending' }];
    expect(parseConditionalContinuationRaw([
      'if hungry:',
      '    # Add animation',
      '    pass',
      'elif tired:',
      '    jump ending',
    ].join('\n'), labels)).toMatchObject({
      ok: true,
      draft: {
        ifBranch: { condition: 'hungry', continuation: { kind: 'action' } },
        elifBranches: [{ condition: 'tired', continuation: { kind: 'jump', target: existingRelationTarget('label-end') } }],
      },
    });
    expect(parseMenuContinuationRaw([
      'menu:',
      '    "Cheese?"',
      '    "Yes":',
      '        pass',
    ].join('\n'), labels).ok).toBe(true);
    expect(parseConditionalContinuationRaw('if hungry:\n    menu:\n        "No":\n            pass', labels)).toEqual({
      ok: false,
      error: 'unsupported-nesting',
    });
  });
});
