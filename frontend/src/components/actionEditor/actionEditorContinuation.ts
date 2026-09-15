import type { RelationTargetSelection } from './relationTargetModel';

export type ContinuationLeafDraft =
  | { kind: 'action'; comment: string; content?: string }
  | { kind: 'call' | 'jump'; target: RelationTargetSelection };

export interface ConditionalContinuationBranchDraft {
  condition: string;
  continuation: ContinuationLeafDraft;
}

export interface ConditionalContinuationDraft {
  mode: 'structured' | 'raw';
  ifBranch: ConditionalContinuationBranchDraft;
  elifBranches: Array<ConditionalContinuationBranchDraft & { id: string }>;
  elseBranch: { continuation: ContinuationLeafDraft } | null;
  raw: string;
}

export interface MenuContinuationChoiceDraft {
  id: string;
  text: string;
  condition: string;
  continuation: ContinuationLeafDraft;
}

export interface MenuContinuationDraft {
  mode: 'structured' | 'raw';
  prompt: string;
  choices: MenuContinuationChoiceDraft[];
  raw: string;
}

export type ContinuationValidationResult =
  | { ok: true; errors: Record<string, never> }
  | { ok: false; errors: Record<string, 'required' | 'invalid' | 'too-long'> };

export const actionLeaf = (comment = ''): ContinuationLeafDraft => ({ kind: 'action', comment });
export const existingRelationTarget = (labelId: string): RelationTargetSelection => ({ kind: 'existing', labelId });

const validateLeaf = (
  leaf: ContinuationLeafDraft,
  field: string,
  errors: Record<string, 'required' | 'invalid' | 'too-long'>,
): void => {
  if (leaf.kind === 'call' || leaf.kind === 'jump') {
    if (leaf.target.kind === 'existing' && !leaf.target.labelId.trim()) {
      errors[`${field}.target`] = 'required';
    }
    if (leaf.target.kind === 'new' && (!leaf.target.draftId || !leaf.target.name)) {
      errors[`${field}.target`] = 'required';
    }
  }
  if (leaf.kind === 'action' && leaf.comment.length > 2_000) {
    errors[`${field}.comment`] = 'too-long';
  }
  if (leaf.kind === 'action' && (leaf.content?.length ?? 0) > 20_000) {
    errors[`${field}.content`] = 'too-long';
  }
};

const resultForErrors = (
  errors: Record<string, 'required' | 'invalid' | 'too-long'>,
): ContinuationValidationResult =>
  Object.keys(errors).length === 0
    ? { ok: true, errors: {} }
    : { ok: false, errors };

export const validateConditionalContinuationDraft = (
  draft: ConditionalContinuationDraft,
): ContinuationValidationResult => {
  const errors: Record<string, 'required' | 'invalid' | 'too-long'> = {};
  if (!draft.ifBranch.condition.trim()) {
    errors['if.condition'] = 'required';
  }
  validateLeaf(draft.ifBranch.continuation, 'if', errors);
  for (const branch of draft.elifBranches) {
    if (!branch.condition.trim()) {
      errors[`elif.${branch.id}.condition`] = 'required';
    }
    validateLeaf(branch.continuation, `elif.${branch.id}`, errors);
  }
  if (draft.elseBranch) {
    validateLeaf(draft.elseBranch.continuation, 'else', errors);
  }
  return resultForErrors(errors);
};

export const validateMenuContinuationDraft = (draft: MenuContinuationDraft): ContinuationValidationResult => {
  const errors: Record<string, 'required' | 'invalid' | 'too-long'> = {};
  if (draft.choices.length === 0) {
    errors.choices = 'required';
  }
  for (const choice of draft.choices) {
    if (!choice.text.trim()) {
      errors[`choice.${choice.id}.text`] = 'required';
    }
    validateLeaf(choice.continuation, `choice.${choice.id}`, errors);
  }
  return resultForErrors(errors);
};

export const serializeActionPlaceholder = (comment: string): string => {
  const comments = comment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `# ${line}`);
  return [...comments, 'pass'].join('\n');
};

export const defaultConditionalContinuationDraft = (): ConditionalContinuationDraft => ({
  mode: 'structured',
  ifBranch: { condition: '', continuation: actionLeaf() },
  elifBranches: [],
  elseBranch: null,
  raw: '',
});

export const defaultMenuContinuationDraft = (): MenuContinuationDraft => ({
  mode: 'structured',
  prompt: '',
  choices: [{ id: 'choice-1', text: '', condition: '', continuation: actionLeaf() }],
  raw: '',
});

export interface ContinuationRawTargetLabel {
  id: string;
  qualifiedName: string;
}

export type ContinuationRawParseResult<T> = { ok: true; draft: T } | { ok: false; error: string };

const indentation = (line: string): number => line.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0;
const deindent = (lines: string[]): string[] => {
  const nonEmpty = lines.filter((line) => line.trim());
  const amount = nonEmpty.length ? Math.min(...nonEmpty.map(indentation)) : 0;
  return lines.map((line) => line.slice(Math.min(amount, line.length))).filter((line) => line.trim());
};

const parseRawLeaf = (
  sourceLines: string[],
  labels: ContinuationRawTargetLabel[],
): ContinuationRawParseResult<ContinuationLeafDraft> => {
  const lines = deindent(sourceLines);
  const executable = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  if (executable.length === 0) {
    return { ok: true, draft: { kind: 'action', comment: '', content: [...lines, 'pass'].join('\n') } };
  }
  if (executable.some((line) => /^(?:if|elif|else|menu|label|while|for|screen|python)\b/.test(line))) {
    return { ok: false, error: 'unsupported-nesting' };
  }
  const relation = executable.length === 1 ? executable[0].match(/^(call|jump)\s+([A-Za-z_][A-Za-z0-9_.]*)$/) : null;
  if (relation) {
    const target = labels.find((label) => label.qualifiedName === relation[2]);
    return target
      ? { ok: true, draft: { kind: relation[1] as 'call' | 'jump', target: existingRelationTarget(target.id) } }
      : { ok: false, error: 'unknown-target' };
  }
  if (executable.some((line) => /^(?:call|jump|return)\b/.test(line))) {
    return { ok: false, error: 'unsupported-nesting' };
  }
  return { ok: true, draft: { kind: 'action', comment: '', content: lines.join('\n') } };
};

export const parseConditionalContinuationRaw = (
  raw: string,
  labels: ContinuationRawTargetLabel[],
): ContinuationRawParseResult<ConditionalContinuationDraft> => {
  const lines = raw.split(/\r?\n/);
  const branches: Array<{ type: 'if' | 'elif' | 'else'; condition: string; body: string[] }> = [];
  let current: (typeof branches)[number] | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      if (current) current.body.push(line);
      continue;
    }
    if (indentation(line) === 0) {
      const heading = line.trim().match(/^(if|elif)\s+(.+):$/);
      const elseHeading = line.trim() === 'else:';
      if (!heading && !elseHeading) return { ok: false, error: 'invalid-branch' };
      current = { type: elseHeading ? 'else' : heading![1] as 'if' | 'elif', condition: heading?.[2]?.trim() ?? '', body: [] };
      branches.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      return { ok: false, error: 'invalid-indentation' };
    }
  }
  if (branches.length === 0 || branches[0].type !== 'if' || branches.slice(1).some((branch, index) => branch.type === 'if' || (branch.type === 'else' && index !== branches.length - 2))) {
    return { ok: false, error: 'invalid-branch-order' };
  }
  const leaves = branches.map((branch) => parseRawLeaf(branch.body, labels));
  const failed = leaves.find((leaf) => !leaf.ok);
  if (failed && !failed.ok) return failed;
  const resolved = leaves.map((leaf) => (leaf as { ok: true; draft: ContinuationLeafDraft }).draft);
  return {
    ok: true,
    draft: {
      mode: 'raw',
      raw,
      ifBranch: { condition: branches[0].condition, continuation: resolved[0] },
      elifBranches: branches.flatMap((branch, index) => branch.type === 'elif' ? [{ id: `raw-elif-${index}`, condition: branch.condition, continuation: resolved[index] }] : []),
      elseBranch: branches.at(-1)?.type === 'else' ? { continuation: resolved.at(-1)! } : null,
    },
  };
};

export const parseMenuContinuationRaw = (
  raw: string,
  labels: ContinuationRawTargetLabel[],
): ContinuationRawParseResult<MenuContinuationDraft> => {
  const lines = raw.split(/\r?\n/);
  if (lines.find((line) => line.trim())?.trim() !== 'menu:') return { ok: false, error: 'invalid-menu' };
  let prompt = '';
  const choices: MenuContinuationChoiceDraft[] = [];
  for (let index = 1; index < lines.length;) {
    if (!lines[index].trim()) { index += 1; continue; }
    if (indentation(lines[index]) !== 4) return { ok: false, error: 'invalid-indentation' };
    const trimmed = lines[index].trim();
    const choice = trimmed.match(/^"((?:\\.|[^"\\])*)"(?:\s+if\s+(.+))?:$/);
    if (!choice) {
      const promptMatch = trimmed.match(/^"((?:\\.|[^"\\])*)"$/);
      if (!promptMatch || prompt || choices.length > 0) return { ok: false, error: 'invalid-choice' };
      prompt = promptMatch[1].replace(/\\"/g, '"');
      index += 1;
      continue;
    }
    const body: string[] = [];
    index += 1;
    while (index < lines.length && (!lines[index].trim() || indentation(lines[index]) > 4)) {
      body.push(lines[index]);
      index += 1;
    }
    const leaf = parseRawLeaf(body, labels);
    if (!leaf.ok) return leaf;
    choices.push({ id: `raw-choice-${choices.length}`, text: choice[1].replace(/\\"/g, '"'), condition: choice[2]?.trim() ?? '', continuation: leaf.draft });
  }
  return choices.length > 0
    ? { ok: true, draft: { mode: 'raw', raw, prompt, choices } }
    : { ok: false, error: 'invalid-choice' };
};
