import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';

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

  const previewAssetCatalog: ProjectAssetCatalogPayload = {
    root_kind: 'renpy-game-root',
    game_directory: 'game',
    characterImages: {
      c: 'crumbs',
      r: 'renpy mouse',
    },
    entries: [
      {
        path: 'backgrounds/living/on.png',
        name: 'on.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['bg living on'],
      },
      {
        path: 'backgrounds/kitchen/morning.png',
        name: 'morning.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['bg kitchen morning'],
      },
      {
        path: 'backgrounds/attic/night.png',
        name: 'night.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['bg attic night'],
      },
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
      {
        path: 'images/renpy_mouse/nervous.png',
        name: 'nervous.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['renpy mouse nervous'],
      },
      {
        path: 'images/crumbs/happy.png',
        name: 'happy.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['crumbs happy'],
      },
      {
        path: 'images/cheddar/neutral.png',
        name: 'neutral.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['cheddar neutral'],
      },
      {
        path: 'art/niva/hysteria.png',
        name: 'hysteria.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['art niva hysteria'],
      },
      {
        path: 'backgrounds/entrance.png',
        name: 'entrance.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['bg entrance'],
      },
      {
        path: 'images/david/sad.png',
        name: 'sad.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['david sad'],
      },
      {
        path: 'images/david/angry.png',
        name: 'angry.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['david angry'],
      },
      {
        path: 'images/adam/neutral.png',
        name: 'neutral.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['adam neutral'],
      },
      {
        path: 'images/sasha/neutral.png',
        name: 'neutral.png',
        extension: '.png',
        kind: 'image',
        size: 100,
        lastModified: 1000,
        renpyNames: ['sasha neutral'],
      },
    ],
  };

  const previewLocalAssetUrls = {
    'backgrounds/living/on.png': 'blob:bg-living-on',
    'backgrounds/kitchen/morning.png': 'blob:bg-kitchen-morning',
    'backgrounds/attic/night.png': 'blob:bg-attic-night',
    'image/monika/happy.png': 'blob:mnk',
    'images/renpy_mouse/brave.png': 'blob:renpy-brave',
    'images/renpy_mouse/nervous.png': 'blob:renpy-nervous',
    'images/crumbs/happy.png': 'blob:crumbs-happy',
    'images/cheddar/neutral.png': 'blob:cheddar-neutral',
    'art/niva/hysteria.png': 'blob:art-niva-hysteria',
    'backgrounds/entrance.png': 'blob:bg-entrance',
    'images/david/sad.png': 'blob:david-sad',
    'images/david/angry.png': 'blob:david-angry',
    'images/adam/neutral.png': 'blob:adam-neutral',
    'images/sasha/neutral.png': 'blob:sasha-neutral',
  };

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
    expect(html).toContain('aria-label="Music preview volume"');
    expect(html).toContain('aria-label="Music options"');
    expect(html).toContain('Sound:');
    expect(html).toContain('none');
    expect(html).toContain('aria-label="Preview sound"');
    expect(html).toContain('aria-label="Sound preview volume"');
    expect(html).toContain('aria-label="Sound options"');
  });

  it('renders the scene preview eye as an expandable button', () => {
    const html = renderToStaticMarkup(<ActionEditorSidebar content={content} onNextAction={vi.fn()} />);

    expect(html).toContain('aria-label="Expand scene preview"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('action-editor-sidebar__preview-toggle');
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
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        content={content}
        nextTargetLabels={[
          { current: true, id: 'label-start', labelStartNodeId: 'start-node-start', qualifiedName: 'start' },
          { id: 'label-day-two', labelStartNodeId: 'start-node-day-two', qualifiedName: 'day_two' },
        ]}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('Player Choice');
    expect(html).toContain('Create a menu of options');
    expect(html).toContain('Conditional Path');
    expect(html).toContain('Add an if/elif/else path');
    expect(html).toContain('Go to Label');
    expect(html).toContain('Jump to another label');
    expect(html).toContain('Call Sub-scene');
    expect(html).toContain('Call another label');
    expect(html).toContain('Return');
    expect(html).not.toContain('aria-label="Go to Label target label"');
    expect(html).not.toContain('aria-label="Call Sub-scene target label"');
    expect(html).not.toContain('<select');
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
        content={['scene bg club_day', 'show monika 1a at left', 'play music t2.ogg fadein 1.0', 'play sound t2.ogg'].join('\n')}
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
    expect(html).not.toContain('data-audio-path="audio/t2.ogg" disabled=""');
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

  it('applies say image attributes only to already visible images with the linked tag', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'c happy "Crumbs talks from offscreen and should not appear in the stage preview."',
          'show renpy mouse nervous at Position(xalign=0.2, yalign=1.0)',
          'r brave "RenPy Mouse changes expression because his image is already showing."',
          'r "The brave expression should remain visible."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="backgrounds/living/on.png"');
    expect(html).toContain('data-asset-path="images/renpy_mouse/brave.png"');
    expect(html).toContain('src="blob:renpy-brave"');
    expect(html).not.toContain('renpy mouse nervous');
    expect(html).not.toContain('crumbs happy');
  });

  it('does not let temporary say image attributes persist after the dialogue line', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'show renpy mouse brave at Position(xalign=0.2, yalign=1.0)',
          'r @ nervous "RenPy Mouse is temporarily nervous for one line."',
          'r "RenPy Mouse returns to the persistent brave expression."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="images/renpy_mouse/brave.png"');
    expect(html).toContain('src="blob:renpy-brave"');
    expect(html).not.toContain('renpy mouse nervous');
    expect(html).not.toContain('renpy mouse @ nervous');
  });

  it('removes shown images by tag for hide while respecting onlayer scope', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'show renpy mouse brave at Position(xalign=0.2, yalign=1.0)',
          'show crumbs happy at Position(xalign=0.7, yalign=1.0)',
          'hide renpy with dissolve',
          'hide crumbs onlayer effects',
          'r "RenPy Mouse leaves, but Crumbs stays because the hide targeted another layer."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="images/crumbs/happy.png"');
    expect(html).toContain('src="blob:crumbs-happy"');
    expect(html).not.toContain('renpy mouse brave');
  });

  it('resolves image statement aliases and keeps every post-scene show visible in preview', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'show layer master at creep_bg_day',
          'show mnk at Position(xalign=-0.1, yalign=1.0)',
          'show renpy mouse brave at Position(xalign=0.3, yalign=1.0)',
          'show crumbs happy at Position(xalign=0.6, yalign=1.0)',
          'with fade',
          'r "RenPy Mouse says the crowded living room should still show everyone."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="backgrounds/living/on.png"');
    expect(html).toContain('data-asset-path="image/monika/happy.png"');
    expect(html).toContain('data-asset-path="images/renpy_mouse/brave.png"');
    expect(html).toContain('data-asset-path="images/crumbs/happy.png"');
    expect(html).toContain('src="blob:mnk"');
    expect(html).toContain('src="blob:renpy-brave"');
    expect(html).toContain('src="blob:crumbs-happy"');
    expect(html).toContain('Position(xalign=-0.1, yalign=1.0)');
    expect(html).not.toContain('layer master');
  });

  it('clears previously shown images when a later scene starts a new layer state', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg kitchen morning',
          'show renpy mouse brave at Position(xalign=0.1, yalign=1.0)',
          'show cheddar neutral at Position(xalign=0.7, yalign=1.0)',
          'r "RenPy Mouse finds cheese in the kitchen."',
          'scene bg attic night',
          'show renpy mouse nervous at Position(xalign=0.4, yalign=1.0)',
          'r "The attic scene starts clean, without the kitchen cast."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="backgrounds/attic/night.png"');
    expect(html).toContain('data-asset-path="images/renpy_mouse/nervous.png"');
    expect(html).toContain('src="blob:renpy-nervous"');
    expect(html).not.toContain('bg kitchen morning');
    expect(html).not.toContain('renpy mouse brave');
    expect(html).not.toContain('cheddar neutral');
  });

  it('resolves scene images with at transforms without folding the transform into the asset name', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene art niva hysteria at bg_auto_cover',
          'show layer master at creep_bg',
          'with pushup',
          'r "RenPy Mouse checks whether the Niva background covers the preview."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="art/niva/hysteria.png"');
    expect(html).toContain('src="blob:art-niva-hysteria"');
    expect(html).toContain('art niva hysteria');
    expect(html).not.toContain('art niva hysteria at bg_auto_cover');
    expect(html).not.toContain('layer master');
  });

  it('keeps expression displayables from hiding ordinary shown images on the master layer', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg entrance',
          'show expression RainAnimation(drops=400) as rain onlayer master',
          'show david sad at right',
          'show layer master at creep_bg',
          'with pushup',
          'play sound "sfx/domofon.opus" fadein 1.0 volume 0.5 loop',
          '"Первый прибежал Давид. Он жил совсем недалеко."',
          'david "Демид, давай, отвечай скорее."',
          'show david angry at right with dissolve',
          'david "Хорошо, что хотя бы тихо пока."',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="backgrounds/entrance.png"');
    expect(html).toContain('src="blob:bg-entrance"');
    expect(html).toContain('data-asset-path="images/david/angry.png"');
    expect(html).toContain('src="blob:david-angry"');
    expect(html).toContain('at right with dissolve');
    expect(html).not.toContain('david sad');
    expect(html).not.toContain('expression RainAnimation');
    expect(html).not.toContain('layer master');
  });

  it('applies basic RenPy at placement hints and renders placement labels above images', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg entrance',
          'show adam neutral at left',
          'show david angry at right with dissolve',
          'show sasha neutral at truecenter',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-preview-placement="left"');
    expect(html).toContain('data-preview-placement="right"');
    expect(html).toContain('data-preview-placement="truecenter"');
    expect(html).toContain('action-editor-sidebar__local-asset--left');
    expect(html).toContain('action-editor-sidebar__local-asset--right');
    expect(html).toContain('action-editor-sidebar__local-asset--truecenter');
    expect(html.indexOf('<small>at right with dissolve</small>')).toBeLessThan(html.indexOf('alt="david angry"'));
  });

  it('anchors Position xalign and yalign exactly against the preview edges', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'show renpy mouse brave at Position(xalign=0.0, yalign=1.0)',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-preview-placement="position"');
    expect(html).toContain('left:0%;top:100%;bottom:auto;transform:translate(0%, -100%)');
  });

  it('retains the shown tag placement when a later show replaces only its image attributes', () => {
    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={previewAssetCatalog}
        content={[
          'scene bg living on',
          'show renpy mouse brave at Position(xalign=0.2, yalign=1.0)',
          'show renpy mouse nervous',
        ].join('\n')}
        localAssetUrls={previewLocalAssetUrls}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-asset-path="images/renpy_mouse/nervous.png"');
    expect(html).toContain('src="blob:renpy-nervous"');
    expect(html).not.toContain('images/renpy_mouse/brave.png');
    expect(html).toContain('<small>at Position(xalign=0.2, yalign=1.0)</small>');
    expect(html).toContain('left:20%;top:100%;bottom:auto;transform:translate(-20%, -100%)');
  });

  it('renders declared Composite image definitions as one layered preview sprite', () => {
    const assetCatalog: ProjectAssetCatalogPayload = {
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
          path: 'backgrounds/living/on.png',
          name: 'on.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
          renpyNames: ['bg living on'],
        },
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

    const html = renderToStaticMarkup(
      <ActionEditorSidebar
        assetCatalog={assetCatalog}
        content={['scene bg living on', 'show sayori 2ba at center'].join('\n')}
        localAssetUrls={{
          'backgrounds/living/on.png': 'blob:bg-living-on',
          'images/sayori/1bl.png': 'blob:sayori-left',
          'images/sayori/2br.png': 'blob:sayori-right',
          'images/sayori/a.png': 'blob:sayori-face',
          'images/sayori/2ba.png': 'blob:should-not-render',
        }}
        onNextAction={vi.fn()}
      />,
    );

    expect(html).toContain('data-preview-image-name="sayori 2ba"');
    expect(html).toContain('action-editor-sidebar__composite-asset');
    expect(html).toContain('data-composite-layer-path="images/sayori/1bl.png"');
    expect(html).toContain('data-composite-layer-path="images/sayori/2br.png"');
    expect(html).toContain('data-composite-layer-path="images/sayori/a.png"');
    expect(html).toContain('src="blob:sayori-left"');
    expect(html).toContain('src="blob:sayori-right"');
    expect(html).toContain('src="blob:sayori-face"');
    expect(html).not.toContain('src="blob:should-not-render"');
    expect(html.indexOf('<small>at center</small>')).toBeLessThan(html.indexOf('data-composite-layer-path="images/sayori/1bl.png"'));
  });
});
