import { describe, it, expect } from 'vitest';
import { RenPyParser, ChoiceNodeType } from '../renpyParser';

describe('RenPyParser', () => {
  const parser = new RenPyParser();

  it('parses basic labels and actions', () => {
    const script = `
label start:
    "Hello world"
    return
`;
    const result = parser.parse(script);
    expect(result.node_type).toBe('root');
    expect(result.children).toHaveLength(1);

    const labelNode = result.children![0];
    expect(labelNode.node_type).toBe(ChoiceNodeType.LABEL_BLOCK);
    expect(labelNode.label_name).toBe('start');

    expect(labelNode.children).toHaveLength(1);

    const actionNode = labelNode.children![0];
    expect(actionNode.node_type).toBe(ChoiceNodeType.ACTION);
    expect(actionNode.start_line).toBe(2);
    // Includes the trailing newline (line 4) because parser skips empty lines but includes them in range
    expect(actionNode.end_line).toBe(4);
  });

  it('parses if blocks', () => {
    const script = `
label start:
    if condition:
        "True"
    else:
        "False"
`;
    const result = parser.parse(script);
    const labelNode = result.children![0];

    expect(labelNode.children).toHaveLength(1);
    const ifNode = labelNode.children![0];
    expect(ifNode.node_type).toBe(ChoiceNodeType.IF_BLOCK);
    expect(ifNode.children).toHaveLength(1); // True branch
    expect(ifNode.false_branch).toHaveLength(1); // Else branch
  });

  it('parses menu blocks', () => {
      const wrappedScript = `
label start:
    menu:
        "Option 1":
            jump one
`;
      const result = parser.parse(wrappedScript);
      const labelNode = result.children![0];
      const menuNode = labelNode.children![0];
      expect(menuNode.node_type).toBe(ChoiceNodeType.MENU_BLOCK);
      expect(menuNode.children).toHaveLength(1);
      expect(menuNode.children![0].node_type).toBe(ChoiceNodeType.MENU_OPTION);
      expect(menuNode.children![0].label_name).toBe('"Option 1"');
  });
});
