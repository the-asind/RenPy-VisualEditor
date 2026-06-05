import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorWriter } from '../ActionEditorWriter';
import type { ProjectAssetCatalogPayload } from '../../../utils/localRenpyDirectory';

describe('ActionEditorWriter Sprint 2 rows', () => {
  const content = [
    'scene bg club_day with dissolve',
    'show monika happy at left',
    'show sayori smile at right',
    'play music t2.ogg fadein 1.0',
    '',
    '"The clubroom gets quiet for a moment."',
    'm "If it\\\'s going to be anyone, then I prefer helping Sayori."',
    's "Ehehe... thank you, Monika."',
  ].join('\n');

  it('renders dialogue and command rows from Action node content', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('Narrator');
    expect(html).toContain('The clubroom gets quiet for a moment.');
    expect(html).toContain('Monika');
    expect(html).toContain('Sayori');
    expect(html).toContain('[Scene]');
    expect(html).toContain('bg club_day');
    expect(html).toContain('aria-label="Scene with value"');
    expect(html).toContain('value="dissolve"');
    expect(html).toContain('[Show]');
    expect(html).toContain('monika happy');
    expect(html).toContain('aria-label="Show at value"');
    expect(html).toContain('value="left"');
    expect(html).toContain('[Music]');
    expect(html).toContain('t2.ogg');
  });

  it('is mounted in the overlay instead of the placeholder writer shell', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('action-editor-writer');
    expect(html).toContain('aria-label="Action writer rows"');
    expect(html).not.toContain('Writer rows are loading');
  });

  it('renders inline formatting controls inside dialogue rows', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('aria-label="Inline text tags"');
    expect(html).toContain('action-editor-toolbar__group');
    expect(html).toContain('action-editor-toolbar__button');
    expect(html).toContain('aria-label="Bold selected text"');
    expect(html).toContain('aria-label="Italic selected text"');
    expect(html).toContain('aria-label="Underline selected text"');
    expect(html).toContain('aria-label="Text color menu"');
    expect(html).toContain('aria-label="Text size menu"');
    expect(html).toContain('aria-label="CPS menu"');
    expect(html).toContain('aria-label="Wait tag"');
    expect(html).toContain('aria-label="Pause tag"');
    expect(html).toContain('aria-label="No wait tag"');
  });

  it('marks speaker rows with stable accent variables', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter
        content={['y "Eh?"', 'n "Seriously?"', 'm "Welcome."', 'mc "..."', '"Narration."'].join('\n')}
        onContentChange={vi.fn()}
      />,
    );

    expect(html).toContain('--action-editor-speaker-accent');
    expect(html).toContain('data-speaker-id="y"');
    expect(html).toContain('data-speaker-id="n"');
    expect(html).toContain('data-speaker-id="m"');
    expect(html).toContain('data-speaker-id="mc"');
    expect(html).toContain('data-speaker-id="Narrator"');
  });

  it('renders RenPy say image attributes inside the speaker tile', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter content={'m 2d "Sayori always helps lighten the mood."'} onContentChange={vi.fn()} />,
    );

    expect(html).toContain('aria-label="Monika image attributes"');
    expect(html).toContain('value="2d"');
    expect(html).toContain('action-editor-writer__speaker-attrs');
  });

  it('renders a clear RenPy documentation note for image attributes', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter content={'m 2d "Sayori always helps lighten the mood."'} onContentChange={vi.fn()} />,
    );

    expect(html).toContain('action-editor-writer__speaker-attrs-help');
    expect(html).toContain('What is this?');
    expect(html).toContain('Ren&#x27;Py say image attributes');
    expect(html).toContain('href="https://www.renpy.org/doc/html/dialogue.html#say-with-image-attributes"');
  });

  it('keeps empty-row picker inactive until the row has focus', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter content={['m "First line."', 'm ""'].join('\n')} onContentChange={vi.fn()} />,
    );

    expect(html).toContain('action-editor-writer__row--empty');
    expect(html).not.toContain('action-editor-empty-picker');
  });

  it('wires Enter handling into dialogue textareas', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('data-enter-splits-row="true"');
  });

  it('disables browser text assistance on RenPy writer fields to keep keyboard input local', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('spellcheck="false"');
    expect(html).toContain('autoCorrect="off"');
    expect(html).toContain('autoCapitalize="off"');
    expect(html).toContain('autoComplete="off"');
  });

  it('renders real six-dot reorder handles instead of rotated punctuation text', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('aria-label="Reorder row"');
    expect(html).toContain('action-editor-drag-handle__dot');
    expect(html).not.toContain('&quot;::&quot;');
    expect(html).not.toContain('>::</span>');
  });

  it('renders distinct command icon classes for quick visual scanning', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter
        content={['scene black', 'show monika 1', 'hide sayori', 'play music t2.ogg', 'play sound page_turn.ogg', 'with dissolve'].join('\n')}
        onContentChange={vi.fn()}
      />,
    );

    expect(html).toContain('action-editor-writer__command-icon--scene');
    expect(html).toContain('action-editor-writer__command-icon--show');
    expect(html).toContain('action-editor-writer__command-icon--hide');
    expect(html).toContain('action-editor-writer__command-icon--music');
    expect(html).toContain('action-editor-writer__command-icon--sound');
    expect(html).toContain('action-editor-writer__command-icon--transition');
  });

  it('offers catalog suggestions for scene, show, music, and sound command fields', () => {
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
      <ActionEditorWriter
        assetCatalog={assetCatalog}
        content={['scene bg club_day', 'show monika 1a', 'play music t2.ogg'].join('\n')}
        onContentChange={vi.fn()}
      />,
    );

    expect(html).toContain('<datalist');
    expect(html).toContain('value="bg club_day"');
    expect(html).toContain('value="monika 1a"');
    expect(html).toContain('value="t2.ogg"');
  });

  it('renders command names and clauses as editable inline fields', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter
        content={['show monika happy at left with dissolve', 'scene bg club_day with fade'].join('\n')}
        onContentChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Show primary value"');
    expect(html).toContain('value="monika happy"');
    expect(html).toContain('aria-label="Show at value"');
    expect(html).toContain('value="left"');
    expect(html).toContain('aria-label="Show with value"');
    expect(html).toContain('value="dissolve"');
    expect(html).toContain('aria-label="Scene primary value"');
    expect(html).toContain('aria-label="Scene with value"');
    expect(html).toContain('action-editor-writer__command-field');
    expect(html).toContain('action-editor-writer__command-clause-token');
  });

  it('renders command modifiers and audio options as editable fields', () => {
    const html = renderToStaticMarkup(
      <ActionEditorWriter
        content={['show monika 1 zorder 2 at t21', 'play music t2.ogg fadein 1.0', 'play sound page_turn.ogg noloop'].join('\n')}
        onContentChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Show modifiers value"');
    expect(html).toContain('value="zorder 2"');
    expect(html).toContain('aria-label="Music options value"');
    expect(html).toContain('value="fadein 1.0"');
    expect(html).toContain('aria-label="Sound options value"');
    expect(html).toContain('value="noloop"');
  });

  it('marks configurable toolbar buttons as menu buttons', () => {
    const html = renderToStaticMarkup(<ActionEditorWriter content={content} onContentChange={vi.fn()} />);

    expect(html).toContain('aria-label="Text color menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Text size menu"');
    expect(html).toContain('aria-label="CPS menu"');
  });
});
