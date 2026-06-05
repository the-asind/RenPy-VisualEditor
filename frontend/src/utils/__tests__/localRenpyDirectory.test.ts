import { describe, expect, it, vi } from 'vitest';

import {
  LocalRenpyGameDirectorySession,
  scanLocalRenpyGameDirectory,
  writeExportedScriptsToLocalGame,
} from '../localRenpyDirectory';

type MockFileHandle = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }>;
};

type MockDirectoryHandle = {
  kind: 'directory';
  name: string;
  entries: () => AsyncIterable<[string, MockDirectoryHandle | MockFileHandle]>;
  getDirectoryHandle: (name: string) => Promise<MockDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<MockFileHandle>;
};

const fileHandle = (name: string, content = '', lastModified = 1000): MockFileHandle => ({
  kind: 'file',
  name,
  getFile: async () => new File([content], name, { lastModified, type: 'text/plain' }),
});

const directoryHandle = (
  name: string,
  children: Record<string, MockDirectoryHandle | MockFileHandle>,
): MockDirectoryHandle => ({
  kind: 'directory',
  name,
  entries: async function* entries() {
    for (const entry of Object.entries(children)) {
      yield entry;
    }
  },
  getDirectoryHandle: async (childName: string) => {
    const child = children[childName];
    if (!child || child.kind !== 'directory') {
      throw new Error(`Missing directory ${childName}`);
    }
    return child;
  },
  getFileHandle: async (childName: string, options?: { create?: boolean }) => {
    const child = children[childName];
    if (child?.kind === 'file') {
      return child;
    }
    if (options?.create) {
      const writes: string[] = [];
      const created: MockFileHandle = {
        kind: 'file',
        name: childName,
        getFile: async () => new File([writes.at(-1) ?? ''], childName),
        createWritable: async () => ({
          write: async (content: string) => {
            writes.push(content);
          },
          close: async () => {},
        }),
      };
      children[childName] = created;
      return created;
    }
    throw new Error(`Missing file ${childName}`);
  },
});

describe('local RenPy game directory', () => {
  it('scans only the nested game directory and applies ignore rules', async () => {
    const root = directoryHandle('MouseGame', {
      game: directoryHandle('game', {
        'script.rpy': fileHandle(
          'script.rpy',
          [
            'define s = Character("Sayori", image="sayori")',
            'define y = Character("Yuri", image="yuri")',
            'define audio.t3 = "<loop 4.444>bgm/3.ogg"',
            'image bg residential_day = "bg/residential_day.png"',
            'image sayori = ConditionSwitch(',
            '    "persistent.clear[0]", "images/sayori/1l.png",',
            '    True, "images/sayori/1r.png")',
            'label start:',
            '    return',
          ].join('\n'),
          1100,
        ),
        bgm: directoryHandle('bgm', {
          '3.ogg': fileHandle('3.ogg', 'ogg', 1250),
        }),
        bg: directoryHandle('bg', {
          'residential_day.png': fileHandle('residential_day.png', 'png', 1260),
        }),
        images: directoryHandle('images', {
          'monika 1a.png': fileHandle('monika 1a.png', 'png', 1200),
          sayori: directoryHandle('sayori', {
            '1l.png': fileHandle('1l.png', 'png', 1210),
            '1r.png': fileHandle('1r.png', 'png', 1220),
          }),
          '.private': directoryHandle('.private', {
            'secret.png': fileHandle('secret.png'),
          }),
        }),
        audio: directoryHandle('audio', {
          't2.ogg': fileHandle('t2.ogg', 'ogg', 1300),
        }),
        cache: directoryHandle('cache', {
          'ignored.png': fileHandle('ignored.png'),
        }),
        saves: directoryHandle('saves', {
          'ignored.save': fileHandle('ignored.save'),
        }),
        'old.rpyc': fileHandle('old.rpyc'),
        'backup.rpy.bak': fileHandle('backup.rpy.bak'),
      }),
      renpy: directoryHandle('renpy', {
        'engine.rpy': fileHandle('engine.rpy'),
      }),
    });

    const scan = await scanLocalRenpyGameDirectory(root as any);

    expect(scan.catalog.entries.map((entry) => entry.path)).toEqual([
      'audio/t2.ogg',
      'bg/residential_day.png',
      'bgm/3.ogg',
      'images/monika 1a.png',
      'images/sayori/1l.png',
      'images/sayori/1r.png',
      'script.rpy',
    ]);
    expect(scan.catalog.entries.find((entry) => entry.path === 'bgm/3.ogg')?.renpyNames).toEqual(['t3', 'audio.t3']);
    expect(scan.catalog.entries.find((entry) => entry.path === 'bg/residential_day.png')?.renpyNames).toEqual([
      'bg residential_day',
    ]);
    expect(scan.catalog.entries.find((entry) => entry.path === 'images/sayori/1l.png')?.renpyNames).toEqual([
      'sayori',
    ]);
    expect(scan.catalog.entries.find((entry) => entry.path === 'images/sayori/1r.png')?.renpyNames).toEqual([
      'sayori',
    ]);
    expect(scan.catalog.characterImages).toEqual({ s: 'sayori', y: 'yuri' });
    expect(scan.rpyFiles.map((script) => script.path)).toEqual(['script.rpy']);
    expect(scan.rpyFiles[0].file.name).toBe('script.rpy');
  });

  it('requires a root directory with a game child directory', async () => {
    const root = directoryHandle('WrongFolder', {});

    await expect(scanLocalRenpyGameDirectory(root as any)).rejects.toThrow('Select the RenPy game root containing a game folder.');
  });

  it('reads local assets and writes only exported .rpy scripts explicitly', async () => {
    const game = directoryHandle('game', {
      images: directoryHandle('images', {
        'monika 1a.png': fileHandle('monika 1a.png', 'png'),
      }),
      scripts: directoryHandle('scripts', {}),
    });
    const root = directoryHandle('MouseGame', { game });
    const session = new LocalRenpyGameDirectorySession(root as any, game as any);

    await expect(session.readAsset('images/monika 1a.png')).resolves.toMatchObject({ name: 'monika 1a.png' });
    await expect(session.readAsset('../outside.png')).resolves.toBeNull();

    await writeExportedScriptsToLocalGame(session, {
      'scripts/day_1.rpy': 'label start:\n    return\n',
      'images/should-not-write.png': 'not a script',
    });

    const written = await session.readScript('scripts/day_1.rpy');
    expect(await written.text()).toBe('label start:\n    return\n');
    await expect(session.readScript('images/should-not-write.png')).rejects.toThrow();
  });
});
