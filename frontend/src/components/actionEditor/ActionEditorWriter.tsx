import PersonIcon from '@mui/icons-material/Person';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import {
  applyActionEditorTextTag,
  parseActionEditorContent,
  serializeActionEditorRows,
  updateActionEditorRowText,
  type ActionEditorCommandRow,
  type ActionEditorDialogueRow,
  type ActionEditorNarrationRow,
  type ActionEditorRawLineRow,
  type ActionEditorRow,
  type ActionEditorTextTag,
} from './actionEditorModel';

export interface ActionEditorWriterProps {
  content: string;
  onContentChange: (content: string) => void;
}

const speakerNames = new Map<string, string>([
  ['m', 'Monika'],
  ['s', 'Sayori'],
]);

const commandLabels = new Map<ActionEditorCommandRow['kind'], string>([
  ['scene', 'Scene'],
  ['show', 'Show'],
  ['hide', 'Hide'],
  ['music', 'Music'],
  ['sound', 'Sound'],
  ['transition', 'Transition'],
]);

const speakerLabel = (row: ActionEditorDialogueRow | ActionEditorNarrationRow): string =>
  row.kind === 'narration' ? 'Narrator' : speakerNames.get(row.speaker) ?? row.speaker;

const rowIcon = (row: ActionEditorRow) => {
  if (row.kind === 'music' || row.kind === 'sound') {
    return <MusicNoteIcon aria-hidden="true" fontSize="small" />;
  }
  if (row.kind === 'scene' || row.kind === 'show' || row.kind === 'hide') {
    return <ImageOutlinedIcon aria-hidden="true" fontSize="small" />;
  }
  return <PersonIcon aria-hidden="true" fontSize="small" />;
};

export const ActionEditorWriter = ({ content, onContentChange }: ActionEditorWriterProps) => {
  const rows = parseActionEditorContent(content);

  const updateRowText = (rowId: string, text: string) => {
    onContentChange(serializeActionEditorRows(updateActionEditorRowText(rows, rowId, text)));
  };

  const applyTextTag = (row: ActionEditorDialogueRow | ActionEditorNarrationRow, tag: ActionEditorTextTag) => {
    const isInsertionTag = tag === 'wait' || tag === 'pause' || tag === 'noWait';
    const selection = isInsertionTag
      ? { start: row.text.length, end: row.text.length }
      : { start: 0, end: row.text.length };
    onContentChange(serializeActionEditorRows(applyActionEditorTextTag(rows, row.id, selection, tag)));
  };

  return (
    <div className="action-editor-writer" aria-label="Action writer rows">
      <div className="action-editor-writer__rows">
        {rows.map((row) => {
          if (row.kind === 'dialogue' || row.kind === 'narration') {
            return (
              <DialogueWriterRow
                key={row.id}
                row={row}
                onTag={(tag) => applyTextTag(row, tag)}
                onTextChange={(text) => updateRowText(row.id, text)}
              />
            );
          }

          if (row.kind === 'rawLine') {
            return <RawLineWriterRow key={row.id} row={row} onTextChange={(text) => updateRowText(row.id, text)} />;
          }

          return <CommandWriterRow key={row.id} row={row} />;
        })}
      </div>
      <button className="action-editor-writer__add-row" type="button">
        Add dialogue or command
      </button>
    </div>
  );
};

const DialogueWriterRow = ({
  row,
  onTag,
  onTextChange,
}: {
  row: ActionEditorDialogueRow | ActionEditorNarrationRow;
  onTag: (tag: ActionEditorTextTag) => void;
  onTextChange: (text: string) => void;
}) => (
  <div className="action-editor-writer__row action-editor-writer__row--dialogue">
    <button className="action-editor-writer__speaker" type="button">
      {rowIcon(row)}
      <span>{speakerLabel(row)}</span>
    </button>
    <InlineTextTagToolbar onTag={onTag} />
    <textarea
      aria-label={`${speakerLabel(row)} dialogue text`}
      className="action-editor-writer__dialogue-input"
      onChange={(event) => onTextChange(event.target.value)}
      value={row.text}
    />
    <span className="action-editor-writer__drag-handle" aria-hidden="true">
      ::
    </span>
  </div>
);

const InlineTextTagToolbar = ({ onTag }: { onTag: (tag: ActionEditorTextTag) => void }) => (
  <div className="action-editor-writer__inline-toolbar" aria-label="Inline text tags">
    <ToolbarButton label="B" onClick={() => onTag('bold')} title="Bold selected text" />
    <ToolbarButton label="I" onClick={() => onTag('italic')} title="Italic selected text" />
    <ToolbarButton label="U" onClick={() => onTag('underline')} title="Underline selected text" />
    <ToolbarButton label="S" onClick={() => onTag('strikethrough')} title="Strikethrough selected text" />
    <span className="action-editor-writer__toolbar-divider" aria-hidden="true" />
    <ToolbarButton label="Color" onClick={() => onTag('color')} title="Color selected text" />
    <ToolbarButton label="Size" onClick={() => onTag('size')} title="Size selected text" />
    <ToolbarButton label="CPS" onClick={() => onTag('cps')} title="CPS selected text" />
    <span className="action-editor-writer__toolbar-divider" aria-hidden="true" />
    <ToolbarButton label="Pause" onClick={() => onTag('pause')} title="Pause tag" />
    <ToolbarButton label="Wait" onClick={() => onTag('wait')} title="Wait tag" />
    <ToolbarButton label="No wait" onClick={() => onTag('noWait')} title="No wait tag" />
  </div>
);

const ToolbarButton = ({ label, onClick, title }: { label: string; onClick: () => void; title: string }) => (
  <button aria-label={title} onMouseDown={(event) => event.preventDefault()} onClick={onClick} type="button">
    {label}
  </button>
);

const CommandWriterRow = ({ row }: { row: ActionEditorCommandRow }) => (
  <div className={`action-editor-writer__row action-editor-writer__row--${row.kind}`}>
    <span className="action-editor-writer__command-icon">{rowIcon(row)}</span>
    <span className="action-editor-writer__command-label">[{commandLabels.get(row.kind) ?? row.command}]</span>
    <span className="action-editor-writer__command-primary">{row.primary}</span>
    {row.suffix ? <span className="action-editor-writer__command-suffix">{row.suffix}</span> : null}
    <button className="action-editor-writer__row-menu" type="button" aria-label={`${row.kind} row options`}>
      <MoreHorizIcon aria-hidden="true" fontSize="small" />
    </button>
    <span className="action-editor-writer__drag-handle" aria-hidden="true">
      ::
    </span>
  </div>
);

const RawLineWriterRow = ({
  row,
  onTextChange,
}: {
  row: ActionEditorRawLineRow;
  onTextChange: (text: string) => void;
}) => (
  <div className="action-editor-writer__row action-editor-writer__row--raw">
    <span className="action-editor-writer__command-label">[Raw]</span>
    <input
      aria-label="Raw RenPy line"
      className="action-editor-writer__raw-input"
      onChange={(event) => onTextChange(event.target.value)}
      value={row.text}
    />
    <span className="action-editor-writer__drag-handle" aria-hidden="true">
      ::
    </span>
  </div>
);

export default ActionEditorWriter;
