import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  apiClient,
  insertNode,
  loadProjectGraphSnapshot,
  type InsertNodeResponse,
} from '../api';
import {
  createProjectGraphCrdtDoc,
  exportProjectGraphCrdtSnapshot,
} from '../../utils/projectGraphCrdt';
import type { ProjectGraphSnapshot } from '../../utils/projectGraphProjection';

describe('insertNode', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('sends the correct request payload and returns the API response', async () => {
    const scriptId = 'script-123';
    const insertionLine = 42;
    const payload = 'menu:\n    "Choice":\n        jump label';
    const response: InsertNodeResponse = {
      start_line: 42,
      end_line: 44,
      line_count: 3,
      tree: { id: 'node-1' },
    };

    mock.onPost(`/scripts/insert-node/${scriptId}`).reply((config) => {
      expect(config.params).toEqual({ insertion_line: insertionLine });
      expect(JSON.parse(config.data)).toEqual({ content: payload, node_type: 'menu' });
      return [200, response];
    });

    const result = await insertNode(scriptId, insertionLine, 'menu', payload);

    expect(result).toEqual(response);
  });

  it('throws the backend error payload when the request fails', async () => {
    const scriptId = 'script-500';
    const errorBody = { detail: 'Something went wrong' };

    mock.onPost(`/scripts/insert-node/${scriptId}`).reply(500, errorBody);

    await expect(insertNode(scriptId, 1, 'if', 'if True:\n    pass')).rejects.toEqual(errorBody);
  });
});

describe('ProjectGraph snapshot loading', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('loads a binary CRDT snapshot and restores the ProjectGraph for the canvas', async () => {
    const graph: ProjectGraphSnapshot = {
      project_id: 'project-load-snapshot',
      files: [
        {
          id: 'file-day-1',
          path: 'renpy_mouse_day_1.rpy',
          order: '0000',
          visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 600 } },
        },
      ],
      labels: [
        {
          id: 'label-start',
          file_id: 'file-day-1',
          parent_label_id: null,
          name: 'start',
          qualified_name: 'start',
          scope: 'global',
          label_start_node_id: 'label-start-node',
          source_span: { start_line: 0, end_line: 0 },
          visual: { position: { x: 48, y: 48 }, size: { width: 640, height: 420 } },
        },
      ],
      label_starts: [
        {
          id: 'label-start-node',
          file_id: 'file-day-1',
          label_id: 'label-start',
          qualified_name: 'start',
          content: 'label start:',
          visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
        },
      ],
      nodes: [
        {
          id: 'node-intro',
          file_id: 'file-day-1',
          label_id: 'label-start',
          parent_node_id: null,
          type: 'dialogue',
          content: 'r "RenPy Mouse opens the real canvas snapshot."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 64, y: 136 }, size: { width: 360, height: 88 } },
        },
      ],
      edges: [],
      diagnostics: [],
      source_index: { files: { 'renpy_mouse_day_1.rpy': 'file-day-1' } },
    };
    const binarySnapshot = exportProjectGraphCrdtSnapshot(createProjectGraphCrdtDoc(graph, { peerId: '1' }));
    const arrayBuffer = binarySnapshot.buffer.slice(
      binarySnapshot.byteOffset,
      binarySnapshot.byteOffset + binarySnapshot.byteLength,
    );

    mock.onGet('/projects/project-load-snapshot/graph-snapshot').reply((config) => {
      expect(config.responseType).toBe('arraybuffer');
      return [200, arrayBuffer];
    });

    await expect(loadProjectGraphSnapshot('project-load-snapshot')).resolves.toEqual(graph);
  });
});
