export type ProjectAssetCatalogEntryKind = 'script' | 'image' | 'audio' | 'video' | 'font' | 'archive' | 'other';

export interface ProjectAssetCatalogEntry {
  path: string;
  name: string;
  extension: string;
  kind: ProjectAssetCatalogEntryKind;
  size: number | null;
  lastModified: number | null;
  renpyNames?: string[];
}

export interface ProjectAssetCatalogPayload {
  root_kind: 'renpy-game-root';
  game_directory: 'game';
  characterImages?: Record<string, string>;
  entries: ProjectAssetCatalogEntry[];
}

export interface LocalRenpyScriptFile {
  path: string;
  file: File;
}

export interface LocalRenpyDirectoryScan {
  catalog: ProjectAssetCatalogPayload;
  rpyFiles: LocalRenpyScriptFile[];
}

type FileSystemPermissionMode = 'read' | 'readwrite';
type FileSystemPermissionState = 'granted' | 'denied' | 'prompt';

interface FileSystemHandleBase {
  kind: 'file' | 'directory';
  name: string;
  queryPermission?: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<FileSystemPermissionState>;
  requestPermission?: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<FileSystemPermissionState>;
}

interface LocalFileSystemFileHandle extends FileSystemHandleBase {
  kind: 'file';
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface LocalFileSystemDirectoryHandle extends FileSystemHandleBase {
  kind: 'directory';
  entries: () => AsyncIterable<[string, LocalFileSystemDirectoryHandle | LocalFileSystemFileHandle]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<LocalFileSystemDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<LocalFileSystemFileHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: FileSystemPermissionMode }) => Promise<LocalFileSystemDirectoryHandle>;
  }
}

const IGNORED_DIRECTORY_NAMES = new Set(['cache', 'saves', 'libs', 'lib', '__pycache__']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.svg']);
const AUDIO_EXTENSIONS = new Set(['.ogg', '.oga', '.mp3', '.wav', '.flac', '.opus', '.m4a']);
const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4', '.ogv', '.mov']);
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const ARCHIVE_EXTENSIONS = new Set(['.rpa', '.zip', '.tar', '.gz', '.7z']);

const normalizeRelativePath = (path: string): string | null => {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return null;
  }
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    return null;
  }
  return parts.join('/');
};

const extensionForPath = (path: string): string => {
  const name = path.split('/').at(-1) ?? path;
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? '' : name.slice(dotIndex).toLowerCase();
};

const normalizeCatalogPath = (path: string): string => path.trim().replace(/\\/g, '/').toLowerCase();

const stripRenpyPathDirectives = (path: string): string => path.replace(/^(?:<[^>]+>\s*)+/, '').trim();

const extractQuotedStrings = (source: string): string[] => {
  const values: string[] = [];
  const pattern = /(["'])((?:\\.|(?!\1).)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    values.push(match[2].replace(/\\(["'])/g, '$1'));
  }
  return values;
};

const addRenpyAlias = (entry: ProjectAssetCatalogEntry, alias: string): void => {
  const normalizedAlias = alias.trim().replace(/\s+/g, ' ');
  if (!normalizedAlias) {
    return;
  }
  const aliases = entry.renpyNames ?? [];
  if (!aliases.some((candidate) => candidate.toLowerCase() === normalizedAlias.toLowerCase())) {
    entry.renpyNames = [...aliases, normalizedAlias];
  }
};

const addCharacterImageAlias = (characterImages: Record<string, string>, character: string, imageTag: string): void => {
  const normalizedCharacter = character.trim();
  const normalizedImageTag = imageTag.trim().replace(/\s+/g, ' ');
  if (normalizedCharacter && normalizedImageTag) {
    characterImages[normalizedCharacter] = normalizedImageTag;
  }
};

const countParenthesesDelta = (source: string): number => {
  let delta = 0;
  let quote: string | null = null;
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') {
      delta += 1;
    } else if (character === ')') {
      delta -= 1;
    }
  }
  return delta;
};

const extractCharacterImageDefine = (statement: string): { character: string; imageTag: string } | null => {
  const defineMatch = statement.match(/^\s*define\s+([A-Za-z_]\w*)\s*=\s*(?:Dynamic)?Character\s*\(/);
  if (!defineMatch) {
    return null;
  }
  const imageMatch = statement.match(/\bimage\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/);
  return imageMatch
    ? {
        character: defineMatch[1],
        imageTag: imageMatch[2].replace(/\\(["'])/g, '$1'),
      }
    : null;
};

const attachRenpyAliasesFromScript = async (
  script: LocalRenpyScriptFile,
  entriesByPath: Map<string, ProjectAssetCatalogEntry>,
  characterImages: Record<string, string>,
): Promise<void> => {
  let source: string;
  try {
    source = await script.file.text();
  } catch (error) {
    console.error('[LocalRenpyDirectory] Failed to read .rpy file while extracting asset aliases.', {
      path: script.path,
      error,
    });
    return;
  }

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const characterDefineMatch = line.match(/^\s*define\s+[A-Za-z_]\w*\s*=\s*(?:Dynamic)?Character\s*\(/);
    if (characterDefineMatch) {
      const statementLines = [line];
      let parenthesesBalance = countParenthesesDelta(line);
      for (
        let continuationIndex = index + 1;
        parenthesesBalance > 0 && continuationIndex < lines.length;
        continuationIndex += 1
      ) {
        const continuationLine = lines[continuationIndex];
        statementLines.push(continuationLine);
        parenthesesBalance += countParenthesesDelta(continuationLine);
        index = continuationIndex;
      }
      const define = extractCharacterImageDefine(statementLines.join('\n'));
      if (define) {
        addCharacterImageAlias(characterImages, define.character, define.imageTag);
      }
      continue;
    }

    const audioMatch = line.match(/^\s*define\s+audio\.([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (audioMatch) {
      const alias = audioMatch[1];
      for (const quotedPath of extractQuotedStrings(audioMatch[2])) {
        const entry = entriesByPath.get(normalizeCatalogPath(stripRenpyPathDirectives(quotedPath)));
        if (entry?.kind === 'audio') {
          addRenpyAlias(entry, alias);
          addRenpyAlias(entry, `audio.${alias}`);
        }
      }
      continue;
    }

    const imageMatch = line.match(/^\s*image\s+(.+?)\s*=\s*(.+)$/);
    if (imageMatch) {
      const imageName = imageMatch[1].trim().replace(/\s+/g, ' ');
      const expressionLines = [imageMatch[2]];
      for (let continuationIndex = index + 1; continuationIndex < lines.length; continuationIndex += 1) {
        const continuationLine = lines[continuationIndex];
        if (continuationLine.trim() && !/^\s/.test(continuationLine)) {
          break;
        }
        expressionLines.push(continuationLine);
        index = continuationIndex;
      }
      for (const quotedPath of extractQuotedStrings(expressionLines.join('\n'))) {
        const entry = entriesByPath.get(normalizeCatalogPath(stripRenpyPathDirectives(quotedPath)));
        if (entry?.kind === 'image') {
          addRenpyAlias(entry, imageName);
        }
      }
    }
  }
};

const attachRenpyAliases = async (
  entries: ProjectAssetCatalogEntry[],
  rpyFiles: LocalRenpyScriptFile[],
): Promise<Record<string, string>> => {
  const entriesByPath = new Map(entries.map((entry) => [normalizeCatalogPath(entry.path), entry]));
  const characterImages: Record<string, string> = {};
  await Promise.all(rpyFiles.map((script) => attachRenpyAliasesFromScript(script, entriesByPath, characterImages)));
  return characterImages;
};

const entryKindForExtension = (extension: string): ProjectAssetCatalogEntryKind => {
  if (extension === '.rpy') {
    return 'script';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  if (FONT_EXTENSIONS.has(extension)) {
    return 'font';
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return 'archive';
  }
  return 'other';
};

const isIgnoredDirectory = (name: string): boolean => name.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());

const isIgnoredFile = (name: string): boolean => {
  const normalized = name.toLowerCase();
  return normalized.endsWith('.bak') || normalized.endsWith('.rpyc');
};

const readNestedFile = async (
  directory: LocalFileSystemDirectoryHandle,
  relativePath: string,
  options?: { create?: boolean },
): Promise<LocalFileSystemFileHandle> => {
  const safePath = normalizeRelativePath(relativePath);
  if (!safePath) {
    throw new Error(`Unsafe local file path: ${relativePath}`);
  }
  const parts = safePath.split('/');
  let current = directory;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, options);
  }
  return current.getFileHandle(parts.at(-1)!, options);
};

const scanDirectory = async (
  directory: LocalFileSystemDirectoryHandle,
  prefix: string,
  entries: ProjectAssetCatalogEntry[],
  rpyFiles: LocalRenpyScriptFile[],
): Promise<void> => {
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'directory') {
      if (!isIgnoredDirectory(name)) {
        await scanDirectory(handle, prefix ? `${prefix}/${name}` : name, entries, rpyFiles);
      }
      continue;
    }

    if (isIgnoredFile(name)) {
      continue;
    }

    const path = prefix ? `${prefix}/${name}` : name;
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      continue;
    }

    const file = await handle.getFile();
    const extension = extensionForPath(safePath);
    entries.push({
      path: safePath,
      name,
      extension,
      kind: entryKindForExtension(extension),
      size: file.size,
      lastModified: file.lastModified,
    });
    if (extension === '.rpy') {
      rpyFiles.push({ path: safePath, file });
    }
  }
};

export const scanLocalRenpyGameDirectory = async (
  rootHandle: LocalFileSystemDirectoryHandle,
): Promise<LocalRenpyDirectoryScan> => {
  let gameHandle: LocalFileSystemDirectoryHandle;
  try {
    gameHandle = await rootHandle.getDirectoryHandle('game');
  } catch {
    throw new Error('Select the RenPy game root containing a game folder.');
  }

  const entries: ProjectAssetCatalogEntry[] = [];
  const rpyFiles: LocalRenpyScriptFile[] = [];
  await scanDirectory(gameHandle, '', entries, rpyFiles);
  const characterImages = await attachRenpyAliases(entries, rpyFiles);
  entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  rpyFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

  return {
    catalog: {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      ...(Object.keys(characterImages).length ? { characterImages } : {}),
      entries,
    },
    rpyFiles,
  };
};

export class LocalRenpyGameDirectorySession {
  constructor(
    public readonly rootHandle: LocalFileSystemDirectoryHandle,
    public readonly gameHandle: LocalFileSystemDirectoryHandle,
  ) {}

  async scan(): Promise<LocalRenpyDirectoryScan> {
    const entries: ProjectAssetCatalogEntry[] = [];
    const rpyFiles: LocalRenpyScriptFile[] = [];
    await scanDirectory(this.gameHandle, '', entries, rpyFiles);
    const characterImages = await attachRenpyAliases(entries, rpyFiles);
    entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
    rpyFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
    return {
      catalog: {
        root_kind: 'renpy-game-root',
        game_directory: 'game',
        ...(Object.keys(characterImages).length ? { characterImages } : {}),
        entries,
      },
      rpyFiles,
    };
  }

  async queryReadWritePermission(): Promise<FileSystemPermissionState> {
    if (!this.rootHandle.queryPermission) {
      return 'granted';
    }
    return this.rootHandle.queryPermission({ mode: 'readwrite' });
  }

  async requestReadWritePermission(): Promise<FileSystemPermissionState> {
    if (!this.rootHandle.requestPermission) {
      return 'granted';
    }
    return this.rootHandle.requestPermission({ mode: 'readwrite' });
  }

  async readScript(path: string): Promise<File> {
    const safePath = normalizeRelativePath(path);
    if (!safePath || extensionForPath(safePath) !== '.rpy') {
      throw new Error(`Only .rpy scripts can be read as scripts: ${path}`);
    }
    return (await readNestedFile(this.gameHandle, safePath)).getFile();
  }

  async readAsset(path: string): Promise<File | null> {
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      return null;
    }
    try {
      return await (await readNestedFile(this.gameHandle, safePath)).getFile();
    } catch {
      return null;
    }
  }

  async writeScript(path: string, content: string): Promise<void> {
    const safePath = normalizeRelativePath(path);
    if (!safePath || extensionForPath(safePath) !== '.rpy') {
      throw new Error(`Only .rpy scripts can be written locally: ${path}`);
    }
    const fileHandle = await readNestedFile(this.gameHandle, safePath, { create: true });
    if (!fileHandle.createWritable) {
      throw new Error('Local file handle does not support writing.');
    }
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

export const connectLocalRenpyGameRoot = async (): Promise<{
  session: LocalRenpyGameDirectorySession;
  scan: LocalRenpyDirectoryScan;
}> => {
  if (!window.showDirectoryPicker) {
    throw new Error('This browser does not support RenPy root folder access.');
  }
  const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const gameHandle = await rootHandle.getDirectoryHandle('game').catch(() => {
    throw new Error('Select the RenPy game root containing a game folder.');
  });
  const session = new LocalRenpyGameDirectorySession(rootHandle, gameHandle);
  const permission = await session.queryReadWritePermission();
  if (permission !== 'granted') {
    const requested = await session.requestReadWritePermission();
    if (requested !== 'granted') {
      throw new Error('Read/write permission is required for the selected RenPy game folder.');
    }
  }
  return { session, scan: await session.scan() };
};

export const writeExportedScriptsToLocalGame = async (
  session: LocalRenpyGameDirectorySession,
  exportedFiles: Record<string, string>,
): Promise<number> => {
  const scriptEntries = Object.entries(exportedFiles).filter(([path]) => extensionForPath(path) === '.rpy');
  for (const [path, content] of scriptEntries) {
    await session.writeScript(path, content);
  }
  return scriptEntries.length;
};
