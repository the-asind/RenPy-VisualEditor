import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildActionEditorAssetContext,
  describeLocalAssetUrlState,
  getActionEditorAudioPreviewVolume,
  playLocalAudioPreview,
  resolveAudioAsset,
  resolveImageAsset,
  setActionEditorAudioPreviewVolume,
  shouldReportMissingLocalAssetUrl,
  stopLocalAudioPreview,
  suggestImageNames,
  updateLocalAudioPreviewVolume,
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
    vi.unstubAllGlobals();
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

  it('uses server-hosted catalog URLs when no local game folder is connected', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://frontend.local' },
      RUNTIME_CONFIG: { VITE_API_URL: 'http://backend.local/api' },
    });

    const serverCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      imageDefinitions: {
        'library night': {
          kind: 'single',
          path: 'images/backgrounds/library-night.webp',
        },
      },
      entries: [
        {
          path: 'images/backgrounds/library-night.webp',
          name: 'library-night.webp',
          extension: '.webp',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['library night'],
          url: '/demo-assets/clockwork-library/v1/images/backgrounds/library-night.webp',
        },
        {
          path: 'audio/music/library-loop.wav',
          name: 'library-loop.wav',
          extension: '.wav',
          kind: 'audio',
          size: 100,
          lastModified: 1000,
          renpyNames: ['library_loop', 'audio.library_loop'],
          url: '/demo-assets/clockwork-library/v1/audio/music/library-loop.wav',
        },
      ],
    };
    const context = buildActionEditorAssetContext(serverCatalog, {});

    expect(resolveImageAsset(context, 'library night')).toEqual({
      name: 'library night',
      path: 'images/backgrounds/library-night.webp',
      url: 'http://backend.local/demo-assets/clockwork-library/v1/images/backgrounds/library-night.webp',
      localAvailable: true,
    });
    expect(resolveAudioAsset(context, 'audio.library_loop')).toEqual({
      name: 'audio.library_loop',
      path: 'audio/music/library-loop.wav',
      url: 'http://backend.local/demo-assets/clockwork-library/v1/audio/music/library-loop.wav',
      localAvailable: true,
    });
  });

  it('keeps local object URLs ahead of server-hosted demo URLs', () => {
    const serverCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      entries: [
        {
          path: 'images/renpy/bright.webp',
          name: 'bright.webp',
          extension: '.webp',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['renpy bright'],
          url: '/demo-assets/clockwork-library/v1/images/renpy/bright.webp',
        },
      ],
    };
    const context = buildActionEditorAssetContext(serverCatalog, {
      'images/renpy/bright.webp': 'blob:local-bright',
    });

    expect(resolveImageAsset(context, 'renpy bright')).toMatchObject({
      path: 'images/renpy/bright.webp',
      url: 'blob:local-bright',
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

  it('keeps music and sound previews separate with independent volumes', async () => {
    const musicAudio = { play: vi.fn<[], Promise<void>>().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 0, volume: 1 };
    const soundAudio = { play: vi.fn<[], Promise<void>>().mockResolvedValue(undefined), pause: vi.fn(), currentTime: 0, volume: 1 };
    const AudioConstructor = vi.fn()
      .mockReturnValueOnce(musicAudio)
      .mockReturnValueOnce(soundAudio);

    await playLocalAudioPreview('blob:music', { channel: 'music', volume: 0.35, AudioConstructor });
    await playLocalAudioPreview('blob:sound', { channel: 'sound', volume: 0.8, AudioConstructor });
    updateLocalAudioPreviewVolume('music', 0.2);
    stopLocalAudioPreview('music');

    expect(musicAudio.volume).toBe(0.2);
    expect(soundAudio.volume).toBe(0.8);
    expect(musicAudio.pause).toHaveBeenCalledTimes(1);
    expect(soundAudio.pause).not.toHaveBeenCalled();
  });

  it('reads and writes separate audio preview volume cookies', () => {
    const cookieSink = { cookie: '' };

    setActionEditorAudioPreviewVolume('music', 0.45, cookieSink);
    setActionEditorAudioPreviewVolume('sound', 0.7, cookieSink);

    expect(cookieSink.cookie).toContain('action_editor_sound_preview_volume=0.7');
    expect(getActionEditorAudioPreviewVolume('music', 'action_editor_music_preview_volume=0.45')).toBe(0.45);
    expect(getActionEditorAudioPreviewVolume('sound', 'action_editor_sound_preview_volume=0.7')).toBe(0.7);
    expect(getActionEditorAudioPreviewVolume('music', 'action_editor_music_preview_volume=2')).toBe(1);
    expect(getActionEditorAudioPreviewVolume('sound', 'action_editor_sound_preview_volume=-1')).toBe(0);
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

  it('resolves explicit RenPy image statement aliases before relying on file names', () => {
    const aliasCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      entries: [
        {
          path: 'image/monika/happy.png',
          name: 'happy.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['mnk'],
        },
        {
          path: 'images/renpy_mouse/brave.png',
          name: 'brave.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['renpy mouse brave'],
        },
      ],
    };
    const context = buildActionEditorAssetContext(aliasCatalog, {
      'image/monika/happy.png': 'blob:mnk',
      'images/renpy_mouse/brave.png': 'blob:renpy-brave',
    });

    expect(resolveImageAsset(context, 'mnk')).toEqual({
      name: 'mnk',
      path: 'image/monika/happy.png',
      url: 'blob:mnk',
      localAvailable: true,
    });
    expect(resolveImageAsset(context, 'renpy mouse brave')).toMatchObject({
      path: 'images/renpy_mouse/brave.png',
      url: 'blob:renpy-brave',
      localAvailable: true,
    });
  });

  it('resolves declared RenPy Composite images before direct path heuristics', () => {
    const compositeCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      imageDefinitions: {
        'sayori 2ba': {
          kind: 'composite',
          size: { width: 960, height: 960 },
          layers: [
            { x: 0, y: 0, path: 'images/sayori/1bl.png' },
            { x: 0, y: 0, path: 'images/sayori/2br.png' },
            { x: 0, y: 0, path: 'images/sayori/a.png' },
          ],
        },
      },
      entries: [
        {
          path: 'images/sayori/1bl.png',
          name: '1bl.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
        {
          path: 'images/sayori/2br.png',
          name: '2br.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
        {
          path: 'images/sayori/a.png',
          name: 'a.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
        {
          path: 'images/sayori/2ba.png',
          name: '2ba.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
      ],
    };
    const context = buildActionEditorAssetContext(compositeCatalog, {
      'images/sayori/1bl.png': 'blob:sayori-left',
      'images/sayori/2br.png': 'blob:sayori-right',
      'images/sayori/a.png': 'blob:sayori-face',
      'images/sayori/2ba.png': 'blob:should-not-win',
    });

    expect(suggestImageNames(compositeCatalog)).toContain('sayori 2ba');
    expect(resolveImageAsset(context, 'sayori 2ba')).toEqual({
      name: 'sayori 2ba',
      path: null,
      url: null,
      localAvailable: true,
      composite: {
        size: { width: 960, height: 960 },
        layers: [
          { x: 0, y: 0, path: 'images/sayori/1bl.png', url: 'blob:sayori-left', localAvailable: true },
          { x: 0, y: 0, path: 'images/sayori/2br.png', url: 'blob:sayori-right', localAvailable: true },
          { x: 0, y: 0, path: 'images/sayori/a.png', url: 'blob:sayori-face', localAvailable: true },
        ],
      },
    });
  });

  it('uses local object URLs when local path keys differ by separators or casing', () => {
    const localPathCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      entries: [
        {
          path: 'art/characters/adam/neutral.png',
          name: 'neutral.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['adam neutral'],
        },
        {
          path: 'audio/ambience/hall.ogg',
          name: 'hall.ogg',
          extension: '.ogg',
          kind: 'audio',
          size: 100,
          lastModified: 1000,
          renpyNames: ['hall_ambience'],
        },
      ],
    };
    const context = buildActionEditorAssetContext(localPathCatalog, {
      'Art\\Characters\\Adam\\Neutral.PNG': 'blob:adam-neutral',
      'AUDIO/Ambience/Hall.OGG': 'blob:hall-ambience',
    });

    expect(resolveImageAsset(context, 'adam neutral')).toMatchObject({
      path: 'art/characters/adam/neutral.png',
      url: 'blob:adam-neutral',
      localAvailable: true,
    });
    expect(resolveAudioAsset(context, 'hall_ambience')).toMatchObject({
      path: 'audio/ambience/hall.ogg',
      url: 'blob:hall-ambience',
      localAvailable: true,
    });
  });

  it('describes local object URL state for preview diagnostics', () => {
    const context = buildActionEditorAssetContext(catalog, {
      'Images/BG/Club_Day.PNG': 'blob:bg',
      'images/monika/monika 1a.png': 'blob:monika',
    });

    expect(describeLocalAssetUrlState(context, 'images/bg/club_day.png')).toEqual({
      path: 'images/bg/club_day.png',
      localUrlCount: 2,
      exactLocalUrlKeyAvailable: false,
      normalizedLocalUrlKeyAvailable: true,
      relatedLocalUrlKeys: ['Images/BG/Club_Day.PNG'],
    });
    expect(describeLocalAssetUrlState(context, 'images/sayori/smile.png')).toMatchObject({
      localUrlCount: 2,
      exactLocalUrlKeyAvailable: false,
      normalizedLocalUrlKeyAvailable: false,
    });
  });

  it('does not report missing local object URLs before the local URL map is populated', () => {
    const emptyContext = buildActionEditorAssetContext(catalog, {});
    const partialContext = buildActionEditorAssetContext(catalog, {
      'images/bg/club_day.png': 'blob:bg',
    });

    expect(shouldReportMissingLocalAssetUrl(emptyContext, 'images/monika/monika 1a.png')).toBe(false);
    expect(shouldReportMissingLocalAssetUrl(partialContext, 'images/monika/monika 1a.png')).toBe(true);
    expect(shouldReportMissingLocalAssetUrl(partialContext, 'images/bg/club_day.png')).toBe(false);
  });
});
