import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createProjectGraphRenderedNodeCache,
  pruneProjectGraphRenderedNodeCache,
  reconcileProjectGraphRenderedNodes,
} from '../projectGraphRenderedNodeCache';

const buildNode = (id: string, data: Record<string, unknown> = {}): Node => ({
  id,
  type: 'scenarioNode',
  position: { x: 0, y: 0 },
  data,
});

const buildOptions = (selectedNodeId: string | null = null) => ({
  selectedNodeId,
  getRenderMode: (node: Node) => (node.data.simple === true ? ('simple' as const) : ('normal' as const)),
  onHeaderPointerDown: vi.fn(),
  onCodeOnlyFileOpen: vi.fn(),
});

describe('project graph rendered-node cache', () => {
  it('reuses unchanged node objects when spatial-window membership changes', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const a = buildNode('a');
    const b = buildNode('b');
    const c = buildNode('c');
    const options = buildOptions();

    const first = reconcileProjectGraphRenderedNodes(cache, [a, b], options);
    const second = reconcileProjectGraphRenderedNodes(cache, [b, c], options);

    expect(second.nodes[0]).toBe(first.nodes[1]);
    expect(second.stats).toEqual({ created: 1, reused: 1 });
  });

  it('retains a node identity while it is outside the spatial window', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const a = buildNode('a');
    const b = buildNode('b');
    const options = buildOptions();

    const first = reconcileProjectGraphRenderedNodes(cache, [a], options);
    reconcileProjectGraphRenderedNodes(cache, [b], options);
    const reentered = reconcileProjectGraphRenderedNodes(cache, [a], options);

    expect(reentered.nodes[0]).toBe(first.nodes[0]);
    expect(reentered.stats).toEqual({ created: 0, reused: 1 });
  });

  it('changes only the old and new selection objects', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const nodes = [buildNode('a'), buildNode('b'), buildNode('c')];
    const sharedOptions = buildOptions('a');

    const first = reconcileProjectGraphRenderedNodes(cache, nodes, sharedOptions);
    const second = reconcileProjectGraphRenderedNodes(cache, nodes, {
      ...sharedOptions,
      selectedNodeId: 'b',
    });

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.nodes[2]).toBe(first.nodes[2]);
    expect(second.stats).toEqual({ created: 2, reused: 1 });
  });

  it('invalidates only nodes whose source or render mode changed', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const a = buildNode('a');
    const b = buildNode('b');
    const options = buildOptions();
    const first = reconcileProjectGraphRenderedNodes(cache, [a, b], options);
    const updatedA = buildNode('a', { version: 2 });
    const simpleB = buildNode('b', { simple: true });

    const sourceChanged = reconcileProjectGraphRenderedNodes(cache, [updatedA, b], options);
    const renderModeChanged = reconcileProjectGraphRenderedNodes(cache, [updatedA, simpleB], options);

    expect(sourceChanged.nodes[0]).not.toBe(first.nodes[0]);
    expect(sourceChanged.nodes[1]).toBe(first.nodes[1]);
    expect(renderModeChanged.nodes[0]).toBe(sourceChanged.nodes[0]);
    expect(renderModeChanged.nodes[1]).not.toBe(sourceChanged.nodes[1]);
    expect(renderModeChanged.nodes[1].data.renderMode).toBe('simple');
  });

  it('preserves stable node callbacks and routes them through the current handlers', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const node = buildNode('a');
    const options = buildOptions();
    const first = reconcileProjectGraphRenderedNodes(cache, [node], options);
    const pointerEvent = {} as never;

    (first.nodes[0].data.onHeaderPointerDown as (event: never) => void)(pointerEvent);
    (first.nodes[0].data.onCodeOnlyFileOpen as () => void)();

    expect(options.onHeaderPointerDown).toHaveBeenCalledWith('a', pointerEvent);
    expect(options.onCodeOnlyFileOpen).toHaveBeenCalledWith('a');
    expect(reconcileProjectGraphRenderedNodes(cache, [node], options).nodes[0].data).toBe(first.nodes[0].data);
  });

  it('invalidates cached objects when a handler identity changes', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const node = buildNode('a');
    const options = buildOptions();
    const first = reconcileProjectGraphRenderedNodes(cache, [node], options);

    const second = reconcileProjectGraphRenderedNodes(cache, [node], {
      ...options,
      onCodeOnlyFileOpen: vi.fn(),
    });

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
  });

  it('can bypass reuse for a causal development A/B comparison', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const node = buildNode('a');
    const options = buildOptions();
    const first = reconcileProjectGraphRenderedNodes(cache, [node], options);
    const bypassed = reconcileProjectGraphRenderedNodes(cache, [node], { ...options, reuseEnabled: false });

    expect(bypassed.nodes[0]).not.toBe(first.nodes[0]);
    expect(bypassed.stats).toEqual({ created: 1, reused: 0 });
  });

  it('prunes entries that no longer exist in the full projection', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const nodes = [buildNode('a'), buildNode('b')];
    const options = buildOptions();
    const first = reconcileProjectGraphRenderedNodes(cache, nodes, options);

    pruneProjectGraphRenderedNodeCache(cache, ['b']);
    const second = reconcileProjectGraphRenderedNodes(cache, nodes, options);

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
    expect(second.nodes[1]).toBe(first.nodes[1]);
  });

  it('bounds object recreation to window delta on a 20k-node source projection', () => {
    const cache = createProjectGraphRenderedNodeCache();
    const nodes = Array.from({ length: 20_000 }, (_, index) => buildNode(`node-${index}`));
    const options = buildOptions();
    const firstWindow = nodes.slice(0, 5_000);
    const shiftedWindow = nodes.slice(1_000, 6_000);

    reconcileProjectGraphRenderedNodes(cache, firstWindow, options);
    const cached = reconcileProjectGraphRenderedNodes(cache, shiftedWindow, options);
    const uncached = reconcileProjectGraphRenderedNodes(cache, shiftedWindow, { ...options, reuseEnabled: false });

    expect(cached.stats).toEqual({ created: 1_000, reused: 4_000 });
    expect(uncached.stats).toEqual({ created: 5_000, reused: 0 });
  });
});
