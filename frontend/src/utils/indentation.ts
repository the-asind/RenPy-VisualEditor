export interface IndentInfo {
  indent: string;
  stripped: boolean;
  strippedText: string;
  error?: string;
}

export function analyzeAndStripIndent(
  text: string,
  t: (key: string, options?: Record<string, any>) => string
): IndentInfo {
  const lines = text.split(/\r?\n/);
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx === -1) {
    return { indent: '', stripped: false, strippedText: text };
  }

  const first = lines[firstIdx];
  const indentMatch = first.match(/^[\t ]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  if (!indent) {
    return { indent: '', stripped: false, strippedText: text };
  }

  const baseLen = indent.length;
  for (let i = firstIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }
    const currentIndent = (line.match(/^[\t ]*/) || [''])[0];
    if (currentIndent.length < baseLen) {
      return {
        indent: '',
        stripped: false,
        strippedText: text,
        error: t('editor.indentError', { line: i + 1 }),
      };
    }
  }

  const strippedLines = lines.map((line) => (line.startsWith(indent) ? line.slice(baseLen) : line));
  return { indent, stripped: true, strippedText: strippedLines.join('\n') };
}

export function restoreIndent(text: string, indent: string): string {
  if (!indent) {
    return text;
  }
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => (line.trim().length ? indent + line : line)).join('\n');
  return out;
}
