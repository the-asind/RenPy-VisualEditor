import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorSidebar } from '../ActionEditorSidebar';

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
    expect(html).toContain('action-editor-sidebar__scene-art');
    expect(html).toContain('action-editor-sidebar__classroom');
    expect(html).toContain('action-editor-sidebar__standee');
    expect(html).toContain('bg club_day');
    expect(html).toContain('monika happy');
    expect(html).toContain('sayori smile');
    expect(html).toContain('Music:');
    expect(html).toContain('t2.ogg');
    expect(html).toContain('Sound:');
    expect(html).toContain('none');
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
});
