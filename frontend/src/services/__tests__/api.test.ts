import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  apiClient,
  exportProjectGraphFiles,
  insertNode,
  importProjectGraphFiles,
  loadProjectGraphSnapshot,
  saveProjectGraphCrdtSnapshot,
  type InsertNodeResponse,
  type ProjectGraphImportResult,
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

  it('imports several RenPy files as multipart ProjectGraph input', async () => {
    const files = [
      new File(['label start:\n    jump day_two\n'], 'renpy_mouse_day_1.rpy', { type: 'text/plain' }),
      new File(['label day_two:\n    return\n'], 'renpy_mouse_day_2.rpy', { type: 'text/plain' }),
    ];
    const importResult: ProjectGraphImportResult = {
      project_id: 'project-load-snapshot',
      file_count: 2,
      label_count: 2,
      label_start_count: 2,
      node_count: 2,
      edge_count: 1,
      diagnostics: {
        total: 0,
        blocking: 0,
        info: 0,
        warning: 0,
        error: 0,
      },
      snapshot_available: true,
    };

    mock.onPost('/projects/project-load-snapshot/graph-import').reply((config) => {
      expect(config.headers?.['Content-Type']).toBe('multipart/form-data');
      expect(config.data).toBeInstanceOf(FormData);
      expect([...(config.data as FormData).getAll('files')].map((file) => (file as File).name)).toEqual([
        'renpy_mouse_day_1.rpy',
        'renpy_mouse_day_2.rpy',
      ]);
      return [200, importResult];
    });

    await expect(importProjectGraphFiles('project-load-snapshot', files)).resolves.toEqual(importResult);
  });

  it('imports directory scan results with relative script paths and asset catalog', async () => {
    const files = [
      new File(['label start:\n    jump day_two\n'], 'renpy_mouse_day_1.rpy', { type: 'text/plain' }),
      new File(['label day_two:\n    return\n'], 'renpy_mouse_day_2.rpy', { type: 'text/plain' }),
    ];
    const filePaths = ['scripts/renpy_mouse_day_1.rpy', 'chapters/renpy_mouse_day_2.rpy'];
    const assetCatalog = {
      root_kind: 'renpy-game-root',
      game_directory: 'game',
      entries: [
        {
          path: 'images/monika/monika 1a.png',
          name: 'monika 1a.png',
          extension: '.png',
          kind: 'image',
          size: 100,
          lastModified: 1000,
        },
      ],
    };
    const importResult: ProjectGraphImportResult = {
      project_id: 'project-load-snapshot',
      file_count: 2,
      label_count: 2,
      label_start_count: 2,
      node_count: 2,
      edge_count: 1,
      diagnostics: {
        total: 0,
        blocking: 0,
        info: 0,
        warning: 0,
        error: 0,
      },
      snapshot_available: true,
      catalog_entry_count: 1,
    };

    mock.onPost('/projects/project-load-snapshot/graph-import').reply((config) => {
      const formData = config.data as FormData;
      expect(formData.getAll('file_paths')).toEqual(filePaths);
      expect(JSON.parse(formData.get('asset_catalog') as string)).toEqual(assetCatalog);
      return [200, importResult];
    });

    await expect(
      importProjectGraphFiles('project-load-snapshot', files, { filePaths, assetCatalog }),
    ).resolves.toEqual(importResult);
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

  it('saves a binary CRDT snapshot without JSON wrapping', async () => {
    const snapshot = new Uint8Array([1, 2, 3, 4]);

    mock.onPut('/projects/project-load-snapshot/graph-snapshot').reply((config) => {
      expect(config.headers?.['Content-Type']).toBe('application/octet-stream');
      expect([...new Uint8Array(config.data as ArrayBuffer)]).toEqual([...snapshot]);
      return [200, { status: 'success' }];
    });

    await expect(saveProjectGraphCrdtSnapshot('project-load-snapshot', snapshot)).resolves.toEqual({
      status: 'success',
    });
  });

  it('exports normalized RenPy files from a ProjectGraph payload', async () => {
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
          content: 'r "RenPy Mouse exports from the canvas."',
          order: '0000',
          source_span: { start_line: 1, end_line: 1 },
          metadata: {},
          visual: { position: { x: 64, y: 136 }, size: { width: 360, height: 88 } },
        },
      ],
      edges: [],
      diagnostics: [],
      source_index: { files: {} },
    };
    const files = { 'renpy_mouse_day_1.rpy': 'label start:\n    r "RenPy Mouse exports from the canvas."\n' };

    mock.onPost('/projects/project-load-snapshot/graph-export').reply((config) => {
      expect(JSON.parse(config.data)).toEqual(graph);
      return [200, { files }];
    });

    await expect(exportProjectGraphFiles('project-load-snapshot', graph)).resolves.toEqual(files);
  });
});
