import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import EditIcon from '@mui/icons-material/Edit';
import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { useTranslation } from 'react-i18next';

import type { ScenarioNodeSnapshot } from '../../utils/projectGraphProjection';
import type { ProjectAssetCatalogPayload } from '../../utils/localRenpyDirectory';
import {
  ActionEditorSidebar,
  type ActionEditorNextActionRequest,
  type ActionEditorNextTargetLabel,
} from './ActionEditorSidebar';
import { ActionEditorRawCodeEditor } from './ActionEditorRawCodeEditor';
import { ActionEditorContinuationModal } from './ActionEditorContinuationModal';
import { ActionEditorRelationModal } from './ActionEditorRelationModal';
import { ActionEditorWriter } from './ActionEditorWriter';
import type { ConditionalContinuationDraft, MenuContinuationDraft } from './actionEditorContinuation';
import type { RelationTargetFileOption } from './relationTargetModel';
import {
  deriveActionEditorTextSplice,
  deriveActionEditorTitle,
  detectActionEditorStructuralStatement,
  type ActionEditorTextSplice,
} from './actionEditorModel';
import './ActionEditorOverlay.css';

export interface ActionEditorOverlayProps {
  assetCatalog?: ProjectAssetCatalogPayload | null;
  node: ScenarioNodeSnapshot;
  filePath: string;
  labelPath: string;
  initialMode?: 'writer' | 'raw';
  hasExistingTail?: boolean;
  localAssetUrls?: Record<string, string>;
  nextTargetFiles?: RelationTargetFileOption[];
  nextTargetLabels?: ActionEditorNextTargetLabel[];
  saveStatus?: string | null;
  onClose: () => void;
  onContentChange: (content: string) => void;
  onContentSplice?: (splice: ActionEditorTextSplice) => void;
  onNextAction?: (request: ActionEditorNextActionRequest) => void | Promise<void>;
  onTitleChange: (title: string) => void;
}

export const ActionEditorOverlay = ({
  assetCatalog,
  node,
  filePath,
  initialMode = 'writer',
  hasExistingTail = false,
  labelPath,
  localAssetUrls,
  nextTargetFiles = [],
  nextTargetLabels,
  saveStatus,
  onClose,
  onContentChange,
  onContentSplice,
  onNextAction,
  onTitleChange,
}: ActionEditorOverlayProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'writer' | 'raw'>(initialMode);
  const [activeWriterRowId, setActiveWriterRowId] = useState<string | null>(null);
  const [continuationModal, setContinuationModal] = useState<'conditional' | 'menu' | 'call' | 'jump' | null>(null);
  const [draftContentState, setDraftContentState] = useState(() => ({
    content: node.content,
    nodeId: node.id,
  }));
  const draftContent = draftContentState.nodeId === node.id ? draftContentState.content : node.content;
  const title = deriveActionEditorTitle(node.metadata, draftContent);
  const displayedSaveStatus = saveStatus ?? t('actionEditor.autosaved');
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
      if (onContentSplice) {
        const splice = deriveActionEditorTextSplice(draftContent, content);
        if (splice) {
          onContentSplice(splice);
        }
      } else {
        onContentChange(content);
      }
    },
    [draftContent, node.id, onContentChange, onContentSplice],
  );
  const handleDraftContentSplice = useCallback(
    (splice: ActionEditorTextSplice) => {
      setDraftContentState((currentDraft) => {
        const currentContent = currentDraft.nodeId === node.id ? currentDraft.content : node.content;
        return {
          content:
            currentContent.slice(0, splice.index) +
            splice.insertText +
            currentContent.slice(splice.index + splice.deleteCount),
          nodeId: node.id,
        };
      });
      onContentSplice?.(splice);
    },
    [node.content, node.id, onContentSplice],
  );
  useEffect(() => {
    setDraftContentState((currentDraft) =>
      onContentSplice || currentDraft.nodeId !== node.id
        ? { content: node.content, nodeId: node.id }
        : currentDraft,
    );
  }, [node.content, node.id, onContentSplice]);

  useEffect(() => {
    setActiveWriterRowId(null);
  }, [node.id]);
  const structuralActionLabel =
    structuralStatement?.kind === 'menu'
      ? t('actionEditor.structure.createChoice')
      : structuralStatement?.kind === 'conditional'
        ? t('actionEditor.structure.createConditional')
        : structuralStatement?.kind === 'jump'
          ? t('actionEditor.structure.createJump')
          : structuralStatement?.kind === 'call'
            ? t('actionEditor.structure.createCall')
            : structuralStatement?.kind === 'return'
              ? t('actionEditor.structure.createReturn')
              : t('actionEditor.structure.review');
  const handleNextIntent = useCallback((request: ActionEditorNextActionRequest) => {
    if (request.action === 'return') {
      onNextAction?.(request);
      return;
    }
    setContinuationModal(request.action);
  }, [onNextAction]);

  return (
    <div className="action-editor" role="dialog" aria-label={t('actionEditor.aria')} aria-modal="true">
      <div className="action-editor__surface">
        <header className="action-editor__header">
          <nav className="action-editor__breadcrumb" aria-label={t('actionEditor.location')}>
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
                aria-label={t('actionEditor.editTitle')}
                onChange={(event) => onTitleChange(event.target.value)}
                value={title}
              />
              <EditIcon aria-hidden="true" fontSize="small" />
            </label>
          </nav>

          <div className="action-editor__header-actions">
            <div className="action-editor__mode-history-cluster">
              <div className="action-editor__mode-switch" aria-label={t('actionEditor.mode.aria')}>
                <button
                  className={mode === 'writer' ? 'action-editor__mode-button action-editor__mode-button--active' : 'action-editor__mode-button'}
                  onClick={() => setMode('writer')}
                  type="button"
                >
                  <WorkspacesIcon aria-hidden="true" fontSize="small" />
                  <span>{t('actionEditor.mode.writer')}</span>
                </button>
                <button
                  className={mode === 'raw' ? 'action-editor__mode-button action-editor__mode-button--active' : 'action-editor__mode-button'}
                  onClick={() => setMode('raw')}
                  type="button"
                >
                  <CodeIcon aria-hidden="true" fontSize="small" />
                  <span>{t('actionEditor.mode.raw')}</span>
                </button>
              </div>
              <div className="action-editor__history-actions" aria-label={t('actionEditor.history')}>
                <button className="action-editor__icon-button" type="button" aria-label={t('actionEditor.undo')} title={t('actionEditor.undo')}>
                  <UndoIcon aria-hidden="true" fontSize="small" />
                </button>
                <button className="action-editor__icon-button" type="button" aria-label={t('actionEditor.redo')} title={t('actionEditor.redo')}>
                  <RedoIcon aria-hidden="true" fontSize="small" />
                </button>
              </div>
            </div>
            <div className="action-editor__save-status" aria-label={t('actionEditor.saveStatus')} role="status">
              <span className="action-editor__save-dot" />
              <span>{displayedSaveStatus}</span>
            </div>
            <button className="action-editor__icon-button" type="button" aria-label={t('actionEditor.close')} onClick={onClose}>
              <CloseIcon aria-hidden="true" fontSize="small" />
            </button>
          </div>
        </header>

        <main className={mode === 'raw' ? 'action-editor__body action-editor__body--raw' : 'action-editor__body'}>
          {mode === 'writer' ? (
            <>
              <section className="action-editor__writer-column" aria-label={t('actionEditor.writer.rows')}>
                <ActionEditorWriter
                  assetCatalog={assetCatalog}
                  content={draftContent}
                  onActiveRowChange={setActiveWriterRowId}
                  onContentChange={handleDraftContentChange}
                  onContentSplice={onContentSplice ? handleDraftContentSplice : undefined}
                />
              </section>
              <ActionEditorSidebar
                activeRowId={activeWriterRowId}
                assetCatalog={assetCatalog}
                content={draftContent}
                localAssetUrls={localAssetUrls}
                nextTargetLabels={nextTargetLabels}
                onNextAction={onNextAction ? handleNextIntent : undefined}
              />
            </>
          ) : (
            <section className="action-editor__raw-column">
              {structuralStatement ? (
                <div className="action-editor__raw-structure-review" role="status">
                  <div>
                    <strong>{t('actionEditor.structure.title')}</strong>
                    <span>{structuralStatement.statement}</span>
                  </div>
                  <button type="button">{structuralActionLabel}</button>
                  <button type="button">{t('actionEditor.structure.keepRaw')}</button>
                </div>
              ) : null}
              <ActionEditorRawCodeEditor onChange={handleDraftContentChange} value={draftContent} />
            </section>
          )}
        </main>
      </div>
      {continuationModal === 'conditional' || continuationModal === 'menu' ? (
        <ActionEditorContinuationModal
          kind={continuationModal}
          hasExistingTail={hasExistingTail}
          targetFiles={nextTargetFiles}
          targetLabels={nextTargetLabels ?? []}
          onCancel={() => setContinuationModal(null)}
          onConfirm={(draft) => {
            const commit = async () => {
            if (continuationModal === 'conditional') {
              await onNextAction?.({ action: 'conditional', conditionalDraft: draft as ConditionalContinuationDraft });
            } else {
              await onNextAction?.({ action: 'menu', menuDraft: draft as MenuContinuationDraft });
            }
            setContinuationModal(null);
            };
            void commit();
          }}
        />
      ) : null}
      {continuationModal === 'call' || continuationModal === 'jump' ? (
        <ActionEditorRelationModal
          relationType={continuationModal}
          hasExistingTail={hasExistingTail}
          targetFiles={nextTargetFiles}
          targetLabels={nextTargetLabels ?? []}
          onCancel={() => setContinuationModal(null)}
          onConfirm={(target) => {
            void Promise.resolve(onNextAction?.({ action: continuationModal, target })).then(() => {
              setContinuationModal(null);
            });
          }}
        />
      ) : null}
    </div>
  );
};

export default ActionEditorOverlay;
