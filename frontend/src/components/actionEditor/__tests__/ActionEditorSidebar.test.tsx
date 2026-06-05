import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorSidebar } from '../ActionEditorSidebar';
import type { ProjectAssetCatalogPayload } from '../../../utils/localRenpyDirectory';

describe('ActionEditorSidebar Sprint 3 writing aids', () => {
  const content = [
    'scene bg club_day with dissolve',
    'show monika happy at left',
    'show sayori smile at right',
    'play music t2.ogg fadein 1.0',
    '',
    'm "If it\\\'s going to be anyone, then I prefer helping Sayori."',
  ].join('\n');

  it('renders scene preview and audio state derived from current Action content', () => {
    const html = renderToStaticMarkup(<ActionEditorSidebar content={content} onNextAction={vi.fn()} />);

    expect(html).toContain('Scene preview');
    expect(html).toContain('action-editor-sidebar__missing-preview');
    expect(html).toContain('bg club_day');
    expect(html).toContain('monika happy');
    expect(html).toContain('sayori smile');
    expect(html).toContain('Music:');
    expect(html).toContain('t2.ogg');
    expect(html).toContain('fadein 1.0');
    expect(html).toContain('aria-label="Preview music"');
    expect(html).toContain('aria-label="Music options"');
    expect(html).toContain('Sound:');
    expect(html).toContain('none');
    expect(html).toContain('aria-label="Sound options"');
  });

  it('derives scene preview and audio from the active writer row instead of the end of the action block', () => {
    const focusedContent = [
      'scene bg hallway',
      'show monika 1 at left',
      'play music opening.ogg',
      'm "Early line."',
      'scene bg club_day',
      'show natsuki 4c at right',
      'play music t2.ogg',
      'play sound page_turn.ogg',
      'n "Later line."',
    ].join('\n');

    const html = renderToStaticMarkup(
      <ActionEditorSidebar content={focusedContent} activeRowId="row-0003" onNextAction={vi.fn()} />,
    );

    expect(html).toContain('bg hallway');
    expect(html).toContain('monika 1');
    expect(html).toContain('opening.ogg');
    expect(html).not.toContain('fadein 2.0');
    expect(html).toContain('Sound:');
    expect(html).toContain('none');
    expect(html).not.toContain('bg club_day');
    expect(html).not.toContain('natsuki 4c');
    expect(html).not.toContain('t2.ogg');
    expect(html).not.toContain('page_turn.ogg');
  });

  it('renders writer-friendly Next actions without inserting structural RenPy as raw text', () => {
    const html = renderToStaticMarkup(<ActionEditorSidebar content={content} onNextAction={vi.fn()} />);

    expect(html).toContain('Player Choice');
    expect(html).toContain('Create a menu of options');
    expect(html).toContain('Conditional Path');
    expect(html).toContain('Add an if/elif/else path');
    expect(html).toContain('Go to Label');
    expect(html).toContain('Jump to another label');
    expect(html).toContain('Call Sub-scene');
    expect(html).toContain('Call another label');
    expect(html).toContain('Return');
  });

  it('uses RenPy-like missing asset rectangles instead of fake people', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        content={['scene black', 'show natsuki 4c zorder 2 at t32', 'show monika 3m zorder 3 at f31'].join('\n')}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('action-editor-sidebar__missing-preview--black');
    expect(html).toContain('action-editor-sidebar__missing-asset');
    expect(html).toContain('black');
    expect(html).toContain('natsuki 4c');
    expect(html).toContain('zorder 2 at t32');
    expect(html).toContain('monika 3m');
    expect(html).toContain('zorder 3 at f31');
    expect(html).not.toContain('action-editor-sidebar__standee');
    expect(html).not.toContain('action-editor-sidebar__classroom');
  });

  it('renders catalog-backed local image and audio preview when local object URLs are available', () => {
    const assetCatalog: ProjectAssetCatalogPayload = {
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

    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={assetCatalog}
        content={['scene bg club_day', 'show monika 1a at left', 'play music t2.ogg fadein 1.0'].join('\n')}
        localAssetUrls={{
          'images/bg/club_day.png': 'blob:bg',
          'images/monika/monika 1a.png': 'blob:monika',
          'audio/t2.ogg': 'blob:t2',
        }}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('src="blob:bg"');
    expect(html).toContain('src="blob:monika"');
    expect(html).toContain('data-asset-path="images/bg/club_day.png"');
    expect(html).toContain('data-asset-path="images/monika/monika 1a.png"');
    expect(html).toContain('data-audio-path="audio/t2.ogg"');
    expect(html).not.toContain('disabled=""');
  });

  it('uses Character image definitions so say image attributes replace the visible sprite tag', () => {
    const assetCatalog: ProjectAssetCatalogPayload = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      characterImages: {
        s: 'sayori',
        y: 'yuri',
      },
      entries: [
        {
          path: 'images/sayori/1a.png',
          name: '1a.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['sayori 1a'],
        },
        {
          path: 'images/sayori/2x.png',
          name: '2x.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['sayori 2x'],
        },
        {
          path: 'images/yuri/2m.png',
          name: '2m.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['yuri 2m'],
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={assetCatalog}
        content={[
          'scene bg club_day',
          'show sayori 1a at t21',
          's 2x "Sayori swaps expression."',
          'show yuri 2m at t22',
          'y "Yuri stays visible."',
        ].join('\n')}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('sayori 2x');
    expect(html).toContain('yuri 2m');
    expect(html).not.toContain('sayori 1a');
  });
});
