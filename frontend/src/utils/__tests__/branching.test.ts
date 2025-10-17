import { describe, expect, it } from 'vitest';
import { buildBranchSnippet } from '../branching';

describe('buildBranchSnippet', () => {
  it('adds an extra indent level for menu snippets', () => {
    const snippet = buildBranchSnippet({
      type: 'menu',
      indent: '',
      options: [
        { text: 'First option' },
      ],
    });

    const lines = snippet.split('\n');
    expect(lines[0]).toBe('    menu:');
    expect(lines[1]).toBe('        "First option":');
    expect(lines[2]).toBe('            # TODO: Add action for "First option"');
    expect(lines[3]).toBe('            pass');
  });

  it('adds an extra indent level for conditional snippets', () => {
    const snippet = buildBranchSnippet({
      type: 'if',
      indent: '',
      branches: [
        { kind: 'if', condition: 'player_has_item' },
        { kind: 'else' },
      ],
    });

    const lines = snippet.split('\n');
    expect(lines[0]).toBe('    if player_has_item:');
    expect(lines[1]).toBe('        # PSEUDO CONDITION: player_has_item');
    expect(lines[2]).toBe('        pass');
    expect(lines[4]).toBe('    else:');
    expect(lines[5]).toBe('        # TODO: Handle else branch');
  });

  it('nests menu snippets relative to existing indentation', () => {
    const snippet = buildBranchSnippet({
      type: 'menu',
      indent: '    ',
      options: [
        { text: 'Nested option' },
      ],
    });

    const lines = snippet.split('\n');
    expect(lines[0]).toBe('        menu:');
    expect(lines[1]).toBe('            "Nested option":');
    expect(lines[2]).toBe('                # TODO: Add action for "Nested option"');
    expect(lines[3]).toBe('                pass');
  });
});
