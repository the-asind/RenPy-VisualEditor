import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

import { ProjectGraphCreateMenu } from './ProjectGraphCreateMenu';

describe('ProjectGraph create context menu', () => {
  it('offers file and label creation on the empty canvas', () => {
    const html = renderToStaticMarkup(
      <ProjectGraphCreateMenu
        files={[{ id: 'file-main', path: 'script.rpy' }]}
        labels={[]}
        menu={{ client: { x: 240, y: 180 }, flow: { x: 400, y: 300 }, target: { kind: 'canvas' } }}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain('Create file');
    expect(html).toContain('Create label');
  });

  it('offers a named sublabel action inside a label frame', () => {
    const html = renderToStaticMarkup(
      <ProjectGraphCreateMenu
        files={[{ id: 'file-main', path: 'script.rpy' }]}
        labels={[{ id: 'label-start', fileId: 'file-main', qualifiedName: 'start' }]}
        menu={{ client: { x: 240, y: 180 }, flow: { x: 400, y: 300 }, target: { kind: 'label', labelId: 'label-start', qualifiedName: 'start' } }}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(html).toContain('Create sublabel in start');
    expect(html).toContain('Delete label');
    expect(html).not.toContain('Create label</button>');
  });

  it('offers only deletion for a scenario node', () => {
    const html = renderToStaticMarkup(
      <ProjectGraphCreateMenu
        files={[]}
        labels={[]}
        menu={{ client: { x: 10, y: 20 }, flow: { x: 30, y: 40 }, target: { kind: 'scenario', nodeId: 'node-mouse', title: 'jump ending' } }}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(html).toContain('Delete node');
    expect(html).not.toContain('Create file');
  });
});
