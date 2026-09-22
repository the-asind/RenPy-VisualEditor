import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import {
  loadClockworkLibraryDemoPreview,
  type ClockworkLibraryDemoPreviewResponse,
} from '../../services/api';
import {
  createProjectGraphCrdtDoc,
  insertProjectGraphNextScenario,
  projectGraphFromCrdtDoc,
  updateScenarioNodeContent,
  updateScenarioNodeMetadata,
  type ProjectGraphCrdtDoc,
} from '../../utils/projectGraphCrdt';
import type { ProjectGraphSnapshot } from '../../utils/projectGraphProjection';
import type { ActionEditorNextActionRequest } from '../actionEditor/ActionEditorSidebar';
import { ProjectGraphCanvas } from '../projectGraph/ProjectGraphCanvas';
import './LandingPage.css';
import { DemoStory } from './DemoStory';

const firstScenarioNodeId = (graph: ProjectGraphSnapshot | null): string | null => {
  const label = graph?.labels.find((item) => item.qualified_name === 'library_hall');
  if (!label || !graph) return null;
  return graph.nodes
    .filter((node) => node.label_id === label.id && node.parent_node_id === null)
    .sort((left, right) => left.order.localeCompare(right.order))[0]?.id ?? null;
};

const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ClockworkLibraryDemoPreviewResponse | null>(null);
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const docRef = useRef<ProjectGraphCrdtDoc | null>(null);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    loadClockworkLibraryDemoPreview()
      .then((result) => {
        if (!mounted) return;
        const doc = createProjectGraphCrdtDoc(result.graph, { peerId: '9000001' });
        docRef.current = doc;
        setPreview(result);
        setGraph(projectGraphFromCrdtDoc(doc));
      })
      .catch(() => mounted && setFailed(true));
    return () => { mounted = false; };
  }, [attempt]);

  const focusNodeId = useMemo(() => firstScenarioNodeId(graph), [graph]);
  const updateGraph = () => {
    if (docRef.current) setGraph(projectGraphFromCrdtDoc(docRef.current));
  };
  const onContentChange = (nodeId: string, content: string) => {
    if (!docRef.current) return;
    updateScenarioNodeContent(docRef.current, nodeId, content);
    updateGraph();
  };
  const onMetadataChange = (nodeId: string, patch: Record<string, unknown>) => {
    if (!docRef.current) return;
    updateScenarioNodeMetadata(docRef.current, nodeId, patch);
    updateGraph();
  };
  const onNextAction = (sourceNodeId: string, request: ActionEditorNextActionRequest) => {
    if (!docRef.current) return null;
    const result = insertProjectGraphNextScenario(docRef.current, {
      action: request.action,
      conditionalDraft: request.conditionalDraft,
      menuDraft: request.menuDraft,
      sourceNodeId,
      target: request.target,
      targetLabelId: request.targetLabelId,
    });
    updateGraph();
    return result.selectedNodeId;
  };

  return (
    <Box className="landing-demo-canvas" aria-label={t('landing.demoAria')}>
      {preview && graph ? (
        <ProjectGraphCanvas
          canvasStory={(nodes, flow) => <DemoStory nodes={nodes} flow={flow} />}
          allowLandingInspector
          allowLandingActionEditor
          assetCatalog={preview.asset_catalog}
          className="landing-project-graph-canvas"
          graph={graph}
          initialFocusNodeId={focusNodeId}
          onlyRenderVisibleElements
          onActionEditorNextAction={onNextAction}
          onScenarioContentChange={onContentChange}
          onScenarioMetadataChange={onMetadataChange}
          presentationMode="landing"
          projectName="CLOCKWORK LIBRARY"
        />
      ) : (
        <Box className="landing-demo-loading"><Typography>{failed ? t('landing.demoUnavailable') : t('landing.demoLoading')}</Typography>{failed && <><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button><a href="#how-it-works">Read how Plotmio works ↓</a></>}</Box>
      )}
    </Box>
  );
};

export default LandingPage;
