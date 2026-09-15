import { useMemo, useState } from 'react';

import type { ActionEditorNextTargetLabel } from './ActionEditorSidebar';
import { existingRelationTarget } from './actionEditorContinuation';
import {
  createDefaultNewRelationTargetDraft,
  validateNewRelationTargetDraft,
  type RelationTargetFileOption,
  type RelationTargetSelection,
} from './relationTargetModel';

export interface ActionEditorRelationModalProps {
  relationType: 'call' | 'jump';
  targetLabels: ActionEditorNextTargetLabel[];
  targetFiles?: RelationTargetFileOption[];
  initialTargetLabelId?: string;
  hasExistingTail?: boolean;
  onCancel: () => void;
  onConfirm: (target: RelationTargetSelection) => void;
}

export const ActionEditorRelationModal = ({
  relationType,
  targetLabels,
  targetFiles = [],
  initialTargetLabelId = '',
  hasExistingTail = false,
  onCancel,
  onConfirm,
}: ActionEditorRelationModalProps) => {
  const [query, setQuery] = useState('');
  const [selectedTargetLabelId, setSelectedTargetLabelId] = useState(initialTargetLabelId);
  const [draft, setDraft] = useState(() => createDefaultNewRelationTargetDraft(`draft-${Date.now()}`));
  const filteredLabels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? targetLabels.filter((label) => label.qualifiedName.toLocaleLowerCase().includes(normalizedQuery))
      : targetLabels;
  }, [query, targetLabels]);
  const validation = validateNewRelationTargetDraft(draft, {
    files: targetFiles,
    labels: targetLabels.map((label) => ({
      id: label.id,
      fileId: label.fileId ?? '',
      qualifiedName: label.qualifiedName,
      scope: label.scope === 'global' || label.scope === 'local' || label.scope === 'nested' ? label.scope : 'global',
    })),
  });
  const globalOwners = targetLabels.filter((label) => label.scope === 'global');

  return (
    <div
      aria-label={`Choose ${relationType} target`}
      aria-modal="true"
      className="action-editor-modal action-editor-modal--relation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
      role="dialog"
    >
      <div className="action-editor-modal__backdrop" />
      <section className="action-editor-modal__surface">
        <header>
          <div>
            <small>{relationType.toUpperCase()}</small>
            <h2>Choose destination label</h2>
          </div>
          <button aria-label="Close target picker" onClick={onCancel} type="button">×</button>
        </header>
        <label className="action-editor-modal__field">
          <span>Search labels</span>
          <input autoFocus onChange={(event) => setQuery(event.target.value)} value={query} />
        </label>
        <div aria-label="Destination labels" className="action-editor-relation-list" role="listbox">
          {filteredLabels.map((label) => (
            <button
              aria-selected={selectedTargetLabelId === label.id}
              className={selectedTargetLabelId === label.id ? 'action-editor-relation-list__item action-editor-relation-list__item--selected' : 'action-editor-relation-list__item'}
              key={label.id}
              onClick={() => setSelectedTargetLabelId(label.id)}
              role="option"
              type="button"
            >
              <strong>{label.qualifiedName}</strong>
              <small>{[label.current ? 'Current label' : null, label.filePath, label.scope, `LabelStartNode · ${label.labelStartNodeId}`].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          {filteredLabels.length === 0 ? <p>No matching labels</p> : null}
        </div>
        <section className="action-editor-modal__create-target" aria-label="Create new label">
          <h3>Create new label</h3>
          <div role="group" aria-label="New label scope">
            <button
              aria-pressed={draft.scope === 'global'}
              onClick={() => setDraft((current) => ({ ...current, scope: 'global', ownerLabelId: null }))}
              type="button"
            >
              Global label
            </button>
            <button
              aria-pressed={draft.scope === 'local'}
              onClick={() => setDraft((current) => ({ ...current, scope: 'local' }))}
              type="button"
            >
              Local label
            </button>
          </div>
          <label className="action-editor-modal__field">
            <span>Existing file</span>
            <select
              onChange={(event) => setDraft((current) => ({ ...current, file: { kind: 'existing', fileId: event.target.value } }))}
              value={draft.file.kind === 'existing' ? draft.file.fileId : ''}
            >
              <option value="">Choose file</option>
              {targetFiles.map((file) => (
                <option key={file.id} value={file.id}>{file.path}</option>
              ))}
            </select>
          </label>
          <label className="action-editor-modal__field">
            <span>New file path</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, file: { kind: 'new', path: event.target.value } }))}
              placeholder="chapters/cheese_heist.rpy"
              value={draft.file.kind === 'new' ? draft.file.path : ''}
            />
          </label>
          {draft.scope === 'local' ? (
            <label className="action-editor-modal__field">
              <span>Owner global label</span>
              <select
                onChange={(event) => setDraft((current) => ({ ...current, ownerLabelId: event.target.value || null }))}
                value={draft.ownerLabelId ?? ''}
              >
                <option value="">Choose owner</option>
                {globalOwners.map((label) => (
                  <option key={label.id} value={label.id}>{label.qualifiedName}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="action-editor-modal__field">
            <span>Label name</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="cheese_heist"
              value={draft.name}
            />
          </label>
          {!validation.ok ? <small>Only valid missing Ren'Py labels/files can be created.</small> : null}
          <button
            disabled={!validation.ok}
            onClick={() => {
              if (validation.ok) {
                onConfirm(validation.value);
              }
            }}
            type="button"
          >
            Create target
          </button>
        </section>
        {hasExistingTail && relationType === 'jump' ? (
          <p className="action-editor-modal__warning">
            The existing continuation will remain stored, but this JUMP makes it unreachable from the selected action.
          </p>
        ) : null}
        <footer>
          <button onClick={onCancel} type="button">Cancel</button>
          <button
            className="action-editor-modal__primary"
            disabled={!selectedTargetLabelId}
            onClick={() => onConfirm(existingRelationTarget(selectedTargetLabelId))}
            type="button"
          >
            Create {relationType}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default ActionEditorRelationModal;
