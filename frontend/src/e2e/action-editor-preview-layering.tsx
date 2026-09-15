import React from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ProjectAssetCatalogPayload } from '../utils/localRenpyDirectory';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';

const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const backgroundImage = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#b8c0cc"/>
  <rect x="190" y="88" width="260" height="218" rx="4" fill="#8a5d3b"/>
  <rect x="210" y="108" width="220" height="178" rx="3" fill="#a37147"/>
  <text x="320" y="54" text-anchor="middle" font-family="Arial" font-size="28" fill="#1f2937">bg entrance</text>
</svg>
`);

const davidAngryImage = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="220" viewBox="0 0 140 220">
  <rect width="140" height="220" rx="18" fill="#ef4444"/>
  <circle cx="70" cy="62" r="34" fill="#fee2e2"/>
  <rect x="30" y="116" width="80" height="82" rx="12" fill="#991b1b"/>
  <text x="70" y="106" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#ffffff">DAVID</text>
</svg>
`);

const adamImage = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="210" viewBox="0 0 120 210">
  <rect width="120" height="210" rx="16" fill="#22c55e"/>
  <text x="60" y="105" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#052e16">ADAM</text>
</svg>
`);

const sashaImage = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="118" height="198" viewBox="0 0 118 198">
  <rect width="118" height="198" rx="16" fill="#3b82f6"/>
  <text x="59" y="99" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#eff6ff">SASHA</text>
</svg>
`);

const assetCatalog: ProjectAssetCatalogPayload = {
  root_kind: 'renpy-game-root',
  game_directory: 'game',
  entries: [
    {
      path: 'backgrounds/entrance.png',
      name: 'entrance.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['bg entrance'],
    },
    {
      path: 'images/david/angry.webp',
      name: 'angry.webp',
      extension: '.webp',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['david angry'],
    },
    {
      path: 'images/david/sad.webp',
      name: 'sad.webp',
      extension: '.webp',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['david sad'],
    },
    {
      path: 'images/adam/neutral.webp',
      name: 'neutral.webp',
      extension: '.webp',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['adam neutral'],
    },
    {
      path: 'images/sasha/neutral.webp',
      name: 'neutral.webp',
      extension: '.webp',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['sasha neutral'],
    },
  ],
};

const localAssetUrls = {
  'backgrounds/entrance.png': backgroundImage,
  'images/david/angry.webp': davidAngryImage,
  'images/david/sad.webp': davidAngryImage,
  'images/adam/neutral.webp': adamImage,
  'images/sasha/neutral.webp': sashaImage,
};

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-preview-layering',
  file_id: 'file-preview-layering',
  label_id: 'label-preview-layering',
  parent_node_id: null,
  type: 'action',
  content: [
    'scene bg entrance',
    'show expression RainAnimation(drops=400) as rain onlayer master',
    'show adam neutral at left',
    'show sasha neutral at truecenter',
    'show david sad at right',
    'show layer master at creep_bg',
    'with pushup',
    'play sound "sfx/domofon.opus" fadein 1.0 volume 0.5 loop',
    '"Первый прибежал Давид. Он жил совсем недалеко."',
    'david "Демид, давай, бля, отвечай скорее."',
    'show david angry at right with dissolve',
    'david "Хорошо, что хотя бы тихо пока."',
  ].join('\n'),
  order: '0021',
  source_span: { start_line: 1, end_line: 10 },
  metadata: {
    title: 'David entrance preview',
    default_title: 'scene bg entrance',
  },
  visual: { position: { x: 360, y: 220 }, size: { width: 360, height: 136 } },
};

createRoot(document.getElementById('root')!).render(
  <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#eef2f7' }}>
    <ActionEditorOverlay
      assetCatalog={assetCatalog}
      filePath="script.rpy"
      labelPath="day1"
      localAssetUrls={localAssetUrls}
      node={actionNode}
      onClose={() => undefined}
      onContentChange={() => undefined}
      onTitleChange={() => undefined}
      saveStatus="Preview fixture"
    />
  </div>,
);
