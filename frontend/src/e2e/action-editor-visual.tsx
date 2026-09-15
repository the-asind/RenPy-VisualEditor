import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ActionEditorNextActionRequest } from '../components/actionEditor/ActionEditorSidebar';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';
import type { ProjectAssetCatalogPayload } from '../utils/localRenpyDirectory';

declare global {
  interface Window {
    __actionEditorNextActions?: ActionEditorNextActionRequest[];
  }
}

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-ch20-main2',
  file_id: 'file-script-ch20',
  label_id: 'label-ch20-main2',
  parent_node_id: null,
  type: 'action',
  content: [
    'scene black',
    'show monika 1 zorder 2 at t21',
    'hide sayori',
    'hide natsuki',
    'hide yuri',
    'y "Eh?"',
    'y "A...a guest?"',
    'show natsuki 4c zorder 2 at t32',
    'n "Seriously? You brought a boy?"',
    'n "Way to kill the atmosphere."',
    'show monika 3m zorder 3 at f31',
    'm "Don\\\'t be mean, Natsuki..."',
    'm 3b "...But anyway, welcome to the club, [player]!"',
    'show monika 3a zorder 2 at t31',
    'play music t2.ogg',
    'play sound page_turn.ogg',
    'pause 0.2',
    'mc "..."',
    '"All words escape me in this situation."',
    '"This club..."',
    '"{i}...is full of incredibly cute girls!!{/i}"',
    'n 5c "So, let me guess..."',
    'n "You\\\'re Monika\\\'s boyfriend, right?"',
    'mc "Wha--"',
    'm "No, I\\\'m not!"',
    'y "Natsuki..."',
    'n "The girl with the sour attitude, whose name is apparently Natsuki..."',
    'n "Is one I don\\\'t recognize."',
    's "You made it!"',
    's "I was worried you would forget."',
    'm "Welcome to the Literature Club."',
    '"The room somehow gets even quieter."',
  ].join('\n'),
  order: '0007',
  source_span: { start_line: 12, end_line: 38 },
  metadata: { title: 'y "Eh?"', default_title: 'y "Eh?"' },
  visual: { position: { x: 420, y: 260 }, size: { width: 360, height: 136 } },
};

const assetCatalog: ProjectAssetCatalogPayload = {
  root_kind: 'renpy-game-root',
  game_directory: 'game',
  entries: [
    {
      path: 'audio/t2.ogg',
      name: 't2.ogg',
      extension: '.ogg',
      kind: 'audio',
      size: 100,
      lastModified: 1000,
    },
    {
      path: 'audio/page_turn.ogg',
      name: 'page_turn.ogg',
      extension: '.ogg',
      kind: 'audio',
      size: 100,
      lastModified: 1000,
    },
  ],
};

const Harness = () => {
  const [node, setNode] = useState(actionNode);
  const handleNextAction = (request: ActionEditorNextActionRequest) => {
    window.__actionEditorNextActions = [...(window.__actionEditorNextActions ?? []), request];
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background:
          'linear-gradient(rgba(226, 232, 240, 0.72) 1px, transparent 1px), linear-gradient(90deg, rgba(226, 232, 240, 0.72) 1px, transparent 1px), #eef2f7',
        backgroundSize: '40px 40px',
      }}
    >
      <ActionEditorOverlay
        assetCatalog={assetCatalog}
        nextTargetLabels={[
          { current: true, id: 'label-start', labelStartNodeId: 'start-node-start', qualifiedName: 'ch20_main2' },
          { id: 'label-day-two', labelStartNodeId: 'start-node-day-two', qualifiedName: 'day_two' },
        ]}
        filePath="script-ch20.rpy"
        labelPath="ch20_main2"
        localAssetUrls={{
          'audio/t2.ogg': 'blob:t2',
          'audio/page_turn.ogg': 'blob:page-turn',
        }}
        node={node}
        onClose={() => undefined}
        onContentChange={(content) => setNode((current) => ({ ...current, content }))}
        onNextAction={handleNextAction}
        onTitleChange={(title) =>
          setNode((current) => ({
            ...current,
            metadata: {
              ...current.metadata,
              title,
            },
          }))
        }
        saveStatus="Autosaved just now"
      />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
