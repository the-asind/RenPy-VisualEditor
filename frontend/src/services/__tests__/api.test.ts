import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { apiClient, insertNode, type InsertNodeResponse } from '../api';

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
