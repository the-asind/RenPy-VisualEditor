import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ActionEditorRelationModal } from '../ActionEditorRelationModal';

const labels = [
  { id: 'label-start', qualifiedName: 'start', labelStartNodeId: 'start-node', current: true, fileId: 'file-main', scope: 'global' },
  { id: 'label-ending', qualifiedName: 'chapter.ending', labelStartNodeId: 'ending-node', fileId: 'file-main', scope: 'local' },
];

describe('ActionEditorRelationModal', () => {
  it('renders searchable disambiguated targets without canvas chrome', () => {
    const html = renderToStaticMarkup(
      <ActionEditorRelationModal
        relationType="jump"
        targetLabels={labels}
        targetFiles={[{ id: 'file-main', path: 'renpy_mouse_day_1.rpy' }]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Search labels');
    expect(html).toContain('chapter.ending');
    expect(html).toContain('Create jump');
    expect(html).toContain('Create new label');
    expect(html).toContain('New file path');
    expect(html).toContain('Label name');
    expect(html).toContain('Local label');
    expect(html).toContain('Global label');
    expect(html).not.toContain('react-flow');
  });
});
