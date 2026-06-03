import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ActionEditorOverlay } from '../components/actionEditor/ActionEditorOverlay';
import type { ScenarioNodeSnapshot } from '../utils/projectGraphProjection';

const actionNode: ScenarioNodeSnapshot = {
  id: 'node-action-sayori-help',
  file_id: 'file-script-ch3',
  label_id: 'label-ch3-end-sayori',
  parent_node_id: null,
  type: 'action',
  content: [
    '"The clubroom gets quiet for a moment."',
    'scene bg club_day with dissolve',
    'show monika happy at left',
    'show sayori smile at right',
    'play music t2.ogg fadein 1.0',
    '',
    'm "If it\\\'s going to be anyone, then I prefer helping Sayori."',
    's "Ehehe... thank you, Monika."',
  ].join('\n'),
  order: '0003',
  source_span: { start_line: 42, end_line: 51 },
  metadata: { title: 'Sayori help scene', default_title: 'scene bg club_day with dissolve' },
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
        filePath="script-ch3.rpy"
        labelPath="ch3_end_sayori"
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
