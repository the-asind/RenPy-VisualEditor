import { describe, it, expect, beforeEach } from 'vitest';
import { RenPyParser, ChoiceNodeType } from '../renpyParser';

describe('RenPyParser', () => {
  let parser: RenPyParser;

  beforeEach(() => {
    parser = new RenPyParser();
  });

  it('parses basic labels and actions', () => {
    const script = `
label Start:
    "Hello"
    "World"
    return
`;
    const result = parser.parse(script);
    expect(result.children.length).toBe(1);
    const label = result.children[0];
    expect(label.label_name).toBe('Start');
    expect(label.children.length).toBe(1);
    expect(label.children[0].node_type).toBe(ChoiceNodeType.ACTION);
  });

  it('parses if blocks', () => {
      const script = `
label Start:
    if x > 0:
        "Positive"
    else:
        "Non-positive"
`;
      const result = parser.parse(script);
      const label = result.children[0];

      const firstChild = label.children[0];
      expect(firstChild.node_type).toBe(ChoiceNodeType.IF_BLOCK);
      expect(firstChild.children.length).toBe(1); // True branch
      expect(firstChild.false_branch.length).toBe(1); // Else branch
  });
});
