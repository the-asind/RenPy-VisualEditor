import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf-8');
const homePageSource = readFileSync(new URL('../../../pages/HomePage.tsx', import.meta.url), 'utf-8');
const loginPageSource = readFileSync(new URL('../../../pages/LoginPage.tsx', import.meta.url), 'utf-8');
const registerPageSource = readFileSync(new URL('../../../pages/RegisterPage.tsx', import.meta.url), 'utf-8');
const authContextSource = readFileSync(new URL('../../../contexts/AuthContext.tsx', import.meta.url), 'utf-8');
const projectServiceSource = readFileSync(new URL('../../../services/projectService.ts', import.meta.url), 'utf-8');
const localDirectorySource = readFileSync(new URL('../../../utils/localRenpyDirectory.ts', import.meta.url), 'utf-8');

const mainMenuPath = new URL('../MainMenuPage.tsx', import.meta.url);
const mainMenuCssPath = new URL('../MainMenuPage.css', import.meta.url);
const authWindowPath = new URL('../../auth/AuthWindow.tsx', import.meta.url);
const recaptchaPath = new URL('../../auth/RecaptchaBox.tsx', import.meta.url);

describe('MainMenu replacement contract', () => {
  it('removes the MVP 1.0 app header, sidebar, and mobile bottom navigation shell', () => {
    expect(appSource).not.toContain("import TopBar from './components/layout/TopBar'");
    expect(appSource).not.toContain("import Sidebar from './components/layout/Sidebar'");
    expect(appSource).not.toContain('BottomNavigation');
    expect(appSource).not.toContain('showTopBar');
    expect(appSource).not.toContain('showSidebar');
    expect(appSource).toContain('<AppRoutes />');
  });

  it('replaces the authenticated home dashboard with the new pre-canvas main menu', () => {
    expect(homePageSource).toContain("import MainMenuPage from '../components/mainMenu/MainMenuPage'");
    expect(homePageSource).toContain('<MainMenuPage />');
    expect(homePageSource).toContain('<LandingPage />');
    expect(homePageSource).not.toContain('ProjectManageDialog');
    expect(homePageSource).not.toContain('Grid');
    expect(homePageSource).not.toContain('CardContent');
    expect(homePageSource).not.toContain('Open Clockwork Library demo');
  });

  it('uses bubble chrome with the translation bubble left of the user bubble', () => {
    expect(existsSync(mainMenuPath)).toBe(true);
    expect(existsSync(mainMenuCssPath)).toBe(true);
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');
    const cssSource = readFileSync(mainMenuCssPath, 'utf-8');

    const languageIndex = mainMenuSource.indexOf('main-menu-language-bubble');
    const userIndex = mainMenuSource.indexOf('main-menu-user-bubble');
    expect(languageIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(-1);
    expect(languageIndex).toBeLessThan(userIndex);

    expect(cssSource).toContain('.main-menu-chrome');
    expect(cssSource).toContain('position: fixed');
    expect(cssSource).toContain('pointer-events: none');
    expect(cssSource).toContain('.main-menu-chrome-bubble');
    expect(cssSource).not.toContain('.main-menu-chrome {\n  width: 100%');
  });

  it('matches the editor canvas bubble system and real logo asset instead of flat MVP text chrome', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');
    const cssSource = readFileSync(mainMenuCssPath, 'utf-8');

    expect(mainMenuSource).toContain("import brandLogoUrl from '../../assets/logo.svg'");
    expect(mainMenuSource).toContain('className="main-menu-brand-logo"');
    expect(mainMenuSource).not.toContain('main-menu-brand-bubble">renpy.online');

    expect(cssSource).toContain('background: #f7f8fb');
    expect(cssSource).toContain('background-size: 36px 36px');
    expect(cssSource).toContain('top: 16px');
    expect(cssSource).toContain('left: 16px');
    expect(cssSource).toContain('right: 16px');
    expect(cssSource).toContain('padding: 8px 12px');
    expect(cssSource).toContain('box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1)');
    expect(cssSource).toContain('backdrop-filter: blur(10px)');
    expect(cssSource).toContain('width: 150px');
    expect(cssSource).toContain('max-height: 28px');
  });

  it('keeps project rows minimal and puts admin actions only inside the expanded cut', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');

    expect(mainMenuSource).toContain('KeyboardArrowDownRoundedIcon');
    expect(mainMenuSource).toContain('AddRoundedIcon');
    expect(mainMenuSource).toContain('CloseRoundedIcon');
    expect(mainMenuSource).not.toContain('⌄');
    expect(mainMenuSource).not.toContain('Manage');
    expect(mainMenuSource).not.toContain('>Invite<');
    expect(mainMenuSource).not.toContain('Invite</button>');
    expect(mainMenuSource).not.toContain('roles open on click');
    expect(mainMenuSource).toContain('handleProjectOpen');
    expect(mainMenuSource).toContain('handleProjectToggle');
    expect(mainMenuSource).toContain('pendingConfirmation');
    expect(mainMenuSource).toContain('oldMember');
    expect(mainMenuSource).toContain('newMember');
  });

  it('makes the project shelf scroll independently on narrow and short screens', () => {
    const cssSource = readFileSync(mainMenuCssPath, 'utf-8');

    expect(cssSource).toContain('height: 100dvh');
    expect(cssSource).toContain('overflow: hidden');
    expect(cssSource).toContain('display: flex');
    expect(cssSource).toContain('flex-direction: column');
    expect(cssSource).toContain('max-height: calc(100dvh - 132px)');
    expect(cssSource).toContain('.main-menu-project-scroll');
    expect(cssSource).toContain('overflow-y: auto');
    expect(cssSource).toContain('scrollbar-color');
    expect(cssSource).toContain('@media (max-width: 720px)');
    expect(cssSource).toContain('.main-menu-mobile-site');
    expect(cssSource).toContain('bottom: 16px');
  });

  it('uses a real three-step folder import flow with import, settings, and final actions', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');

    expect(mainMenuSource).toContain('connectLocalRenpyGameRoot');
    expect(mainMenuSource).toContain('localDirectoryScan.rpyFiles.map((entry) => entry.file)');
    expect(mainMenuSource).toContain('filePaths: localDirectoryScan.rpyFiles.map((entry) => entry.path)');
    expect(mainMenuSource).toContain('assetCatalog: localDirectoryScan.catalog');
    expect(mainMenuSource).toContain('main-menu-wizard-pill');
    expect(mainMenuSource).toContain('main-menu-wizard-arrow');
    expect(mainMenuSource).toContain("t('mainMenu.create.steps.import')");
    expect(mainMenuSource).toContain("t('mainMenu.create.steps.settings')");
    expect(mainMenuSource).toContain("t('mainMenu.create.steps.final')");
    expect(mainMenuSource).toContain("t('mainMenu.create.final.title')");
    expect(mainMenuSource).toContain("t('mainMenu.create.final.enter')");
    expect(mainMenuSource).toContain("t('common.back')");
    expect(mainMenuSource).not.toContain('Import → Settings → Final');
    expect(mainMenuSource).not.toContain('type="file"');
    expect(mainMenuSource).not.toContain('.rpy file(s) selected');
    expect(localDirectorySource).toContain('showDirectoryPicker');
  });

  it('preloads collapsed project members and models Admin as a first-class project role', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');

    expect(projectServiceSource).toContain("export type ProjectRole = 'Owner' | 'Admin' | 'Editor' | 'Viewer'");
    expect(projectServiceSource).toContain("project.role === 'Admin'");
    expect(projectServiceSource).toContain('active_users: project.active_users ?? []');
    expect(projectServiceSource).toContain('isBuiltInDemoProject');
    expect(projectServiceSource).toContain("Action-focused Ren'Py demo with rich dialogue, images, and audio.");
    expect(projectServiceSource).toContain("Branchy Ren'Py demo with server-hosted images and audio.");
    expect(projectServiceSource).toContain('BUILT_IN_DEMO_DESCRIPTIONS.has(project?.description)');

    expect(mainMenuSource).toContain("const roles: ProjectRole[] = ['Admin', 'Editor', 'Viewer']");
    expect(mainMenuSource).toContain('const adminRoles = new Set<ProjectRole>');
    expect(mainMenuSource).toContain("adminRoles.has(detail.role as ProjectRole)");
    expect(mainMenuSource).toContain('member.role === \'Owner\'');
    expect(mainMenuSource).toContain('main-menu-member-role--static');
    expect(mainMenuSource).not.toContain('disabled={!canAdmin || member.role === \'Owner\'}');
  });

  it('routes new main-menu copy through i18n and keeps text/icon buttons vertically aligned', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');
    const authWindowSource = readFileSync(authWindowPath, 'utf-8');
    const cssSource = readFileSync(mainMenuCssPath, 'utf-8');

    expect(mainMenuSource).toContain('const { t, i18n } = useTranslation()');
    expect(mainMenuSource).toContain("t('mainMenu.projects.title')");
    expect(mainMenuSource).toContain("t('mainMenu.confirm.title')");
    expect(mainMenuSource).toContain("t('mainMenu.account.settings')");
    expect(authWindowSource).toContain('useTranslation');
    expect(authWindowSource).toContain("t('auth.login.title')");
    expect(cssSource).toContain('.main-menu-button-content');
    expect(cssSource).toContain('align-items: center');
    expect(cssSource).toContain('line-height: 1');
  });

  it('replaces login and register with shared auth windows and Google reCAPTCHA v2', () => {
    expect(existsSync(authWindowPath)).toBe(true);
    expect(existsSync(recaptchaPath)).toBe(true);
    expect(loginPageSource).toContain('<AuthWindow mode="login"');
    expect(registerPageSource).toContain('<AuthWindow mode="register"');

    const authWindowSource = readFileSync(authWindowPath, 'utf-8');
    const recaptchaSource = readFileSync(recaptchaPath, 'utf-8');
    expect(authWindowSource).toContain('RecaptchaBox');
    expect(recaptchaSource).toContain('https://www.google.com/recaptcha/api.js');
    expect(recaptchaSource).toContain('VITE_RECAPTCHA_SITE_KEY');
    expect(authContextSource).toContain('recaptchaToken');
    expect(authContextSource).toContain("formData.append('recaptcha_token'");
    expect(authContextSource).toContain('recaptcha_token: recaptchaToken');
  });

  it('adds project activity and member-management service calls for the main menu', () => {
    expect(projectServiceSource).toContain('last_opened_at');
    expect(projectServiceSource).toContain('markProjectOpened');
    expect(projectServiceSource).toContain('removeProjectMember');
    expect(projectServiceSource).toContain('shareProject(projectId, username, null)');
  });

  it('validates create-project wizard members when Add is clicked and reuses validated invites on create', () => {
    const mainMenuSource = readFileSync(mainMenuPath, 'utf-8');

    expect(projectServiceSource).toContain('validateProjectShareTarget');
    expect(projectServiceSource).toContain("api.post('/projects/validate-share-target'");
    expect(mainMenuSource).toContain('const addWizardInvite = async () =>');
    expect(mainMenuSource).toContain('await projectService.validateProjectShareTarget(username, wizardInviteDraft.role)');
    expect(mainMenuSource).toContain('validatedInvite.username');
    expect(mainMenuSource).toContain('for (const invite of wizardInvites)');
    expect(mainMenuSource).not.toContain('Promise.all(\n        wizardInvites.map');
  });
});
