import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorWriter } from '../ActionEditorWriter';

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
    expect(html).toContain('with dissolve');
    expect(html).toContain('[Show]');
    expect(html).toContain('monika happy');
    expect(html).toContain('at left');
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
    expect(html).toContain('aria-label="Bold selected text"');
    expect(html).toContain('aria-label="Italic selected text"');
    expect(html).toContain('aria-label="Underline selected text"');
    expect(html).toContain('aria-label="Color selected text"');
    expect(html).toContain('aria-label="Size selected text"');
    expect(html).toContain('aria-label="CPS selected text"');
    expect(html).toContain('aria-label="Wait tag"');
    expect(html).toContain('aria-label="Pause tag"');
    expect(html).toContain('aria-label="No wait tag"');
  });
});
