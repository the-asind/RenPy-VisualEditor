export interface MenuBranchOption {
  text: string;
  jump?: string;
  notes?: string;
}

export interface MenuBranchDialogResult {
  type: 'menu';
  indent: string;
  options: MenuBranchOption[];
}

export type ConditionBranchKind = 'if' | 'elif' | 'else';

export interface ConditionBranchEntry {
  kind: ConditionBranchKind;
  condition?: string;
  notes?: string;
  content?: string;
}

export interface ConditionBranchDialogResult {
  type: 'if';
  indent: string;
  branches: ConditionBranchEntry[];
}

export type BranchDialogResult = MenuBranchDialogResult | ConditionBranchDialogResult;

const INDENT_UNIT = '    ';

const formatNotes = (note: string | undefined, indent: string): string[] => {
  if (!note || !note.trim()) {
    return [];
  }
  return note
    .split(/\r?\n/)
    .map((line) => `${indent}# ${line.trim()}`);
};

export const buildBranchSnippet = (result: BranchDialogResult): string => {
  if (result.type === 'menu') {
    const baseIndent = `${result.indent ?? ''}${INDENT_UNIT}`;
    const optionIndent = baseIndent + INDENT_UNIT;
    const actionIndent = optionIndent + INDENT_UNIT;
    const lines: string[] = [`${baseIndent}menu:`];

    result.options.forEach((option, index) => {
      lines.push(...formatNotes(option.notes, optionIndent));
      lines.push(`${optionIndent}"${option.text}":`);

      if (option.jump && option.jump.trim()) {
        lines.push(`${actionIndent}jump ${option.jump.trim()}`);
      } else {
        lines.push(`${actionIndent}# TODO: Add action for "${option.text}"`);
        lines.push(`${actionIndent}pass`);
      }

      if (index < result.options.length - 1) {
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  const baseIndent = `${result.indent ?? ''}${INDENT_UNIT}`;
  const innerIndent = baseIndent + INDENT_UNIT;
  const lines: string[] = [];

  result.branches.forEach((branch, index) => {
    if (branch.kind === 'else') {
      lines.push(`${baseIndent}else:`);
      lines.push(...formatNotes(branch.notes, innerIndent));
      if (branch.content && branch.content.trim()) {
        lines.push(
          ...branch.content
            .split(/\r?\n/)
            .map((line) => `${innerIndent}${line.trim()}`)
        );
      } else {
        lines.push(`${innerIndent}# TODO: Handle else branch`);
        lines.push(`${innerIndent}pass`);
      }
    } else {
      const keyword = branch.kind;
      const condition = branch.condition?.trim() || 'True';
      lines.push(`${baseIndent}${keyword} ${condition}:`);
      if (branch.notes && branch.notes.trim()) {
        lines.push(...formatNotes(branch.notes, innerIndent));
      }
      if (branch.condition && branch.condition.trim()) {
        lines.push(`${innerIndent}# PSEUDO CONDITION: ${branch.condition.trim()}`);
      } else {
        lines.push(`${innerIndent}# TODO: Provide condition logic`);
      }
      if (branch.content && branch.content.trim()) {
        lines.push(
          ...branch.content
            .split(/\r?\n/)
            .map((line) => `${innerIndent}${line.trim()}`)
        );
      } else {
        lines.push(`${innerIndent}pass`);
      }
    }

    if (index < result.branches.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
};
