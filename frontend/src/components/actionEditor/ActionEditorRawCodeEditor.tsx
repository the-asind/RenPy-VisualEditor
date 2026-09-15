import CodeMirror from '@uiw/react-codemirror';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { useTranslation } from 'react-i18next';

export interface ActionEditorRawCodeEditorProps {
  onChange: (content: string) => void;
  value: string;
}

const rawEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '0',
  },
  '.cm-scroller': {
    fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
    fontSize: '14px',
    height: '100%',
    lineHeight: '1.6',
    minHeight: '0',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: '#2563eb',
    minHeight: 'auto',
    padding: '18px',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    borderRight: '1px solid rgba(15, 23, 42, 0.08)',
    color: '#94a3b8',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    color: '#2563eb',
  },
  '.rpy-token--keyword': {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  '.rpy-token--audio': {
    color: '#7c3aed',
    fontWeight: '750',
  },
  '.rpy-token--speaker': {
    color: '#0f766e',
    fontWeight: '750',
  },
  '.rpy-token--string': {
    color: '#047857',
  },
  '.rpy-token--comment': {
    color: '#64748b',
    fontStyle: 'italic',
  },
  '.rpy-token--number': {
    color: '#c2410c',
    fontWeight: '700',
  },
});

const keywordPattern = /\b(label|menu|jump|call|return|scene|show|hide|with|if|elif|else|image|define|default|transform|screen|python|init)\b/g;
const audioPattern = /\b(play|music|sound|voice|at|as|onlayer|zorder|behind|fadein|fadeout|loop|noloop|volume|pause)\b/g;
const speakerPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?=\s+(?:[@A-Za-z0-9_]+\s+)*["'])/g;
const stringPattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const numberPattern = /\b\d+(?:\.\d+)?\b/g;

const tokenDecoration = (token: 'audio' | 'comment' | 'keyword' | 'number' | 'speaker' | 'string') =>
  Decoration.mark({ class: `rpy-token rpy-token--${token}` });

const addPatternDecorations = (
  ranges: Array<{ from: number; to: number; decoration: Decoration }>,
  lineFrom: number,
  text: string,
  pattern: RegExp,
  decoration: Decoration,
  occupiedRanges: Array<{ from: number; to: number }>,
) => {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    if (start === end || occupiedRanges.some((range) => start < range.to && end > range.from)) {
      continue;
    }
    ranges.push({ from: start, to: end, decoration });
    occupiedRanges.push({ from: start, to: end });
  }
};

const buildRenpyDecorations = (view: EditorView): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      const text = line.text;
      const occupiedRanges: Array<{ from: number; to: number }> = [];
      const commentIndex = text.indexOf('#');
      if (commentIndex !== -1) {
        const from = line.from + commentIndex;
        const to = line.to;
        ranges.push({ from, to, decoration: tokenDecoration('comment') });
        occupiedRanges.push({ from, to });
      }
      addPatternDecorations(ranges, line.from, text, stringPattern, tokenDecoration('string'), occupiedRanges);
      addPatternDecorations(ranges, line.from, text, speakerPattern, tokenDecoration('speaker'), occupiedRanges);
      addPatternDecorations(ranges, line.from, text, keywordPattern, tokenDecoration('keyword'), occupiedRanges);
      addPatternDecorations(ranges, line.from, text, audioPattern, tokenDecoration('audio'), occupiedRanges);
      addPatternDecorations(ranges, line.from, text, numberPattern, tokenDecoration('number'), occupiedRanges);
      if (line.to >= range.to) {
        break;
      }
      position = line.to + 1;
    }
  }
  ranges
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .forEach((range) => builder.add(range.from, range.to, range.decoration));
  return builder.finish();
};

const renpyDecorationHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildRenpyDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildRenpyDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

export const renpyCodeMirrorExtensions = [
  renpyDecorationHighlighter,
  rawEditorTheme,
  EditorView.lineWrapping,
];

export const ActionEditorRawCodeEditor = ({ onChange, value }: ActionEditorRawCodeEditorProps) => {
  const { t } = useTranslation();
  const rawContentLabel = t('actionEditor.rawContent');
  return (
  <div
    aria-label={rawContentLabel}
    autoCapitalize="off"
    autoComplete="off"
    autoCorrect="off"
    className="action-editor__raw-codemirror"
    data-raw-renpy-content={value}
    spellCheck={false}
  >
    {typeof document === 'undefined' ? (
      <pre className="action-editor__raw-codemirror-ssr">{value}</pre>
    ) : (
      <CodeMirror
        basicSetup={{
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: false,
          foldGutter: false,
          highlightActiveLine: true,
          lineNumbers: true,
        }}
        extensions={[
          ...renpyCodeMirrorExtensions,
          EditorView.contentAttributes.of({
            'aria-label': rawContentLabel,
            autocapitalize: 'off',
            autocomplete: 'off',
            autocorrect: 'off',
            spellcheck: 'false',
          }),
        ]}
        height="100%"
        onChange={onChange}
        value={value}
      />
    )}
  </div>
  );
};

export default ActionEditorRawCodeEditor;
