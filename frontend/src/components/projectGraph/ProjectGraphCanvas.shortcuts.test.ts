import { describe, expect, it } from 'vitest';

import type { Node } from '@xyflow/react';

import { getProjectGraphNodeAnchor, isProjectGraphKeyboardShortcut } from './ProjectGraphCanvas';

describe('ProjectGraphCanvas keyboard shortcuts', () => {
  it('uses the physical export key across keyboard layouts', () => {
    expect(
      isProjectGraphKeyboardShortcut(
        { ctrlKey: true, metaKey: false, shiftKey: true, code: 'KeyE', key: 'e' },
        'KeyE', true,
      ),
    ).toBe(true);
    expect(
      isProjectGraphKeyboardShortcut(
        { ctrlKey: true, metaKey: false, shiftKey: true, code: 'KeyE', key: 'у' },
        'KeyE', true,
      ),
    ).toBe(true);
    expect(
      isProjectGraphKeyboardShortcut(
        { ctrlKey: false, metaKey: true, shiftKey: true, code: 'KeyE', key: 'ث' },
        'KeyE', true,
      ),
    ).toBe(true);
  });

  it('requires the platform modifier, Shift, and the requested physical key', () => {
    expect(isProjectGraphKeyboardShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, code: 'KeyE', key: 'e' }, 'KeyE', true)).toBe(false);
    expect(isProjectGraphKeyboardShortcut({ ctrlKey: false, metaKey: false, shiftKey: true, code: 'KeyE', key: 'e' }, 'KeyE', true)).toBe(false);
    expect(isProjectGraphKeyboardShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, code: 'KeyK', key: 'k' }, 'KeyE', true)).toBe(false);
    expect(isProjectGraphKeyboardShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, code: 'KeyK', key: 'л' }, 'KeyK')).toBe(true);
  });
});

describe('ProjectGraphCanvas presence anchors', () => {
  it('anchors editing activity to the center of a nested scenario node', () => {
    const nodes: Node[] = [
      {
        id: 'file',
        position: { x: 100, y: 50 },
        data: {},
        style: { width: 800, height: 600 },
      },
      {
        id: 'label',
        parentId: 'file',
        position: { x: 40, y: 30 },
        data: {},
        style: { width: 500, height: 400 },
      },
      {
        id: 'action',
        parentId: 'label',
        position: { x: 20, y: 10 },
        data: {},
        style: { width: 200, height: 80 },
      },
    ];

    expect(getProjectGraphNodeAnchor(nodes, 'action')).toEqual({ x: 260, y: 130 });
    expect(getProjectGraphNodeAnchor(nodes, 'missing')).toBeNull();
  });
});
