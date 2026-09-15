import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingSource = readFileSync(new URL('../LandingPage.tsx', import.meta.url), 'utf-8');
const landingCss = readFileSync(new URL('../LandingPage.css', import.meta.url), 'utf-8');
const appSource = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf-8');
const homePageSource = readFileSync(new URL('../../../pages/HomePage.tsx', import.meta.url), 'utf-8');
const loginPageSource = readFileSync(new URL('../../../pages/LoginPage.tsx', import.meta.url), 'utf-8');
const authWindowSource = readFileSync(new URL('../../auth/AuthWindow.tsx', import.meta.url), 'utf-8');

describe('LandingPage contract', () => {
  it('uses a headerless full-canvas demo with the current SVG logo and one login action into auth', () => {
    expect(landingSource).toContain("import brandLogoUrl from '../../assets/logo.svg'");
    expect(landingSource).toContain("t('landing.hero.title')");
    expect(landingSource).toContain(
      "t('landing.hero.description')",
    );
    expect(landingSource).toContain("t('landing.storyTags.realtime')");
    expect(landingSource).toContain("t('landing.storyTags.fullProject')");
    expect(landingSource).toContain("t('landing.legal')");
    expect(landingSource).toContain("navigate('/login')");
    expect(landingSource).not.toContain("navigate('/login?openDemo=clockwork-library')");

    expect(landingSource).not.toContain("navigate('/register')");
    expect(landingSource).not.toContain('menu.register');
    expect(landingSource).not.toContain('Watch demo');
    expect(landingSource).not.toContain('landing.cards');
    expect(landingSource).not.toContain('landing.realtime');
  });

  it('aligns compact landing chrome, shifts the hero left, and exposes the language switcher', () => {
    const mainMenuSource = readFileSync(new URL('../../mainMenu/MainMenuPage.tsx', import.meta.url), 'utf-8');

    expect(landingSource).toContain('landing-top-left-chrome');
    expect(landingSource).toContain('landing-language-bubble');
    expect(landingSource).toContain('landing-language-popover');
    expect(landingSource).toContain('TranslateRoundedIcon');
    expect(landingSource).toContain("i18n.changeLanguage(language.code)");
    expect(landingCss).toContain('height: 46px');
    expect(landingCss).toContain('left: clamp(26px, 14vw, 286px)');
    expect(landingCss).toContain('right: 16px');
    expect(landingCss).toContain('@media (max-width: 360px)');
    expect(landingCss).toContain('flex-wrap: wrap');
    expect(mainMenuSource).toContain('<TranslateRoundedIcon fontSize="small" />');
    expect(mainMenuSource).not.toContain('<span>A</span>');
  });

  it('replaces the old media/card landing with a normal full ProjectGraphCanvas demo preview', () => {
    expect(landingSource).toContain('landing-demo-stage');
    expect(landingSource).toContain('landing-hero-bubble');
    expect(landingSource).toContain('landing-demo-login-bubble');
    expect(landingSource).toContain('landing-demo-brand-bubble');
    expect(landingSource).toContain("import { ProjectGraphCanvas } from '../projectGraph/ProjectGraphCanvas';");
    expect(landingSource).toContain('loadClockworkLibraryDemoPreview');
    expect(landingSource).toContain('presentationMode="landing"');
    expect(landingSource).toContain('assetCatalog={demoPreview.asset_catalog}');
    expect(landingSource).toContain('allowLandingActionEditor');
    expect(landingSource).toContain('projectName="DEMO"');
    expect(landingSource).not.toContain('8 .rpy files');
    expect(landingSource).not.toContain('branching labels');
    expect(landingSource).not.toContain('Server-hosted media');

    expect(landingSource).not.toContain('const demoBranchNodes');
    expect(landingSource).not.toContain('const demoFiles');
    expect(landingSource).not.toContain('DemoFileFrame');
    expect(landingSource).not.toContain('TinyNode');
    expect(landingSource).not.toContain('ConnectorLine');
    expect(landingSource).not.toContain('tutorial_atl.rpy');
    expect(landingSource).not.toContain('tutorial_positions');
    expect(landingSource).not.toContain('Catalog: 312 file(s)');
    expect(landingSource).not.toContain('Connect game root');
    expect(landingSource).not.toContain('68%');

    expect(landingSource).not.toContain('<iframe');
    expect(landingSource).not.toContain('youtube.com/embed');
    expect(landingSource).not.toContain('DarkVeil');
    expect(landingSource).not.toContain('CardContent');
  });

  it('does not render an extra demo header over the landing canvas preview', () => {
    expect(landingSource).not.toContain('8 .rpy files · branching labels · Server-hosted media');
    expect(landingSource).not.toContain("top: 18");
    expect(landingSource).not.toContain("zIndex: 5");
    expect(landingSource).not.toContain('pt: 7.5');
  });

  it('keeps demo edits in memory while the full canvas supports inspector and action editor', () => {
    expect(landingSource).toContain('handleOpenDemoIntent');
    expect(landingSource).toContain('getClockworkLibraryHallFirstScenarioNodeId');
    expect(landingSource).toContain('onScenarioContentChange={handleDemoScenarioContentChange}');
    expect(landingSource).toContain('onScenarioMetadataChange={handleDemoScenarioMetadataChange}');
    expect(landingSource).toContain('onActionEditorNextAction={handleDemoActionEditorNextAction}');
    expect(landingSource).toContain('handleDemoActionEditorNextAction');
    expect(landingSource).toContain('insertProjectGraphNextScenario');
    expect(landingSource).toContain('projectGraphFromCrdtDoc');
    expect(landingSource).toContain('allowLandingInspector');
    expect(landingSource).toContain('allowLandingActionEditor');
    expect(landingSource).toContain('initialFocusNodeId={demoInitialFocusNodeId}');
    expect(landingSource).not.toContain('role="button"');
    expect(landingSource).not.toContain('onClick={handleOpenDemoIntent}\n          onKeyDown=');
    expect(landingSource).not.toContain("cursor: 'pointer'");
    expect(landingSource).toContain("position: 'absolute'");
    expect(landingSource).toContain('inset: 0');
    expect(landingSource).not.toContain("width: { xs: '100%', lg: '112%' }");
    expect(landingSource).not.toContain("overflow: 'visible'");
    expect(landingSource).not.toContain('minWidth: { lg: 780 }');
    expect(landingSource).toContain("import './LandingPage.css';");
    expect(landingCss).toContain('.landing-root:has(.project-graph-canvas__node-editor) .landing-hero-bubble');
    expect(landingCss).toContain('.landing-root:has(.action-editor) .landing-demo-stage');
    expect(landingCss).toContain('z-index: 40 !important');
  });

  it('never opens or stores the Clockwork Library demo automatically after login', () => {
    expect(loginPageSource).toContain('<AuthWindow mode="login"');
    expect(authWindowSource).not.toContain('useLocation');
    expect(authWindowSource).not.toContain('openClockworkLibraryDemoProject');
    expect(authWindowSource).not.toContain("new URLSearchParams(location.search).get('openDemo')");
    expect(authWindowSource).not.toContain('Opening demo editor');
    expect(authWindowSource).toContain("navigate('/', { replace: true })");
  });

  it('keeps landing demo edits local to the in-memory preview graph', () => {
    expect(landingSource).toContain('const [demoGraph, setDemoGraph]');
    expect(landingSource).toContain('demoCrdtDocRef');
    expect(landingSource).toContain('createProjectGraphCrdtDoc');
    expect(landingSource).toContain('updateScenarioNodeContent');
    expect(landingSource).toContain('updateScenarioNodeMetadata');
    expect(landingSource).toContain('projectGraphFromCrdtDoc');
    expect(landingSource).not.toContain('saveProjectGraphCrdtSnapshot');
    expect(landingSource).not.toContain('ProjectGraphCollaborationSession');
    expect(landingSource).not.toContain('connectProjectGraphCollaborationSocket');
  });

  it('keeps landing inspector and initial focus as presentation-only ProjectGraphCanvas options', () => {
    const canvasSource = readFileSync(new URL('../../projectGraph/ProjectGraphCanvas.tsx', import.meta.url), 'utf-8');

    expect(canvasSource).toContain('allowLandingInspector?: boolean');
    expect(canvasSource).toContain('allowLandingActionEditor?: boolean');
    expect(canvasSource).toContain('initialFocusNodeId?: string | null');
    expect(canvasSource).toContain('const shouldShowScenarioInspector = !isLandingPresentation || allowLandingInspector;');
    expect(canvasSource).toContain('const shouldAllowActionEditor = !isLandingPresentation || allowLandingActionEditor;');
    expect(canvasSource).toContain('initialLandingFocusDoneRef');
    expect(canvasSource).toContain('reactFlowInstance.setCenter(');
    expect(canvasSource).toContain('duration: 950');
  });

  it('keeps the global app shell headerless and lets pages own their bubble chrome', () => {
    expect(appSource).toContain("import { useAuth } from './contexts/AuthContext';");
    expect(appSource).toContain('<AppRoutes />');
    expect(appSource).not.toContain("import TopBar from './components/layout/TopBar'");
    expect(appSource).not.toContain("import Sidebar from './components/layout/Sidebar'");
    expect(appSource).not.toContain('BottomNavigation');
    expect(appSource).not.toContain('showTopBar');
    expect(appSource).not.toContain('showSidebar');
  });

  it('keeps the authenticated home focused on the new pre-canvas main menu', () => {
    expect(homePageSource).toContain("import MainMenuPage from '../components/mainMenu/MainMenuPage'");
    expect(homePageSource).toContain('<MainMenuPage />');
    expect(homePageSource).not.toContain('Open Clockwork Library demo');
    expect(homePageSource).not.toContain('ProjectManageDialog');
  });

  it('removes the old decorative landing roots after the replacement', () => {
    expect(existsSync(new URL('../DarkVeil.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../DarkVeil.css', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../GlassIcons.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../GlassIcons.css', import.meta.url))).toBe(false);
  });
});
