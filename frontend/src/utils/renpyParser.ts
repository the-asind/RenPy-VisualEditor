import { ParsedNodeData } from './parsedNodeTypes';

export enum ChoiceNodeType {
  ACTION = 'Action',
  LABEL_BLOCK = 'LabelBlock',
  IF_BLOCK = 'IfBlock',
  MENU_BLOCK = 'MenuBlock',
  MENU_OPTION = 'MenuOption',
}

// Helper to generate unique IDs
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'node-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

export class RenPyParser {
  private lines: string[] = [];

  public parse(text: string): ParsedNodeData {
    this.lines = text.split(/\r?\n/);

    // Root node
    const root: ParsedNodeData = {
      id: generateId(),
      node_type: ChoiceNodeType.ACTION,
      label_name: 'root',
      start_line: 0,
      end_line: 0,
      children: [],
    };

    let index = 0;
    while (index < this.lines.length) {
      const line = this.lines[index];
      const strippedLine = line.trim();

      if (!strippedLine || strippedLine.startsWith('#')) {
        index++;
        continue;
      }

      // Check for Label definition
      const [isLabel, labelName] = this._isLabel(line);
      if (isLabel && labelName) {
        const labelNode: ParsedNodeData = {
          id: generateId(),
          node_type: ChoiceNodeType.LABEL_BLOCK,
          label_name: labelName,
          start_line: index,
          end_line: index,
          children: [],
        };

        index = this._parseBlock(index + 1, labelNode, 1);
        labelNode.end_line = index > labelNode.start_line! ? index - 1 : labelNode.start_line;

        root.children?.push(labelNode);
      } else {
        index++;
      }
    }

    return root;
  }

  private _parseBlock(index: number, parentNode: ParsedNodeData, indentLevel: number): number {
    while (index < this.lines.length) {
      let line = this.lines[index];
      let currentIndent = this._getIndentLevel(line);

      // Skip empty lines
      if (!line.trim()) {
        index++;
        continue;
      }

      if (currentIndent < indentLevel) {
        // Indent mismatch (dedent).
        // Backtrack over any trailing empty lines we might have consumed
        while (index > 0 && !this.lines[index-1].trim()) {
            index--;
        }
        return index;
      }

      if (this._isIfStatement(line)) {
        const ifNode: ParsedNodeData = {
          id: generateId(),
          node_type: ChoiceNodeType.IF_BLOCK,
          label_name: '',
          start_line: index,
          end_line: index,
          children: [],
          false_branch: [],
        };
        index = this._parseIfBlock(index, ifNode, currentIndent);
        parentNode.children?.push(ifNode);
      }
      else if (this._isMenuStatement(line)) {
         const menuNode: ParsedNodeData = {
          id: generateId(),
          node_type: ChoiceNodeType.MENU_BLOCK,
          label_name: '',
          start_line: index,
          end_line: index,
          children: [],
        };
        index = this._parseMenuBlock(index, menuNode, currentIndent);
        parentNode.children?.push(menuNode);
      }
      else {
        // Generic Action / Dialog
        const actionNode: ParsedNodeData = {
          id: generateId(),
          node_type: ChoiceNodeType.ACTION,
          label_name: '',
          start_line: index,
          end_line: index,
          children: [],
        };

        while (index < this.lines.length) {
          line = this.lines[index];

          if (!line.trim()) {
             index++;
             continue;
          }

          const nextIndent = this._getIndentLevel(line);
          if (nextIndent !== indentLevel) {
              // Indent mismatch. Do NOT backtrack empty lines here.
              break;
          }

          if (this._isIfStatement(line) || this._isMenuStatement(line) || this._isLabel(line)[0]) {
            break;
          }

          index++;
        }

        // Set end_line to the last consumed line (index - 1)
        actionNode.end_line = index - 1;

        if (actionNode.start_line <= actionNode.end_line) {
             parentNode.children?.push(actionNode);
        }
      }
    }
    return index;
  }

  private _parseIfBlock(index: number, ifNode: ParsedNodeData, indentLevel: number): number {
    ifNode.start_line = index;
    index++;

    // Parse true branch
    index = this._parseBlock(index, ifNode, indentLevel + 1);

    while (index < this.lines.length) {
      let line = this.lines[index];
      if (!line.trim()) {
        index++;
        continue;
      }

      const currentIndent = this._getIndentLevel(line);
      if (currentIndent !== indentLevel) {
          break;
      }

      if (this._isElifStatement(line)) {
        const elifNode: ParsedNodeData = {
          id: generateId(),
          node_type: ChoiceNodeType.IF_BLOCK,
          label_name: '',
          start_line: index,
          end_line: index,
          children: [],
          false_branch: [],
        };

        if (!ifNode.false_branch) ifNode.false_branch = [];
        ifNode.false_branch.push(elifNode);

        index++;
        index = this._parseBlock(index, elifNode, indentLevel + 1);

        ifNode = elifNode;

      } else if (this._isElseStatement(line)) {
        index++;

        const dummyParent: ParsedNodeData = { children: [] };
        index = this._parseBlock(index, dummyParent, indentLevel + 1);

        if (!ifNode.false_branch) ifNode.false_branch = [];
        if (dummyParent.children) {
            ifNode.false_branch.push(...dummyParent.children);
        }
        break;
      } else {
        break;
      }
    }

    return index;
  }

  private _parseMenuBlock(index: number, menuNode: ParsedNodeData, indentLevel: number): number {
    menuNode.start_line = index;
    index++;

    while (index < this.lines.length) {
      const line = this.lines[index];
      const currentIndent = this._getIndentLevel(line);

      if (!line.trim()) {
        index++;
        continue;
      }

      if (currentIndent <= indentLevel) {
        while (index > 0 && !this.lines[index-1].trim()) {
            index--;
        }
        return index;
      }

      const stripped = line.trim();
      if (stripped.startsWith('"') && stripped.endsWith(':')) {
         const labelName = stripped.replace(/:$/, '').trim();
         const optionNode: ParsedNodeData = {
           id: generateId(),
           node_type: ChoiceNodeType.MENU_OPTION,
           label_name: labelName,
           start_line: index,
           end_line: index,
           children: [],
         };

         index++;
         index = this._parseBlock(index, optionNode, currentIndent + 1);

         menuNode.children?.push(optionNode);
      } else {
         index++;
      }
    }
    return index;
  }

  // Helpers
  private _isLabel(line: string): [boolean, string | null] {
    const trimmed = line.trim();
    if (trimmed.startsWith('label ') && trimmed.endsWith(':')) {
      return [true, trimmed.substring(6, trimmed.length - 1).trim()];
    }
    return [false, null];
  }

  private _isIfStatement(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('if ') && trimmed.endsWith(':');
  }

  private _isElifStatement(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('elif ') && trimmed.endsWith(':');
  }

  private _isElseStatement(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('else') && trimmed.endsWith(':');
  }

  private _isMenuStatement(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('menu') && trimmed.endsWith(':');
  }

  private _getIndentLevel(line: string): number {
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
}
