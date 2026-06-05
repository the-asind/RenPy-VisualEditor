import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildActionEditorAssetContext,
  playLocalAudioPreview,
  resolveAudioAsset,
  resolveImageAsset,
  stopLocalAudioPreview,
  suggestImageNames,
} from '../assetCatalogResolver';
import type { ProjectAssetCatalogPayload } from '../localRenpyDirectory';

const catalog: ProjectAssetCatalogPayload = {
  root_kind: 'renpy-game-root',
  game_directory: 'game',
  entries: [
    {
      path: 'images/bg/club_day.png',
      name: 'club_day.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
    },
    {
      path: 'images/monika/monika 1a.png',
      name: 'monika 1a.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
    },
    {
      path: 'audio/t2.ogg',
      name: 't2.ogg',
      extension: '.ogg',
      kind: 'audio',
      size: 100,
      lastModified: 1000,
    },
  ],
};

describe('asset catalog resolver', () => {
  afterEach(() => {
    stopLocalAudioPreview();
  });

  it('builds image suggestions from server catalog without binary files', () => {
    expect(suggestImageNames(catalog)).toEqual(expect.arrayContaining(['bg club_day', 'club_day', 'monika 1a']));
  });

  it('resolves image and audio entries with optional local object URLs', () => {
    const context = buildActionEditorAssetContext(catalog, {
      'images/bg/club_day.png': 'blob:bg',
      'audio/t2.ogg': 'blob:t2',
    });

    expect(resolveImageAsset(context, 'bg club_day')).toEqual({
      name: 'bg club_day',
      path: 'images/bg/club_day.png',
      url: 'blob:bg',
      localAvailable: true,
    });
    expect(resolveImageAsset(context, 'monika 1a')).toMatchObject({
      path: 'images/monika/monika 1a.png',
      localAvailable: false,
    });
    expect(resolveAudioAsset(context, 't2.ogg')).toEqual({
      name: 't2.ogg',
      path: 'audio/t2.ogg',
      url: 'blob:t2',
      localAvailable: true,
    });
  });

  it('plays a local audio object URL without requiring a server upload', async () => {
    const play = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
    const AudioConstructor = vi.fn(() => ({ play, pause: vi.fn(), currentTime: 0 }));

    await playLocalAudioPreview('blob:t2', AudioConstructor);

    expect(AudioConstructor).toHaveBeenCalledWith('blob:t2');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops the current audio preview before starting another and toggles the same URL off', async () => {
    const firstAudio = { play: vi.fn<[], Promise<void>>().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 0 };
    const secondAudio = { play: vi.fn<[], Promise<void>>().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 0 };
    const AudioConstructor = vi.fn()
      .mockReturnValueOnce(firstAudio)
      .mockReturnValueOnce(secondAudio);

    await playLocalAudioPreview('blob:t2', AudioConstructor);
    await playLocalAudioPreview('blob:t3', AudioConstructor);
    await playLocalAudioPreview('blob:t3', AudioConstructor);

    expect(firstAudio.pause).toHaveBeenCalledTimes(1);
    expect(firstAudio.currentTime).toBe(0);
    expect(secondAudio.play).toHaveBeenCalledTimes(1);
    expect(secondAudio.pause).toHaveBeenCalledTimes(1);
    expect(secondAudio.currentTime).toBe(0);
    expect(AudioConstructor).toHaveBeenCalledTimes(2);
  });

  it('resolves common RenPy asset names without explicit file extensions', () => {
    const ddLikeCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      entries: [
        {
          path: 'bg/residential_day.png',
          name: 'residential_day.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
        {
          path: 'bgm/3.ogg',
          name: '3.ogg',
          extension: '.ogg',
          kind: 'audio',
          size: 100,
          lastModified: 1000,
          renpyNames: ['t3', 'audio.t3'],
        },
      ],
    };
    const context = buildActionEditorAssetContext(ddLikeCatalog, {
      'bg/residential_day.png': 'blob:bg',
      'bgm/3.ogg': 'blob:t3',
    });

    expect(resolveImageAsset(context, 'bg residential_day')).toMatchObject({
      path: 'bg/residential_day.png',
      url: 'blob:bg',
      localAvailable: true,
    });
    expect(resolveAudioAsset(context, 't3')).toMatchObject({
      path: 'bgm/3.ogg',
      url: 'blob:t3',
      localAvailable: true,
    });
    expect(resolveAudioAsset(context, 'audio.t3')).toMatchObject({
      path: 'bgm/3.ogg',
      url: 'blob:t3',
      localAvailable: true,
    });
  });
});
