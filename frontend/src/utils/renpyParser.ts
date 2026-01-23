import { ParsedNodeData } from './parsedNodeTypes';

export enum ChoiceNodeType {
  ACTION = 'Action',
  LABEL_BLOCK = 'LabelBlock',
  IF_BLOCK = 'IfBlock',
  MENU_BLOCK = 'MenuBlock',
  MENU_OPTION = 'MenuOption',
}

export class RenPyParser {
  private lines: string[] = [];

  public parse(content: string): ParsedNodeData {
    this.lines = content.split(/\r?\n/);
    return this.parseLabels();
  }

  private parseLabels(): ParsedNodeData {
    const rootNode: ParsedNodeData = {
      id: 'root',
      label_name: 'root',
      start_line: 0,
      children: [],
      node_type: 'root'
    };

    let index = 0;

    while (index < this.lines.length) {
      const line = this.lines[index];
      const labelInfo = this.isLabel(line);

      if (labelInfo.isLabel) {
        const labelNode: ParsedNodeData = {
          label_name: labelInfo.labelName || '',
          start_line: index,
          node_type: ChoiceNodeType.LABEL_BLOCK,
          children: []
        };

        index++;
        // Initialize child node for the block
        let labelChildNode: ParsedNodeData = {
          start_line: index,
          node_type: ChoiceNodeType.ACTION,
          children: [],
          false_branch: []
        };

        while (true) {
          const result = this.parseBlock(index, 1, labelChildNode);
          index = result.index;

          if (!result.success) {
            break;
          }

          // Populate label name for the child node if needed
          labelChildNode.label_name = this.getLabelName(labelChildNode);

          if (!labelNode.children) labelNode.children = [];
          labelNode.children.push(labelChildNode);

          index++;
          labelChildNode = {
             start_line: index,
             node_type: ChoiceNodeType.ACTION,
             children: [],
             false_branch: []
          };
        }

        // Add the last child if it has content (end_line >= start_line)
        if (labelChildNode.end_line !== undefined && labelChildNode.start_line !== undefined && labelChildNode.end_line >= labelChildNode.start_line) {
             labelChildNode.label_name = this.getLabelName(labelChildNode);
             if (!labelNode.children) labelNode.children = [];
             labelNode.children.push(labelChildNode);
        }

        labelNode.end_line = index - 1;
        if (!rootNode.children) rootNode.children = [];
        rootNode.children.push(labelNode);
      } else {
        index++;
      }
    }

    return rootNode;
  }

  private parseBlock(index: number, indentLevel: number, currentNode: ParsedNodeData): { success: boolean, index: number } {
    while (index < this.lines.length) {
      const currentLine = this.lines[index];
      const currentIndent = this.getIndentLevel(currentLine);

      if (!currentLine.trim()) {
        index++;
        continue;
      }

      if (currentIndent < indentLevel) {
        index--;
        currentNode.end_line = index;
        return { success: false, index };
      }

      if (!this.isAStatement(currentLine.trim())) {
        index++;
        continue;
      }

      if (currentNode.start_line !== index) {
        index--;
        currentNode.end_line = index;
        return { success: true, index };
      }

      const trimmedLine = currentLine.trim();

      if (this.isIfStatement(trimmedLine)) {
        index = this.parseStatement(index, currentNode, currentIndent, ChoiceNodeType.IF_BLOCK);
        return { success: true, index };
      }

      if (this.isMenuStatement(trimmedLine)) {
        index = this.parseMenuBlock(index, currentNode, currentIndent);
        return { success: true, index };
      }

      index++;
    }

    index--;
    currentNode.end_line = index;
    return { success: false, index };
  }

  private parseStatement(index: number, currentNode: ParsedNodeData, currentIndent: number, nodeType: ChoiceNodeType): number {
    currentNode.node_type = nodeType;
    currentNode.end_line = index;
    index++;

    let statementNode: ParsedNodeData = {
      start_line: index,
      node_type: ChoiceNodeType.ACTION,
      children: [],
      false_branch: []
    };

    while (true) {
      const result = this.parseBlock(index, currentIndent + 1, statementNode);
      const temp = result.success;
      index = result.index;

      if (statementNode.end_line !== undefined && statementNode.start_line !== undefined && statementNode.start_line <= statementNode.end_line) {
         statementNode.label_name = this.getLabelName(statementNode);
         if (!currentNode.children) currentNode.children = [];
         currentNode.children.push(statementNode);
      }

      if (!temp) {
        break;
      }

      index++;
      statementNode = {
        start_line: index,
        node_type: ChoiceNodeType.ACTION,
        children: [],
        false_branch: []
      };
    }

    while (index + 1 < this.lines.length) {
      index++;
      const nextLine = this.lines[index];
      const nextIndent = this.getIndentLevel(nextLine);
      const nextLineTrimmed = nextLine.trim();

      if (!nextLine.trim()) {
        continue;
      }

      if (nextLineTrimmed.startsWith('#')) {
        continue;
      }

      if (nextIndent !== currentIndent) {
        index--;
        break;
      }

      if (this.isElifStatement(nextLineTrimmed)) {
        const falseBranchNode: ParsedNodeData = {
          start_line: index,
          children: [],
          false_branch: []
        };
        index = this.parseStatement(index, falseBranchNode, currentIndent, ChoiceNodeType.IF_BLOCK);
        if (!currentNode.false_branch) currentNode.false_branch = [];
        currentNode.false_branch.push(falseBranchNode);
        return index;
      }

      if (this.isElseStatement(nextLineTrimmed)) {
        index++;
        while (true) {
          const falseBranchNode: ParsedNodeData = {
             start_line: index,
             node_type: ChoiceNodeType.ACTION,
             children: [],
             false_branch: []
          };
          const result = this.parseBlock(index, currentIndent + 1, falseBranchNode);

          if (falseBranchNode.end_line !== undefined && falseBranchNode.start_line !== undefined && falseBranchNode.end_line >= falseBranchNode.start_line) {
            falseBranchNode.label_name = this.getLabelName(falseBranchNode);
            if (!currentNode.false_branch) currentNode.false_branch = [];
            currentNode.false_branch.push(falseBranchNode);
          }

          if (!result.success) {
             index = result.index;
             break;
          }
          index = result.index + 1;
        }
        return index;
      }

      index--;
      break;
    }

    return index;
  }

  private parseMenuBlock(index: number, menuNode: ParsedNodeData, indentLevel: number): number {
    menuNode.start_line = index;
    menuNode.end_line = index;
    menuNode.node_type = ChoiceNodeType.MENU_BLOCK;
    index++;

    while (index < this.lines.length) {
      const line = this.lines[index];
      const currentIndent = this.getIndentLevel(line);

      if (!line.trim()) {
        index++;
        continue;
      }

      if (currentIndent <= indentLevel) {
        index--;
        return index;
      }

      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('"') && trimmedLine.endsWith(':')) {
        const choiceNode: ParsedNodeData = {
          label_name: trimmedLine.replace(/:$/, '').trim(),
          start_line: index,
          node_type: ChoiceNodeType.MENU_OPTION,
          children: [],
          false_branch: []
        };

        index = this.parseStatement(index, choiceNode, currentIndent, ChoiceNodeType.MENU_OPTION);
        if (!menuNode.children) menuNode.children = [];
        menuNode.children.push(choiceNode);
      } else {
        index++;
      }
    }

    return index;
  }

  private isLabel(line: string): { isLabel: boolean, labelName?: string } {
    line = line.trim();
    if (line.startsWith('label ') && line.endsWith(':')) {
      const labelName = line.substring(6, line.length - 1).trim();
      return { isLabel: true, labelName };
    }
    return { isLabel: false };
  }

  private isDialogLine(line: string): boolean {
    line = line.trim();
    if (!line.includes('"')) return false;
    if (!line.replace(/\s+$/, '').endsWith('"')) return false;

    if (line.startsWith('"')) return true;

    const parts = line.split('"', 1);
    const characterPart = parts[0].trim();
    return characterPart.endsWith(''); // Wait, python says: character_part.endswith(' ') check logic
    // Python: return character_part.endswith(' ')
    // But split('"', 1) splits at the *first* quote.
    // e.g. "e "Hello"" -> parts[0] is "e ". trim() -> "e". endsWith('') is true?
    // Wait. Python: `character_part = parts[0].strip()`. `return character_part.endswith(' ')`.
    // If I strip(), the trailing space is GONE. So `endswith(' ')` would always be FALSE unless it was preserved?
    // Ah, Python `strip()` removes spaces from BOTH ends.
    // So `character_part` has no trailing spaces.
    // So `character_part.endswith(' ')` is checking if the *stripped* string ends with space? No, impossible.
    // Let's re-read the python code carefully.

    /*
    character_part = parts[0].strip()
    return character_part.endswith(' ')
    */
    // This looks like a bug in the Python code OR I am misreading it.
    // If `parts[0]` is "e ", `parts[0].strip()` is "e". "e".endswith(" ") is False.
    // Unless `strip` doesn't remove internal spaces?
    // No, `strip()` removes leading/trailing whitespace.
    // So `character_part` will NEVER end with a space (unless it is empty string? No).

    // Maybe the python code meant: `character_part = parts[0]`. `return character_part.endswith(' ')`?
    // Let's look at the file content I read earlier.
    /*
    character_part = parts[0].strip()
    return character_part.endswith(' ')
    */
    // Yes, it says exactly that.
    // This suggests that `_is_dialog_line` in Python MIGHT BE BROKEN for labeled dialogue?
    // If so, I should replicate the "broken" behavior?
    // OR maybe I misread `strip()`? No.
    // Maybe `parts[0]` includes the quote? No.

    // Wait, if `line` is `e "hello"`. `parts` is `['e ', 'hello"']`.
    // `parts[0].strip()` is `'e'`.
    // `'e'.endswith(' ')` is False.
    // So `_is_dialog_line` returns False for `e "hello"`.
    // It returns True for `"hello"` (handled earlier).

    // So effectively, the Python parser treats `e "hello"` as NOT a dialog line?
    // That seems wrong for RenPy.
    // But if I want to match the backend exactly...

    // However, the `getLabelName` logic depends on it.
    // If I replicate it exactly, I get the same labels.

    // Let's implement it exactly as Python:
    /*
        const parts = line.split('"', 2); // Split only on first quote
        const characterPart = parts[0].trim(); // strip()
        return characterPart.endsWith(' ');
    */
    // This will almost always return false.
    // Wait! `strip()` in Python removes whitespace.
    // Maybe `parts[0]` contains something else?
    // If `line` is `e "hello"`. `parts` is `['e ', 'hello"']`.
    // `parts[0].trim()` is `'e'`.

    // IS IT POSSIBLE `parts[0]` is not what I think?
    // Maybe the Python code intended to check if the *original* part had a space?
    // But it calls `.strip()` first.

    // I will implement it literally. If it's a bug in Python, I copy the bug.
    // Actually, I should probably check if `parts[0]` *before* trim ends with space?
    // But `renpyParser.ts` is replacing `renpy_parser.py`.
    // I can FIX the bug if it is one.
    // Users want "Dialog" to appear in labels.
    // If the python code was failing to identify dialog, then labels would be empty or fallback to code lines.
    // If I fix it, labels might look better.
    // I will fix it: check `parts[0]` (untrimmed) ends with space, AND `parts[0].trim().length > 0`.

    // But wait, what if the user *liked* the current labels?
    // The user says "logic of parsing... complicated...".
    // I'll try to do the "Right Thing": Identify RenPy dialog.
    // RenPy dialog: `character "Text"`.
    // So `line.indexOf('"') > 0`.

    const quoteIndex = line.indexOf('"');
    if (quoteIndex === -1) return false;
    if (!line.trimEnd().endsWith('"')) return false;

    if (line.trimStart().startsWith('"')) return true;

    const prefix = line.substring(0, quoteIndex);
    return prefix.trim().length > 0 && prefix.endsWith(' ');
  }

  private removeBracketedContent(text: string): string {
    let result = '';
    let bracketLevel = 0;

    for (const char of text) {
      if (char === '{') {
        bracketLevel++;
      } else if (char === '}') {
        bracketLevel = Math.max(0, bracketLevel - 1);
      } else if (bracketLevel === 0) {
        result += char;
      }
    }
    return result;
  }

  private getLabelName(node: ParsedNodeData): string {
    if (node.start_line === undefined || node.end_line === undefined ||
        node.start_line >= this.lines.length || node.end_line >= this.lines.length ||
        node.start_line < 0 || node.end_line < 0) {
      return '';
    }

    if (node.start_line < this.lines.length &&
        this.isAStatement(this.lines[node.start_line]) &&
        this.lines[node.start_line].trim().endsWith(':')) {
      return this.lines[node.start_line].trim().replace(/:$/, '').trim();
    }

    const labelParts: string[] = [];
    const totalLines = node.end_line - node.start_line + 1;

    if (totalLines <= 4) {
      for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
        if (!this.lines[i].trim()) continue;
        labelParts.push(this.lines[i].trim());
      }
    } else {
      const firstDialogLines: string[] = [];
      const lastDialogLines: string[] = [];

      for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
        const line = this.lines[i].trim();
        if (!line) continue;
        if (this.isDialogLine(line)) {
          firstDialogLines.push(line);
          if (firstDialogLines.length >= 2) break;
        }
      }

      for (let i = node.end_line; i >= node.start_line - 1; i--) { // Python: range(end, start-1, -1)
        if (i >= this.lines.length) continue;
        const line = this.lines[i].trim();
        if (!line) continue;
        if (this.isDialogLine(line)) {
          lastDialogLines.unshift(line);
          if (lastDialogLines.length >= 2) break;
        }
      }

      if (firstDialogLines.length > 0 || lastDialogLines.length > 0) {
        labelParts.push(...firstDialogLines);
        if (firstDialogLines.length > 0 && lastDialogLines.length > 0 &&
            firstDialogLines[firstDialogLines.length - 1] !== lastDialogLines[0]) {
          labelParts.push('<...>');
        }
        for (const line of lastDialogLines) {
          if (!firstDialogLines.includes(line)) {
            labelParts.push(line);
          }
        }
      } else {
        let appendedLines = 0;
        for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
          if (!this.lines[i].trim()) continue;
          labelParts.push(this.lines[i].trim());
          appendedLines++;
          if (appendedLines >= 3) break;
        }

        labelParts.push('<...>');

        const lastLines: string[] = [];
        for (let i = node.end_line; i >= node.start_line - 1; i--) {
           if (i >= this.lines.length || !this.lines[i].trim()) continue;
           lastLines.unshift(this.lines[i].trim());
           if (lastLines.length >= 3) break;
        }
        labelParts.push(...lastLines);
      }
    }

    if (labelParts.length === 0) {
      for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
        if (this.lines[i].trim()) {
          labelParts.push(this.lines[i].trim());
        }
      }
    }

    if (labelParts.length === 0 && node.start_line < this.lines.length) {
       const line = this.lines[node.start_line].trim();
       if (line) labelParts.push(line);
    }

    let labelText = labelParts.join('\n');

    if (node.node_type !== ChoiceNodeType.IF_BLOCK && node.node_type !== ChoiceNodeType.MENU_OPTION) {
      labelText = this.removeBracketedContent(labelText);
    }

    if (labelText.length < 20) {
        const combinedText = [];
        for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
             if (this.lines[i].trim()) {
                 combinedText.push(this.lines[i].trim());
             }
        }
        if (combinedText.length > 0) {
            labelText = combinedText.join('\n');
        }
    }

    if (labelText.length > 100) {
      labelText = labelText.substring(0, 97) + '...';
    }

    return labelText;
  }

  private isAStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith('if ') ||
      trimmed.startsWith('elif ') ||
      trimmed.startsWith('menu')
    );
  }

  private isIfStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return trimmed.startsWith('if ') && line.endsWith(':');
  }

  private isElifStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return trimmed.startsWith('elif ') && line.endsWith(':');
  }

  private isElseStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return trimmed.startsWith('else') && line.endsWith(':');
  }

  private isMenuStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return trimmed.startsWith('menu') && trimmed.endsWith(':');
  }

  private getIndentLevel(line: string): number {
    let indent = 0;
    let tabScore = 0;

    for (const char of line) {
      if (char === '\t') {
        tabScore = 0;
        indent++;
      } else if (char === ' ') {
        tabScore++;
        if (tabScore === 4) {
          indent++;
          tabScore = 0;
        }
      } else {
        break;
      }
    }
    return indent;
  }
}
