import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Stack, IconButton, Button, TextField,
  Select, MenuItem, Typography, GlobalStyles, useTheme, Alert, Chip, ButtonBase, Tooltip
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SelectChangeEvent } from '@mui/material/Select';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import Editor, { OnMount } from '@monaco-editor/react';
import type { Node } from 'reactflow';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  formatMetadataComment,
  NODE_METADATA_PREFIX,
  NODE_STATUS_VALUES,
  NODE_STATUS_TRANSLATION_KEYS,
  parseMetadataComment,
  type NodeStatus,
  type NodeMetadata,
} from '../utils/nodeMetadata';

// ---------- Props ----------
interface NodeEditorPopupProps {
  open: boolean;
  onClose: () => void;
  nodeData: Node | null;
  initialContent: string;
  scriptId: string;
  onSave: (startLine: number, endLine: number, newContent: string) => Promise<void> | void;
  onSwitchToGlobal: () => void;
  isLoading?: boolean;
}

// ---------- Ren'Py dialogue helpers ----------
interface DialogueItem { name: string; text: string; startLine: number; endLine: number; }

// Parse Ren'Py dialogues (supports extend, escaped quotes, skips if/elif/else)
function parseDialoguesWithMap(text: string): DialogueItem[] {
  const lines = text.split(/\r?\n/);
  const result: DialogueItem[] = [];
  let last: DialogueItem | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^if\b|^elif\b|^else\b/.test(trimmed)) continue;

    // extend "..."
    let m = raw.match(/^\s*extend\s+\"((?:[^"\\]|\\.)*)\"/);
    if (m) {
      const piece = m[1].replace(/\\(["\\])/g, '$1');
      if (last) { last.text += piece; last.endLine = i + 1; }
      else { last = { name: '', text: piece, startLine: i + 1, endLine: i + 1 }; result.push(last); }
      continue;
    }
    // Name "text"
    m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+\"((?:[^"\\]|\\.)*)\"/);
    if (m) {
      last = { name: m[1], text: m[2].replace(/\\(["\\])/g, '$1'), startLine: i + 1, endLine: i + 1 };
      result.push(last); continue;
    }
    // "text"
    m = raw.match(/^\s*\"((?:[^"\\]|\\.)*)\"/);
    if (m) {
      last = { name: '', text: m[1].replace(/\\(["\\])/g, '$1'), startLine: i + 1, endLine: i + 1 };
      result.push(last); continue;
    }
  }
  return result;
}

// Render safe subset of Ren'Py text tags -> HTML
function renderTextTags(src: string): string {
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sanitizeColor = (v: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null);
  let out = ''; let i = 0; const stack: string[] = [];
  const open = (style: string) => { out += `<span style="${style}">`; stack.push('</span>'); };
  const close = () => { if (stack.length) out += stack.pop(); };
  while (i < src.length) {
    const m = src.slice(i).match(/^\{\/?(b|i|u|color|size|alpha)(?:=([^}]+))?\}/);
    if (m) {
      const full = m[0], tag = m[1], val = (m[2] || '').trim();
      i += full.length;
      const closing = /^\{\//.test(full);
      if (closing) { close(); continue; }
      if (tag === 'b') open('font-weight:700');
      else if (tag === 'i') open('font-style:italic');
      else if (tag === 'u') open('text-decoration:underline');
      else if (tag === 'color') { const c = sanitizeColor(val); if (c) open(`color:${c}`); }
      else if (tag === 'size') {
        let sz: string | null = null;
        if (/^[+\-]?\d+$/.test(val)) { const n = parseInt(val, 10); sz = val.startsWith('+') || val.startsWith('-') ? `calc(1em + ${n}px)` : `${n}px`; }
        if (sz) open(`font-size:${sz}`);
      } else if (tag === 'alpha') { if (/^0(\.\d+)?|1(\.0+)?$/.test(val)) open(`opacity:${val}`); }
      continue;
    }
    out += escapeHtml(src[i++]);
  }
  while (stack.length) out += stack.pop();
  return out;
}

// Bubble color: light/dark aware
function bubbleColor(name: string, dark: boolean) {
  if (!name) return dark ? '#1a1d24' : '#f3f4f6';
  let h = 0; for (const ch of name) h = ch.charCodeAt(0) + ((h << 5) - h);
  return dark ? `hsl(${h % 360}, 32%, 22%)` : `hsl(${h % 360}, 70%, 95%)`;
}

const ACTION_NODE_COLORS = [
  '#5E60CE',
  '#48BFE3',
  '#56CFE1',
  '#80FF72',
  '#FFD166',
  '#FF6B6B',
  '#FF9F9C',
  '#C77DFF',
];

// ---------- Indentation helpers (strip + restore) ----------
interface IndentInfo { indent: string; stripped: boolean; error?: string }
function analyzeAndStripIndent(text: string, t: (key: string, options?: any) => string): IndentInfo & { strippedText: string } {
  const lines = text.split(/\r?\n/);
  const firstIdx = lines.findIndex(l => l.trim().length > 0);
  if (firstIdx === -1) return { indent: '', stripped: false, strippedText: text };
  const first = lines[firstIdx];
  const indentMatch = first.match(/^[\t ]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  if (!indent) return { indent: '', stripped: false, strippedText: text };

  // Validate: any non-empty line with smaller indent -> error
  const baseLen = indent.length;
  for (let i = firstIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const cur = (l.match(/^[\t ]*/) || [''])[0];
    if (cur.length < baseLen) {
      return {
        indent: '',
        stripped: false,
        strippedText: text,
        error: t('editor.indentError', { line: i + 1 })
      };
    }
  }

  // Safe: strip same indent from lines that have it
  const strippedLines = lines.map(l => l.startsWith(indent) ? l.slice(baseLen) : l);
  return { indent, stripped: true, strippedText: strippedLines.join('\n') };
}

function restoreIndent(text: string, indent: string): string {
  if (!indent) return text;
  const lines = text.split(/\r?\n/);
  // Добавляем одинаковый отступ в каждую НЕ пустую строку
  const out = lines.map(l => (l.trim().length ? indent + l : l)).join('\n');
  return out;
}

const stripMetadataComment = (content: string): string => {
  const lines = content.split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex(line => line.trim().length > 0);
  if (firstNonEmptyIndex === -1) {
    return content;
  }

  const candidate = lines[firstNonEmptyIndex].trim();
  if (!candidate.startsWith(NODE_METADATA_PREFIX)) {
    return content;
  }

  const updatedLines = [...lines];
  updatedLines.splice(firstNonEmptyIndex, 1);

  // Remove leading empty lines that might be left behind to avoid blank gap
  while (updatedLines.length && updatedLines[0].trim().length === 0) {
    updatedLines.shift();
  }

  return updatedLines.join('\n');
};

const extractMetadataFromContent = (content: string): NodeMetadata => {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith(NODE_METADATA_PREFIX)) {
      return parseMetadataComment(trimmed);
    }
    break;
  }
  return {};
};

const CONTROL_HEIGHT = 36; // px

const NodeEditorPopup: React.FC<NodeEditorPopupProps> = ({
  open, onClose, nodeData, initialContent, scriptId, onSave, onSwitchToGlobal, isLoading
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUsername = user?.username?.trim() ?? '';
  const isActionNode = (nodeData as any)?.data?.originalData?.node_type === 'Action';
  const statusOptions = NODE_STATUS_VALUES;
  const statusLabelMap = useMemo(() => {
    const entries = statusOptions.map((status) => [
      status,
      t(NODE_STATUS_TRANSLATION_KEYS[status], status),
    ] as const);
    return Object.fromEntries(entries) as Record<NodeStatus, string>;
  }, [statusOptions, t]);

  const [nodeName, setNodeName] = useState<string>('');
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | ''>('');
  const [nodeAuthor, setNodeAuthor] = useState<string>('');
  const [nodeColor, setNodeColor] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const nameBeforeEditRef = useRef<string>('');

  // ----- indentation memory -----
  const indentRef = useRef<IndentInfo>({ indent: '', stripped: false });
  const [indentError, setIndentError] = useState<string | null>(null);

  const [value, setValue] = useState<string>('');
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const [dialogs, setDialogs] = useState<DialogueItem[]>([]);
  const [activeMsgIdx, setActiveMsgIdx] = useState<number | null>(null);
  const [activeSepIdx, setActiveSepIdx] = useState<number | null>(null); // 0..n

  const startLine = (nodeData as any)?.data?.originalData?.start_line ?? 1;
  const endLine = (nodeData as any)?.data?.originalData?.end_line ?? 1;

  // Split state (left %)
  const [split, setSplit] = useState<number>(() => {
    const saved = localStorage.getItem('renpy_node_editor_split');
    const n = saved ? Number(saved) : 60;
    return Number.isFinite(n) ? Math.min(80, Math.max(20, n)) : 60;
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Prepare content on open: analyze indent and strip
  useEffect(() => {
    if (!open) return;
    const rawContent = initialContent || '';
    const contentForEditor = isActionNode ? stripMetadataComment(rawContent) : rawContent;
    const a = analyzeAndStripIndent(contentForEditor, t);
    indentRef.current = a;
    setIndentError(a.error ?? null);
    setValue(a.strippedText);
  }, [initialContent, open, t, isActionNode]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!isActionNode) {
      setNodeName('');
      setNodeStatus('');
      setNodeAuthor('');
      setNodeColor('');
      setIsEditingName(false);
      return;
    }

    const metadata = extractMetadataFromContent(initialContent || '');
    setNodeName(metadata.name ?? '');
    setNodeStatus(metadata.status ?? '');
    setNodeAuthor(metadata.author ?? '');
    setNodeColor(metadata.accentColor ?? '');
    setIsEditingName(false);
  }, [initialContent, isActionNode, open]);

  const handleStartEditingName = useCallback(() => {
    if (!isActionNode) {
      return;
    }
    nameBeforeEditRef.current = nodeName;
    setIsEditingName(true);
  }, [isActionNode, nodeName]);

  const handleNameKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setIsEditingName(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setNodeName(nameBeforeEditRef.current);
      setIsEditingName(false);
    }
  }, []);

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
  }, []);

  const handleStatusChange = useCallback((event: SelectChangeEvent<string>) => {
    const value = event.target.value || '';
    setNodeStatus(value as NodeStatus | '');
  }, []);

  // Re-parse & decorate
  const applyDecorations = useCallback(() => {
    const ed = editorRef.current; const mon = monacoRef.current; if (!ed || !mon) return;
    const model = ed.getModel(); if (!model) return;
    const lines = model.getLinesContent();
    const newDecos = [] as any[];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*\".*\"/.test(line) || /^\s*[A-Za-z_][A-Za-z0-9_]*\s+\".*\"/.test(line) || /^\s*extend\s+\".*\"/.test(line)) {
        newDecos.push({
          range: new mon.Range(i + 1, 1, i + 1, line.length + 1),
          options: { isWholeLine: true, className: 'renpy-dialogue-line', glyphMarginClassName: 'renpy-glyph' }
        });
      }
    }
    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, newDecos);
  }, []);

  const setActiveFromEditor = useCallback(() => {
    const ed = editorRef.current; if (!ed) return;
    const pos = ed.getPosition();
    const line = pos?.lineNumber ?? 1;
    const ds = parseDialoguesWithMap(value);
    const found = ds.findIndex(d => line >= d.startLine && line <= d.endLine);
    if (found >= 0) { setActiveMsgIdx(found); setActiveSepIdx(null); }
    else {
      let idx = ds.findIndex(d => line <= d.startLine - 1);
      if (idx === -1) idx = ds.length;
      setActiveMsgIdx(null); setActiveSepIdx(idx);
    }
  }, [value]);

  const fullRefresh = useCallback(() => {
    const ds = parseDialoguesWithMap(value);
    setDialogs(ds);
    applyDecorations();
    setActiveFromEditor();
  }, [value, applyDecorations, setActiveFromEditor]);

  useEffect(() => { fullRefresh(); }, [fullRefresh]);

  const setActiveFromChat = useCallback((type: 'dialog' | 'sep', index: number, moveCaret: boolean) => {
    const ed = editorRef.current; const mon = monacoRef.current; if (!ed || !mon) return;
    const model = ed.getModel(); if (!model) return;
    const ds = parseDialoguesWithMap(value);
    if (type === 'dialog') {
      setActiveMsgIdx(index); setActiveSepIdx(null);
      if (moveCaret) {
        const d = ds[index]; const col = model.getLineMaxColumn(d.endLine);
        ed.setPosition({ lineNumber: d.endLine, column: col }); ed.focus();
      }
    } else {
      setActiveMsgIdx(null); setActiveSepIdx(index);
      if (moveCaret) {
        let target: number;
        if (index <= 0) target = ds.length ? ds[0].startLine : model.getLineCount();
        else if (index >= ds.length) target = model.getLineCount();
        else target = ds[index].startLine;
        const col = model.getLineFirstNonWhitespaceColumn(target) || 1;
        ed.setPosition({ lineNumber: target, column: col }); ed.focus();
      }
    }
  }, [value]);

  // Editor mount: language + themes
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor; monacoRef.current = monaco;

    monaco.languages.register({ id: 'renpy' });
    monaco.languages.setMonarchTokensProvider('renpy', {
      defaultToken: '', tokenPostfix: '.renpy',
      keywords: ['label','call','jump','menu','choice','if','elif','else','screen','return','python','init','define','show','hide','play','stop'],
      tokenizer: { root: [
        [/^[ \t]*[a-zA-Z_][\w]*:/, 'keyword'],
        [/#.*$/, 'comment'],
        [/^[ \t]*[A-Z][A-Za-z_0-9]*[ \t]+\"/, 'type.identifier'],
        [/\"[^\"]*\"/, 'string'],
        [/^\s*\$.*$/, 'number'],
      ] }
    });
    monaco.languages.setLanguageConfiguration('renpy', {
      comments: { lineComment: '#' },
      brackets: [['(',')'],['[',']'],['{','}']],
      autoClosingPairs: [
        {open:'(',close:')'},{open:'[',close:']'},{open:'{',close:'}'},
        {open:'"', close:'"', notIn:['string']}
      ],
      indentationRules: {
        increaseIndentPattern: /^\s*(label|menu|if|elif|else|python|screen).*:\s*$/,
        decreaseIndentPattern: /^\s*(return|pass)\b/
      }
    });

    monaco.editor.defineTheme('renpyLight', {
      base: 'vs', inherit: true,
      rules: [
        { token: 'keyword', foreground: 'b46900', fontStyle: 'bold' },
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'string', foreground: 'a31515' },
        { token: 'type.identifier', foreground: '267f99' }
      ],
      colors: { 'editor.background': '#ffffff', 'editor.foreground': '#1e1e1e' }
    });
    monaco.editor.defineTheme('renpyDark', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF9D00', fontStyle: 'bold' },
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'type.identifier', foreground: '4FC1FF' }
      ],
      colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4' }
    });

    monaco.editor.setTheme(isDark ? 'renpyDark' : 'renpyLight');

    editor.onDidChangeCursorPosition(() => setActiveFromEditor());
    fullRefresh();
  };

  // Apply theme changes
  useEffect(() => {
    monacoRef.current?.editor?.setTheme(isDark ? 'renpyDark' : 'renpyLight');
  }, [isDark]);

  // Insert from visual input
  const insertAtContext = useCallback((lineText: string) => {
    const ed = editorRef.current; const mon = monacoRef.current; if (!ed || !mon) return;
    const model = ed.getModel(); if (!model) return;
    const val = (lineText || '').trim(); if (!val) return;
    const ds = parseDialoguesWithMap(model.getValue());
    if (activeMsgIdx !== null) {
      const d = ds[activeMsgIdx];
      const col = model.getLineMaxColumn(d.endLine);
      model.applyEdits([{ range: new mon.Range(d.endLine, col, d.endLine, col), text: `\n${lineText}\n`, forceMoveMarkers: true }]);
    } else {
      let targetLine: number;
      if (!ds.length) targetLine = model.getLineCount();
      else if ((activeSepIdx ?? ds.length) <= 0) targetLine = ds[0].startLine;
      else if ((activeSepIdx ?? ds.length) >= ds.length) targetLine = model.getLineCount();
      else targetLine = ds[activeSepIdx as number].startLine;
      model.applyEdits([{ range: new mon.Range(targetLine, 1, targetLine, 1), text: `${lineText}\n`, forceMoveMarkers: true }]);
    }
    const newValue = model.getValue();
    setValue(newValue);
    setDialogs(parseDialoguesWithMap(newValue));
    applyDecorations();
  }, [activeMsgIdx, activeSepIdx, applyDecorations]);

  // Visual input
  const [newMsg, setNewMsg] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState('');

  const characterOptions = useMemo(() => {
    const uniq = Array.from(new Set(dialogs.filter(d => d.name).map(d => d.name)));
    return ['', ...uniq];
  }, [dialogs]);

  const onSend = useCallback(() => {
    const line = selectedCharacter ? `${selectedCharacter} "${newMsg}"` : `"${newMsg}"`;
    insertAtContext(line); setNewMsg('');
  }, [selectedCharacter, newMsg, insertAtContext]);

  const onInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = characterOptions.indexOf(selectedCharacter);
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      const n = characterOptions.length;
      const next = (idx + dir + n) % n;
      setSelectedCharacter(characterOptions[next]);
    } else if (e.key === 'Enter') {
      e.preventDefault(); onSend();
    }
  }, [characterOptions, selectedCharacter, onSend]);

  // Drag-resize
  const onMouseDownResizer = (e: React.MouseEvent) => {
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
  };
  const onMouseUpWindow = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = '';
    localStorage.setItem('renpy_node_editor_split', String(split));
    setTimeout(() => editorRef.current?.layout?.(), 0);
  }, [split]);
  const onMouseMoveWindow = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const clamped = Math.min(80, Math.max(20, percent));
    setSplit(clamped);
  }, []);
  useEffect(() => {
    window.addEventListener('mousemove', onMouseMoveWindow);
    window.addEventListener('mouseup', onMouseUpWindow);
    return () => {
      window.removeEventListener('mousemove', onMouseMoveWindow);
      window.removeEventListener('mouseup', onMouseUpWindow);
    };
  }, [onMouseMoveWindow, onMouseUpWindow]);

  useEffect(() => { editorRef.current?.layout?.(); }, [split]);

  // ----- SAVE (restore indent & close) -----
  const handleSave = useCallback(async () => {
    let updatedText = value;

    if (isActionNode) {
      const trimmedName = nodeName.trim();
      const metadata: NodeMetadata = {};
      if (trimmedName) {
        metadata.name = trimmedName;
      }
      if (nodeStatus) {
        metadata.status = nodeStatus;
      }
      const authorName = currentUsername || nodeAuthor.trim();
      if (authorName) {
        metadata.author = authorName;
      }
      if (nodeColor) {
        metadata.accentColor = nodeColor;
      }

      const lines = value.split(/\r?\n/);
      let insertionIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) {
          continue;
        }
        insertionIndex = i;
        if (trimmed.startsWith(NODE_METADATA_PREFIX)) {
          lines.splice(i, 1);
        }
        break;
      }

      const metadataComment = formatMetadataComment(metadata);
      if (metadataComment) {
        lines.splice(insertionIndex, 0, metadataComment);
      }

      updatedText = lines.join('\n');

      if (metadata.author) {
        setNodeAuthor(metadata.author);
      } else if (!authorName) {
        setNodeAuthor('');
      }

      if (metadata.name !== undefined) {
        setNodeName(metadata.name);
      } else if (!trimmedName) {
        setNodeName('');
      }

      if (metadata.accentColor) {
        setNodeColor(metadata.accentColor);
      } else if (!nodeColor) {
        setNodeColor('');
      }
    }

    let finalText = updatedText;
    if (indentRef.current.stripped) {
      finalText = restoreIndent(updatedText, indentRef.current.indent);
    }
    await onSave(startLine, endLine, finalText);
    onClose();
  }, [
    value,
    onSave,
    startLine,
    endLine,
    onClose,
    isActionNode,
    nodeName,
    nodeStatus,
    currentUsername,
    nodeAuthor,
    nodeColor,
  ]);

  // Styles
  const mode = theme.palette.mode;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: {
          m: 2, // маленькие отступы по краям — видно, что это попап
          height: 'calc(100vh - 32px)',
          borderRadius: 2,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }
      }}
    >
      <GlobalStyles styles={{
        body: { backgroundColor: theme.palette.background.default },
        '.monaco-editor .renpy-dialogue-line': { background: mode === 'dark' ? '#2a2330' : '#fff6da' },
        '.monaco-editor .renpy-glyph': { background: '#ffc', width: '4px' },
      }} />

      <DialogTitle sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: '0 0 auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">
            {t('editor.nodeEditor.title', { start: startLine, end: endLine })}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
          >
            {t('button.save')}
          </Button>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>

        {isActionNode && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {t('editor.nodeEditor.nodeName', 'Node name')}
              </Typography>
              {isEditingName ? (
                <TextField
                  variant="standard"
                  value={nodeName}
                  onChange={(event) => setNodeName(event.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={handleNameKeyDown}
                  autoFocus
                  sx={{ minWidth: 160 }}
                />
              ) : (
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    maxWidth: 240,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  onClick={handleStartEditingName}
                >
                  {nodeName || t('editor.nodeEditor.unnamed', 'Unnamed node')}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="caption" color="text.secondary">
                {t('editor.nodeEditor.statusPlaceholder', 'Status')}
              </Typography>
              <Select
                size="small"
                value={nodeStatus || ''}
                displayEmpty
                onChange={handleStatusChange}
                renderValue={(value) => {
                  if (!value) {
                    return t('editor.nodeEditor.noStatus', 'No status');
                  }
                  const status = value as NodeStatus;
                  return statusLabelMap[status] ?? status;
                }}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary">
                    {t('editor.nodeEditor.noStatus', 'No status')}
                  </Typography>
                </MenuItem>
                {statusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {statusLabelMap[status] ?? status}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t('editor.nodeEditor.colorLabel', 'Color')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                <Tooltip title={t('editor.nodeEditor.defaultColor', 'Automatic')}>
                  <ButtonBase
                    onClick={() => setNodeColor('')}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: nodeColor
                        ? `1px dashed ${theme.palette.divider}`
                        : `2px solid ${theme.palette.text.primary}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.palette.text.secondary,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10 }}>
                      Ø
                    </Typography>
                  </ButtonBase>
                </Tooltip>
                {ACTION_NODE_COLORS.map((color) => {
                  const isSelected = nodeColor === color;
                  return (
                    <Tooltip key={color} title={color}>
                      <ButtonBase
                        onClick={() => setNodeColor(color)}
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          border: isSelected
                            ? `2px solid ${theme.palette.getContrastText(color)}`
                            : `1px solid ${alpha(color, 0.6)}`,
                          boxShadow: isSelected ? `0 0 0 3px ${alpha(color, 0.25)}` : 'none',
                          transition: theme.transitions.create(['box-shadow', 'transform'], {
                            duration: theme.transitions.duration.shortest,
                          }),
                          transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                        }}
                      >
                        <Box
                          sx={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            backgroundColor: color,
                          }}
                        />
                      </ButtonBase>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>

            {nodeAuthor && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t('editor.nodeEditor.authorChipPrefix', 'by')} ${nodeAuthor}`}
                sx={{
                  borderColor: theme.palette.divider,
                  color: theme.palette.text.secondary,
                }}
              />
            )}
          </Box>
        )}
      </DialogTitle>

      {indentError && (
        <Box sx={{ px: 2, pt: 1 }}>
          <Alert severity="warning" onClose={() => setIndentError(null)}>{indentError}</Alert>
        </Box>
      )}

      <DialogContent sx={{ p: 0, flex: '1 1 auto', overflow: 'hidden' }}>
        {/* GRID: editor | resizer | visual */}
        <Box
          ref={gridRef}
          sx={{
            height: '100%',
            width: '100%',
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateColumns: `${split}% 6px ${100 - split}%`,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Left: Monaco */}
          <Box sx={{ minWidth: 0, minHeight: 0, borderRight: `1px solid ${theme.palette.divider}`, boxSizing: 'border-box', overflow: 'hidden' }}>
            <Editor
              height="100%"
              defaultLanguage="renpy"
              value={value}
              onChange={(v) => setValue(v ?? '')}
              onMount={(e, m) => {
                // mount + set theme
                handleEditorMount(e, m);
                // prevent horizontal scrollbar jumps
                const dom = (e as any)?.getDomNode?.();
                if (dom) (dom as HTMLElement).style.overflow = 'hidden';
              }}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                glyphMargin: true,
                fontSize: 14,
                automaticLayout: true,
              }}
            />
          </Box>

          {/* Resizer */}
          <Box
            onMouseDown={onMouseDownResizer}
            sx={{
              cursor: 'col-resize',
              '&:hover': { backgroundColor: theme.palette.action.hover },
            }}
          />

          {/* Right: visual chat */}
          <Box
            sx={{
              minWidth: 0, minHeight: 0,
              display: 'flex', flexDirection: 'column',
              bgcolor: theme.palette.background.default,
              color: theme.palette.text.primary,
              overflow: 'hidden',
            }}
          >
            {/* scroll area */}
            <Box id="chat" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
              {dialogs.map((d, idx) => (
                <React.Fragment key={idx}>
                  <Box
                    className="message"
                    sx={{
                      m: '10px 8px', p: '10px 12px', borderRadius: '10px', lineHeight: 1.35,
                      border: `1px solid ${theme.palette.divider}`,
                      bgcolor: bubbleColor(d.name, isDark),
                      color: theme.palette.text.primary,
                      outline: activeMsgIdx === idx ? `2px solid ${theme.palette.primary.main}` : 'none',
                      boxShadow: theme.shadows[1],
                      wordBreak: 'break-word',
                    }}
                    onClick={() => setActiveFromChat('dialog', idx, true)}
                  >
                    {d.name && (
                      <Typography component="span" sx={{ fontWeight: 600, mr: 1, opacity: 0.85 }}>
                        {d.name}:
                      </Typography>
                    )}
                    <span dangerouslySetInnerHTML={{ __html: renderTextTags(d.text) }} />
                  </Box>

                  {idx < dialogs.length - 1 && (
                    <Box
                      className="separator"
                      onClick={() => setActiveFromChat('sep', idx + 1, true)}
                      sx={{ position: 'relative', height: 14, m: '4px 8px', cursor: 'pointer' }}
                    >
                      <Box
                        sx={{
                          position: 'absolute', left: 8, right: 8, top: 6, height: 2, borderRadius: 2,
                          bgcolor: (activeSepIdx === idx + 1 && activeMsgIdx === null)
                            ? theme.palette.primary.main
                            : theme.palette.divider
                        }}
                      />
                    </Box>
                  )}
                </React.Fragment>
              ))}
            </Box>

            {/* Input */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                borderTop: `1px solid ${theme.palette.divider}`,
                p: 1,
                bgcolor: theme.palette.background.paper,
                pb: `max(8px, env(safe-area-inset-bottom))`,
                flex: '0 0 auto',
              }}
            >
              <Select
                size="small"
                value={selectedCharacter}
                onChange={(e) => setSelectedCharacter(e.target.value)}
                sx={{
                  minWidth: 180,
                  height: `${CONTROL_HEIGHT}px`,
                  '& .MuiOutlinedInput-root': { height: `${CONTROL_HEIGHT}px`, alignItems: 'center' },
                  '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
                }}
              >
                <MenuItem value="">{t('editor.nodeEditor.narrator')}</MenuItem>
                {Array.from(new Set(dialogs.filter(d => d.name).map(d => d.name))).map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>

              <TextField
                size="small"
                fullWidth
                placeholder={t('editor.nodeEditor.placeholder')}
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={onInputKeyDown}
                multiline
                minRows={1}
                maxRows={4}
                sx={{
                  '& .MuiInputBase-root': {
                    height: `${CONTROL_HEIGHT}px`,
                    alignItems: 'center',
                  },
                  '& .MuiInputBase-input': {
                    py: 0.5,
                  }
                }}
              />

              <Button
                variant="contained"
                onClick={onSend}
                sx={{ height: `${CONTROL_HEIGHT}px`, px: 2 }}
              >
                {t('editor.nodeEditor.insert')}
              </Button>
            </Stack>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default NodeEditorPopup;
