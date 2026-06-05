export type ActionEditorRow =
  | ActionEditorDialogueRow
  | ActionEditorNarrationRow
  | ActionEditorCommandRow
  | ActionEditorRawLineRow;

export interface ActionEditorDialogueRow {
  id: string;
  kind: 'dialogue';
  speaker: string;
  imageAttributes?: string[];
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
  extraClauses?: string;
  clauses?: ActionEditorCommandClauses;
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

export type ActionEditorCommandClauseName = 'at' | 'with';
export type ActionEditorCommandClauses = Partial<Record<ActionEditorCommandClauseName, string>>;

export interface ActionEditorTextSelection {
  start: number;
  end: number;
}

export interface ActionEditorTextTagSettings {
  value?: string;
}

export type ActionEditorStructuralStatementKind = 'menu' | 'conditional' | 'jump' | 'call' | 'return' | 'label';

export interface ActionEditorStructuralStatement {
  kind: ActionEditorStructuralStatementKind;
  statement: string;
}

const speakerAccentPalette = ['#2563eb', '#db2777', '#7c3aed', '#16a34a', '#ea580c', '#0891b2', '#4f46e5', '#be123c'];

const knownSpeakerAccents = new Map<string, string>([
  ['narrator', '#64748b'],
  ['m', '#16a34a'],
  ['monika', '#16a34a'],
  ['n', '#db2777'],
  ['natsuki', '#db2777'],
  ['y', '#7c3aed'],
  ['yuri', '#7c3aed'],
  ['s', '#2563eb'],
  ['sayori', '#2563eb'],
  ['mc', '#ea580c'],
]);

export const actionEditorDraftCardKinds = [
  'dialogue',
  'scene',
  'show',
  'hide',
  'music',
  'sound',
  'transition',
] as const;

export type ActionEditorDraftCardKind = (typeof actionEditorDraftCardKinds)[number];

export const speakerAccentForId = (speakerId: string): string => {
  const normalized = speakerId.trim().toLowerCase();
  const knownAccent = knownSpeakerAccents.get(normalized);
  if (knownAccent) {
    return knownAccent;
  }

  let hash = 0;
  for (const character of normalized || 'speaker') {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return speakerAccentPalette[hash % speakerAccentPalette.length];
};

const rowId = (lineIndex: number): string => `row-${String(lineIndex).padStart(4, '0')}`;

const lineIndexFromRowId = (id: string): number | null => {
  const match = id.match(/^row-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const uniqueInsertedRowId = (rows: ActionEditorRow[], baseRowId: string): string => {
  const usedIds = new Set(rows.map((row) => row.id));
  let candidate = `${baseRowId}-split`;
  let counter = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseRowId}-split-${counter}`;
    counter += 1;
  }
  return candidate;
};

const unescapeRenpyString = (value: string): string =>
  value.replace(/\\(["'\\])/g, (_match, character: string) => character);

const escapeRenpyString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const parseQuotedText = (line: string): string | null => {
  const match = line.match(/^"((?:\\.|[^"\\])*)"$/);
  return match ? unescapeRenpyString(match[1]) : null;
};

const parseDialogueLine = (line: string): { speaker: string; imageAttributes: string[]; text: string } | null => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+([^"].*?))?\s+"((?:\\.|[^"\\])*)"$/);
  return match
    ? {
        speaker: match[1],
        imageAttributes: match[2]?.trim().split(/\s+/).filter(Boolean) ?? [],
        text: unescapeRenpyString(match[3]),
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

const suffixFromClauses = (clauses?: ActionEditorCommandClauses, extraClauses?: string): string =>
  [
    extraClauses?.trim() ?? '',
    clauses?.at?.trim() ? `at ${clauses.at.trim()}` : '',
    clauses?.with?.trim() ? `with ${clauses.with.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ');

const splitExtraImageClauses = (body: string): { primary: string; extraClauses: string } => {
  const match = body.match(/\s+(?:onlayer|behind|zorder)\s+/);
  if (!match || typeof match.index !== 'number') {
    return { primary: body.trim(), extraClauses: '' };
  }

  return {
    primary: body.slice(0, match.index).trim(),
    extraClauses: body.slice(match.index).trim(),
  };
};

const parseImageCommandClauses = (body: string, enabledClauses: ActionEditorCommandClauseName[]) => {
  const clauses: ActionEditorCommandClauses = {};
  let primary = body.trim();
  let extraClauses = '';

  if (enabledClauses.includes('with')) {
    const withMatch = primary.match(/\s+with\s+/);
    if (withMatch && typeof withMatch.index === 'number') {
      clauses.with = primary.slice(withMatch.index + withMatch[0].length).trim();
      primary = primary.slice(0, withMatch.index).trim();
    }
  }

  if (enabledClauses.includes('at')) {
    const atMatch = primary.match(/\s+at\s+/);
    if (atMatch && typeof atMatch.index === 'number') {
      clauses.at = primary.slice(atMatch.index + atMatch[0].length).trim();
      primary = primary.slice(0, atMatch.index).trim();
    }
  }

  const extraSplit = splitExtraImageClauses(primary);
  primary = extraSplit.primary;
  extraClauses = extraSplit.extraClauses;

  const cleanClauses = Object.fromEntries(
    Object.entries(clauses).filter(([, value]) => value.trim()),
  ) as ActionEditorCommandClauses;

  return {
    clauses: cleanClauses,
    extraClauses,
    primary,
    suffix: suffixFromClauses(cleanClauses, extraClauses),
  };
};

const parseCommandLine = (line: string, id: string): ActionEditorCommandRow | null => {
  if (line.startsWith('scene ')) {
    const body = line.slice('scene '.length).trim();
    const parts = parseImageCommandClauses(body, ['with']);
    return { id, kind: 'scene', command: 'scene', primary: parts.primary, suffix: parts.suffix, ...(parts.extraClauses ? { extraClauses: parts.extraClauses } : {}), clauses: parts.clauses, source: line };
  }

  if (line.startsWith('show ')) {
    const body = line.slice('show '.length).trim();
    const parts = parseImageCommandClauses(body, ['at', 'with']);
    return { id, kind: 'show', command: 'show', primary: parts.primary, suffix: parts.suffix, ...(parts.extraClauses ? { extraClauses: parts.extraClauses } : {}), clauses: parts.clauses, source: line };
  }

  if (line.startsWith('hide ')) {
    const body = line.slice('hide '.length).trim();
    const parts = parseImageCommandClauses(body, ['with']);
    return { id, kind: 'hide', command: 'hide', primary: parts.primary, suffix: parts.suffix, ...(parts.extraClauses ? { extraClauses: parts.extraClauses } : {}), clauses: parts.clauses, source: line };
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
          ...(dialogue.imageAttributes.length ? { imageAttributes: dialogue.imageAttributes } : {}),
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

  const clauseSuffix = row.clauses ? suffixFromClauses(row.clauses, row.extraClauses) : row.suffix.trim();
  const parts = [row.primary.trim(), clauseSuffix].filter(Boolean).join(' ');
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
    const imageAttributes = row.imageAttributes?.filter(Boolean).join(' ') ?? '';
    const speakerAndAttributes = [row.speaker, imageAttributes].filter(Boolean).join(' ');
    return row.source ?? `${speakerAndAttributes} "${escapeRenpyString(row.text)}"`;
  }

  if (row.kind === 'narration') {
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

export const updateActionEditorCommandPrimary = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  primary: string,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || row.kind === 'dialogue' || row.kind === 'narration' || row.kind === 'rawLine') {
      return row;
    }

    const clauses = row.clauses ? { ...row.clauses } : undefined;
    return {
      ...row,
      primary,
      suffix: suffixFromClauses(clauses, row.extraClauses) || row.suffix,
      source: undefined,
    };
  });

export const updateActionEditorCommandClause = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  clauseName: ActionEditorCommandClauseName,
  value: string,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || row.kind === 'dialogue' || row.kind === 'narration' || row.kind === 'rawLine') {
      return row;
    }

    const clauses = {
      ...(row.clauses ?? {}),
      [clauseName]: value.trim(),
    };
    if (!clauses[clauseName]) {
      delete clauses[clauseName];
    }

    return {
      ...row,
      clauses,
      suffix: suffixFromClauses(clauses, row.extraClauses),
      source: undefined,
    };
  });

export const updateActionEditorCommandExtraClauses = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  extraClauses: string,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || row.kind === 'dialogue' || row.kind === 'narration' || row.kind === 'rawLine') {
      return row;
    }

    const trimmedExtraClauses = extraClauses.trim();
    return {
      ...row,
      ...(trimmedExtraClauses ? { extraClauses: trimmedExtraClauses } : { extraClauses: undefined }),
      suffix: suffixFromClauses(row.clauses, trimmedExtraClauses),
      source: undefined,
    };
  });

export const updateActionEditorCommandSuffix = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  suffix: string,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || row.kind === 'dialogue' || row.kind === 'narration' || row.kind === 'rawLine') {
      return row;
    }

    return {
      ...row,
      suffix: suffix.trim(),
      source: undefined,
    };
  });

export const deriveActionEditorSpeakerPool = (rows: ActionEditorRow[]): string[] => {
  const speakers: string[] = [];
  for (const row of rows) {
    if (row.kind !== 'dialogue' && row.kind !== 'narration') {
      continue;
    }
    const speaker = row.kind === 'narration' ? 'Narrator' : row.speaker;
    if (!speakers.includes(speaker)) {
      speakers.push(speaker);
    }
  }

  return speakers.length ? speakers : ['Narrator'];
};

export const splitActionEditorTextRow = (
  rows: ActionEditorRow[],
  rowIdToSplit: string,
  selection: ActionEditorTextSelection,
): ActionEditorRow[] => {
  const targetIndex = rows.findIndex((row) => row.id === rowIdToSplit);
  const targetRow = rows[targetIndex];
  if (targetIndex === -1 || !targetRow || (targetRow.kind !== 'dialogue' && targetRow.kind !== 'narration')) {
    return rows;
  }

  const splitStart = Math.max(0, Math.min(selection.start, targetRow.text.length));
  const splitEnd = Math.max(splitStart, Math.min(selection.end, targetRow.text.length));
  const before = targetRow.text.slice(0, splitStart);
  const after = targetRow.text.slice(splitEnd);
  const nextExistingRow = rows[targetIndex + 1];
  const targetSpeaker = targetRow.kind === 'narration' ? 'Narrator' : targetRow.speaker;
  const nextSpeaker =
    nextExistingRow?.kind === 'narration' ? 'Narrator' : nextExistingRow?.kind === 'dialogue' ? nextExistingRow.speaker : null;
  if (!after && nextExistingRow && (nextExistingRow.kind === 'dialogue' || nextExistingRow.kind === 'narration')) {
    if (!nextExistingRow.text.trim() && nextSpeaker === targetSpeaker) {
      return rows;
    }
  }

  const nextRow =
    targetRow.kind === 'dialogue'
      ? {
          id: uniqueInsertedRowId(rows, targetRow.id),
          kind: 'dialogue' as const,
          speaker: targetRow.speaker,
          ...(targetRow.imageAttributes?.length ? { imageAttributes: [...targetRow.imageAttributes] } : {}),
          text: after,
        }
      : {
          id: uniqueInsertedRowId(rows, targetRow.id),
          kind: 'narration' as const,
          speaker: 'Narrator' as const,
          text: after,
        };

  return [
    ...rows.slice(0, targetIndex),
    {
      ...targetRow,
      text: before,
      source: undefined,
    },
    nextRow,
    ...rows.slice(targetIndex + 1),
  ];
};

export const changeActionEditorEmptyRowSpeaker = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  direction: -1 | 1,
  speakerPool: string[],
): ActionEditorRow[] => {
  const normalizedPool = speakerPool.length ? speakerPool : deriveActionEditorSpeakerPool(rows);

  return rows.map((row) => {
    if (row.id !== rowIdToUpdate || (row.kind !== 'dialogue' && row.kind !== 'narration') || row.text.trim()) {
      return row;
    }

    const currentSpeaker = row.kind === 'narration' ? 'Narrator' : row.speaker;
    const currentIndex = Math.max(0, normalizedPool.indexOf(currentSpeaker));
    const nextSpeaker = normalizedPool[(currentIndex + direction + normalizedPool.length) % normalizedPool.length];

    if (nextSpeaker === 'Narrator') {
      return {
        id: row.id,
        kind: 'narration',
        speaker: 'Narrator',
        text: '',
      };
    }

    return {
      id: row.id,
      kind: 'dialogue',
      speaker: nextSpeaker,
      text: '',
    };
  });
};

const firstConcreteSpeaker = (rows: ActionEditorRow[]): string => {
  const dialogue = rows.find((row): row is ActionEditorDialogueRow => row.kind === 'dialogue');
  return dialogue?.speaker ?? 'm';
};

const draftCommandForKind = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  kind: Exclude<ActionEditorDraftCardKind, 'dialogue'>,
): ActionEditorCommandRow => {
  const speaker = firstConcreteSpeaker(rows);
  if (kind === 'scene') {
    return { id: rowIdToUpdate, kind, command: 'scene', primary: 'black', suffix: '' };
  }
  if (kind === 'show') {
    return { id: rowIdToUpdate, kind, command: 'show', primary: speaker, suffix: '' };
  }
  if (kind === 'hide') {
    return { id: rowIdToUpdate, kind, command: 'hide', primary: speaker, suffix: '' };
  }
  if (kind === 'music') {
    return { id: rowIdToUpdate, kind, command: 'music', primary: 'none', suffix: '' };
  }
  if (kind === 'sound') {
    return { id: rowIdToUpdate, kind, command: 'sound', primary: 'none', suffix: '' };
  }
  return { id: rowIdToUpdate, kind, command: 'with', primary: 'dissolve', suffix: '' };
};

export const commitActionEditorEmptyRowDraft = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  draftKind: ActionEditorDraftCardKind,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || (row.kind !== 'dialogue' && row.kind !== 'narration') || row.text.trim()) {
      return row;
    }

    if (draftKind === 'dialogue') {
      return row;
    }

    return draftCommandForKind(rows, rowIdToUpdate, draftKind);
  });

export const updateActionEditorDialogueImageAttributes = (
  rows: ActionEditorRow[],
  rowIdToUpdate: string,
  imageAttributes: string[],
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || row.kind !== 'dialogue') {
      return row;
    }

    return {
      ...row,
      imageAttributes: imageAttributes.map((attribute) => attribute.trim()).filter(Boolean),
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

const parameterizedTextTag = (
  tag: ActionEditorTextTag,
  settings?: ActionEditorTextTagSettings,
): { open: string; close: string } | null => {
  if (!settings?.value?.trim()) {
    return null;
  }

  const value = settings.value.trim();
  if (tag === 'color') {
    return { open: `{color=${value}}`, close: '{/color}' };
  }
  if (tag === 'size') {
    return { open: `{size=${value}}`, close: '{/size}' };
  }
  if (tag === 'cps') {
    return { open: `{cps=${value}}`, close: '{/cps}' };
  }

  return null;
};

const insertionTextTags: Partial<Record<ActionEditorTextTag, string>> = {
  wait: '{w}',
  pause: '{p}',
  noWait: '{nw}',
};

const applyTagToText = (
  text: string,
  selection: ActionEditorTextSelection,
  tag: ActionEditorTextTag,
  settings?: ActionEditorTextTagSettings,
): string => {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const pairedTag = parameterizedTextTag(tag, settings) ?? pairedTextTags[tag];
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
  settings?: ActionEditorTextTagSettings,
): ActionEditorRow[] =>
  rows.map((row) => {
    if (row.id !== rowIdToUpdate || (row.kind !== 'dialogue' && row.kind !== 'narration')) {
      return row;
    }

    return {
      ...row,
      text: applyTagToText(row.text, selection, tag, settings),
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
