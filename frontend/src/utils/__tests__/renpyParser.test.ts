import { describe, it, expect } from 'vitest';
import { RenPyParser, ChoiceNodeType } from '../renpyParser';

describe('RenPyParser', () => {
  it('should parse a simple label', () => {
    const parser = new RenPyParser();
    const content = `label start:
    "Hello World"
    return`;

    const result = parser.parse(content);
    expect(result.children).toHaveLength(1);
    expect(result.children![0].node_type).toBe(ChoiceNodeType.LABEL_BLOCK);
    expect(result.children![0].label_name).toBe('start');
  });

  it('should attach metadata preceding a label', () => {
    const parser = new RenPyParser();
    const content = `# @NODE offset="100,200"
label start:
    "Hello"`;

    const result = parser.parse(content);
    const labelNode = result.children![0];

    expect(labelNode.start_line).toBe(0); // Should point to the comment line
    expect(labelNode.label_name).toBe('start');
  });

  it('should parse nested if statements', () => {
      const parser = new RenPyParser();
      const content = `label start:
    if condition:
        "Yes"
    else:
        "No"`;

      const result = parser.parse(content);
      const labelNode = result.children![0];
      // Action node contains the IF
      const actionNode = labelNode.children![0]; // Action
      // But wait, the parser creates a sequence of actions.
      // If `if` is encountered, does it start a new action?
      // parseBlock logic:
      // - Iterates lines.
      // - If statement: returns True, and checks if start_line != index.
      // - If so, it returns the current Action node (end_line set).
      // - Then parent loop appends Action node, then calls parseBlock again with new empty Action node.
      // - The next parseBlock call hits the `if` immediately?
      // No, `parseLabels` loop:
      //   labelChildNode = Action
      //   while true:
      //      result = parseBlock()
      //      labelNode.children.push(labelChildNode)
      //      ...
      //      labelChildNode = Action

      // Inside `parseBlock`:
      //   if statement:
      //     if currentNode.start_line != index: return true (pushes the accumulated Action)
      //     if currentNode.start_line == index: (we are fresh)
      //       call parseStatement -> returns index after statement
      //       return true

      // So `if` block becomes a child of `currentNode` (the Action node).
      // Wait, `parseStatement` creates children for `currentNode`?
      // `currentNode` is passed to `parseStatement`.
      // `parseStatement` sets `currentNode.node_type = nodeType`.
      // So the `Action` node transforms into an `IfBlock` node.

      // Let's verify structure:
      // root -> LabelBlock -> [ Action(lines before if), IfBlock(if), Action(lines after) ]
      // Actually `parseBlock` returns `true` when statement found.
      // If text preceded `if`: `Action` is returned. Then loop creates NEW `Action`.
      // New `Action` calls `parseBlock`. `parseBlock` sees `if` at start.
      // `parseBlock` calls `parseStatement` on that `Action` node.
      // `parseStatement` sets `node.node_type = IF`.
      // So yes: root -> LabelBlock -> [ Action(pre), IfBlock, Action(post) ]

      expect(labelNode.children).toHaveLength(1); // "if" is inside the first "Action" node which becomes IfBlock?
      // Wait. If there is no text before `if`:
      // Label starts. `labelChildNode` (Action) created.
      // `parseBlock` called.
      // Line 1: `if ...`. `isStatement` is true.
      // `currentNode.start_line` (1) == index (1).
      // `parseStatement` called on `currentNode`.
      // `currentNode` becomes `IfBlock`.
      // `parseBlock` returns true.
      // `labelNode.children` push `currentNode` (IfBlock).
      // Loop continues. New `labelChildNode` (Action).

      const firstChild = labelNode.children![0];
      expect(firstChild.node_type).toBe(ChoiceNodeType.IF_BLOCK);
      expect(firstChild.children).toBeDefined(); // True branch
      expect(firstChild.false_branch).toBeDefined(); // Else branch
  });

  it('should parse menu with metadata', () => {
      const parser = new RenPyParser();
      const content = `label start:
    menu:
        # @NODE offset="10,10"
        "Choice 1":
            jump one
        "Choice 2":
            jump two`;

      const result = parser.parse(content);
      const labelNode = result.children![0];
      const menuNode = labelNode.children![0];

      expect(menuNode.node_type).toBe(ChoiceNodeType.MENU_BLOCK);
      expect(menuNode.children).toHaveLength(2);

      const choice1 = menuNode.children![0];
      // "Choice 1" line index is 3 (0-based: label=0, menu=1, meta=2, choice=3)
      // Metadata is at 2.
      // start_line should be 2.
      expect(choice1.start_line).toBe(2);
  });

  it('should attach metadata separated by regular comments', () => {
    const parser = new RenPyParser();
    const content = `# @NODE offset="10,10"
# Some regular comment
label start:
    "Hello"`;

    const result = parser.parse(content);
    const labelNode = result.children![0];

    // Metadata is at line 0. Comment at 1. Label at 2.
    // start_line should be 0.
    expect(labelNode.start_line).toBe(0);
  });
});
