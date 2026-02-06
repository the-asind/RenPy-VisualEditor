export enum ChoiceNodeType {
  ACTION = "Action",
  LABEL_BLOCK = "LabelBlock",
  IF_BLOCK = "IfBlock",
  MENU_BLOCK = "MenuBlock",
  MENU_OPTION = "MenuOption"
}

export class ChoiceNode {
  id: string;
  label_name: string;
  start_line: number;
  end_line: number;
  node_type: ChoiceNodeType;
  children: ChoiceNode[];
  false_branch: ChoiceNode[];

  constructor(
    label_name: string = "",
    start_line: number = 0,
    end_line: number = 0,
    node_type: ChoiceNodeType = ChoiceNodeType.ACTION
  ) {
    // Generate a temporary ID.
    // Note: In a real app, you might want more robust ID generation.
    this.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.label_name = label_name;
    this.start_line = start_line;
    this.end_line = end_line;
    this.node_type = node_type;
    this.children = [];
    this.false_branch = [];
  }
}

function getIndentLevel(line: string): number {
  let indent = 0;
  let tabScore = 0;

  for (const char of line) {
      if (char === '\t') {
          tabScore = 0;
          indent += 1;
      } else if (char === ' ') {
          tabScore += 1;
          if (tabScore === 4) {
              indent += 1;
              tabScore = 0;
          }
      } else {
          break;
      }
  }
  return indent;
}

function isLabel(line: string): [boolean, string | null] {
  line = line.trim();
  if (line.startsWith("label ") && line.endsWith(':')) {
      const labelName = line.substring(6, line.length - 1).trim();
      return [true, labelName];
  }
  return [false, null];
}

function isStatement(line: string): boolean {
  const trimmedLine = line.trim();
  return (
      trimmedLine.startsWith("if ") ||
      trimmedLine.startsWith("elif ") ||
      trimmedLine.startsWith("menu")
  );
}

function isIfStatement(line: string): boolean {
  return line.trim().startsWith("if ") && line.trim().endsWith(":");
}

function isElifStatement(line: string): boolean {
  return line.trim().startsWith("elif ") && line.trim().endsWith(":");
}

function isElseStatement(line: string): boolean {
  return line.trim().startsWith("else") && line.trim().endsWith(":");
}

function isMenuStatement(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("menu") && trimmed.endsWith(":");
}

export class RenPyParser {
  lines: string[] = [];

  parse(content: string): ChoiceNode {
      this.lines = content.split(/\r?\n/);
      if (this.lines.length > 0 && this.lines[this.lines.length - 1] === "") {
          this.lines.pop();
      }
      return this.parseLabels();
  }

  private parseLabels(): ChoiceNode {
      const rootNode = new ChoiceNode("root", 0);
      let index = 0;

      while (index < this.lines.length) {
          const line = this.lines[index];
          const [isLbl, labelName] = isLabel(line);

          if (isLbl && labelName !== null) {
              const labelNode = new ChoiceNode(
                  labelName,
                  index,
                  0, // Will be updated
                  ChoiceNodeType.LABEL_BLOCK
              );

              index += 1;
              let labelChildNode = new ChoiceNode("", index, 0, ChoiceNodeType.ACTION);

              while (true) {
                  const result = this.parseBlock(index, 1, labelChildNode);
                  const success = result.success;
                  index = result.index;

                  if (!success) {
                      break;
                  }

                  labelNode.children.push(labelChildNode);
                  index += 1;
                  labelChildNode = new ChoiceNode("", index, 0, ChoiceNodeType.ACTION);
              }

               // add check before label_child_node (porting python logic)
               if (labelChildNode.end_line >= labelChildNode.start_line) {
                  labelNode.children.push(labelChildNode);
               }

              labelNode.end_line = index - 1;
              rootNode.children.push(labelNode);
          } else {
              index += 1;
          }
      }

      return rootNode;
  }

  private parseBlock(index: number, indentLevel: number, currentNode: ChoiceNode): { success: boolean, index: number } {
      while (index < this.lines.length) {
          const currentLine = this.lines[index];
          const currentIndent = getIndentLevel(currentLine);

          if (!currentLine.trim()) {
              index += 1;
              continue;
          }

          if (currentIndent < indentLevel) {
              index -= 1;
              currentNode.end_line = index;
              return { success: false, index };
          }

          if (!isStatement(currentLine.trim())) {
              index += 1;
              continue;
          }

          if (currentNode.start_line !== index) {
              index -= 1;
              currentNode.end_line = index;
              return { success: true, index };
          }

          const trimmedLine = currentLine.trim();

          if (isIfStatement(trimmedLine)) {
              index = this.parseStatement(index, currentNode, currentIndent, ChoiceNodeType.IF_BLOCK);
              return { success: true, index };
          }

          if (isMenuStatement(trimmedLine)) {
              index = this.parseMenuBlock(index, currentNode, currentIndent);
              return { success: true, index };
          }

          index += 1;
      }

      index -= 1;
      currentNode.end_line = index;
      return { success: false, index };
  }

  private parseStatement(index: number, currentNode: ChoiceNode, currentIndent: number, nodeType: ChoiceNodeType): number {
      currentNode.node_type = nodeType;
      currentNode.end_line = index;
      index += 1;
      let statementNode = new ChoiceNode("", index, 0, ChoiceNodeType.ACTION);

      // Parse the 'true' branch
      while (true) {
          const { success, index: newIndex } = this.parseBlock(index, currentIndent + 1, statementNode);
          index = newIndex;

          if (statementNode.start_line <= statementNode.end_line) {
              currentNode.children.push(statementNode);
          }

          if (!success) {
              break;
          }

          index += 1;
          statementNode = new ChoiceNode("", index, 0, ChoiceNodeType.ACTION);
      }

      // Check for 'elif' or 'else' at the same indentation level
      while (index + 1 < this.lines.length) {
          index += 1;
          const nextLine = this.lines[index];
          const nextIndent = getIndentLevel(nextLine);
          const nextLineTrimmed = nextLine.trim();

          if (!nextLine.trim()) {
              continue;
          }

          if (nextLineTrimmed.startsWith('#')) {
              continue;
          }

          if (nextIndent !== currentIndent) {
              index -= 1;
              break;
          }

          if (isElifStatement(nextLineTrimmed)) {
              const falseBranchNode = new ChoiceNode("", index);
              // In TS, false_branch is initialized to empty array.
              // We need to push the new node to it, but parseStatement expects to fill currentNode.children/false_branch

              // Wait, Python logic:
              // false_branch_node = ChoiceNode(start_line=index)
              // index = self._parse_statement(index, false_branch_node, current_indent, ChoiceNodeType.IF_BLOCK)
              // current_node.false_branch.append(false_branch_node)

              index = this.parseStatement(index, falseBranchNode, currentIndent, ChoiceNodeType.IF_BLOCK);
              currentNode.false_branch.push(falseBranchNode);
              return index;
          }

          if (isElseStatement(nextLineTrimmed)) {
              index += 1;
              while (true) {
                  const falseBranchNode = new ChoiceNode("", index, 0, ChoiceNodeType.ACTION);
                  const { success, index: newIndex } = this.parseBlock(index, currentIndent + 1, falseBranchNode);
                  index = newIndex;

                  if (falseBranchNode.end_line >= falseBranchNode.start_line) {
                      currentNode.false_branch.push(falseBranchNode);
                  }

                  if (!success) {
                      break;
                  }

                  index += 1;
              }
              return index;
          }

          index -= 1;
          break;
      }

      return index;
  }

  private parseMenuBlock(index: number, menuNode: ChoiceNode, indentLevel: number): number {
      menuNode.start_line = index;
      menuNode.end_line = index;
      menuNode.node_type = ChoiceNodeType.MENU_BLOCK;
      index += 1;

      while (index < this.lines.length) {
          const line = this.lines[index];
          const currentIndent = getIndentLevel(line);

          if (!line.trim()) {
              index += 1;
              continue;
          }

          if (currentIndent <= indentLevel) {
              index -= 1;
              return index;
          }

          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('"') && trimmedLine.endsWith(':')) {
              let labelName = trimmedLine.replace(/:$/, '').trim();
              const choiceNode = new ChoiceNode(
                  labelName,
                  index,
                  0,
                  ChoiceNodeType.MENU_OPTION
              );
              index = this.parseStatement(index, choiceNode, currentIndent, ChoiceNodeType.MENU_OPTION);
              menuNode.children.push(choiceNode);
          } else {
              index += 1;
          }
      }

      return index;
  }
}
