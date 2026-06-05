import type { ProjectAssetCatalogEntry, ProjectAssetCatalogPayload } from './localRenpyDirectory';

export interface ActionEditorResolvedAsset {
  name: string;
  path: string | null;
  url: string | null;
  localAvailable: boolean;
}

export interface ActionEditorAssetContext {
  imageEntries: ProjectAssetCatalogEntry[];
  audioEntries: ProjectAssetCatalogEntry[];
  characterImages: Record<string, string>;
  localAssetUrls: Record<string, string>;
}

export interface LocalAudioPreviewHandle {
  currentTime: number;
  pause: () => void;
  play: () => Promise<void>;
}

export type LocalAudioConstructor = new (url: string) => LocalAudioPreviewHandle;

let activeAudioPreview: { audio: LocalAudioPreviewHandle; url: string } | null = null;

export const stopLocalAudioPreview = (): void => {
  if (!activeAudioPreview) {
    return;
  }
  activeAudioPreview.audio.pause();
  activeAudioPreview.audio.currentTime = 0;
  activeAudioPreview = null;
};

const normalizeLookup = (value: string): string =>
  value.trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/\s+/g, ' ');

const withoutExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? name : name.slice(0, dotIndex);
};

const pathWithoutExtension = (path: string): string => withoutExtension(path.replace(/^images\//i, '').replace(/\//g, ' '));

const imageCandidates = (entry: ProjectAssetCatalogEntry): string[] => {
  const basename = withoutExtension(entry.name);
  const fullPathName = pathWithoutExtension(entry.path);
  const parts = entry.path.split('/');
  const parent = parts.length > 2 ? parts.at(-2) ?? '' : '';
  const parentAndName = parent && !basename.toLowerCase().startsWith(parent.toLowerCase())
    ? `${parent} ${basename}`
    : basename;
  return Array.from(new Set([...(entry.renpyNames ?? []), fullPathName, parentAndName, basename].filter(Boolean)));
};

const audioCandidates = (entry: ProjectAssetCatalogEntry): string[] => {
  const basename = withoutExtension(entry.name);
  const pathWithoutPrefix = entry.path.replace(/^audio\//i, '');
  return Array.from(new Set([...(entry.renpyNames ?? []), entry.name, basename, entry.path, pathWithoutPrefix, withoutExtension(pathWithoutPrefix)].filter(Boolean)));
};

export const buildActionEditorAssetContext = (
  catalog: ProjectAssetCatalogPayload | null | undefined,
  localAssetUrls: Record<string, string> = {},
): ActionEditorAssetContext => ({
  imageEntries: catalog?.entries.filter((entry) => entry.kind === 'image') ?? [],
  audioEntries: catalog?.entries.filter((entry) => entry.kind === 'audio') ?? [],
  characterImages: catalog?.characterImages ?? {},
  localAssetUrls,
});

export const suggestImageNames = (catalog: ProjectAssetCatalogPayload | null | undefined): string[] => {
  const names = new Set<string>();
  for (const entry of catalog?.entries ?? []) {
    if (entry.kind === 'image') {
      for (const candidate of imageCandidates(entry)) {
        names.add(candidate);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export const resolveImageAsset = (
  context: ActionEditorAssetContext,
  name: string,
): ActionEditorResolvedAsset => {
  const lookup = normalizeLookup(name);
  const entry = context.imageEntries.find((candidate) =>
    imageCandidates(candidate).some((candidateName) => normalizeLookup(candidateName) === lookup),
  );
  if (!entry) {
    return { name, path: null, url: null, localAvailable: false };
  }
  const url = context.localAssetUrls[entry.path] ?? null;
  return { name, path: entry.path, url, localAvailable: Boolean(url) };
};

export const playLocalAudioPreview = async (
  url: string | null | undefined,
  AudioConstructor: LocalAudioConstructor = Audio,
): Promise<void> => {
  if (!url) {
    return;
  }
  if (activeAudioPreview) {
    if (activeAudioPreview.url === url) {
      stopLocalAudioPreview();
      return;
    }
    stopLocalAudioPreview();
  }

  const audio = new AudioConstructor(url);
  activeAudioPreview = { audio, url };
  await audio.play();
};

export const resolveAudioAsset = (
  context: ActionEditorAssetContext,
  name: string,
): ActionEditorResolvedAsset => {
  const lookup = normalizeLookup(name);
  const entry = context.audioEntries.find((candidate) => audioCandidates(candidate).some((candidateName) => normalizeLookup(candidateName) === lookup));
  if (!entry) {
    return { name, path: null, url: null, localAvailable: false };
  }
  const url = context.localAssetUrls[entry.path] ?? null;
  return { name, path: entry.path, url, localAvailable: Boolean(url) };
};
