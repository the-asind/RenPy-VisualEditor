import { ParsedNodeData } from './parsedNodeTypes';

export enum ChoiceNodeType {
  ACTION = 'Action',
  LABEL_BLOCK = 'LabelBlock',
  IF_BLOCK = 'IfBlock',
  MENU_BLOCK = 'MenuBlock',
  MENU_OPTION = 'MenuOption',
}

interface Offset {
  x: number;
  y: number;
}

export class ChoiceNode implements ParsedNodeData {
  id: string;
  label_name: string;
  start_line: number;
  end_line: number;
  node_type: string;
  children: ChoiceNode[];
  false_branch: ChoiceNode[];
  offset?: Offset;

  constructor(
    label_name: string = '',
    start_line: number = 0,
    end_line: number = 0,
    node_type: ChoiceNodeType = ChoiceNodeType.ACTION
  ) {
    // Generate a unique ID (simple counter or random string)
    // In Python it was id(node), here we'll use a random string
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

  // Check if the line has quotes
  if (!line.includes('"')) {
    return false;
  }

  // Check if the line ends with a quote (ignoring trailing spaces)
  if (!line.trimEnd().endsWith('"')) {
    return false;
  }

  // Split at the first quote
  const parts = line.split('"');

  // If it starts with a quote, it's a dialog line without character name
  if (line.startsWith('"')) {
    return true;
  }

  // There should be a space between character name and the opening quote
  // parts[0] is the part before the first quote
  const characterPart = line.substring(0, line.indexOf('"')).trim();
  // Check if the original line had a space after the character name before the quote
  // This is a bit tricky with split, let's look at the substring before the first "
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
    this.lines = content.split(/\r?\n/);
    return this.parseLabels();
  }

  private parseLabels(): ChoiceNode {
    const rootNode = new ChoiceNode('root', 0);
    let index = 0;

    while (index < this.lines.length) {
      const line = this.lines[index];
      const labelInfo = isLabel(line);

      if (labelInfo.isLabel && labelInfo.labelName) {
        // Check for offset in comments before the label
        const offset = this.parseOffset(index - 1);

        const labelNode = new ChoiceNode(
          labelInfo.labelName,
          index,
          0, // placeholder
          ChoiceNodeType.LABEL_BLOCK
        );

        if (offset) {
          labelNode.offset = offset;
        }

        index++;
        let labelChildNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);

        // Check for offset for the first child
        const childOffset = this.parseOffset(index - 1);
        if (childOffset) {
            labelChildNode.offset = childOffset;
        }

        while (true) {
          const result = this.parseBlock(index, 1, labelChildNode);
          index = result.index;
          if (!result.success) {
            break;
          }
          // Only add child if it has content (start <= end)
          // However, newly created nodes might have start > end if they are empty.
          // In python: if label_child_node.end_line >= label_child_node.start_line:
          // But wait, parseBlock updates end_line.

          // Let's populate label name
          labelChildNode.label_name = this.getLabelName(labelChildNode);

          labelNode.children.push(labelChildNode);
          index++;
          labelChildNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
           // Check for offset for the next child
           const nextChildOffset = this.parseOffset(index - 1);
           if (nextChildOffset) {
               labelChildNode.offset = nextChildOffset;
           }
        }

        // Add check before label_child_node
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

      // If it's a comment, ignore it here (offsets are handled before creating nodes)
      // But wait, if we are inside a block, we encounter statements.
      // If we see a statement, we want to attach the comment before it to the statement node.
      if (currentLine.trim().startsWith('#')) {
          // If it is just a comment line, we continue.
          // The node creation logic looks backwards for offsets.
          index++;

          // If we haven't found any real content yet for this node (start_line was pointing to this comment),
          // advance start_line so we don't create an empty node containing just comments.
          if (currentNode.start_line === index - 1) {
              currentNode.start_line = index;
          }

          continue;
      }

      // Check for offset before processing the line (action or statement)
      // We only do this if currentNode is "fresh" (start_line == index) OR if we are about to create a new node?
      // Actually, if we are here, we are at a non-comment line.
      // We should check if there was an offset above this line.

      const potentialOffset = this.parseOffset(index - 1);

      if (!this.isAStatement(currentLine.trim())) {
        // It's an action line.
        // If the current node is fresh (start_line was set to this index, OR it was set to a previous comment line that we skipped)
        // Wait, if we skipped comment lines, start_line is "behind".
        // But the content starts here.

        // If currentNode doesn't have an offset yet, and we found one, apply it.
        // This handles the "Action node starting with offset" case.
        if (potentialOffset && !currentNode.offset) {
             currentNode.offset = potentialOffset;
        }

        index++;
        continue;
      }

      if (currentNode.start_line !== index) {
        // If we are here, it means we were parsing a block of actions, and we hit a statement.
        // We need to close the current action node.

        // Note: The statement will be parsed in the NEXT iteration (caller loop), or returned here?
        // This function returns { success: true, index } which means "Statement encountered at index".
        // The caller (parseLabels or parseStatement) loop handles appending the current node and creating a new one.

        // BUT, the statement itself needs to be parsed.
        // We return index pointing to the statement.
        index--; // Backtrack so the statement is processed by the caller or next logic?
        // Wait, if we return true, the caller appends `currentNode` (the action block).
        // Then caller increments index and creates a NEW node for the statement?
        // Let's look at `parseLabels`:
        // result = parseBlock(...)
        // if result: break loop? No.
        // if not result: break.
        // labelNode.children.append(label_child_node)
        // index += 1 (skips the statement?? No!)

        // In Python `renpy_parser.py`:
        // while True:
        //    result, index = self._parse_block(index, 1, label_child_node)
        //    if not result: break
        //    label_node.children.append(label_child_node)
        //    index += 1  <-- This skips the statement line if parseBlock returned pointing to it?

        // Let's re-read Python code carefully.
        // `_parse_block` returns `True, index` if statement encountered. `index` points to the statement line.
        // Caller: `label_node.children.append(label_child_node)` (Appends the action block up to the statement).
        // `index += 1`. This would skip the statement line!
        // UNLESS `_parse_block` returns index pointing to the line BEFORE the statement?

        // Python `_parse_block`:
        // if self._is_if_statement(trimmed_line):
        //    index = self._parse_statement(...)
        //    return True, index  <-- Returns index AFTER the statement block is fully parsed!

        // Ah! `_parse_block` calls `_parse_statement` internally!

        // My implementation in TS `parseBlock`:
        // if (this.isIfStatement(trimmedLine)) {
        //   index = this.parseStatement(...)
        //   return { success: true, index };
        // }

        // So `parseBlock` consumes the statement.

        // BUT, what if `currentNode.start_line != index`?
        // Python:
        // if current_node.start_line != index:
        //     index -= 1
        //     current_node.end_line = index
        //     return True, index

        // It backtracks!
        // So it returns `index` pointing to the line BEFORE the statement (the last line of action).
        // The caller then:
        // appends action node.
        // `index += 1`. Points to the statement.
        // loops. `label_child_node` created at statement index.
        // calls `parseBlock` again.
        // `parseBlock` sees statement at `index`. `start_line == index`.
        // It enters `isIfStatement` block and consumes it.

        index--;
        currentNode.end_line = index;
        return { success: true, index };
      }

      const trimmedLine = currentLine.trim();
      // const offset = this.parseOffset(index - 1); // Already have potentialOffset
      if (potentialOffset) {
          currentNode.offset = potentialOffset;
      }

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
    currentNode.label_name = this.lines[index].trim(); // Use the if line as label
    index++;

    let statementNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
    const offset = this.parseOffset(index - 1);
    if(offset) statementNode.offset = offset;

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
      const nextOffset = this.parseOffset(index - 1);
      if(nextOffset) statementNode.offset = nextOffset;
    }

    // Check for elif or else
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
        const fbOffset = this.parseOffset(index - 1);
        if(fbOffset) falseBranchNode.offset = fbOffset;

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
        // The else line itself
        // index is at 'else:'

        // We need to advance to parse the block inside else
        index++;
        while (true) {
          const falseBranchNode = new ChoiceNode('', index, 0, ChoiceNodeType.ACTION);
          const fbOffset = this.parseOffset(index - 1);
          if(fbOffset) falseBranchNode.offset = fbOffset;

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

      // Check for comments (offsets) for menu options
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
        const offset = this.parseOffset(index - 1);
        if (offset) choiceNode.offset = offset;

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

  private parseOffset(lineIndex: number): Offset | undefined {
      // Look backwards from lineIndex for comments
      // We want to find the *closest* comment block above.
      // E.g.
      // # offset: 100, 200
      // # some other comment
      // label Start:

      // We traverse upwards skipping empty lines.
      let i = lineIndex;
      while (i >= 0) {
          const line = this.lines[i].trim();
          if (!line) {
              i--;
              continue;
          }
          if (line.startsWith('#')) {
              // Check if this comment is an offset
              const offsetMatch = line.match(/#\s*offset:\s*(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/i);
              if (offsetMatch) {
                  return {
                      x: parseFloat(offsetMatch[1]),
                      y: parseFloat(offsetMatch[3])
                  };
              }
              // If it's a comment but not an offset, keep looking up?
              // Or should we stop? Usually comments stick to the node below.
              // If we have:
              // # offset: 10,10
              // # NOTE: This is important
              // label X:
              // Then the offset should apply.
              i--;
              continue;
          }
          // If we hit a non-comment, non-empty line, stop.
          break;
      }
      return undefined;
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

    // Check if labelParts is empty and fill safely
    if (labelParts.length === 0) {
         for (let i = node.start_line; i <= Math.min(node.end_line, this.lines.length - 1); i++) {
             if (this.lines[i].trim()) {
                 labelParts.push(this.lines[i].trim());
             }
         }
    }

    // Special case for return/jump if still empty
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
