import { describe, expect, it } from 'vitest';
import { createProjectGraphCrdtDoc, projectGraphFromCrdtDoc } from '../../../utils/projectGraphCrdt';
import { projectGraphToReactFlow, type ProjectGraphSnapshot } from '../../../utils/projectGraphProjection';
import { buildDemoChapters } from '../demoChapters';
import { viewportForDemoChapter } from '../demoChapters';
import type { Node } from '@xyflow/react';
describe('demo chapter placement', () => {
  it('keeps text outside project frames and leaves graph untouched', () => {
    const nodes = [{ id: 'file', position: { x: 400, y: 100 }, width: 1200, height: 3000 }];
    const before = JSON.stringify(nodes);
    const chapters = buildDemoChapters(nodes);
    expect(chapters).toHaveLength(4);
    expect(chapters.map(chapter => chapter.id)).toEqual(['intro', 'branches', 'collaboration', 'files']);
    for (const chapter of chapters) {
      const outsideFrame = chapter.x + chapter.width < 400 || chapter.x > 1600 ||
        chapter.y + 580 < 100 || chapter.y > 3100;
      expect(outsideFrame).toBe(true);
    }
    expect(new Set(chapters.map(c => `${c.x},${c.y}`)).size).toBe(4);
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('supports empty previews', () => {
    expect(buildDemoChapters([]).every(c => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
  });
});


it('keeps demo copy out of the actual Loro project after projection', () => {
  const graph: ProjectGraphSnapshot = {
    project_id: 'mouse-demo', files: [{ id: 'mouse-file', path: 'mouse.rpy', order: '0',
      visual: { position: { x: 0, y: 0 }, size: { width: 800, height: 640 } },
      metadata: { code_only: true } }],
    labels: [], label_starts: [], nodes: [], edges: [], diagnostics: [],
    source_index: { 'mouse.rpy': '# RenPy Mouse refuses to become a marketing headline.' },
  };
  const doc = createProjectGraphCrdtDoc(graph, { peerId: '9000021' });
  const before = projectGraphFromCrdtDoc(doc);
  const projection = projectGraphToReactFlow(before);
  const chapters = buildDemoChapters(projection.nodes);
  expect(chapters[0].title).toContain('Plotmio');
  expect(projectGraphFromCrdtDoc(doc)).toEqual(before);
  expect(JSON.stringify(projectGraphFromCrdtDoc(doc))).not.toContain('Plotmio');
  expect(projection.nodes.map(n => n.id)).not.toContain('intro');
});

it('anchors each chapter action to the content that proves its claim', () => {
  const frames = ['script.rpy', 'library.rpy', 'basement.rpy', 'rooftop.rpy', 'characters.rpy', 'audio.rpy'].map((path, index) => ({
    id: `file-${index}`, type: 'projectFrame', position: { x: index * 1360, y: 0 }, width: 1200, height: 1000,
    data: { path },
  }));
  const scenarios = [
    { id: 'first-scene', type: 'scenarioNode', parentId: 'file-0', position: { x: 160, y: 180 }, width: 320, height: 180, data: { scenarioType: 'action', original: { file_id: 'file-0' } } },
    { id: 'real-menu', type: 'scenarioNode', parentId: 'file-1', position: { x: 260, y: 390 }, width: 320, height: 100, data: { scenarioType: 'menu', original: { file_id: 'file-1' } } },
    { id: 'team-scene', type: 'scenarioNode', parentId: 'file-2', position: { x: 240, y: 200 }, width: 320, height: 180, data: { scenarioType: 'action', original: { file_id: 'file-2' } } },
  ];
  const chapters = buildDemoChapters([...frames, ...scenarios] as Node[]);
  expect(chapters.map(chapter => chapter.targetNodeId)).toEqual(['first-scene', 'real-menu', 'team-scene', 'file-5']);
  expect(chapters[1].focus.x).toBe(1360 + 260 + 160);
  expect(chapters[2].focus.x).toBe(2720 + 240 + 160);
});

it('frames the selected copy without centering the following chapter', () => {
  const nodes = ['script.rpy', 'library.rpy', 'basement.rpy', 'rooftop.rpy', 'characters.rpy', 'audio.rpy'].map((path, index) => ({
    id: path, type: 'projectFrame', position: { x: index * 1360, y: 0 }, width: 1200, height: 1000, data: { path },
  })) as Node[];
  const chapters = buildDemoChapters(nodes);
  for (let index = 0; index < chapters.length - 1; index += 1) {
    const viewport = viewportForDemoChapter(chapters[index], 1440, 900);
    const copyX = chapters[index].x * viewport.zoom + viewport.x;
    const nextX = chapters[index + 1].x * viewport.zoom + viewport.x;
    const nextY = chapters[index + 1].y * viewport.zoom + viewport.y;
    expect(copyX).toBeGreaterThanOrEqual(20);
    expect(copyX).toBeLessThan(1000);
    expect(nextX > 1440 || nextY > 900).toBe(true);
  }
});
