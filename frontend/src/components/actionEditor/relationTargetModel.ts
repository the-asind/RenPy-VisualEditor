export interface RelationTargetFileOption {
  id: string;
  path: string;
  codeOnlyReason?: 'renpy_template' | 'no_labels';
}

export interface RelationTargetLabelOption {
  id: string;
  fileId: string;
  qualifiedName: string;
  scope: 'global' | 'local' | 'nested';
}

export interface RelationTargetContext {
  files: RelationTargetFileOption[];
  labels: RelationTargetLabelOption[];
}

export type RelationTargetFileSelection =
  | { kind: 'existing'; fileId: string }
  | { kind: 'new'; path: string };

export interface NewRelationTargetDraft {
  kind: 'new';
  draftId: string;
  file: RelationTargetFileSelection;
  scope: 'global' | 'local';
  ownerLabelId: string | null;
  name: string;
}

export interface ExistingRelationTargetSelection {
  kind: 'existing';
  labelId: string;
}

export type RelationTargetSelection = ExistingRelationTargetSelection | NewRelationTargetDraft;

export interface NormalizedNewRelationTargetDraft extends NewRelationTargetDraft {
  filePath: string;
  qualifiedName: string;
}

export type RelationTargetValidationError = 'required' | 'invalid' | 'duplicate';
export type RelationTargetValidationErrors = Partial<
  Record<'fileId' | 'filePath' | 'scope' | 'ownerLabelId' | 'name', RelationTargetValidationError>
>;

export type RelationTargetValidationResult =
  | { ok: true; errors: Record<string, never>; value: NormalizedNewRelationTargetDraft }
  | { ok: false; errors: RelationTargetValidationErrors };

const RENPY_NAME_COMPONENT = /^[a-zA-Z_\u00a0-\ufffd][0-9a-zA-Z_\u00a0-\ufffd]*$/u;
const RENPY_NAME_KEYWORDS = new Set(['as', 'if', 'in', 'return', 'with', 'while']);
const WINDOWS_RESERVED_FILE = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;
const INVALID_FILE_SEGMENT_CHARACTER = /[<>:"|?*\u0000-\u001f]/u;
const WINDOWS_MAX_PATH_CHARACTERS = 259;
const WINDOWS_MAX_COMPONENT_CHARACTERS = 255;

export const createDefaultNewRelationTargetDraft = (draftId: string): NewRelationTargetDraft => ({
  kind: 'new',
  draftId,
  file: { kind: 'existing', fileId: '' },
  scope: 'global',
  ownerLabelId: null,
  name: '',
});

export const normalizeRelationTargetFilePath = (path: string): string | null => {
  const candidate = path.replace(/\\/g, '/');
  if (
    candidate !== candidate.trim() ||
    !candidate ||
    candidate.startsWith('/') ||
    /^[A-Za-z]:/.test(candidate)
  ) {
    return null;
  }

  const parts = candidate.split('/');
  const filename = parts.at(-1) ?? '';
  if (!filename.toLocaleLowerCase().endsWith('.rpy')) {
    if (filename.includes('.')) return null;
    parts[parts.length - 1] = `${filename}.rpy`;
  } else {
    if (!filename.slice(0, -4)) return null;
    parts[parts.length - 1] = `${filename.slice(0, -4)}.rpy`;
  }
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.length > WINDOWS_MAX_COMPONENT_CHARACTERS ||
        part.endsWith('.') ||
        part.endsWith(' ') ||
        INVALID_FILE_SEGMENT_CHARACTER.test(part) ||
        WINDOWS_RESERVED_FILE.test(part),
    )
  ) {
    return null;
  }

  const normalized = parts.join('/');
  return normalized.length <= WINDOWS_MAX_PATH_CHARACTERS ? normalized : null;
};

export const isValidRenpyNameComponent = (name: string): boolean =>
  name === name.trim() &&
  name.length > 0 &&
  name.length <= 200 &&
  RENPY_NAME_COMPONENT.test(name) &&
  !RENPY_NAME_KEYWORDS.has(name);

export const validateNewRelationTargetDraft = (
  draft: NewRelationTargetDraft,
  context: RelationTargetContext,
): RelationTargetValidationResult => {
  const errors: RelationTargetValidationErrors = {};
  let destinationFile: RelationTargetFileOption | undefined;
  let filePath = '';
  let normalizedFile: RelationTargetFileSelection = draft.file;

  if (draft.file.kind === 'existing') {
    if (!draft.file.fileId) {
      errors.fileId = 'required';
    } else {
      destinationFile = context.files.find((file) => file.id === draft.file.fileId);
      if (!destinationFile || destinationFile.codeOnlyReason === 'renpy_template') {
        errors.fileId = 'invalid';
      } else {
        filePath = destinationFile.path;
      }
    }
  } else {
    const normalizedPath = normalizeRelationTargetFilePath(draft.file.path);
    if (!draft.file.path) {
      errors.filePath = 'required';
    } else if (!normalizedPath) {
      errors.filePath = 'invalid';
    } else if (context.files.some((file) => file.path.replace(/\\/g, '/').toLocaleLowerCase() === normalizedPath.toLocaleLowerCase())) {
      errors.filePath = 'duplicate';
    } else {
      filePath = normalizedPath;
      normalizedFile = { kind: 'new', path: normalizedPath };
    }
  }

  if (!draft.name) {
    errors.name = 'required';
  } else if (!isValidRenpyNameComponent(draft.name)) {
    errors.name = 'invalid';
  }

  let owner: RelationTargetLabelOption | undefined;
  let qualifiedName = draft.name;
  if (draft.scope === 'local') {
    if (draft.file.kind === 'new') {
      errors.scope = 'invalid';
    }
    if (!draft.ownerLabelId) {
      errors.ownerLabelId = 'required';
    } else {
      owner = context.labels.find((label) => label.id === draft.ownerLabelId);
      if (
        !owner ||
        owner.scope !== 'global' ||
        draft.file.kind !== 'existing' ||
        owner.fileId !== draft.file.fileId
      ) {
        errors.ownerLabelId = 'invalid';
      } else {
        qualifiedName = `${owner.qualifiedName}.${draft.name}`;
      }
    }
  }

  if (!errors.name && context.labels.some((label) => label.qualifiedName === qualifiedName)) {
    errors.name = 'duplicate';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: {},
    value: {
      ...draft,
      file: normalizedFile,
      ownerLabelId: draft.scope === 'local' ? owner!.id : null,
      filePath,
      qualifiedName,
    },
  };
};
