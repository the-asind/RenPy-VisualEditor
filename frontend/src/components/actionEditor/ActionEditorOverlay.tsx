import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import EditIcon from '@mui/icons-material/Edit';
import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import WorkspacesIcon from '@mui/icons-material/Workspaces';

import type { ScenarioNodeSnapshot } from '../../utils/projectGraphProjection';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';
import { ActionEditorSidebar } from './ActionEditorSidebar';
import { ActionEditorWriter } from './ActionEditorWriter';
import { deriveActionEditorTitle, detectActionEditorStructuralStatement } from './actionEditorModel';
import './ActionEditorOverlay.css';

export interface ActionEditorOverlayProps {
  assetCatalog?: ProjectAssetCatalogPayload | null;
  node: ScenarioNodeSnapshot;
  filePath: string;
  labelPath: string;
  initialMode?: 'writer' | 'raw';
  localAssetUrls?: Record<string, string>;
  saveStatus?: string | null;
  onClose: () => void;
  onContentChange: (content: string) => void;
  onTitleChange: (title: string) => void;
}

export const ActionEditorOverlay = ({
  assetCatalog,
  node,
  filePath,
  initialMode = 'writer',
  labelPath,
  localAssetUrls,
  saveStatus,
  onClose,
  onContentChange,
  onTitleChange,
}: ActionEditorOverlayProps) => {
  const [mode, setMode] = useState<'writer' | 'raw'>(initialMode);
  const [activeWriterRowId, setActiveWriterRowId] = useState<string | null>(null);
  const [draftContentState, setDraftContentState] = useState(() => ({
    content: node.content,
    nodeId: node.id,
  }));
  const draftContent = draftContentState.nodeId === node.id ? draftContentState.content : node.content;
  const title = deriveActionEditorTitle(node.metadata, draftContent);
  const displayedSaveStatus = saveStatus ?? 'Autosaved';
  const structuralStatement = useMemo(
    () =>
      draftContent
        .split(/\r?\n/)
        .map(detectActionEditorStructuralStatement)
        .find((statement) => statement !== null),
    [draftContent],
  );
  const handleDraftContentChange = useCallback(
    (content: string) => {
      setDraftContentState({ content, nodeId: node.id });
      onContentChange(content);
    },
    [node.id, onContentChange],
  );
  const handleNextAction = useCallback(() => undefined, []);

  useEffect(() => {
    setDraftContentState((currentDraft) =>
      currentDraft.nodeId === node.id ? currentDraft : { content: node.content, nodeId: node.id },
    );
  }, [node.content, node.id]);

  useEffect(() => {
    setActiveWriterRowId(null);
  }, [node.id]);
  const structuralActionLabel =
    structuralStatement?.kind === 'menu'
      ? 'Create Player Choice from menu'
      : structuralStatement?.kind === 'conditional'
        ? 'Create Conditional Path'
        : structuralStatement?.kind === 'jump'
          ? 'Create Go to Label'
          : structuralStatement?.kind === 'call'
            ? 'Create Call Sub-scene'
            : structuralStatement?.kind === 'return'
              ? 'Create Return node'
              : 'Review structure';

  return (
    <div className="action-editor" role="dialog" aria-label="Action editor" aria-modal="true">
      <div className="action-editor__surface">
        <header className="action-editor__header">
          <nav className="action-editor__breadcrumb" aria-label="Action editor location">
            <button className="action-editor__breadcrumb-link" type="button">
              {filePath}
            </button>
            <span className="action-editor__breadcrumb-separator">/</span>
            <button className="action-editor__breadcrumb-link" type="button">
              {labelPath}
            </button>
            <span className="action-editor__breadcrumb-separator">/</span>
            <label className="action-editor__title-field">
              <input
                aria-label="Edit action editor title"
                onChange={(event) => onTitleChange(event.target.value)}
                value={title}
              />
              <EditIcon aria-hidden="true" fontSize="small" />
            </label>
          </nav>

          <div className="action-editor__header-actions">
            <div className="action-editor__mode-history-cluster">
              <div className="action-editor__mode-switch" aria-label="Action editor mode">
                <button
                  className={mode === 'writer' ? 'action-editor__mode-button action-editor__mode-button--active' : 'action-editor__mode-button'}
                  onClick={() => setMode('writer')}
                  type="button"
                >
                  <WorkspacesIcon aria-hidden="true" fontSize="small" />
                  <span>Writer view</span>
                </button>
                <button
                  className={mode === 'raw' ? 'action-editor__mode-button action-editor__mode-button--active' : 'action-editor__mode-button'}
                  onClick={() => setMode('raw')}
                  type="button"
                >
                  <CodeIcon aria-hidden="true" fontSize="small" />
                  <span>Raw Ren&apos;Py</span>
                </button>
              </div>
              <div className="action-editor__history-actions" aria-label="Action history controls">
                <button className="action-editor__icon-button" type="button" aria-label="Undo" title="Undo">
                  <UndoIcon aria-hidden="true" fontSize="small" />
                </button>
                <button className="action-editor__icon-button" type="button" aria-label="Redo" title="Redo">
                  <RedoIcon aria-hidden="true" fontSize="small" />
                </button>
              </div>
            </div>
            <div className="action-editor__save-status" aria-label="Autosave status" role="status">
              <span className="action-editor__save-dot" />
              <span>{displayedSaveStatus}</span>
            </div>
            <button className="action-editor__icon-button" type="button" aria-label="Close action editor" onClick={onClose}>
              <CloseIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
        </header>

        <main className={mode === 'raw' ? 'action-editor__body action-editor__body--raw' : 'action-editor__body'}>
          {mode === 'writer' ? (
            <>
              <section className="action-editor__writer-column" aria-label="Writer rows">
                <ActionEditorWriter
                  assetCatalog={assetCatalog}
                  content={draftContent}
                  onActiveRowChange={setActiveWriterRowId}
                  onContentChange={handleDraftContentChange}
                />
              </section>
              <ActionEditorSidebar
                activeRowId={activeWriterRowId}
                assetCatalog={assetCatalog}
                content={draftContent}
                localAssetUrls={localAssetUrls}
                onNextAction={handleNextAction}
              />
            </>
          ) : (
            <section className="action-editor__raw-column">
              {structuralStatement ? (
                <div className="action-editor__raw-structure-review" role="status">
                  <div>
                    <strong>Review structural Ren&apos;Py</strong>
                    <span>{structuralStatement.statement}</span>
                  </div>
                  <button type="button">{structuralActionLabel}</button>
                  <button type="button">Keep as raw text</button>
                </div>
              ) : null}
              <textarea
                aria-label="Raw RenPy action content"
                className="action-editor__raw-editor"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onChange={(event) => handleDraftContentChange(event.target.value)}
                spellCheck={false}
                value={draftContent}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default ActionEditorOverlay;
