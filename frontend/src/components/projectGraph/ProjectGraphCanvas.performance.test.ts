import { readFileSync } from 'node:fs';

import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildProjectGraphStaticMiniMapGeometry,
  buildProjectGraphStaticMiniMapViewportRect,
  getCodeOnlySourcePreview,
  getProjectGraphViewportStyleVariables,
} from './ProjectGraphCanvas';

describe('ProjectGraphCanvas viewport hot path', () => {
  it('keeps continuous viewport zoom outside every React Flow node data object', () => {
    const source = readFileSync(new URL('./ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).not.toContain('viewportZoom');
    expect(source).not.toContain('shouldTrackProjectGraphViewportLive');
    expect(source).toContain('<ViewportPortal>');
    expect(source).toContain('onNodeClick={handleNodeClick}');
    expect(source).toContain('onNodeDragStop={handleNodeDragStop}');
  });

  it('computes inherited frame-title and cursor scale variables without node data', () => {
    expect(getProjectGraphViewportStyleVariables(0.5)).toEqual({
      '--pg-frame-title-font-size': '30px',
      '--pg-frame-title-scale': '2',
      '--pg-frame-title-header-min-height': '56px',
      '--pg-viewport-inverse-zoom': '2',
    });
  });
});

describe('ProjectGraphCanvas static minimap', () => {
  const nodes: Node[] = [
    {
      id: 'file',
      type: 'projectFrame',
      position: { x: 100, y: 50 },
      data: {},
      style: { width: 800, height: 600 },
    },
    {
      id: 'label',
      type: 'labelFrame',
      parentId: 'file',
      position: { x: 40, y: 30 },
      data: {},
      style: { width: 500, height: 400 },
    },
    {
      id: 'action',
      type: 'scenarioNode',
      parentId: 'label',
      position: { x: 20, y: 10 },
      data: {},
      style: { width: 200, height: 80 },
    },
  ];

  it('builds frame geometry once and derives viewport rectangles separately', () => {
    const geometry = buildProjectGraphStaticMiniMapGeometry(nodes);
    const firstRect = buildProjectGraphStaticMiniMapViewportRect(
      geometry,
      { x: 0, y: 0, zoom: 1 },
      { width: 1200, height: 800 },
    );
    const pannedRect = buildProjectGraphStaticMiniMapViewportRect(
      geometry,
      { x: -300, y: -200, zoom: 1 },
      { width: 1200, height: 800 },
    );

    expect(geometry.frames.map((frame) => frame.id)).toEqual(['file', 'label']);
    expect(firstRect).not.toBeNull();
    expect(pannedRect).not.toEqual(firstRect);
    expect(geometry.frames.map((frame) => frame.id)).toEqual(['file', 'label']);
  });

  it('does not rebuild full minimap geometry from viewport-dependent component memoization', () => {
    const source = readFileSync(new URL('./ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('buildProjectGraphStaticMiniMapGeometry(nodes)');
    expect(source).toContain('buildProjectGraphStaticMiniMapViewportRect(geometry, viewport, canvasSize)');
    expect(source).not.toContain('buildProjectGraphStaticMiniMapModel(nodes, viewport, canvasSize)');
  });
});

describe('ProjectGraphCanvas code-only frame preview', () => {
  it('keeps canvas source previews bounded while preserving an explicit truncation marker', () => {
    const source = Array.from({ length: 40 }, (_, index) => `line ${index + 1} ${'x'.repeat(100)}`).join('\n');
    const preview = getCodeOnlySourcePreview({ sourceContent: source });

    expect(preview.split('\n').length).toBeLessThanOrEqual(13);
    expect(preview.length).toBeLessThanOrEqual(1202);
    expect(preview).toContain('line 1');
    expect(preview).not.toContain('line 40');
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('ProjectGraphCanvas spatial projection', () => {
  it('feeds React Flow from a bounded spatial query while keeping the full projection for the minimap', () => {
    const source = readFileSync(new URL('./ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(source).toContain('buildProjectGraphSpatialNodeIndex');
    expect(source).toContain('queryProjectGraphSpatialNodes');
    expect(source).toContain('queryProjectGraphSpatialEdges');
    expect(source).toContain('reconcileProjectGraphRenderedNodes');
    expect(source).toContain('reconcileProjectGraphProjection');
    expect(source).toContain('refreshProjectGraphSpatialNodeIndexNodes');
    expect(source).toContain('nodes={interactiveNodes}');
    expect(source).toContain('nodes={projection.nodes} viewport={viewport}');
  });
});
