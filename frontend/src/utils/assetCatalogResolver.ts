import type { ProjectAssetCatalogEntry, ProjectAssetCatalogPayload, RenpyImageDefinition } from './localRenpyDirectory';

export interface ActionEditorResolvedAsset {
  name: string;
  path: string | null;
  url: string | null;
  localAvailable: boolean;
  composite?: {
    size: { width: number; height: number };
    layers: Array<{ x: number; y: number; path: string; url: string | null; localAvailable: boolean }>;
  };
}

export interface ActionEditorAssetContext {
  imageEntries: ProjectAssetCatalogEntry[];
  audioEntries: ProjectAssetCatalogEntry[];
  characterImages: Record<string, string>;
  imageDefinitions: Record<string, RenpyImageDefinition>;
  localAssetUrls: Record<string, string>;
  normalizedLocalAssetUrls: Record<string, string>;
}

export interface LocalAudioPreviewHandle {
  currentTime: number;
  onended?: (() => void) | null;
  pause: () => void;
  play: () => Promise<void>;
  volume: number;
}

export interface LocalAssetUrlState {
  path: string;
  localUrlCount: number;
  exactLocalUrlKeyAvailable: boolean;
  normalizedLocalUrlKeyAvailable: boolean;
  relatedLocalUrlKeys: string[];
}

export type LocalAudioConstructor = new (url: string) => LocalAudioPreviewHandle;

export type ActionEditorAudioPreviewChannel = 'music' | 'sound';

export interface PlayLocalAudioPreviewOptions {
  AudioConstructor?: LocalAudioConstructor;
  channel?: ActionEditorAudioPreviewChannel;
  onEnded?: () => void;
  volume?: number;
}

type CookieSink = { cookie: string };

const actionEditorAudioPreviewVolumeCookies: Record<ActionEditorAudioPreviewChannel, string> = {
  music: 'action_editor_music_preview_volume',
  sound: 'action_editor_sound_preview_volume',
};

let activeAudioPreviews: Partial<Record<ActionEditorAudioPreviewChannel, { audio: LocalAudioPreviewHandle; url: string }>> = {};

const clampAudioVolume = (volume: number): number => {
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, volume));
};

export const getActionEditorAudioPreviewVolume = (
  channel: ActionEditorAudioPreviewChannel,
  cookieString = typeof document === 'undefined' ? '' : document.cookie,
): number => {
  const cookieName = actionEditorAudioPreviewVolumeCookies[channel];
  const cookie = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  if (!cookie) {
    return 1;
  }
  const parsed = Number.parseFloat(decodeURIComponent(cookie.slice(cookieName.length + 1)));
  return clampAudioVolume(parsed);
};

export const setActionEditorAudioPreviewVolume = (
  channel: ActionEditorAudioPreviewChannel,
  volume: number,
  cookieSink: CookieSink = typeof document === 'undefined' ? { cookie: '' } : document,
): number => {
  const nextVolume = clampAudioVolume(volume);
  const cookieName = actionEditorAudioPreviewVolumeCookies[channel];
  cookieSink.cookie = `${cookieName}=${encodeURIComponent(String(nextVolume))}; Max-Age=31536000; Path=/; SameSite=Lax`;
  return nextVolume;
};

export const updateLocalAudioPreviewVolume = (
  channel: ActionEditorAudioPreviewChannel,
  volume: number,
): void => {
  const preview = activeAudioPreviews[channel];
  if (!preview) {
    return;
  }
  preview.audio.volume = clampAudioVolume(volume);
};

export const stopLocalAudioPreview = (channel?: ActionEditorAudioPreviewChannel): void => {
  const channels: ActionEditorAudioPreviewChannel[] = channel ? [channel] : ['music', 'sound'];
  for (const previewChannel of channels) {
    const preview = activeAudioPreviews[previewChannel];
    if (!preview) {
      continue;
    }
    preview.audio.pause();
    preview.audio.currentTime = 0;
    delete activeAudioPreviews[previewChannel];
  }
};

const normalizeLookup = (value: string): string =>
  value.trim().replace(/^['"]|['"]$/g, '').toLowerCase().replace(/\s+/g, ' ');

const normalizeAssetPathKey = (path: string): string => path.trim().replace(/\\/g, '/').toLowerCase();

const getConfiguredApiUrl = (): string | null => {
  const runtimeConfig = typeof window !== 'undefined' ? (window as any).RUNTIME_CONFIG : undefined;
  return runtimeConfig?.VITE_API_URL || import.meta.env.VITE_API_URL || null;
};

const resolveServerAssetUrl = (url: string | null | undefined): string | null => {
  if (!url) {
    return null;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const apiUrl = getConfiguredApiUrl();
  if (!apiUrl) {
    return url;
  }
  try {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const apiOrigin = new URL(apiUrl, fallbackOrigin).origin;
    return new URL(url, apiOrigin).toString();
  } catch {
    return url;
  }
};

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
): ActionEditorAssetContext => {
  const normalizedLocalAssetUrls = Object.fromEntries(
    Object.entries(localAssetUrls).map(([path, url]) => [normalizeAssetPathKey(path), url]),
  );
  return {
    imageEntries: catalog?.entries.filter((entry) => entry.kind === 'image') ?? [],
    audioEntries: catalog?.entries.filter((entry) => entry.kind === 'audio') ?? [],
    characterImages: catalog?.characterImages ?? {},
    imageDefinitions: catalog?.imageDefinitions ?? {},
    localAssetUrls,
    normalizedLocalAssetUrls,
  };
};

const resolveLocalAssetUrl = (context: ActionEditorAssetContext, path: string): string | null =>
  context.localAssetUrls[path] ?? context.normalizedLocalAssetUrls[normalizeAssetPathKey(path)] ?? null;

const resolveCatalogEntryUrl = (context: ActionEditorAssetContext, entry: ProjectAssetCatalogEntry): string | null =>
  resolveLocalAssetUrl(context, entry.path) ?? resolveServerAssetUrl(entry.url);

export const describeLocalAssetUrlState = (context: ActionEditorAssetContext, path: string): LocalAssetUrlState => {
  const localUrlKeys = Object.keys(context.localAssetUrls);
  const normalizedPath = normalizeAssetPathKey(path);
  const basename = normalizedPath.split('/').at(-1) ?? normalizedPath;
  return {
    path,
    localUrlCount: localUrlKeys.length,
    exactLocalUrlKeyAvailable: Object.prototype.hasOwnProperty.call(context.localAssetUrls, path),
    normalizedLocalUrlKeyAvailable: Object.prototype.hasOwnProperty.call(context.normalizedLocalAssetUrls, normalizedPath),
    relatedLocalUrlKeys: localUrlKeys
      .filter((key) => {
        const normalizedKey = normalizeAssetPathKey(key);
        return normalizedKey === normalizedPath || normalizedKey.endsWith(`/${basename}`);
      })
      .slice(0, 5),
  };
};

export const shouldReportMissingLocalAssetUrl = (context: ActionEditorAssetContext, path: string): boolean => {
  const state = describeLocalAssetUrlState(context, path);
  return state.localUrlCount > 0 && !state.normalizedLocalUrlKeyAvailable;
};

export const suggestImageNames = (catalog: ProjectAssetCatalogPayload | null | undefined): string[] => {
  const names = new Set<string>();
  for (const imageName of Object.keys(catalog?.imageDefinitions ?? {})) {
    names.add(imageName);
  }
  for (const entry of catalog?.entries ?? []) {
    if (entry.kind === 'image') {
      for (const candidate of imageCandidates(entry)) {
        names.add(candidate);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

const resolveDeclaredImageAsset = (
  context: ActionEditorAssetContext,
  name: string,
): ActionEditorResolvedAsset | null => {
  const lookup = normalizeLookup(name);
  const imageDefinitionEntry = Object.entries(context.imageDefinitions).find(
    ([imageName]) => normalizeLookup(imageName) === lookup,
  );
  if (!imageDefinitionEntry) {
    return null;
  }
  const definition = imageDefinitionEntry[1];
  if (definition.kind === 'single') {
    const entry = context.imageEntries.find((candidate) => normalizeAssetPathKey(candidate.path) === normalizeAssetPathKey(definition.path));
    const url = entry ? resolveCatalogEntryUrl(context, entry) : resolveLocalAssetUrl(context, definition.path);
    return { name, path: definition.path, url, localAvailable: Boolean(url) };
  }
  const layers = definition.layers.map((layer) => {
    const entry = context.imageEntries.find((candidate) => normalizeAssetPathKey(candidate.path) === normalizeAssetPathKey(layer.path));
    const url = entry ? resolveCatalogEntryUrl(context, entry) : resolveLocalAssetUrl(context, layer.path);
    return { ...layer, url, localAvailable: Boolean(url) };
  });
  return {
    name,
    path: null,
    url: null,
    localAvailable: layers.every((layer) => layer.localAvailable),
    composite: {
      size: definition.size,
      layers,
    },
  };
};

export const resolveImageAsset = (
  context: ActionEditorAssetContext,
  name: string,
): ActionEditorResolvedAsset => {
  const declaredImageAsset = resolveDeclaredImageAsset(context, name);
  if (declaredImageAsset) {
    return declaredImageAsset;
  }
  const lookup = normalizeLookup(name);
  const entry = context.imageEntries.find((candidate) =>
    imageCandidates(candidate).some((candidateName) => normalizeLookup(candidateName) === lookup),
  );
  if (!entry) {
    return { name, path: null, url: null, localAvailable: false };
  }
  const url = resolveCatalogEntryUrl(context, entry);
  return { name, path: entry.path, url, localAvailable: Boolean(url) };
};

export const playLocalAudioPreview = async (
  url: string | null | undefined,
  optionsOrAudioConstructor: PlayLocalAudioPreviewOptions | LocalAudioConstructor = {},
): Promise<'empty' | 'playing' | 'stopped'> => {
  if (!url) {
    return 'empty';
  }
  const options: PlayLocalAudioPreviewOptions =
    typeof optionsOrAudioConstructor === 'function' ? { AudioConstructor: optionsOrAudioConstructor } : optionsOrAudioConstructor;
  const channel = options.channel ?? 'music';
  const AudioConstructor = options.AudioConstructor ?? Audio;
  const activeAudioPreview = activeAudioPreviews[channel];
  if (activeAudioPreview) {
    if (activeAudioPreview.url === url) {
      stopLocalAudioPreview(channel);
      return 'stopped';
    }
    stopLocalAudioPreview(channel);
  }

  const audio = new AudioConstructor(url);
  audio.volume = clampAudioVolume(options.volume ?? getActionEditorAudioPreviewVolume(channel));
  audio.onended = () => {
    delete activeAudioPreviews[channel];
    options.onEnded?.();
  };
  activeAudioPreviews[channel] = { audio, url };
  await audio.play();
  return 'playing';
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
  const url = resolveCatalogEntryUrl(context, entry);
  return { name, path: entry.path, url, localAvailable: Boolean(url) };
};
