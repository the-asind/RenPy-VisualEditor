export interface ProjectTag {
  name: string;
  color: string;
}

export const MAX_TAG_LENGTH = 13;

export const TAG_COLOR_OPTIONS: string[] = [
  '#6C757D',
  '#5E60CE',
  '#48BFE3',
  '#56CFE1',
  '#80FF72',
  '#FFD166',
  '#FF6B6B',
  '#FF9F9C',
  '#C77DFF',
  '#F72585',
  '#2EC4B6',
  '#4D908E',
];

export const DEFAULT_TAG_COLOR = TAG_COLOR_OPTIONS[0];

const STORAGE_PREFIX = 'renpy-project-tags';

const sanitizeTag = (tag: ProjectTag): ProjectTag => ({
  name: tag.name.trim().slice(0, MAX_TAG_LENGTH),
  color: tag.color.trim(),
});

export const loadProjectTags = (projectId: string | number | null | undefined): ProjectTag[] => {
  if (!projectId) {
    return [];
  }

  try {
    const key = `${STORAGE_PREFIX}:${projectId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => ({ name: String(entry?.name ?? ''), color: String(entry?.color ?? DEFAULT_TAG_COLOR) }))
      .filter((entry) => entry.name.trim().length > 0)
      .map(sanitizeTag);
  } catch (error) {
    console.warn('Failed to load project tags from storage:', error);
    return [];
  }
};

export const persistProjectTags = (projectId: string | number | null | undefined, tags: ProjectTag[]): void => {
  if (!projectId) {
    return;
  }

  try {
    const key = `${STORAGE_PREFIX}:${projectId}`;
    localStorage.setItem(key, JSON.stringify(tags.map(sanitizeTag)));
  } catch (error) {
    console.warn('Failed to persist project tags:', error);
  }
};

const normalizeTagName = (name: string): string => name.trim().toLowerCase();

export const upsertProjectTag = (tags: ProjectTag[], newTag: ProjectTag): ProjectTag[] => {
  const sanitized = sanitizeTag(newTag);
  const normalized = normalizeTagName(sanitized.name);

  const filtered = tags.filter((tag) => normalizeTagName(tag.name) !== normalized);
  return [...filtered, sanitized];
};

export const sortProjectTags = (tags: ProjectTag[]): ProjectTag[] =>
  [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
