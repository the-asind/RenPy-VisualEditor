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

  it('parses offsets correctly', () => {
    const script = `
# offset: 100, 200
label Start:
    # offset: 50, 50
    "Hello"
    "World"
    return
`;
    const result = parser.parse(script);
    const label = result.children[0];

    expect(label.offset).toBeDefined();
    expect(label.offset).toEqual({ x: 100, y: 200 });

    expect(label.children.length).toBe(1);
    const action = label.children[0];
    expect(action.offset).toBeDefined();
    expect(action.offset).toEqual({ x: 50, y: 50 });
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

  it('parses offsets on if blocks', () => {
      const script = `
label Start:
    # offset: 10, 20
    if x > 0:
        "Positive"
`;
      const result = parser.parse(script);
      const label = result.children[0];
      // The first child of the label is the IfBlock
      const ifNode = label.children[0];
      expect(ifNode.offset).toEqual({ x: 10, y: 20 });
  });
});
