import { describe, expect, it } from 'vitest';
import { createProjectGraphCrdtDoc, projectGraphFromCrdtDoc } from '../../../utils/projectGraphCrdt';
import { projectGraphToReactFlow, type ProjectGraphSnapshot } from '../../../utils/projectGraphProjection';
import { buildDemoChapters } from '../demoChapters';
describe('demo chapter placement', () => {
  it('keeps text outside project frames and leaves graph untouched', () => {
    const nodes = [{ id: 'file', position: { x: 400, y: 100 }, width: 1200, height: 3000 }];
    const before = JSON.stringify(nodes);
    const chapters = buildDemoChapters(nodes);
    expect(chapters).toHaveLength(4);
    expect(chapters.map(chapter => chapter.id)).toEqual(['intro', 'branches', 'collaboration', 'files']);
    for (const chapter of chapters) {
      expect(chapter.x + chapter.width < 400 || chapter.y + 580 < 100).toBe(true);
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
