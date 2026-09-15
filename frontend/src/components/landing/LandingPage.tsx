import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import brandLogoUrl from '../../assets/logo.svg';
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

const languageOptions = [
  { code: 'en', key: 'language.english' },
  { code: 'ru', key: 'language.russian' },
  { code: 'ja', key: 'language.japanese' },
  { code: 'zh', key: 'language.chinese' },
  { code: 'de', key: 'language.german' },
];

const getClockworkLibraryHallFirstScenarioNodeId = (graph: ProjectGraphSnapshot | null): string | null => {
  if (!graph) {
    return null;
  }

  const libraryHallLabel = graph.labels.find((label) => label.qualified_name === 'library_hall');
  if (!libraryHallLabel) {
    return null;
  }

  const firstScenario = graph.nodes
    .filter((node) => node.label_id === libraryHallLabel.id && node.parent_node_id === null)
    .sort((left, right) => left.order.localeCompare(right.order))[0];

  return firstScenario?.id ?? null;
};

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [demoPreview, setDemoPreview] = useState<ClockworkLibraryDemoPreviewResponse | null>(null);
  const [demoGraph, setDemoGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [demoPreviewFailed, setDemoPreviewFailed] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const demoCrdtDocRef = useRef<ProjectGraphCrdtDoc | null>(null);

  const handleOpenDemoIntent = () => {
    navigate('/login');
  };

  useEffect(() => {
    let isMounted = true;

    loadClockworkLibraryDemoPreview()
      .then((preview) => {
        if (isMounted) {
          const demoDoc = createProjectGraphCrdtDoc(preview.graph, { peerId: '9000001' });
          demoCrdtDocRef.current = demoDoc;
          setDemoPreview(preview);
          setDemoGraph(projectGraphFromCrdtDoc(demoDoc));
          setDemoPreviewFailed(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          demoCrdtDocRef.current = null;
          setDemoGraph(null);
          setDemoPreviewFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const demoInitialFocusNodeId = useMemo(
    () => getClockworkLibraryHallFirstScenarioNodeId(demoGraph),
    [demoGraph],
  );

  const handleDemoScenarioContentChange = (nodeId: string, content: string) => {
    const demoDoc = demoCrdtDocRef.current;
    if (!demoDoc) {
      return;
    }
    updateScenarioNodeContent(demoDoc, nodeId, content);
    setDemoGraph(projectGraphFromCrdtDoc(demoDoc));
  };

  const handleDemoScenarioMetadataChange = (nodeId: string, metadataPatch: Record<string, unknown>) => {
    const demoDoc = demoCrdtDocRef.current;
    if (!demoDoc) {
      return;
    }
    updateScenarioNodeMetadata(demoDoc, nodeId, metadataPatch);
    setDemoGraph(projectGraphFromCrdtDoc(demoDoc));
  };

  const handleDemoActionEditorNextAction = (sourceNodeId: string, request: ActionEditorNextActionRequest) => {
    const demoDoc = demoCrdtDocRef.current;
    if (!demoDoc) {
      return null;
    }

    const result = insertProjectGraphNextScenario(demoDoc, {
      action: request.action,
      conditionalDraft: request.conditionalDraft,
      menuDraft: request.menuDraft,
      sourceNodeId,
      target: request.target,
      targetLabelId: request.targetLabelId,
    });
    setDemoGraph(projectGraphFromCrdtDoc(demoDoc));
    return result.selectedNodeId;
  };

  return (
    <Box
      className="landing-root"
      sx={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        background: '#f7f8fb',
        color: '#121826',
      }}
    >
      <Box
        className="landing-demo-stage"
        aria-label={t('landing.demoAria')}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
        }}
      >
        {demoPreview && demoGraph ? (
          <ProjectGraphCanvas
            allowLandingInspector
            allowLandingActionEditor
            assetCatalog={demoPreview.asset_catalog}
            className="landing-project-graph-canvas"
            graph={demoGraph}
            initialFocusNodeId={demoInitialFocusNodeId}
            onlyRenderVisibleElements
            onActionEditorNextAction={handleDemoActionEditorNextAction}
            onScenarioContentChange={handleDemoScenarioContentChange}
            onScenarioMetadataChange={handleDemoScenarioMetadataChange}
            presentationMode="landing"
            projectName="DEMO"
          />
        ) : (
          <Box
            sx={{
              display: 'grid',
              height: '100%',
              placeItems: 'center',
              px: 3,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 800 }}>
              {demoPreviewFailed ? t('landing.demoUnavailable') : t('landing.demoLoading')}
            </Typography>
          </Box>
        )}
      </Box>

      <Box className="landing-top-left-chrome">
        <Box
          className="landing-demo-brand-bubble"
          sx={{
            display: 'flex',
            height: 46,
            boxSizing: 'border-box',
            alignItems: 'center',
            gap: '12px',
            border: '1px solid rgba(15, 23, 42, 0.1)',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.86)',
            padding: '8px 12px',
            boxShadow: '0 10px 28px rgba(15, 23, 42, 0.1)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Box
            component="img"
            src={brandLogoUrl}
            alt="renpy.online"
            sx={{ display: 'block', width: 150, height: 'auto', maxHeight: 28, objectFit: 'contain' }}
          />
          <Box
            sx={{
              minWidth: 0,
              borderLeft: '1px solid rgba(15, 23, 42, 0.12)',
              pl: '12px',
              color: '#0f172a',
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            DEMO
          </Box>
        </Box>

        <Button
          className="landing-demo-login-bubble"
          variant="contained"
          startIcon={<LoginRoundedIcon />}
          onClick={handleOpenDemoIntent}
          sx={{
            height: 46,
            minHeight: 46,
            borderRadius: '8px',
            background: '#0f172a',
            px: 2,
            py: 0,
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: 0,
            textTransform: 'none',
            '& .MuiButton-startIcon': {
              display: 'inline-flex',
              alignItems: 'center',
              mr: '7px',
            },
            '&:hover': {
              background: '#1e293b',
              boxShadow: '0 14px 32px rgba(15, 23, 42, 0.2)',
            },
          }}
        >
          {t('landing.login')}
        </Button>
      </Box>

      <Box className="landing-language-control">
        <button
          className="landing-language-bubble"
          type="button"
          aria-label={t('mainMenu.language.change')}
          aria-expanded={languageOpen}
          onClick={() => setLanguageOpen((current) => !current)}
        >
          <TranslateRoundedIcon fontSize="small" />
        </button>
        {languageOpen ? (
          <div className="landing-language-popover">
            {languageOptions.map((language) => (
              <button
                className="landing-language-option"
                type="button"
                key={language.code}
                onClick={() => {
                  void i18n.changeLanguage(language.code);
                  setLanguageOpen(false);
                }}
              >
                {t(language.key)}
              </button>
            ))}
          </div>
        ) : null}
      </Box>

      <Box
        className="landing-hero-bubble"
        sx={{
          position: 'absolute',
          zIndex: 18,
          top: '50%',
          width: { xs: 'min(360px, calc(100vw - 36px))', md: 390 },
          transform: 'translateY(-50%)',
          border: '1px solid rgba(15, 23, 42, 0.1)',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.84)',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.12)',
          backdropFilter: 'blur(10px)',
          p: { xs: '22px', md: '28px' },
        }}
      >
        <Typography
          component="h1"
          sx={{
            maxWidth: 330,
            color: '#0b1020',
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontSize: { xs: 42, md: 56 },
            fontWeight: 500,
            letterSpacing: 0,
            lineHeight: 0.98,
            m: 0,
          }}
        >
          {t('landing.hero.title')}
        </Typography>
        <Typography
          sx={{
            maxWidth: 330,
            mt: 2,
            color: '#526071',
            fontSize: 15,
            fontWeight: 560,
            letterSpacing: 0,
            lineHeight: 1.5,
          }}
        >
          {t('landing.hero.description')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 0.85, mt: 3 }}>
          {[t('landing.storyTags.realtime'), t('landing.storyTags.fullProject')].map((tag) => (
            <Typography
              key={tag}
              sx={{
                color: '#8b96a8',
                fontSize: 12,
                fontWeight: 760,
                letterSpacing: 0,
                lineHeight: 1.35,
              }}
            >
              {tag}
            </Typography>
          ))}
        </Box>
      </Box>

      <Typography
        component="small"
        sx={{
          position: 'absolute',
          zIndex: 20,
          left: { xs: 24, lg: 64 },
          right: { xs: 24, lg: 64 },
          bottom: { xs: 18, lg: 22 },
          color: '#9aa4b2',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0,
          lineHeight: 1.35,
          textAlign: { xs: 'left', lg: 'center' },
          pointerEvents: 'none',
        }}
      >
        {t('landing.legal')}
      </Typography>
    </Box>
  );
};

export default LandingPage;
