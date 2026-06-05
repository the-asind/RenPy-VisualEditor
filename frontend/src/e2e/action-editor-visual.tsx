import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';

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

const Harness = () => {
  const [node, setNode] = useState(actionNode);

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
        filePath="script-ch20.rpy"
        labelPath="ch20_main2"
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
        saveStatus="Autosaved just now"
      />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
