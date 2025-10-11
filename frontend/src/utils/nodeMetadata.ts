import type { ParsedNodeData } from './parsedNodeTypes';

export type NodeStatus = 'Done' | 'In progress' | 'To Do';

export interface NodeMetadata {
  name?: string;
  status?: NodeStatus;
  author?: string;
  accentColor?: string;
  commentLineIndex?: number;
  tag?: string;
  tagColor?: string;
}

export interface NodeDisplayInfo {
  title: string;
  summary: string;
  status?: NodeStatus;
  author?: string;
  tag?: string;
  tagColor?: string;
}

export const NODE_METADATA_PREFIX = '# @NODE';

const STATUS_VALUES: NodeStatus[] = ['Done', 'In progress', 'To Do'];
export const NODE_STATUS_VALUES = [...STATUS_VALUES];
export const NODE_STATUS_TRANSLATION_KEYS: Record<NodeStatus, string> = {
  Done: 'editor.nodeStatus.done',
  'In progress': 'editor.nodeStatus.inProgress',
  'To Do': 'editor.nodeStatus.toDo',
};

const metadataKeyRegex = /(\w+)=((?:"[^"\\]*(?:\\.[^"\\]*)*"?)|(?:'[^'\\]*(?:\\.[^'\\]*)*'?)|[^\s]+)/g;

const isDialogLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const quoteIndex = trimmed.indexOf('"');
  if (quoteIndex === -1 || !trimmed.endsWith('"')) {
    return false;
  }

  if (trimmed.startsWith('"')) {
    return true;
  }

  const beforeQuote = trimmed.slice(0, quoteIndex).trim();
  return /[A-Za-z_][A-Za-z0-9_]*$/.test(beforeQuote);
};

const removeBracketedContent = (text: string): string => {
  let result = '';
  let bracketLevel = 0;

  for (const char of text) {
    if (char === '{') {
      bracketLevel += 1;
    } else if (char === '}') {
      bracketLevel = Math.max(0, bracketLevel - 1);
    } else if (bracketLevel === 0) {
      result += char;
    }
  }

  return result;
};

const isStatementLine = (line: string): boolean => {
  const trimmed = line.trimLeft();
  return (
    (trimmed.startsWith('if ') || trimmed.startsWith('elif ') || trimmed.startsWith('menu')) &&
    trimmed.endsWith(':')
  );
};

const normalizeValue = (raw: string): string => {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\"/g, '"');
};

export const parseMetadataComment = (line: string): NodeMetadata => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(NODE_METADATA_PREFIX)) {
    return {};
  }

  const metadata: NodeMetadata = {};
  const remainder = trimmed.slice(NODE_METADATA_PREFIX.length).trim();

  for (const match of remainder.matchAll(metadataKeyRegex)) {
    const key = match[1].toLowerCase();
    const rawValue = match[2];
    const value = normalizeValue(rawValue);

    if (key === 'name') {
      metadata.name = value;
    } else if (key === 'status') {
      const statusCandidate = STATUS_VALUES.find((status) => status.toLowerCase() === value.toLowerCase());
      if (statusCandidate) {
        metadata.status = statusCandidate;
      }
    } else if (key === 'author') {
      metadata.author = value;
    } else if (key === 'color' || key === 'accent') {
      metadata.accentColor = value;
    } else if (key === 'tag') {
      metadata.tag = value;
    } else if (key === 'tagcolor' || key === 'tag_color') {
      metadata.tagColor = value;
    }
  }

  return metadata;
};

export const extractNodeMetadata = (
  scriptLines: string[],
  node: ParsedNodeData
): NodeMetadata => {
  const metadata: NodeMetadata = {};

  const start = typeof node.start_line === 'number' ? node.start_line : null;
  const end = typeof node.end_line === 'number' ? node.end_line : null;

  if (
    start === null ||
    end === null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end >= scriptLines.length ||
    start > end
  ) {
    return metadata;
  }

  for (let index = start; index <= end; index += 1) {
    const rawLine = scriptLines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith(NODE_METADATA_PREFIX)) {
      const parsed = parseMetadataComment(trimmed);
      metadata.name = parsed.name;
      metadata.status = parsed.status;
      metadata.author = parsed.author;
      metadata.commentLineIndex = index;
      metadata.accentColor = parsed.accentColor;
      metadata.tag = parsed.tag;
      metadata.tagColor = parsed.tagColor;
      break;
    }

    // Stop scanning after the first non-empty, non-metadata line
    break;
  }

  return metadata;
};

const clampRange = (scriptLines: string[], start?: number, end?: number): [number, number] | null => {
  if (!Array.isArray(scriptLines) || scriptLines.length === 0) {
    return null;
  }

  if (typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  const clampedStart = Math.max(0, Math.min(scriptLines.length - 1, start));
  const clampedEnd = Math.max(clampedStart, Math.min(scriptLines.length - 1, end));
  return [clampedStart, clampedEnd];
};

export const computeNodeSummary = (
  scriptLines: string[],
  node: ParsedNodeData
): string => {
  const range = clampRange(scriptLines, node.start_line, node.end_line);
  if (!range) {
    return '';
  }

  const [start, end] = range;
  const collectedLines = scriptLines.slice(start, end + 1);
  if (collectedLines.length === 0) {
    return '';
  }

  const firstLine = collectedLines[0];
  if (isStatementLine(firstLine)) {
    return firstLine.trim().replace(/:$/, '');
  }

  const sanitizedLines: string[] = [];

  collectedLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith(NODE_METADATA_PREFIX)) {
      return;
    }

    if (trimmed.startsWith('#')) {
      return;
    }

    sanitizedLines.push(trimmed);
  });

  if (sanitizedLines.length === 0) {
    sanitizedLines.push(
      ...collectedLines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    );
  }

  if (sanitizedLines.length === 0) {
    return '';
  }

  if (sanitizedLines.length <= 4) {
    return sanitizedLines.join('\n');
  }

  const firstDialogLines: string[] = [];
  const lastDialogLines: string[] = [];

  for (const line of sanitizedLines) {
    if (isDialogLine(line)) {
      firstDialogLines.push(line);
      if (firstDialogLines.length >= 2) {
        break;
      }
    }
  }

  for (let index = sanitizedLines.length - 1; index >= 0; index -= 1) {
    const line = sanitizedLines[index];
    if (isDialogLine(line)) {
      lastDialogLines.unshift(line);
      if (lastDialogLines.length >= 2) {
        break;
      }
    }
  }

  const labelParts: string[] = [];

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
  }

  if (labelParts.length === 0) {
    const head = sanitizedLines.slice(0, 3);
    const tail = sanitizedLines.slice(-3);

    labelParts.push(...head);
    if (sanitizedLines.length > head.length) {
      if (sanitizedLines.length > head.length + tail.length) {
        labelParts.push('<...>');
      }
      labelParts.push(...tail);
    }
  }

  let summary = labelParts.join('\n');

  if (node.node_type !== 'IfBlock' && node.node_type !== 'MenuOption') {
    summary = removeBracketedContent(summary);
  }

  if (summary.length < 20) {
    const fallbackLines = sanitizedLines.slice(0, Math.min(6, sanitizedLines.length));
    if (fallbackLines.length > 0) {
      summary = fallbackLines.join('\n');
    }
  }

  if (summary.length > 100) {
    summary = `${summary.slice(0, 97)}...`;
  }

  return summary;
};

const escapeValue = (value: string): string => value.replace(/"/g, '\\"');

export const formatMetadataComment = (metadata: NodeMetadata): string | null => {
  const parts: string[] = [];

  if (metadata.name && metadata.name.trim()) {
    parts.push(`name="${escapeValue(metadata.name.trim())}"`);
  }

  if (metadata.status) {
    parts.push(`status="${metadata.status}"`);
  }

  if (metadata.author && metadata.author.trim()) {
    parts.push(`author="${escapeValue(metadata.author.trim())}"`);
  }

  if (metadata.accentColor && metadata.accentColor.trim()) {
    parts.push(`color="${escapeValue(metadata.accentColor.trim())}"`);
  }

  if (metadata.tag && metadata.tag.trim()) {
    parts.push(`tag="${escapeValue(metadata.tag.trim())}"`);
  }

  if (metadata.tagColor && metadata.tagColor.trim()) {
    parts.push(`tagColor="${escapeValue(metadata.tagColor.trim())}"`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `${NODE_METADATA_PREFIX} ${parts.join(' ')}`;
};

export const buildNodeDisplayInfo = (
  scriptLines: string[],
  node: ParsedNodeData
): NodeDisplayInfo => {
  const metadata = extractNodeMetadata(scriptLines, node);
  const summary = computeNodeSummary(scriptLines, node);
  const title = metadata.name && metadata.name.trim().length > 0
    ? metadata.name.trim()
    : summary.split('\n')[0] || node.label_name || '';

  return {
    title,
    summary,
    status: metadata.status,
    author: metadata.author,
    tag: metadata.tag,
    tagColor: metadata.tagColor,
  };
};
