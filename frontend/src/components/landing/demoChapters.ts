import type { Node } from '@xyflow/react';
export function buildDemoChapters(nodes: Pick<Node, 'id' | 'position' | 'parentId' | 'width' | 'height'>[]) {
  const roots = nodes.filter(n => !n.parentId).sort((a, b) => a.position.x - b.position.x);
  const left = roots.length ? Math.min(...roots.map(n => n.position.x)) : 0;
  const top = roots.length ? Math.min(...roots.map(n => n.position.y)) : 0;
  return [
    { id: 'intro', title: 'Plotmio understands your Ren’Py project.', label: 'The idea', eyebrow: 'YOUR STORY, IN PERSPECTIVE', text: 'Bring your .rpy files onto one canvas. Follow the story beyond the file list.', hint: 'Drag the canvas to explore. Click a scene to edit it.' },
    { id: 'branches', title: 'Every choice leads somewhere.', label: 'Connections', eyebrow: 'FOLLOW THE THREAD', text: 'Labels, choices, jumps and calls reveal how your story connects. Explore the library beside you, then try changing a line.', hint: 'This is the real editor. Your demo edits stay here until you reload.' },
    { id: 'collaboration', title: 'Write the story together.', label: 'Collaborate', eyebrow: 'ONE PROJECT · MANY AUTHORS', text: 'Invite your team into the same project. Edit scenes on a shared canvas and see each other’s changes as you work.', hint: 'Choose who can view and who can edit. Sign in to collaborate on a saved project.' },
    { id: 'files', title: 'Your files. A new perspective.', label: 'Your files', eyebrow: 'BUILT AROUND REN’PY', text: 'Start with your existing .rpy scripts. Edit visually, then review and export normalized Ren’Py files.', hint: 'Open source · Apache 2.0 · No account needed to explore' },
  ].map((chapter, index) => {
    const root = roots[Math.min(index, roots.length - 1)];
    // Reading zones live outside file frames; no graph or CRDT entities are added.
    const x = index === 0 ? left - 720 : Math.max(root?.position.x ?? left, left + (index - 1) * 760);
    return {
      ...chapter, x, y: index === 0 ? top : top - 640, width: 580,
      scene: { x: (root?.position.x ?? left) + 300, y: (root?.position.y ?? top) + 240 },
    };
  });
}
