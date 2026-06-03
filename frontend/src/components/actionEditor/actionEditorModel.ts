export type ActionEditorRow =
  | ActionEditorDialogueRow
  | ActionEditorNarrationRow
  | ActionEditorCommandRow
  | ActionEditorRawLineRow;

export interface ActionEditorDialogueRow {
  id: string;
  kind: 'dialogue';
  speaker: string;
  text: string;
  source?: string;
}

export interface ActionEditorNarrationRow {
  id: string;
  kind: 'narration';
  speaker: 'Narrator';
  text: string;
  source?: string;
}

export interface ActionEditorCommandRow {
  id: string;
  kind: 'scene' | 'show' | 'hide' | 'music' | 'sound' | 'transition';
  command: string;
  primary: string;
  suffix: string;
  source?: string;
}

export interface ActionEditorRawLineRow {
  id: string;
  kind: 'rawLine';
  text: string;
  source?: string;
}

export type ActionEditorTextTag =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'color'
  | 'size'
  | 'cps'
  | 'wait'
  | 'pause'
  | 'noWait';

export interface ActionEditorTextSelection {
  start: number;
  end: number;
}

export type ActionEditorStructuralStatementKind = 'menu' | 'conditional' | 'jump' | 'call' | 'return' | 'label';

export interface ActionEditorStructuralStatement {
  kind: ActionEditorStructuralStatementKind;
  statement: string;
}

const rowId = (lineIndex: number): string => `row-${String(lineIndex).padStart(4, '0')}`;

const lineIndexFromRowId = (id: string): number | null => {
  const match = id.match(/^row-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const unescapeRenpyString = (value: string): string =>
  value.replace(/\\(["'\\])/g, (_match, character: string) => character);

const escapeRenpyString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const parseQuotedText = (line: string): string | null => {
  const match = line.match(/^"((?:\\.|[^"\\])*)"$/);
  return match ? unescapeRenpyString(match[1]) : null;
};

const parseDialogueLine = (line: string): { speaker: string; text: string } | null => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s+"((?:\\.|[^"\\])*)"$/);
  return match
    ? {
        speaker: match[1],
        text: unescapeRenpyString(match[2]),
      }
    : null;
};

const splitPrimaryAndSuffix = (value: string, suffixPattern: RegExp): { primary: string; suffix: string } => {
  const match = value.match(suffixPattern);
  if (!match || typeof match.index !== 'number') {
    return { primary: value.trim(), suffix: '' };
  }

  return {
    primary: value.slice(0, match.index).trim(),
    suffix: value.slice(match.index).trim(),
  };
};

const parseCommandLine = (line: string, id: string): ActionEditorCommandRow | null => {
  if (line.startsWith('scene ')) {
    const body = line.slice('scene '.length).trim();
    const parts = splitPrimaryAndSuffix(body, /\s+with\s+/);
    return { id, kind: 'scene', command: 'scene', primary: parts.primary, suffix: parts.suffix, source: line };
  }

  if (line.startsWith('show ')) {
    const body = line.slice('show '.length).trim();
    const parts = splitPrimaryAndSuffix(body, /\s+(?:at|with|onlayer|behind|zorder)\s+/);
    return { id, kind: 'show', command: 'show', primary: parts.primary, suffix: parts.suffix, source: line };
  }

  if (line.startsWith('hide ')) {
    const body = line.slice('hide '.length).trim();
    const parts = splitPrimaryAndSuffix(body, /\s+(?:with|onlayer)\s+/);
    return { id, kind: 'hide', command: 'hide', primary: parts.primary, suffix: parts.suffix, source: line };
  }

  if (line.startsWith('play music ')) {
    const body = line.slice('play music '.length).trim();
    const [primary = '', ...suffix] = body.split(/\s+/);
    return { id, kind: 'music', command: 'music', primary, suffix: suffix.join(' '), source: line };
  }

  if (line.startsWith('play sound ')) {
    const body = line.slice('play sound '.length).trim();
    const [primary = '', ...suffix] = body.split(/\s+/);
    return { id, kind: 'sound', command: 'sound', primary, suffix: suffix.join(' '), source: line };
  }

  if (line.startsWith('with ')) {
    return {
      id,
      kind: 'transition',
      command: 'with',
      primary: line.slice('with '.length).trim(),
      suffix: '',
      source: line,
    };
  }

  return null;
};

export const parseActionEditorContent = (content: string): ActionEditorRow[] =>
  content
    .split(/\r?\n/)
    .map((line, lineIndex): ActionEditorRow | null => {
      const trimmedLine = line.trim();
      const id = rowId(lineIndex);
      if (!trimmedLine) {
        return null;
      }

      const command = parseCommandLine(trimmedLine, id);
      if (command) {
        return command;
      }

      const narration = parseQuotedText(trimmedLine);
      if (narration !== null) {
        return {
          id,
          kind: 'narration',
          speaker: 'Narrator',
          text: narration,
          source: trimmedLine,
        };
      }

      const dialogue = parseDialogueLine(trimmedLine);
      if (dialogue) {
        return {
          id,
          kind: 'dialogue',
          speaker: dialogue.speaker,
          text: dialogue.text,
          source: trimmedLine,
        };
      }

      return {
        id,
        kind: 'rawLine',
        text: trimmedLine,
        source: trimmedLine,
      };
    })
    .filter((row): row is ActionEditorRow => row !== null);

const serializeCommandRow = (row: ActionEditorCommandRow): string => {
  if (row.source) {
    return row.source;
  }

  const parts = [row.primary.trim(), row.suffix.trim()].filter(Boolean).join(' ');
  if (row.kind === 'music') {
    return `play music ${parts}`.trimEnd();
  }
  if (row.kind === 'sound') {
    return `play sound ${parts}`.trimEnd();
  }
  return `${row.command} ${parts}`.trimEnd();
};

const serializeRow = (row: ActionEditorRow): string | null => {
  if (row.kind === 'dialogue') {
    if (!row.text.trim()) {
      return null;
    }
    return row.source ?? `${row.speaker} "${escapeRenpyString(row.text)}"`;
  }

  if (row.kind === 'narration') {
    if (!row.text.trim()) {
      return null;
    }
    return row.source ?? `"${escapeRenpyString(row.text)}"`;
  }

  if (row.kind === 'rawLine') {
    return row.source ?? row.text;
  }

  return serializeCommandRow(row);
};

export const serializeActionEditorRows = (rows: ActionEditorRow[]): string => {
  const lines: string[] = [];
  let previousLineIndex: number | null = null;

  for (const row of rows) {
    const currentLineIndex = lineIndexFromRowId(row.id);
    if (previousLineIndex !== null && currentLineIndex !== null) {
      for (let gap = previousLineIndex + 1; gap < currentLineIndex; gap += 1) {
        lines.push('');
      }
    }

    const line = serializeRow(row);
    if (line !== null) {
      lines.push(line);
      previousLineIndex = currentLineIndex ?? previousLineIndex;
    }
  }

  return lines.join('\n');
};

export const updateActionEditorRowText = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  text: string,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate) {
      return row;
    }

    if (row.kind === 'dialogue' || row.kind === 'narration') {
      return {
        ...row,
        text,
        source: undefined,
      };
    }

    if (row.kind === 'rawLine') {
      return {
        ...row,
        text,
        source: undefined,
      };
    }

    return {
      ...row,
      primary: text,
      source: undefined,
    };
  });

const pairedTextTags: Partial<Record<ActionEditorTextTag, { open: string; close: string }>> = {
  bold: { open: '{b}', close: '{/b}' },
  italic: { open: '{i}', close: '{/i}' },
  underline: { open: '{u}', close: '{/u}' },
  strikethrough: { open: '{s}', close: '{/s}' },
  color: { open: '{color=#2563eb}', close: '{/color}' },
  size: { open: '{size=+4}', close: '{/size}' },
  cps: { open: '{cps=28}', close: '{/cps}' },
};

const insertionTextTags: Partial<Record<ActionEditorTextTag, string>> = {
  wait: '{w}',
  pause: '{p}',
  noWait: '{nw}',
};

const applyTagToText = (text: string, selection: ActionEditorTextSelection, tag: ActionEditorTextTag): string => {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const pairedTag = pairedTextTags[tag];
  if (pairedTag) {
    const selectedText = text.slice(start, end);
    return `${text.slice(0, start)}${pairedTag.open}${selectedText}${pairedTag.close}${text.slice(end)}`;
  }

  const inserted = insertionTextTags[tag];
  if (inserted) {
    return `${text.slice(0, start)}${inserted}${text.slice(end)}`;
  }

  return text;
};

export const applyActionEditorTextTag = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  selection: ActionEditorTextSelection,
  tag: ActionEditorTextTag,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || (row.kind !== 'dialogue' && row.kind !== 'narration')) {
      return row;
    }

    return {
      ...row,
      text: applyTagToText(row.text, selection, tag),
      source: undefined,
    };
  });

export const detectActionEditorStructuralStatement = (statement: string): ActionEditorStructuralStatement | null => {
  const normalized = statement.trim();
  if (!normalized || normalized.startsWith('#')) {
    return null;
  }

  if (/^menu\b.*:$/.test(normalized)) {
    return { kind: 'menu', statement: normalized };
  }

  if (/^(if\s+.+|elif\s+.+|else)\s*:$/.test(normalized)) {
    return { kind: 'conditional', statement: normalized };
  }

  if (/^jump\s+\S+/.test(normalized)) {
    return { kind: 'jump', statement: normalized };
  }

  if (/^call\s+\S+/.test(normalized)) {
    return { kind: 'call', statement: normalized };
  }

  if (/^return(?:\s+.*)?$/.test(normalized)) {
    return { kind: 'return', statement: normalized };
  }

  if (/^label\s+\S+\s*:$/.test(normalized)) {
    return { kind: 'label', statement: normalized };
  }

  return null;
};

export const deriveActionEditorTitle = (metadata: Record<string, unknown>, content: string): string => {
  const title = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  if (title) {
    return title;
  }

  const defaultTitle = typeof metadata.default_title === 'string' ? metadata.default_title.trim() : '';
  if (defaultTitle) {
    return defaultTitle;
  }

  const firstMeaningfulLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstMeaningfulLine || 'Untitled scene';
};
