import React, { useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import {
  ProjectGraphCanvas,
  type ProjectGraphPresenceActivityUpdate,
} from '../components/projectGraph/ProjectGraphCanvas';
import {
  createProjectGraphCrdtDoc,
  exportProjectGraphCrdtSnapshot,
  exportProjectGraphCrdtUpdate,
  getProjectGraphCrdtVersion,
  importProjectGraphCrdtSnapshot,
  insertProjectGraphNextScenario,
  spliceScenarioNodeContent,
  type ProjectGraphCrdtDoc,
  type ProjectGraphScenarioTextSplice,
} from '../utils/projectGraphCrdt';
import { ProjectGraphCollaborationSession } from '../utils/projectGraphCollaboration';
import type { ProjectGraphSnapshot } from '../utils/projectGraphProjection';

declare global {
  interface Window {
    projectGraphInputHarness?: {
      graphChanges: string[];
      presenceEvents: ProjectGraphPresenceActivityUpdate[];
      insertAbove(): void;
      remoteSpliceAction(edit: Omit<ProjectGraphScenarioTextSplice, 'nodeId'>): void;
      snapshots: number;
      latestGraph: ProjectGraphSnapshot;
    };
  }
}

const graph: ProjectGraphSnapshot = {
  project_id: 'input-stability-project',
  files: [
    {
      id: 'file-day-1',
      path: 'renpy_mouse_typing_lab.rpy',
      order: '0000',
      visual: { position: { x: 0, y: 0 }, size: { width: 900, height: 700 } },
    },
  ],
  labels: [
    {
      id: 'label-start',
      file_id: 'file-day-1',
      parent_label_id: null,
      name: 'start',
      qualified_name: 'start',
      scope: 'global',
      label_start_node_id: 'label-start-node',
      source_span: { start_line: 1, end_line: 1 },
      visual: { position: { x: 48, y: 48 }, size: { width: 720, height: 540 } },
    },
    {
      id: 'label-day-two',
      file_id: 'file-day-1',
      parent_label_id: null,
      name: 'day_two',
      qualified_name: 'day_two',
      scope: 'global',
      label_start_node_id: 'label-day-two-node',
      source_span: { start_line: 20, end_line: 20 },
      visual: { position: { x: 48, y: 640 }, size: { width: 720, height: 300 } },
    },
  ],
  label_starts: [
    {
      id: 'label-start-node',
      file_id: 'file-day-1',
      label_id: 'label-start',
      qualified_name: 'start',
      content: 'label start:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
    {
      id: 'label-day-two-node',
      file_id: 'file-day-1',
      label_id: 'label-day-two',
      qualified_name: 'day_two',
      content: 'label day_two:',
      visual: { position: { x: 32, y: 32 }, size: { width: 260, height: 72 } },
    },
  ],
  nodes: [
    {
      id: 'node-action',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'action',
      content: 'RenPy Mouse waits for a stable keyboard.',
      order: '0000',
      source_span: { start_line: 2, end_line: 2 },
      metadata: {
        default_title: 'RenPy Mouse waits for a stable keyboard.',
        title: 'RenPy Mouse waits for a stable keyboard.',
      },
      visual: { position: { x: 64, y: 136 }, size: { width: 420, height: 128 } },
    },
    {
      id: 'node-lower-action',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'action',
      content: 'r "RenPy Mouse keeps editing the lower stable node."',
      order: '0001',
      source_span: { start_line: 3, end_line: 3 },
      metadata: {
        default_title: 'RenPy Mouse keeps editing the lower stable node.',
        title: 'RenPy Mouse keeps editing the lower stable node.',
      },
      visual: { position: { x: 64, y: 312 }, size: { width: 420, height: 128 } },
    },
    {
      id: 'node-reference',
      file_id: 'file-day-1',
      label_id: 'label-start',
      parent_node_id: null,
      type: 'jump',
      content: 'jump day_two',
      order: '0002',
      source_span: { start_line: 4, end_line: 4 },
      metadata: { target: 'day_two' },
      visual: { position: { x: 64, y: 488 }, size: { width: 420, height: 96 } },
    },
  ],
  edges: [{
    id: 'edge-reference-day-two',
    source_node_id: 'node-reference',
    target_node_id: 'label-day-two-node',
    kind: 'jump',
    metadata: { target: 'day_two' },
  }],
  diagnostics: [],
  source_index: { files: {} },
};

const Harness = () => {
  const [, startGraphTransition] = useTransition();
  const [currentGraph, setCurrentGraph] = useState<ProjectGraphSnapshot>(graph);
  const sessionRef = useRef<ProjectGraphCollaborationSession | null>(null);
  const remoteDocRef = useRef<ProjectGraphCrdtDoc | null>(null);

  if (!sessionRef.current) {
    const doc = createProjectGraphCrdtDoc(graph, { peerId: '1' });
    remoteDocRef.current = importProjectGraphCrdtSnapshot(exportProjectGraphCrdtSnapshot(doc), { peerId: '2' });
    sessionRef.current = new ProjectGraphCollaborationSession(doc, {
      persistDebounceMs: 500,
      persistSnapshot: async () => {
        if (window.projectGraphInputHarness) {
          window.projectGraphInputHarness.snapshots += 1;
        }
      },
      onGraphChange: (updatedGraph) =>
        startGraphTransition(() => {
          window.projectGraphInputHarness?.graphChanges.push(
            updatedGraph.nodes.find((node) => node.id === 'node-action')?.content ?? '',
          );
          window.projectGraphInputHarness!.latestGraph = updatedGraph;
          setCurrentGraph(updatedGraph);
        }),
    });
  }

  window.projectGraphInputHarness = window.projectGraphInputHarness ?? {
    graphChanges: [],
    presenceEvents: [],
    insertAbove: () => {
      const remoteDoc = remoteDocRef.current;
      if (!remoteDoc) {
        return;
      }
      const from = getProjectGraphCrdtVersion(remoteDoc);
      insertProjectGraphNextScenario(remoteDoc, { action: 'menu', sourceNodeId: 'node-action' });
      sessionRef.current?.receiveRemoteUpdate(exportProjectGraphCrdtUpdate(remoteDoc, from));
    },
    remoteSpliceAction: (edit) => {
      const remoteDoc = remoteDocRef.current;
      if (!remoteDoc) {
        return;
      }
      const from = getProjectGraphCrdtVersion(remoteDoc);
      spliceScenarioNodeContent(remoteDoc, { nodeId: 'node-action', ...edit });
      sessionRef.current?.receiveRemoteUpdate(exportProjectGraphCrdtUpdate(remoteDoc, from));
    },
    snapshots: 0,
    latestGraph: currentGraph,
  };
  window.projectGraphInputHarness.latestGraph = currentGraph;

  return (
    <ProjectGraphCanvas
      graph={currentGraph}
      projectName="RenPy Mouse Input Lab"
      saveStatus="Saved"
      onScenarioContentChange={(nodeId, content) => sessionRef.current?.editScenarioContent(nodeId, content)}
      onPresenceActivity={(update) => window.projectGraphInputHarness?.presenceEvents.push(update)}
      onScenarioContentSplice={(nodeId, splice) => sessionRef.current?.applyScenarioTextSplice({ nodeId, ...splice })}
      onScenarioMetadataChange={(nodeId, metadataPatch) =>
        sessionRef.current?.editScenarioMetadata(nodeId, metadataPatch)
      }
      onActionEditorNextAction={(sourceNodeId, request) => {
        const result = sessionRef.current?.insertNextScenario({
          action: request.action,
          conditionalDraft: request.conditionalDraft,
          menuDraft: request.menuDraft,
          sourceNodeId,
          target: request.target,
          targetLabelId: request.targetLabelId,
        });
        return result?.selectedNodeId ?? null;
      }}
      onCreateStructure={(command) => sessionRef.current?.createStructure(command).selectedEntityId ?? null}
    />
  );
};

createRoot(document.getElementById('root')!).render(<Harness />);
