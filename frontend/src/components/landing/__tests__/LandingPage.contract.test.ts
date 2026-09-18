import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const landingSource = readFileSync(new URL('../LandingPage.tsx', import.meta.url), 'utf-8');
const entrySource = readFileSync(new URL('../../../landing.tsx', import.meta.url), 'utf-8');
const authWindowSource = readFileSync(new URL('../../auth/AuthWindow.tsx', import.meta.url), 'utf-8');
const homePageSource = readFileSync(new URL('../../../pages/HomePage.tsx', import.meta.url), 'utf-8');

describe('Plotmio landing demo contract', () => {
  it('loads the interactive demo only after the explicit CTA', () => {
    expect(entrySource).toContain("getElementById('demo-start')");
    expect(entrySource).toContain("import('./components/landing/LandingPage')");
    expect(entrySource).toContain('data-demo-started');
    expect(entrySource).toContain("getElementById('demo-root')");
  });

  it('uses the real ProjectGraph canvas and an in-memory CRDT preview', () => {
    expect(landingSource).toContain('loadClockworkLibraryDemoPreview');
    expect(landingSource).toContain('createProjectGraphCrdtDoc');
    expect(landingSource).toContain('projectName="CLOCKWORK LIBRARY"');
    expect(landingSource).toContain('allowLandingInspector');
    expect(landingSource).toContain('allowLandingActionEditor');
    expect(landingSource).toContain('onScenarioContentChange');
    expect(landingSource).toContain('onScenarioMetadataChange');
    expect(landingSource).toContain('onActionEditorNextAction');
    expect(landingSource).not.toContain('saveProjectGraphCrdtSnapshot');
    expect(landingSource).not.toContain('ProjectGraphCollaborationSession');
  });

  it('keeps demo interaction on the marketing page', () => {
    expect(landingSource).not.toContain('useNavigate');
    expect(landingSource).not.toContain("navigate('/login')");
    expect(landingSource).toContain('onScenarioContentChange={onContentChange}');
    expect(landingSource).toContain('onScenarioMetadataChange={onMetadataChange}');
    expect(landingSource).toContain('onActionEditorNextAction={onNextAction}');
  });

  it('keeps login intent routing explicit and does not auto-open the demo', () => {
    expect(authWindowSource).toContain('useLocation');
    expect(authWindowSource).toContain('intent=import');
    expect(authWindowSource).toContain('navigate(continuePath, { replace: true })');
    expect(authWindowSource).not.toContain('openClockworkLibraryDemoProject');
    expect(authWindowSource).not.toContain('Opening demo editor');
  });

  it('keeps the authenticated home on the main menu', () => {
    expect(homePageSource).toContain("import MainMenuPage from '../components/mainMenu/MainMenuPage'");
    expect(homePageSource).toContain('<MainMenuPage />');
  });
});
