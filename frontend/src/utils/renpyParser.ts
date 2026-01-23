import { ParsedNodeData } from './parsedNodeTypes';

export enum ChoiceNodeType {
  ACTION = "Action",
  LABEL_BLOCK = "LabelBlock",
  IF_BLOCK = "IfBlock",
  MENU_BLOCK = "MenuBlock",
  MENU_OPTION = "MenuOption",
}

export class RenPyParser {
  private lines: string[] = [];

  constructor() {}

  public parse(content: string): ParsedNodeData {
    // Normalize line endings and split
    this.lines = content.split(/\r?\n/);
    return this.parseLabels();
  }

  private parseLabels(): ParsedNodeData {
    const rootNode: ParsedNodeData = {
      id: "root",
      node_type: "Root", // Or just leave undefined/custom
      children: [],
      start_line: 0,
    };

    let index = 0;
    while (index < this.lines.length) {
      const line = this.lines[index];
      const labelInfo = this.isLabel(line);

      if (labelInfo.isLabel) {
        // Check for preceding metadata comments
        const startLine = this.findStartLineWithMetadata(index, 0);

        const labelNode: ParsedNodeData = {
          id: labelInfo.labelName, // Use label name as ID for simplicity
          label_name: labelInfo.labelName,
          start_line: startLine,
          node_type: ChoiceNodeType.LABEL_BLOCK,
          children: [],
        };

        index += 1;
        // Start processing the block inside the label
        // Labels have children. We start with an Action node.

        let labelChildNode: ParsedNodeData = {
            start_line: index,
            node_type: ChoiceNodeType.ACTION,
            children: []
        };

        while (true) {
            const { result, newIndex } = this.parseBlock(index, 1, labelChildNode);
            index = newIndex;

            if (!result) {
                break;
            }

            // If the child node is valid (has content), add it
            if ((labelChildNode.end_line ?? -1) >= (labelChildNode.start_line ?? 0)) {
                 labelNode.children?.push(labelChildNode);
            }

            index += 1;
            labelChildNode = {
                start_line: index,
                node_type: ChoiceNodeType.ACTION,
                children: []
            };
        }

        // Add the last child if valid
        if ((labelChildNode.end_line ?? -1) >= (labelChildNode.start_line ?? 0)) {
            labelNode.children?.push(labelChildNode);
        }

        labelNode.end_line = index - 1;
        rootNode.children?.push(labelNode);
      } else {
        index += 1;
      }
    }

    return rootNode;
  }

  private parseBlock(index: number, indentLevel: number, currentNode: ParsedNodeData): { result: boolean, newIndex: number } {
    while (index < this.lines.length) {
      const currentLine = this.lines[index];

      if (!currentLine.trim()) {
        index += 1;
        continue;
      }

      const currentIndent = this.getIndentLevel(currentLine);

      if (currentIndent < indentLevel) {
        index -= 1;
        currentNode.end_line = index;
        return { result: false, newIndex: index };
      }

      // If we hit a statement (if/menu), we finish the current Action node
      if (this.isStatement(currentLine)) {
          // If the current action node has accumulated lines, we need to close it and return
          // so the parent loop can create a new node for this statement.
          // BUT wait, the logic in Python is:
          // If current_node.start_line != index: return True (to push current action, then handle statement next)

          if (currentNode.start_line !== index) {
              index -= 1;
              currentNode.end_line = index;
              return { result: true, newIndex: index };
          }

          // Determine specific statement type
          if (this.isIfStatement(currentLine)) {
               // Check for metadata for this IF block
               const adjustedStartLine = this.findStartLineWithMetadata(index, indentLevel);
               currentNode.start_line = adjustedStartLine;

               index = this.parseStatement(index, currentNode, currentIndent, ChoiceNodeType.IF_BLOCK);
               return { result: true, newIndex: index };
          }

          if (this.isMenuStatement(currentLine)) {
              const adjustedStartLine = this.findStartLineWithMetadata(index, indentLevel);
              currentNode.start_line = adjustedStartLine;

              index = this.parseMenuBlock(index, currentNode, currentIndent);
              return { result: true, newIndex: index };
          }
      }

      // Normal line (dialog, python code, etc.) belonging to Action
      index += 1;
    }

    index -= 1;
    currentNode.end_line = index;
    return { result: false, newIndex: index };
  }

  private parseStatement(index: number, currentNode: ParsedNodeData, currentIndent: number, nodeType: ChoiceNodeType): number {
      currentNode.node_type = nodeType;
      currentNode.end_line = index;
      currentNode.children = [];
      currentNode.false_branch = [];

      index += 1;
      let statementNode: ParsedNodeData = {
          start_line: index,
          node_type: ChoiceNodeType.ACTION,
          children: []
      };

      // Parse True branch
      while (true) {
          const { result, newIndex } = this.parseBlock(index, currentIndent + 1, statementNode);
          index = newIndex;

          if ((statementNode.end_line ?? -1) >= (statementNode.start_line ?? 0)) {
              currentNode.children?.push(statementNode);
          }

          if (!result) break;

          index += 1;
          statementNode = {
            start_line: index,
            node_type: ChoiceNodeType.ACTION,
            children: []
          };
      }

      // Check for elif/else
      while (index + 1 < this.lines.length) {
          index += 1;
          const nextLine = this.lines[index];
          const nextLineTrimmed = nextLine.trim();

          if (!nextLineTrimmed) continue;
          if (nextLineTrimmed.startsWith('#')) continue; // comments

          const nextIndent = this.getIndentLevel(nextLine);
          if (nextIndent !== currentIndent) {
              index -= 1;
              break;
          }

          if (this.isElifStatement(nextLineTrimmed)) {
              const falseBranchNode: ParsedNodeData = {
                  start_line: index,
                  children: [],
                  false_branch: []
              };
              // Check for metadata for elif? usually not needed as it's part of the if chain
              // But if we wanted to support it, we'd do it here.
              // For now, let's just parse it.
              index = this.parseStatement(index, falseBranchNode, currentIndent, ChoiceNodeType.IF_BLOCK);
              currentNode.false_branch?.push(falseBranchNode);
              return index;
          }

          if (this.isElseStatement(nextLineTrimmed)) {
              index += 1;
              while (true) {
                  let falseBranchAction: ParsedNodeData = {
                      start_line: index,
                      node_type: ChoiceNodeType.ACTION,
                      children: []
                  };
                  const { result, newIndex } = this.parseBlock(index, currentIndent + 1, falseBranchAction);
                  index = newIndex;

                  if ((falseBranchAction.end_line ?? -1) >= (falseBranchAction.start_line ?? 0)) {
                      currentNode.false_branch?.push(falseBranchAction);
                  }

                  if (!result) break;
                  index += 1;
              }
              return index;
          }

          index -= 1;
          break;
      }

      return index;
  }

  private parseMenuBlock(index: number, menuNode: ParsedNodeData, indentLevel: number): number {
      menuNode.start_line = index;
      // end_line will be updated, but initially index
      menuNode.end_line = index;
      menuNode.node_type = ChoiceNodeType.MENU_BLOCK;
      menuNode.children = [];

      index += 1;

      while (index < this.lines.length) {
          const line = this.lines[index];
          if (!line.trim()) {
              index += 1;
              continue;
          }

          const currentIndent = this.getIndentLevel(line);
          if (currentIndent <= indentLevel) {
              index -= 1;
              return index;
          }

          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('"') && trimmedLine.endsWith(':')) {
              // Menu choice
              // Check for metadata preceding this choice
              const adjustedStartLine = this.findStartLineWithMetadata(index, currentIndent);

              const choiceNode: ParsedNodeData = {
                  label_name: trimmedLine.slice(0, -1).trim().replace(/^"|"$/g, ''), // strip : and quotes
                  start_line: adjustedStartLine,
                  node_type: ChoiceNodeType.MENU_OPTION,
                  children: []
              };

              index = this.parseStatement(index, choiceNode, currentIndent, ChoiceNodeType.MENU_OPTION);
              menuNode.children?.push(choiceNode);
          } else {
              index += 1;
          }
      }
      return index;
  }

  // --- Helper Methods ---

  private isLabel(line: string): { isLabel: boolean, labelName?: string } {
      const trimmed = line.trim();
      if (trimmed.startsWith('label ') && trimmed.endsWith(':')) {
          return { isLabel: true, labelName: trimmed.slice(6, -1).trim() };
      }
      return { isLabel: false };
  }

  private isStatement(line: string): boolean {
      const trimmed = line.trim();
      return trimmed.startsWith('if ') || trimmed.startsWith('elif ') || trimmed.startsWith('menu');
  }

  private isIfStatement(line: string): boolean {
      const trimmed = line.trim();
      return trimmed.startsWith('if ') && trimmed.endsWith(':');
  }

  private isElifStatement(line: string): boolean {
      const trimmed = line.trim();
      return trimmed.startsWith('elif ') && trimmed.endsWith(':');
  }

  private isElseStatement(line: string): boolean {
      const trimmed = line.trim();
      return trimmed.startsWith('else') && trimmed.endsWith(':');
  }

  private isMenuStatement(line: string): boolean {
      const trimmed = line.trim();
      return trimmed.startsWith('menu') && trimmed.endsWith(':');
  }

  private getIndentLevel(line: string): number {
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

  private findStartLineWithMetadata(currentIndex: number, indentLevel: number): number {
      // Look backwards for # @NODE comments at the same indentation level
      let probeIndex = currentIndex - 1;
      let foundIndex = currentIndex;

      while (probeIndex >= 0) {
          const line = this.lines[probeIndex];
          const trimmed = line.trim();

          if (!trimmed) {
              probeIndex--;
              continue;
          }

          const currentIndent = this.getIndentLevel(line);
          if (currentIndent !== indentLevel) {
              // Indentation change implies different block scope
              break;
          }

          if (trimmed.startsWith('# @NODE')) {
               foundIndex = probeIndex;
          } else if (trimmed.startsWith('#')) {
              // Regular comment.
              // We continue scanning backwards. If we find metadata above this,
              // this comment will be included in the node range, which is acceptable.
          } else {
              // Code line or something else
              break;
          }
          probeIndex--;
      }
      return foundIndex;
  }
}
