import type { Node, Viewport } from '@xyflow/react';
import { getAbsoluteNodePosition } from '../../utils/projectGraphProjection';

type DemoNode = Pick<Node, 'id' | 'type' | 'position' | 'parentId' | 'width' | 'height'> & { data?: Node['data'] };
export type DemoChapterId = 'intro' | 'branches' | 'collaboration' | 'files';

export interface DemoChapter {
  id: DemoChapterId;
  title: string;
  label: string;
  eyebrow: string;
  text: string;
  hint: string;
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  compactX?: number;
  compactY?: number;
  width: number;
  targetNodeId: string | null;
  focus: { x: number; y: number };
}

const point = (node: DemoNode | undefined, nodes: DemoNode[]) => {
  if (!node) return { x: 0, y: 0 };
  const position = getAbsoluteNodePosition(nodes as Node[], node.id) ?? node.position;
  return { x: position.x + Number(node.width ?? 0) / 2, y: position.y + Number(node.height ?? 0) / 2 };
};

export function buildDemoChapters(nodes: DemoNode[]): DemoChapter[] {
  const roots = nodes.filter(node => !node.parentId).sort((a, b) => a.position.x - b.position.x);
  const byPath = (path: string, fallback: number) =>
    roots.find(node => node.data?.path === path) ?? roots[Math.min(fallback, roots.length - 1)];
  const script = byPath('script.rpy', 0);
  const library = byPath('library.rpy', 1);
  const basement = byPath('basement.rpy', 2);
  const rooftop = byPath('rooftop.rpy', 3);
  const audio = byPath('audio.rpy', 5);
  const scenario = (file: DemoNode | undefined, type: string) =>
    nodes.find(node => node.type === 'scenarioNode' && node.data?.scenarioType === type &&
      (node.data?.original as { file_id?: string } | undefined)?.file_id === file?.id);
  const firstScene = scenario(script, 'action') ?? script;
  const menu = scenario(library, 'menu') ?? library;
  const teamScene = scenario(basement, 'action') ?? basement;
  const scriptX = script?.position.x ?? 0;
  const scriptY = script?.position.y ?? 0;
  const libraryX = library && library !== script ? library.position.x : scriptX + 1360;
  const libraryY = library?.position.y ?? scriptY;
  const basementX = basement && basement !== library ? basement.position.x : libraryX + 1360;
  const basementY = basement?.position.y ?? libraryY;
  const teamX = rooftop && rooftop !== basement ? rooftop.position.x : basementX + Number(basement?.width ?? 1200) + 240;
  const filesX = audio && audio !== rooftop ? audio.position.x : teamX + 2720;
  const filesY = audio?.position.y ?? scriptY;
  const menuFocus = point(menu, nodes);
  const teamFocus = point(teamScene, nodes);
  const filesFocus = point(audio, nodes);
  return [
    { id: 'intro', title: 'Plotmio understands your Ren’Py project.', label: 'The idea', eyebrow: 'YOUR STORY, IN PERSPECTIVE', text: 'Bring your .rpy files onto one canvas. Follow the story beyond the file list.', hint: 'Drag the canvas to explore. Click a scene to edit it.', x: scriptX - 720, y: scriptY, mobileX: scriptX - 720, mobileY: scriptY, targetNodeId: firstScene?.id ?? null, focus: point(firstScene, nodes) },
    { id: 'branches', title: 'Every choice leads somewhere.', label: 'Connections', eyebrow: 'FOLLOW THE THREAD', text: 'Labels, choices, jumps and calls reveal how your story connects. Explore the library beside you, then try changing a line.', hint: 'This is the real editor. Your demo edits stay here until you reload.', x: libraryX - 660, y: scriptY + Number(script?.height ?? 800) + 300, mobileX: menuFocus.x - 290, mobileY: libraryY - 640, targetNodeId: menu?.id ?? null, focus: menuFocus },
    { id: 'collaboration', title: 'Write the story together.', label: 'Collaborate', eyebrow: 'ONE PROJECT · MANY AUTHORS', text: 'Invite your team into the same project. Edit scenes on a shared canvas and see each other’s changes as you work.', hint: 'Choose who can view and who can edit. Sign in to collaborate on a saved project.', x: teamX, y: basementY - 640, mobileX: teamFocus.x - 290, mobileY: basementY - 640, compactX: basementX - 600, compactY: basementY - 530, targetNodeId: teamScene?.id ?? null, focus: teamFocus },
    { id: 'files', title: 'Your files. A new perspective.', label: 'Your files', eyebrow: 'BUILT AROUND REN’PY', text: 'Start with your existing .rpy scripts. Edit visually, then review and export normalized Ren’Py files.', hint: 'Open source · Apache 2.0 · No account needed to explore', x: filesX, y: filesY - 640, mobileX: filesX, mobileY: filesY - 640, targetNodeId: audio?.id ?? null, focus: filesFocus },
  ].map(chapter => ({ ...chapter, width: 580 })) as DemoChapter[];
}

export function chapterCopyPosition(chapter: DemoChapter, width: number, height: number) {
  if (width < 600) return { x: chapter.mobileX, y: chapter.mobileY };
  if (chapter.id === 'branches' && height < 760) {
    // On a short desktop viewport, place the claim beside the menu and move script.rpy out of its lane.
    return { x: chapter.x + 560, y: chapter.y - 650 };
  }
  if (chapter.id === 'collaboration' && height < 760) {
    // Let the copy lead from an empty lane on the left into the shared scene and cursors on the right.
    return { x: chapter.compactX ?? chapter.x, y: chapter.compactY ?? chapter.y };
  }
  if (width < 1100 && chapter.id === 'branches') return { x: chapter.mobileX, y: chapter.mobileY };
  return { x: chapter.x, y: chapter.y };
}

export function viewportForDemoChapter(chapter: DemoChapter, width: number, height: number): Viewport {
  const mobile = width < 600;
  const copy = chapterCopyPosition(chapter, width, height);
  const zoom = mobile
    ? Math.max(0.35, Math.min(1, (width - 48) / chapter.width, (height - 230) / 850))
    : Math.max(0.58, Math.min(1, (width - 56) / (chapter.id === 'files' ? 2800 : 1900),
      (height - 130) / (chapter.id === 'intro' ? 850 : chapter.id === 'files' ? 1400 : 1300)));
  const screenX = mobile ? 24 : chapter.id === 'collaboration' && height < 760 ? 32 : chapter.id === 'collaboration'
    ? width - chapter.width * zoom - 110 : chapter.id === 'files' ? width * 0.33 : 32;
  const screenY = mobile ? 165 : chapter.id === 'intro' ? 210 :
    chapter.id === 'branches' && width >= 1100 && height >= 760 ? 530 : 115;
  return { x: screenX - copy.x * zoom, y: screenY - copy.y * zoom, zoom };
}
