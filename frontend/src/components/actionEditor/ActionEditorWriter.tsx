import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import PersonIcon from '@mui/icons-material/Person';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { ActionEditorDragHandle } from './ActionEditorDragHandle';
import {
  applyActionEditorTextTag,
  actionEditorDraftCardKinds,
  changeActionEditorEmptyRowSpeaker,
  commitActionEditorEmptyRowDraft,
  deriveActionEditorSpeakerPool,
  parseActionEditorContent,
  serializeActionEditorRows,
  speakerAccentForId,
  splitActionEditorTextRow,
  updateActionEditorCommandClause,
  updateActionEditorCommandExtraClauses,
  updateActionEditorCommandPrimary,
  updateActionEditorCommandSuffix,
  updateActionEditorDialogueImageAttributes,
  updateActionEditorRowText,
  type ActionEditorCommandClauseName,
  type ActionEditorCommandRow,
  type ActionEditorDraftCardKind,
  type ActionEditorDialogueRow,
  type ActionEditorNarrationRow,
  type ActionEditorRawLineRow,
  type ActionEditorRow,
  type ActionEditorTextSelection,
  type ActionEditorTextTagSettings,
  type ActionEditorTextTag,
} from './actionEditorModel';
import { suggestImageNames } from '../../utils/assetCatalogResolver';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';

export interface ActionEditorWriterProps {
  assetCatalog?: ProjectAssetCatalogPayload | null;
  content: string;
  onActiveRowChange?: (rowId: string) => void;
  onContentChange: (content: string) => void;
}

const speakerNames = new Map<string, string>([
  ['m', 'Monika'],
  ['mc', 'mc'],
  ['n', 'n'],
  ['s', 'Sayori'],
  ['y', 'y'],
]);

const commandLabels = new Map<ActionEditorCommandRow['kind'], string>([
  ['scene', 'Scene'],
  ['show', 'Show'],
  ['hide', 'Hide'],
  ['music', 'Music'],
  ['sound', 'Sound'],
  ['transition', 'Transition'],
]);

const renpyTextInputProps = {
  autoCapitalize: 'off',
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

const ACTION_EDITOR_TEXT_COMMIT_DEBOUNCE_MS = 120;

const speakerLabel = (row: ActionEditorDialogueRow | ActionEditorNarrationRow): string =>
  row.kind === 'narration' ? 'Narrator' : speakerNames.get(row.speaker) ?? row.speaker;

const rowIcon = (row: ActionEditorRow) => {
  if (row.kind === 'music') {
    return <MusicNoteIcon aria-hidden="true" fontSize="small" />;
  }
  if (row.kind === 'sound') {
    return <VolumeUpIcon aria-hidden="true" fontSize="small" />;
  }
  if (row.kind === 'hide') {
    return <VisibilityOffOutlinedIcon aria-hidden="true" fontSize="small" />;
  }
  if (row.kind === 'transition') {
    return <AutoAwesomeIcon aria-hidden="true" fontSize="small" />;
  }
  if (row.kind === 'scene' || row.kind === 'show') {
    return <ImageOutlinedIcon aria-hidden="true" fontSize="small" />;
  }
  return <PersonIcon aria-hidden="true" fontSize="small" />;
};

export const ActionEditorWriter = memo(function ActionEditorWriter({
  assetCatalog,
  content,
  onActiveRowChange,
  onContentChange,
}: ActionEditorWriterProps) {
  const rows = useMemo(() => parseActionEditorContent(content), [content]);
  const speakerPool = useMemo(() => deriveActionEditorSpeakerPool(rows), [rows]);
  const imageSuggestions = useMemo(() => suggestImageNames(assetCatalog), [assetCatalog]);
  const audioSuggestions = useMemo(
    () => assetCatalog?.entries.filter((entry) => entry.kind === 'audio').map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })) ?? [],
    [assetCatalog],
  );
  const draftRowsRef = useRef<ActionEditorRow[]>(rows);
  const pendingContentRef = useRef<string | null>(null);
  const pendingContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldFocusEmptyRowAfterRenderRef = useRef(false);
  const [emptyRowFocusRequestId, setEmptyRowFocusRequestId] = useState(0);
  const emptyRowFocusTargetId = shouldFocusEmptyRowAfterRenderRef.current
    ? rows
        .filter((row) => (row.kind === 'dialogue' || row.kind === 'narration') && row.text.length === 0)
        .at(-1)?.id ?? null
    : null;

  const flushPendingContent = () => {
    const pendingContent = pendingContentRef.current;
    if (pendingContent === null) {
      return;
    }
    pendingContentRef.current = null;
    if (pendingContentTimerRef.current) {
      clearTimeout(pendingContentTimerRef.current);
      pendingContentTimerRef.current = null;
    }
    onContentChange(pendingContent);
  };

  const scheduleRowsChange = (nextRows: ActionEditorRow[]) => {
    draftRowsRef.current = nextRows;
    pendingContentRef.current = serializeActionEditorRows(nextRows);
    if (pendingContentTimerRef.current) {
      clearTimeout(pendingContentTimerRef.current);
    }
    pendingContentTimerRef.current = setTimeout(() => {
      pendingContentTimerRef.current = null;
      flushPendingContent();
    }, ACTION_EDITOR_TEXT_COMMIT_DEBOUNCE_MS);
  };

  const commitRowsChange = (nextRows: ActionEditorRow[]) => {
    draftRowsRef.current = nextRows;
    pendingContentRef.current = null;
    if (pendingContentTimerRef.current) {
      clearTimeout(pendingContentTimerRef.current);
      pendingContentTimerRef.current = null;
    }
    onContentChange(serializeActionEditorRows(nextRows));
  };

  useEffect(() => {
    draftRowsRef.current = rows;
  }, [rows]);

  useEffect(() => () => flushPendingContent(), [onContentChange]);

  const updateRowText = (rowId: string, text: string) => {
    scheduleRowsChange(updateActionEditorRowText(draftRowsRef.current, rowId, text));
  };

  const updateDialogueImageAttributes = (rowId: string, imageAttributes: string[]) => {
    commitRowsChange(updateActionEditorDialogueImageAttributes(draftRowsRef.current, rowId, imageAttributes));
  };

  const updateCommandPrimary = (rowId: string, primary: string) => {
    commitRowsChange(updateActionEditorCommandPrimary(draftRowsRef.current, rowId, primary));
  };

  const updateCommandClause = (rowId: string, clauseName: ActionEditorCommandClauseName, value: string) => {
    commitRowsChange(updateActionEditorCommandClause(draftRowsRef.current, rowId, clauseName, value));
  };

  const updateCommandExtraClauses = (rowId: string, extraClauses: string) => {
    commitRowsChange(updateActionEditorCommandExtraClauses(draftRowsRef.current, rowId, extraClauses));
  };

  const updateCommandSuffix = (rowId: string, suffix: string) => {
    commitRowsChange(updateActionEditorCommandSuffix(draftRowsRef.current, rowId, suffix));
  };

  const splitRowText = (rowId: string, selection: ActionEditorTextSelection) => {
    const nextRows = splitActionEditorTextRow(draftRowsRef.current, rowId, selection);
    if (nextRows !== draftRowsRef.current) {
      shouldFocusEmptyRowAfterRenderRef.current = true;
      setEmptyRowFocusRequestId((requestId) => requestId + 1);
    }
    commitRowsChange(nextRows);
  };

  const shiftEmptyRowSpeaker = (rowId: string, direction: -1 | 1) => {
    commitRowsChange(changeActionEditorEmptyRowSpeaker(draftRowsRef.current, rowId, direction, speakerPool));
  };

  const commitEmptyRowDraft = (rowId: string, draftKind: ActionEditorDraftCardKind) => {
    commitRowsChange(commitActionEditorEmptyRowDraft(draftRowsRef.current, rowId, draftKind));
  };

  const applyTextTag = (
    row: ActionEditorDialogueRow | ActionEditorNarrationRow,
    tag: ActionEditorTextTag,
    selection: { start: number; end: number },
    settings?: ActionEditorTextTagSettings,
  ) => {
    commitRowsChange(applyActionEditorTextTag(draftRowsRef.current, row.id, selection, tag, settings));
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
                onTag={(tag, selection, settings) => applyTextTag(row, tag, selection, settings)}
                onImageAttributesChange={(imageAttributes) => updateDialogueImageAttributes(row.id, imageAttributes)}
                onEmptySpeakerShift={(direction) => shiftEmptyRowSpeaker(row.id, direction)}
                onEmptyDraftCommit={(draftKind) => commitEmptyRowDraft(row.id, draftKind)}
                onSplit={(selection) => splitRowText(row.id, selection)}
                onActive={() => onActiveRowChange?.(row.id)}
                onCommitPending={flushPendingContent}
                onEmptyFocusRequestHandled={() => {
                  shouldFocusEmptyRowAfterRenderRef.current = false;
                }}
                onTextChange={(text) => updateRowText(row.id, text)}
                emptyFocusRequestId={row.id === emptyRowFocusTargetId ? emptyRowFocusRequestId : 0}
                speakerPool={speakerPool}
              />
            );
          }

          if (row.kind === 'rawLine') {
            return (
              <RawLineWriterRow
                key={row.id}
                row={row}
                onActive={() => onActiveRowChange?.(row.id)}
                onCommitPending={flushPendingContent}
                onTextChange={(text) => updateRowText(row.id, text)}
              />
            );
          }

          return (
            <CommandWriterRow
              key={row.id}
              row={row}
              suggestions={row.kind === 'music' || row.kind === 'sound' ? audioSuggestions : imageSuggestions}
              onActive={() => onActiveRowChange?.(row.id)}
              onClauseChange={(clauseName, value) => updateCommandClause(row.id, clauseName, value)}
              onExtraClausesChange={(extraClauses) => updateCommandExtraClauses(row.id, extraClauses)}
              onPrimaryChange={(primary) => updateCommandPrimary(row.id, primary)}
              onSuffixChange={(suffix) => updateCommandSuffix(row.id, suffix)}
            />
          );
        })}
      </div>
      <button className="action-editor-writer__add-row" type="button">
        Add dialogue or command
      </button>
    </div>
  );
});

const DialogueWriterRow = ({
  row,
  emptyFocusRequestId,
  onTag,
  onImageAttributesChange,
  onEmptySpeakerShift,
  onEmptyDraftCommit,
  onSplit,
  onActive,
  onCommitPending,
  onEmptyFocusRequestHandled,
  onTextChange,
  speakerPool,
}: {
  row: ActionEditorDialogueRow | ActionEditorNarrationRow;
  emptyFocusRequestId: number;
  onTag: (
    tag: ActionEditorTextTag,
    selection: { start: number; end: number },
    settings?: ActionEditorTextTagSettings,
  ) => void;
  onImageAttributesChange: (imageAttributes: string[]) => void;
  onEmptySpeakerShift: (direction: -1 | 1) => void;
  onEmptyDraftCommit: (draftKind: ActionEditorDraftCardKind) => void;
  onSplit: (selection: ActionEditorTextSelection) => void;
  onActive: () => void;
  onCommitPending: () => void;
  onEmptyFocusRequestHandled: () => void;
  onTextChange: (text: string) => void;
  speakerPool: string[];
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draftText, setDraftText] = useState(row.text);
  const [selection, setSelection] = useState({ start: draftText.length, end: draftText.length });
  const [draftCardIndex, setDraftCardIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const speakerId = row.kind === 'narration' ? 'Narrator' : row.speaker;
  const isEmpty = draftText.length === 0;
  const rowStyle = {
    '--action-editor-speaker-accent': speakerAccentForId(speakerId),
  } as CSSProperties;
  const imageAttributesHelpId = `${row.id}-image-attributes-help`;
  const captureSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    setSelection({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isEmpty) {
        onEmptyDraftCommit(actionEditorDraftCardKinds[draftCardIndex]);
        return;
      }
      onSplit({
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
      });
      return;
    }

    if (!isEmpty) {
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onEmptySpeakerShift(event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setDraftCardIndex((currentIndex) => {
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        return (currentIndex + direction + actionEditorDraftCardKinds.length) % actionEditorDraftCardKinds.length;
      });
    }
  };

  useEffect(() => {
    setDraftText(row.text);
    setSelection((currentSelection) =>
      currentSelection.start > row.text.length || currentSelection.end > row.text.length
        ? { start: row.text.length, end: row.text.length }
        : currentSelection,
    );
  }, [row.id, row.text]);

  useEffect(() => {
    if (emptyFocusRequestId === 0 || !isEmpty) {
      return;
    }
    textareaRef.current?.focus();
    onEmptyFocusRequestHandled();
  }, [emptyFocusRequestId, isEmpty, onEmptyFocusRequestHandled]);

  return (
    <div
      className={
        isEmpty
          ? 'action-editor-writer__row action-editor-writer__row--dialogue action-editor-writer__row--empty'
          : 'action-editor-writer__row action-editor-writer__row--dialogue'
      }
      data-speaker-id={speakerId}
      style={rowStyle}
    >
      <div className="action-editor-writer__speaker" role="group" aria-label={`${speakerLabel(row)} speaker`}>
        <button className="action-editor-writer__speaker-name" type="button">
          {rowIcon(row)}
          <span>{speakerLabel(row)}</span>
        </button>
        {row.kind === 'dialogue' ? (
          <>
            <input
              aria-describedby={imageAttributesHelpId}
              aria-label={`${speakerLabel(row)} image attributes`}
              className="action-editor-writer__speaker-attrs"
              {...renpyTextInputProps}
              onChange={(event) => onImageAttributesChange(event.target.value.split(/\s+/))}
              onFocus={onActive}
              value={row.imageAttributes?.join(' ') ?? ''}
            />
            <div className="action-editor-writer__speaker-attrs-help" id={imageAttributesHelpId} role="note">
              <strong>What is this?</strong>
              <span>
                These are Ren&apos;Py say image attributes. In <code>m 2d &quot;...&quot;</code>, <code>m</code> is the
                character, <code>2d</code> selects the shown sprite pose or expression, and the text remains one
                dialogue statement.
              </span>
              <a
                href="https://www.renpy.org/doc/html/dialogue.html#say-with-image-attributes"
                rel="noreferrer"
                target="_blank"
              >
                Ren&apos;Py documentation
              </a>
            </div>
          </>
        ) : null}
      </div>
      {!isEmpty ? <InlineTextTagToolbar onTag={(tag, settings) => onTag(tag, selection, settings)} /> : null}
      <textarea
        aria-label={`${speakerLabel(row)} dialogue text`}
        className="action-editor-writer__dialogue-input"
        data-enter-splits-row="true"
        {...renpyTextInputProps}
        onChange={(event) => {
          const text = event.target.value;
          setDraftText(text);
          onTextChange(text);
          captureSelection();
        }}
        onBlur={() => {
          onCommitPending();
          setIsFocused(false);
        }}
        onFocus={() => {
          onActive();
          setIsFocused(true);
          captureSelection();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onSelect={captureSelection}
        ref={textareaRef}
        rows={1}
        value={draftText}
      />
      {isEmpty && isFocused ? (
        <EmptyRowPicker
          currentCardIndex={draftCardIndex}
          currentSpeaker={speakerId}
          speakerPool={speakerPool}
        />
      ) : null}
      <ActionEditorDragHandle />
    </div>
  );
};

const EmptyRowPicker = ({
  currentCardIndex,
  currentSpeaker,
  speakerPool,
}: {
  currentCardIndex: number;
  currentSpeaker: string;
  speakerPool: string[];
}) => {
  const currentCardKind = actionEditorDraftCardKinds[currentCardIndex];
  const currentSpeakerIndex = Math.max(0, speakerPool.indexOf(currentSpeaker));
  const previousSpeaker = speakerPool[(currentSpeakerIndex - 1 + speakerPool.length) % speakerPool.length];
  const nextSpeaker = speakerPool[(currentSpeakerIndex + 1) % speakerPool.length];

  return (
    <div
      className={
        currentCardKind === 'dialogue'
          ? 'action-editor-empty-picker'
          : 'action-editor-empty-picker action-editor-empty-picker--command'
      }
      aria-label="Empty writer row picker"
    >
      {currentCardKind === 'dialogue' ? (
        <div className="action-editor-empty-picker__speaker-rail" aria-label="Speaker cycle">
          <span className="action-editor-empty-picker__speaker action-editor-empty-picker__speaker--edge">
            {speakerNames.get(previousSpeaker) ?? previousSpeaker}
          </span>
          <span className="action-editor-empty-picker__speaker action-editor-empty-picker__speaker--current">
            {speakerNames.get(currentSpeaker) ?? currentSpeaker}
          </span>
          <span className="action-editor-empty-picker__speaker action-editor-empty-picker__speaker--edge">
            {speakerNames.get(nextSpeaker) ?? nextSpeaker}
          </span>
        </div>
      ) : null}
      <div className="action-editor-empty-picker__card-belt" aria-label="Card type cycle">
        {actionEditorDraftCardKinds.map((kind, index) => (
          <span
            className={
              index === currentCardIndex
                ? 'action-editor-empty-picker__card action-editor-empty-picker__card--selected'
                : 'action-editor-empty-picker__card'
            }
            key={kind}
          >
            {kind === 'dialogue' ? 'Dialogue' : commandLabels.get(kind) ?? kind}
          </span>
        ))}
      </div>
    </div>
  );
};

const toolbarMenuOptions = {
  color: [
    { label: 'Blue #2563eb', value: '#2563eb' },
    { label: 'Red #ef4444', value: '#ef4444' },
    { label: 'Green #16a34a', value: '#16a34a' },
  ],
  size: [
    { label: 'Size +4', value: '+4' },
    { label: 'Size +8', value: '+8' },
    { label: 'Size 24', value: '24' },
  ],
  cps: [
    { label: 'CPS 20', value: '20' },
    { label: 'CPS 28', value: '28' },
    { label: 'CPS 40', value: '40' },
  ],
} satisfies Record<'color' | 'size' | 'cps', { label: string; value: string }[]>;

const InlineTextTagToolbar = ({
  onTag,
}: {
  onTag: (tag: ActionEditorTextTag, settings?: ActionEditorTextTagSettings) => void;
}) => {
  const [openMenu, setOpenMenu] = useState<'color' | 'size' | 'cps' | null>(null);
  const closeMenu = () => setOpenMenu(null);

  useEffect(() => {
    if (!openMenu) {
      return undefined;
    }

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [openMenu]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  };

  return (
    <div
      className="action-editor-writer__inline-toolbar action-editor-toolbar"
      aria-label="Inline text tags"
      onKeyDown={handleKeyDown}
    >
      <div className="action-editor-toolbar__group" aria-label="Text style">
        <ToolbarButton label="B" onClick={() => onTag('bold')} title="Bold selected text" />
        <ToolbarButton label="I" onClick={() => onTag('italic')} title="Italic selected text" />
        <ToolbarButton label="U" onClick={() => onTag('underline')} title="Underline selected text" />
        <ToolbarButton label="S" onClick={() => onTag('strikethrough')} title="Strikethrough selected text" />
      </div>
      <div className="action-editor-toolbar__group" aria-label="Text parameters">
        <ToolbarMenuButton
          customInputLabel="Custom color value"
          label="Color"
          menuLabel="Text color options"
          menuName="color"
          onMenuToggle={setOpenMenu}
          onSelect={(value) => onTag('color', { value })}
          openMenu={openMenu}
          options={toolbarMenuOptions.color}
          title="Text color menu"
        />
        <ToolbarMenuButton
          customInputLabel="Custom size value"
          label="Size"
          menuLabel="Text size options"
          menuName="size"
          onMenuToggle={setOpenMenu}
          onSelect={(value) => onTag('size', { value })}
          openMenu={openMenu}
          options={toolbarMenuOptions.size}
          title="Text size menu"
        />
        <ToolbarMenuButton
          customInputLabel="Custom CPS value"
          label="CPS"
          menuLabel="CPS options"
          menuName="cps"
          onMenuToggle={setOpenMenu}
          onSelect={(value) => onTag('cps', { value })}
          openMenu={openMenu}
          options={toolbarMenuOptions.cps}
          title="CPS menu"
        />
      </div>
      <div className="action-editor-toolbar__group" aria-label="Text timing">
        <ToolbarButton label="Pause" onClick={() => onTag('pause')} title="Pause tag" />
        <ToolbarButton label="Wait" onClick={() => onTag('wait')} title="Wait tag" />
        <ToolbarButton label="No wait" onClick={() => onTag('noWait')} title="No wait tag" />
      </div>
    </div>
  );
};

const ToolbarButton = ({ label, onClick, title }: { label: string; onClick: () => void; title: string }) => (
  <button
    aria-label={title}
    className="action-editor-toolbar__button"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);

const ToolbarMenuButton = ({
  customInputLabel,
  label,
  menuLabel,
  menuName,
  onMenuToggle,
  onSelect,
  openMenu,
  options,
  title,
}: {
  customInputLabel: string;
  label: string;
  menuLabel: string;
  menuName: 'color' | 'size' | 'cps';
  onMenuToggle: (menuName: 'color' | 'size' | 'cps' | null) => void;
  onSelect: (value: string) => void;
  openMenu: 'color' | 'size' | 'cps' | null;
  options: { label: string; value: string }[];
  title: string;
}) => {
  const isOpen = openMenu === menuName;
  const menuId = `action-editor-toolbar-menu-${menuName}`;
  const [customValue, setCustomValue] = useState('');
  const menuNoun = menuName === 'cps' ? 'CPS' : menuName;

  return (
    <span className="action-editor-toolbar__menu-wrap">
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={title}
        className="action-editor-toolbar__button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onMenuToggle(isOpen ? null : menuName)}
        type="button"
      >
        {label}
      </button>
      {isOpen ? (
        <div className="action-editor-toolbar__menu" id={menuId} role="menu" aria-label={menuLabel}>
          {options.map((option) => (
            <button
              className="action-editor-toolbar__menu-option"
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.value);
                onMenuToggle(null);
              }}
              role="menuitem"
              type="button"
            >
              {option.label}
            </button>
          ))}
          <label className="action-editor-toolbar__custom-option">
            <span>{menuName === 'cps' ? 'Custom CPS' : `Custom ${menuName}`}</span>
            <input
              aria-label={customInputLabel}
              {...renpyTextInputProps}
              onChange={(event) => setCustomValue(event.target.value)}
              placeholder={options[0]?.value ?? ''}
              value={customValue}
            />
          </label>
          <button
            className="action-editor-toolbar__menu-option action-editor-toolbar__menu-option--apply"
            disabled={!customValue.trim()}
            onClick={() => {
              onSelect(customValue);
              setCustomValue('');
              onMenuToggle(null);
            }}
            role="menuitem"
            type="button"
          >
            Apply custom {menuNoun}
          </button>
        </div>
      ) : null}
    </span>
  );
};

const commandSupportsClause = (row: ActionEditorCommandRow, clauseName: ActionEditorCommandClauseName): boolean => {
  if (clauseName === 'at') {
    return row.kind === 'show';
  }
  return row.kind === 'scene' || row.kind === 'show' || row.kind === 'hide';
};

const CommandClauseField = ({
  commandLabel,
  name,
  onChange,
  onFocus,
  value,
}: {
  commandLabel: string;
  name: ActionEditorCommandClauseName;
  onChange: (value: string) => void;
  onFocus?: () => void;
  value: string;
}) => {
  const isFilled = value.trim().length > 0;
  return (
    <span
      className={
        isFilled
          ? 'action-editor-writer__command-clause action-editor-writer__command-clause--filled'
          : 'action-editor-writer__command-clause'
      }
    >
      <span className="action-editor-writer__command-clause-token">{name}</span>
      <input
        aria-label={`${commandLabel} ${name} value`}
        className={
          isFilled
            ? 'action-editor-writer__command-field action-editor-writer__command-field--filled'
            : 'action-editor-writer__command-field'
        }
        {...renpyTextInputProps}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder="..."
        value={value}
      />
    </span>
  );
};

const CommandOptionField = ({
  commandLabel,
  name,
  onChange,
  onFocus,
  placeholder,
  value,
}: {
  commandLabel: string;
  name: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  value: string;
}) => {
  const isFilled = value.trim().length > 0;
  return (
    <span
      className={
        isFilled
          ? 'action-editor-writer__command-clause action-editor-writer__command-clause--filled'
          : 'action-editor-writer__command-clause'
      }
    >
      <span className="action-editor-writer__command-clause-token">{name}</span>
      <input
        aria-label={`${commandLabel} ${name === 'mods' ? 'modifiers' : name} value`}
        className={
          isFilled
            ? 'action-editor-writer__command-field action-editor-writer__command-field--filled'
            : 'action-editor-writer__command-field'
        }
        {...renpyTextInputProps}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        value={value}
      />
    </span>
  );
};

const CommandWriterRow = ({
  row,
  suggestions,
  onActive,
  onClauseChange,
  onExtraClausesChange,
  onPrimaryChange,
  onSuffixChange,
}: {
  row: ActionEditorCommandRow;
  suggestions: string[];
  onActive: () => void;
  onClauseChange: (clauseName: ActionEditorCommandClauseName, value: string) => void;
  onExtraClausesChange: (extraClauses: string) => void;
  onPrimaryChange: (primary: string) => void;
  onSuffixChange: (suffix: string) => void;
}) => {
  const label = commandLabels.get(row.kind) ?? row.command;
  const primaryFilled = row.primary.trim().length > 0;
  const suggestionsId = suggestions.length ? `${row.id}-command-suggestions` : undefined;

  return (
    <div className={`action-editor-writer__row action-editor-writer__row--${row.kind}`}>
      <span className={`action-editor-writer__command-icon action-editor-writer__command-icon--${row.kind}`}>
        {rowIcon(row)}
      </span>
      <span className="action-editor-writer__command-label">[{label}]</span>
      <input
        aria-label={`${label} primary value`}
        className={
          primaryFilled
            ? 'action-editor-writer__command-field action-editor-writer__command-field--primary action-editor-writer__command-field--filled'
            : 'action-editor-writer__command-field action-editor-writer__command-field--primary'
        }
        {...renpyTextInputProps}
        list={suggestionsId}
        onChange={(event) => onPrimaryChange(event.target.value)}
        onFocus={onActive}
        placeholder="name"
        value={row.primary}
      />
      {suggestionsId ? (
        <datalist id={suggestionsId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
      <span className="action-editor-writer__command-clauses">
        {row.kind === 'show' ? (
          <CommandOptionField
            commandLabel={label}
            name="mods"
            onChange={onExtraClausesChange}
            onFocus={onActive}
            placeholder="zorder"
            value={row.extraClauses ?? ''}
          />
        ) : null}
        {commandSupportsClause(row, 'at') ? (
          <CommandClauseField
            commandLabel={label}
            name="at"
            onChange={(value) => onClauseChange('at', value)}
            onFocus={onActive}
            value={row.clauses?.at ?? ''}
          />
        ) : null}
        {commandSupportsClause(row, 'with') ? (
          <CommandClauseField
            commandLabel={label}
            name="with"
            onChange={(value) => onClauseChange('with', value)}
            onFocus={onActive}
            value={row.clauses?.with ?? ''}
          />
        ) : null}
        {row.kind === 'music' || row.kind === 'sound' ? (
          <CommandOptionField
            commandLabel={label}
            name="options"
            onChange={onSuffixChange}
            onFocus={onActive}
            placeholder="fadein"
            value={row.suffix}
          />
        ) : null}
        {row.kind !== 'music' && row.kind !== 'sound' && !row.clauses && row.suffix ? (
          <span className="action-editor-writer__command-suffix">{row.suffix}</span>
        ) : null}
      </span>
      <button className="action-editor-writer__row-menu" onFocus={onActive} type="button" aria-label={`${row.kind} row options`}>
        <MoreHorizIcon aria-hidden="true" fontSize="small" />
      </button>
      <ActionEditorDragHandle />
    </div>
  );
};

const RawLineWriterRow = ({
  row,
  onActive,
  onCommitPending,
  onTextChange,
}: {
  row: ActionEditorRawLineRow;
  onActive: () => void;
  onCommitPending: () => void;
  onTextChange: (text: string) => void;
}) => {
  const [draftText, setDraftText] = useState(row.text);

  useEffect(() => {
    setDraftText(row.text);
  }, [row.id, row.text]);

  return (
    <div className="action-editor-writer__row action-editor-writer__row--raw">
      <span className="action-editor-writer__command-label">[Raw]</span>
      <input
        aria-label="Raw RenPy line"
        className="action-editor-writer__raw-input"
        {...renpyTextInputProps}
        onBlur={onCommitPending}
        onChange={(event) => {
          const text = event.target.value;
          setDraftText(text);
          onTextChange(text);
        }}
        onFocus={onActive}
        value={draftText}
      />
      <ActionEditorDragHandle />
    </div>
  );
};

export default ActionEditorWriter;
