import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ProjectAssetCatalogPayload } from '../utils/localRenpyDirectory';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';

const transparentPixel =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const edgeAlignedSprite = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160" viewBox="0 0 80 160"><rect width="80" height="160" fill="#ef4444"/></svg>',
)}`;
const replacementSprite = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160" viewBox="0 0 80 160"><rect width="80" height="160" fill="#2563eb"/></svg>',
)}`;

const assetCatalog: ProjectAssetCatalogPayload = {
  root_kind: 'renpy-game-root',
  game_directory: 'game',
  entries: [
    {
      path: 'backgrounds/living/on.png',
      name: 'on.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['bg living on'],
    },
    {
      path: 'backgrounds/kitchen/morning.png',
      name: 'morning.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['bg kitchen morning'],
    },
    {
      path: 'image/monika/happy.png',
      name: 'happy.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['mnk'],
    },
    {
      path: 'images/renpy_mouse/brave.png',
      name: 'brave.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['renpy mouse brave'],
    },
    {
      path: 'images/renpy_mouse/nervous.png',
      name: 'nervous.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['renpy mouse nervous'],
    },
    {
      path: 'images/crumbs/happy.png',
      name: 'happy.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['crumbs happy'],
    },
    {
      path: 'images/stale/kitchen.png',
      name: 'kitchen.png',
      extension: '.png',
      kind: 'image',
      size: 100,
      lastModified: 1000,
      renpyNames: ['stale kitchen mouse'],
    },
  ],
};

const localAssetUrls = {
  ...Object.fromEntries(assetCatalog.entries.map((entry) => [entry.path, transparentPixel])),
  'images/renpy_mouse/brave.png': edgeAlignedSprite,
  'images/renpy_mouse/nervous.png': replacementSprite,
};

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-scene-preview',
  file_id: 'file-scene-preview',
  label_id: 'label-scene-preview',
  parent_node_id: null,
  type: 'action',
  content: [
    'scene bg kitchen morning',
    'show stale kitchen mouse at Position(xalign=0.5, yalign=1.0)',
    'r "RenPy Mouse leaves the kitchen before the next scene."',
    'scene bg living on',
    'show layer master at creep_bg_day',
    'show mnk at Position(xalign=-0.1, yalign=1.0)',
    'show renpy mouse brave at Position(xalign=0.0, yalign=1.0)',
    'show renpy mouse nervous',
    'show crumbs happy at Position(xalign=0.6, yalign=1.0)',
    'with fade',
    'r "RenPy Mouse expects the final preview to show the whole living room cast."',
  ].join('\n'),
  order: '0017',
  source_span: { start_line: 1, end_line: 10 },
  metadata: {
    title: 'RenPy Mouse scene preview',
    default_title: 'scene bg living on',
  },
  visual: { position: { x: 360, y: 220 }, size: { width: 360, height: 136 } },
};

const Harness = () => {
  const [node, setNode] = useState(actionNode);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#eef2f7',
      }}
    >
      <ActionEditorOverlay
        assetCatalog={assetCatalog}
        filePath="script-preview.rpy"
        labelPath="renpy_mouse_preview"
        localAssetUrls={localAssetUrls}
        node={node}
        onClose={() => undefined}
        onContentChange={(content) => setNode((current) => ({ ...current, content }))}
        onTitleChange={(title) =>
          setNode((current) => ({
            ...current,
            metadata: {
              ...current.metadata,
              title,
            },
          }))
        }
        saveStatus="Preview fixture"
      />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
