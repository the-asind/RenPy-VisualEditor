import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorContinuationModal } from '../ActionEditorContinuationModal';

describe('ActionEditorContinuationModal', () => {
  it('renders IF vertically with optional elif and else controls', () => {
    const html = renderToStaticMarkup(
      <ActionEditorContinuationModal kind="conditional" targetLabels={[]} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(html).toContain('Create conditional path');
    expect(html).toContain('IF condition');
    expect(html).toContain('Add ELIF');
    expect(html).toContain('Add ELSE');
    expect(html).toContain('Intent comment');
    expect(html).toContain('ACTION');
    expect(html).toContain('CALL');
    expect(html).toContain('JUMP');
  });

  it('renders MENU with optional prompt and a required choice', () => {
    const html = renderToStaticMarkup(
      <ActionEditorContinuationModal kind="menu" targetLabels={[]} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(html).toContain('Create player choice');
    expect(html).toContain('Prompt (optional)');
    expect(html).toContain('Choice text');
    expect(html).toContain('Condition (optional)');
    expect(html).toContain('Add choice');
    expect(html).not.toContain('Terminal');
  });
});
