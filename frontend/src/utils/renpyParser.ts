import { ParsedNodeData } from './parsedNodeTypes';

export enum ChoiceNodeType {
  ACTION = 'Action',
  LABEL_BLOCK = 'LabelBlock',
  IF_BLOCK = 'IfBlock',
  MENU_BLOCK = 'MenuBlock',
  MENU_OPTION = 'MenuOption',
}

export class ChoiceNode implements ParsedNodeData {
  id: string;
  label_name: string;
  start_line: number;
  end_line: number;
  node_type: string;
  children: ChoiceNode[];
  false_branch: ChoiceNode[];

  constructor(
    label_name: string = '',
    start_line: number = 0,
    end_line: number = 0,
    node_type: ChoiceNodeType = ChoiceNodeType.ACTION
  ) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.label_name = label_name;
    this.start_line = start_line;
    this.end_line = end_line;
    this.node_type = node_type;
    this.children = [];
    this.false_branch = [];
  }
}

function isLabel(line: string): { isLabel: boolean; labelName: string | null } {
  line = line.trim();
  if (line.startsWith('label ') && line.endsWith(':')) {
    const labelName = line.substring(6, line.length - 1).trim();
    return { isLabel: true, labelName };
  }
  return { isLabel: false, labelName: null };
}

function isDialogLine(line: string): boolean {
  line = line.trim();

  if (!line.includes('"')) {
    return false;
  }

  if (!line.trimEnd().endsWith('"')) {
    return false;
  }

  if (line.startsWith('"')) {
    return true;
  }

  const prefix = line.substring(0, line.indexOf('"'));
  return prefix.endsWith(' ');
}

function removeBracketedContent(text: string): string {
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

export class RenPyParser {
  private lines: string[] = [];

  parse(content: string): ChoiceNode {
    console.time('RenPyParser.parse');
    this.lines = content.split(/\r?\n/);
    console.log(`RenPyParser: Parsing ${this.lines.length} lines`);

    const result = this.parseLabels();
    console.timeEnd('RenPyParser.parse');
    return result;
  }

  private parseLabels(): ChoiceNode {
    const rootNode = new ChoiceNode('root', 0);
    let index = 0;
    const startTime = performance.now();

    while (index < this.lines.length) {
      if (performance.now() - startTime > 1000) {
         console.warn(`RenPyParser: Parsing taking long time. Current index: ${index}/${this.lines.length}`);
      }

      const line = this.lines[index];
      const labelInfo = isLabel(line);

      if (labelInfo.isLabel && labelInfo.labelName) {
        const labelNode = new ChoiceNode(
          labelInfo.labelName,
          index,
          0,
          ChoiceNodeType.LABEL_BLOCK
        );

        index++;
        let labelChildNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);

        while (true) {
          const result = this.parseBlock(index, 1, labelChildNode);
          index = result.index;
          if (!result.success) {
            break;
          }

          labelChildNode.label_name = this.getLabelName(labelChildNode);

          labelNode.children.push(labelChildNode);
          index++;
          labelChildNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
        }

        if (labelChildNode.end_line >= labelChildNode.start_line) {
          labelChildNode.label_name = this.getLabelName(labelChildNode);
          labelNode.children.push(labelChildNode);
        }

        labelNode.end_line = index - 1;
        rootNode.children.push(labelNode);
      } else {
        index++;
      }
    }

    return rootNode;
  }

  private parseBlock(
    index: number,
    indentLevel: number,
    currentNode: ChoiceNode
  ): { success: boolean; index: number } {
    let loopGuard = 0;
    while (index < this.lines.length) {
      loopGuard++;
      if (loopGuard > 100000) {
          console.error("RenPyParser: Infinite loop detected in parseBlock at index " + index);
          return { success: false, index };
      }

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

      // Ignore comments inside blocks
      if (currentLine.trim().startsWith('#')) {
          index++;

          // If we haven't found any real content yet for this node (start_line was pointing to this comment),
          // advance start_line so we don't create an empty node containing just comments.
          if (currentNode.start_line === index - 1) {
              currentNode.start_line = index;
          }
          continue;
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
        index = this.parseStatement(
          index,
          currentNode,
          currentIndent,
          ChoiceNodeType.IF_BLOCK
        );
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

  private parseStatement(
    index: number,
    currentNode: ChoiceNode,
    currentIndent: number,
    nodeType: ChoiceNodeType
  ): number {
    currentNode.node_type = nodeType;
    currentNode.end_line = index;
    currentNode.label_name = this.lines[index].trim();
    index++;

    let statementNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);

    while (true) {
      const result = this.parseBlock(index, currentIndent + 1, statementNode);
      let temp = result.success;
      index = result.index;

      if (statementNode.start_line <= statementNode.end_line) {
        statementNode.label_name = this.getLabelName(statementNode);
        currentNode.children.push(statementNode);
      }

      if (!temp) {
        break;
      }

      index++;
      statementNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
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
        const falseBranchNode = new ChoiceNode('', index);
        index = this.parseStatement(
          index,
          falseBranchNode,
          currentIndent,
          ChoiceNodeType.IF_BLOCK
        );
        currentNode.false_branch.push(falseBranchNode);
        return index;
      }

      if (this.isElseStatement(nextLineTrimmed)) {
        index++;
        while (true) {
          const falseBranchNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
          const result = this.parseBlock(index, currentIndent + 1, falseBranchNode);

          if (falseBranchNode.end_line >= falseBranchNode.start_line) {
             falseBranchNode.label_name = this.getLabelName(falseBranchNode);
            currentNode.false_branch.push(falseBranchNode);
          }

          index = result.index;
          if (!result.success) {
            break;
          }

          index++;
        }
        return index;
      }

      index--;
      break;
    }

    return index;
  }

  private parseMenuBlock(
    index: number,
    menuNode: ChoiceNode,
    indentLevel: number
  ): number {
    menuNode.start_line = index;
    menuNode.end_line = index;
    menuNode.node_type = ChoiceNodeType.MENU_BLOCK;
    menuNode.label_name = "Menu";
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

      if (line.trim().startsWith('#')) {
          index++;
          continue;
      }

      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('"') && trimmedLine.endsWith(':')) {
        const choiceNode = new ChoiceNode(
          trimmedLine.replace(/:$/, '').trim(),
          index,
          0,
          ChoiceNodeType.MENU_OPTION
        );

        index = this.parseStatement(
          index,
          choiceNode,
          currentIndent,
          ChoiceNodeType.MENU_OPTION
        );
        menuNode.children.push(choiceNode);
      } else {
        index++;
      }
    }

    return index;
  }

  private isIfStatement(line: string): boolean {
    return line.trimStart().startsWith('if ') && line.endsWith(':');
  }

  private isElseStatement(line: string): boolean {
    return line.trimStart().startsWith('else') && line.endsWith(':');
  }

  private isElifStatement(line: string): boolean {
    return line.trimStart().startsWith('elif ') && line.endsWith(':');
  }

  private isAStatement(line: string): boolean {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith('if ') ||
      trimmed.startsWith('elif ') ||
      trimmed.startsWith('menu')
    );
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

  private getLabelName(node: ChoiceNode): string {
    if (
      node.start_line >= this.lines.length ||
      node.end_line >= this.lines.length ||
      node.start_line < 0 ||
      node.end_line < 0
    ) {
      return '';
    }

    if (
      node.start_line < this.lines.length &&
      this.isAStatement(this.lines[node.start_line]) &&
      this.lines[node.start_line].endsWith(':')
    ) {
      return this.lines[node.start_line].replace(/:$/, '').trim();
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
        if (isDialogLine(line)) {
          firstDialogLines.push(line);
          if (firstDialogLines.length >= 2) break;
        }
      }

      for (let i = node.end_line; i >= node.start_line; i--) {
        if (i >= this.lines.length) continue;
        const line = this.lines[i].trim();
        if (!line) continue;
        if (isDialogLine(line)) {
          lastDialogLines.unshift(line);
          if (lastDialogLines.length >= 2) break;
        }
      }

      if (firstDialogLines.length > 0 || lastDialogLines.length > 0) {
        labelParts.push(...firstDialogLines);
        if (
          firstDialogLines.length > 0 &&
          lastDialogLines.length > 0 &&
          firstDialogLines[firstDialogLines.length - 1] !== lastDialogLines[0]
        ) {
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

        const lastLines = [];
        for (let i = node.end_line; i >= node.start_line; i--) {
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
      labelText = removeBracketedContent(labelText);
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
}
