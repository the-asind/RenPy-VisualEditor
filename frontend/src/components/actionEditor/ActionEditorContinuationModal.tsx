import { useState } from 'react';

import {
  actionLeaf,
  defaultConditionalContinuationDraft,
  defaultMenuContinuationDraft,
  parseConditionalContinuationRaw,
  parseMenuContinuationRaw,
  validateConditionalContinuationDraft,
  validateMenuContinuationDraft,
  type ConditionalContinuationDraft,
  type ContinuationLeafDraft,
  type MenuContinuationDraft,
} from './actionEditorContinuation';
import { ActionEditorRelationModal } from './ActionEditorRelationModal';
import type { ActionEditorNextTargetLabel } from './ActionEditorSidebar';
import type { RelationTargetFileOption, RelationTargetSelection } from './relationTargetModel';

export interface ActionEditorContinuationModalProps {
  kind: 'conditional' | 'menu';
  targetLabels: ActionEditorNextTargetLabel[];
  targetFiles?: RelationTargetFileOption[];
  hasExistingTail?: boolean;
  onCancel: () => void;
  onConfirm: (draft: ConditionalContinuationDraft | MenuContinuationDraft) => void;
}

interface PendingRelation {
  type: 'call' | 'jump';
  currentTarget: string;
  apply: (leaf: ContinuationLeafDraft) => void;
}

const existingTargetLabelId = (leaf: ContinuationLeafDraft): string =>
  leaf.kind === 'call' || leaf.kind === 'jump'
    ? leaf.target.kind === 'existing'
      ? leaf.target.labelId
      : ''
    : '';

const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const LeafEditor = ({
  leaf,
  onChange,
  openRelation,
}: {
  leaf: ContinuationLeafDraft;
  onChange: (leaf: ContinuationLeafDraft) => void;
  openRelation: (type: 'call' | 'jump', apply: (leaf: ContinuationLeafDraft) => void, currentTarget: string) => void;
}) => (
  <div className="action-editor-continuation-leaf">
    <div className="action-editor-continuation-leaf__types" role="group" aria-label="Continuation type">
      {(['action', 'call', 'jump'] as const).map((type) => (
        <button
          aria-pressed={leaf.kind === type}
          key={type}
          onClick={() => {
            if (type === 'action') {
              onChange(actionLeaf(leaf.kind === 'action' ? leaf.comment : ''));
            } else {
              const currentTarget = leaf.kind === type ? existingTargetLabelId(leaf) : '';
              openRelation(type, onChange, currentTarget);
            }
          }}
          type="button"
        >
          {type.toUpperCase()}
        </button>
      ))}
    </div>
    {leaf.kind === 'action' ? (
      <label className="action-editor-modal__field">
        <span>Intent comment (optional)</span>
        <textarea
          onChange={(event) => onChange({ kind: 'action', comment: event.target.value })}
          placeholder="What should be written here later?"
          value={leaf.comment}
        />
      </label>
    ) : (
      <button onClick={() => openRelation(leaf.kind, onChange, existingTargetLabelId(leaf))} type="button">
        {existingTargetLabelId(leaf) ? 'Change destination' : 'Choose destination'}
      </button>
    )}
  </div>
);

export const ActionEditorContinuationModal = ({
  kind,
  targetLabels,
  targetFiles = [],
  hasExistingTail = false,
  onCancel,
  onConfirm,
}: ActionEditorContinuationModalProps) => {
  const [conditionalDraft, setConditionalDraft] = useState(defaultConditionalContinuationDraft);
  const [menuDraft, setMenuDraft] = useState(defaultMenuContinuationDraft);
  const [pendingRelation, setPendingRelation] = useState<PendingRelation | null>(null);
  const draft = kind === 'conditional' ? conditionalDraft : menuDraft;
  const rawResult = draft.mode === 'raw'
    ? kind === 'conditional'
      ? parseConditionalContinuationRaw(draft.raw, targetLabels)
      : parseMenuContinuationRaw(draft.raw, targetLabels)
    : null;
  const effectiveDraft = rawResult?.ok ? rawResult.draft : draft;
  const validation = rawResult && !rawResult.ok
    ? { ok: false as const, errors: { raw: 'invalid' as const } }
    : kind === 'conditional'
      ? validateConditionalContinuationDraft(effectiveDraft as ConditionalContinuationDraft)
      : validateMenuContinuationDraft(effectiveDraft as MenuContinuationDraft);
  const openRelation = (
    type: 'call' | 'jump',
    apply: (leaf: ContinuationLeafDraft) => void,
    currentTarget: string,
  ) => setPendingRelation({ type, apply, currentTarget });

  const setIfContinuation = (continuation: ContinuationLeafDraft) =>
    setConditionalDraft((current) => ({ ...current, ifBranch: { ...current.ifBranch, continuation } }));

  return (
    <div aria-label={kind === 'conditional' ? 'Create conditional path' : 'Create player choice'} aria-modal="true" className="action-editor-modal" role="dialog">
      <div className="action-editor-modal__backdrop" />
      <section className="action-editor-modal__surface action-editor-modal__surface--constructor">
        <header>
          <div>
            <small>{kind === 'conditional' ? 'IF / ELIF / ELSE' : 'MENU'}</small>
            <h2>{kind === 'conditional' ? 'Create conditional path' : 'Create player choice'}</h2>
          </div>
          <button aria-label="Close constructor" onClick={onCancel} type="button">×</button>
        </header>
        <div className="action-editor-modal__mode" role="group" aria-label="Constructor mode">
          <button aria-pressed={draft.mode === 'structured'} onClick={() => kind === 'conditional' ? setConditionalDraft((current) => ({ ...current, mode: 'structured' })) : setMenuDraft((current) => ({ ...current, mode: 'structured' }))} type="button">Structured</button>
          <button aria-pressed={draft.mode === 'raw'} onClick={() => kind === 'conditional' ? setConditionalDraft((current) => ({ ...current, mode: 'raw' })) : setMenuDraft((current) => ({ ...current, mode: 'raw' }))} type="button">Raw</button>
        </div>
        {draft.mode === 'raw' ? (
          <label className="action-editor-modal__field">
            <span>Raw Ren'Py structure</span>
            <textarea value={draft.raw} onChange={(event) => kind === 'conditional' ? setConditionalDraft((current) => ({ ...current, raw: event.target.value })) : setMenuDraft((current) => ({ ...current, raw: event.target.value }))} />
          </label>
        ) : kind === 'conditional' ? (
          <div className="action-editor-constructor">
            <article className="action-editor-branch-card action-editor-branch-card--if">
              <label className="action-editor-modal__field"><span>IF condition</span><input value={conditionalDraft.ifBranch.condition} onChange={(event) => setConditionalDraft((current) => ({ ...current, ifBranch: { ...current.ifBranch, condition: event.target.value } }))} /></label>
              <LeafEditor leaf={conditionalDraft.ifBranch.continuation} onChange={setIfContinuation} openRelation={openRelation} />
            </article>
            {conditionalDraft.elifBranches.map((branch, index) => (
              <article className="action-editor-branch-card" key={branch.id}>
                <header><strong>ELIF {index + 1}</strong><span><button aria-label={`Move ELIF ${index + 1} up`} disabled={index === 0} onClick={() => setConditionalDraft((current) => ({ ...current, elifBranches: moveItem(current.elifBranches, index, index - 1) }))} type="button">↑</button><button aria-label={`Move ELIF ${index + 1} down`} disabled={index === conditionalDraft.elifBranches.length - 1} onClick={() => setConditionalDraft((current) => ({ ...current, elifBranches: moveItem(current.elifBranches, index, index + 1) }))} type="button">↓</button><button onClick={() => setConditionalDraft((current) => ({ ...current, elifBranches: current.elifBranches.filter((candidate) => candidate.id !== branch.id) }))} type="button">Remove</button></span></header>
                <label className="action-editor-modal__field"><span>ELIF condition</span><input value={branch.condition} onChange={(event) => setConditionalDraft((current) => ({ ...current, elifBranches: current.elifBranches.map((candidate) => candidate.id === branch.id ? { ...candidate, condition: event.target.value } : candidate) }))} /></label>
                <LeafEditor leaf={branch.continuation} onChange={(continuation) => setConditionalDraft((current) => ({ ...current, elifBranches: current.elifBranches.map((candidate) => candidate.id === branch.id ? { ...candidate, continuation } : candidate) }))} openRelation={openRelation} />
              </article>
            ))}
            {conditionalDraft.elseBranch ? (
              <article className="action-editor-branch-card action-editor-branch-card--else">
                <header><strong>ELSE</strong><button onClick={() => setConditionalDraft((current) => ({ ...current, elseBranch: null }))} type="button">Remove</button></header>
                <LeafEditor leaf={conditionalDraft.elseBranch.continuation} onChange={(continuation) => setConditionalDraft((current) => ({ ...current, elseBranch: { continuation } }))} openRelation={openRelation} />
              </article>
            ) : null}
            <div className="action-editor-constructor__add">
              <button onClick={() => setConditionalDraft((current) => ({ ...current, elifBranches: [...current.elifBranches, { id: `elif-${Date.now()}-${current.elifBranches.length}`, condition: '', continuation: actionLeaf() }] }))} type="button">Add ELIF</button>
              {!conditionalDraft.elseBranch ? <button onClick={() => setConditionalDraft((current) => ({ ...current, elseBranch: { continuation: actionLeaf() } }))} type="button">Add ELSE</button> : null}
            </div>
          </div>
        ) : (
          <div className="action-editor-constructor">
            <label className="action-editor-modal__field"><span>Prompt (optional)</span><input value={menuDraft.prompt} onChange={(event) => setMenuDraft((current) => ({ ...current, prompt: event.target.value }))} /></label>
            {menuDraft.choices.map((choice, index) => (
              <article className="action-editor-branch-card action-editor-branch-card--choice" key={choice.id}>
                <header><strong>Choice {index + 1}</strong><span><button aria-label={`Move choice ${index + 1} up`} disabled={index === 0} onClick={() => setMenuDraft((current) => ({ ...current, choices: moveItem(current.choices, index, index - 1) }))} type="button">↑</button><button aria-label={`Move choice ${index + 1} down`} disabled={index === menuDraft.choices.length - 1} onClick={() => setMenuDraft((current) => ({ ...current, choices: moveItem(current.choices, index, index + 1) }))} type="button">↓</button>{menuDraft.choices.length > 1 ? <button onClick={() => setMenuDraft((current) => ({ ...current, choices: current.choices.filter((candidate) => candidate.id !== choice.id) }))} type="button">Remove</button> : null}</span></header>
                <label className="action-editor-modal__field"><span>Choice text</span><input value={choice.text} onChange={(event) => setMenuDraft((current) => ({ ...current, choices: current.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, text: event.target.value } : candidate) }))} /></label>
                <label className="action-editor-modal__field"><span>Condition (optional)</span><input value={choice.condition} onChange={(event) => setMenuDraft((current) => ({ ...current, choices: current.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, condition: event.target.value } : candidate) }))} /></label>
                <LeafEditor leaf={choice.continuation} onChange={(continuation) => setMenuDraft((current) => ({ ...current, choices: current.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, continuation } : candidate) }))} openRelation={openRelation} />
              </article>
            ))}
            <button onClick={() => setMenuDraft((current) => ({ ...current, choices: [...current.choices, { id: `choice-${Date.now()}-${current.choices.length}`, text: '', condition: '', continuation: actionLeaf() }] }))} type="button">Add choice</button>
          </div>
        )}
        {hasExistingTail ? <p className="action-editor-modal__warning">A terminal JUMP branch will leave the existing continuation stored but unreachable from that branch.</p> : null}
        {!validation.ok ? <p className="action-editor-modal__error">{rawResult && !rawResult.ok ? `Raw structure cannot be mapped safely: ${rawResult.error}.` : 'Complete the required fields before creating this structure.'}</p> : null}
        <footer><button onClick={onCancel} type="button">Cancel</button><button className="action-editor-modal__primary" disabled={!validation.ok} onClick={() => onConfirm(effectiveDraft)} type="button">Create structure</button></footer>
      </section>
      {pendingRelation ? (
        <ActionEditorRelationModal
          initialTargetLabelId={pendingRelation.currentTarget}
          relationType={pendingRelation.type}
          targetFiles={targetFiles}
          targetLabels={targetLabels}
          onCancel={() => setPendingRelation(null)}
          onConfirm={(target: RelationTargetSelection) => {
            pendingRelation.apply({ kind: pendingRelation.type, target });
            setPendingRelation(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default ActionEditorContinuationModal;
