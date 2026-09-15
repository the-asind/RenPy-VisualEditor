import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import brandLogoUrl from '../../assets/logo.svg';
import { useAuth } from '../../contexts/AuthContext';
import useProjects from '../../hooks/useProjects';
import projectService, { Project, ProjectMember, ProjectRole } from '../../services/projectService';
import { importProjectGraphFiles } from '../../services/api';
import {
  connectLocalRenpyGameRoot,
  type LocalRenpyDirectoryScan,
  type LocalRenpyGameDirectorySession,
} from '../../utils/localRenpyDirectory';
import './MainMenuPage.css';

type Confirmation =
  | {
      kind: 'role';
      projectId: string | number;
      username: string;
      oldMember: string;
      newMember: string;
      role: ProjectRole;
    }
  | {
      kind: 'remove';
      projectId: string | number;
      username: string;
      oldMember: string;
      newMember: string;
    }
  | {
      kind: 'add';
      projectId: string | number;
      username: string;
      oldMember: string;
      newMember: string;
      role: ProjectRole;
    }
  | {
      kind: 'deleteProject';
      projectId: string | number;
      oldMember: string;
      newMember: string;
    }
  | {
      kind: 'deleteAccount';
      oldMember: string;
      newMember: string;
    };

type WizardInvite = {
  username: string;
  role: ProjectRole;
};

const roles: ProjectRole[] = ['Admin', 'Editor', 'Viewer'];
const adminRoles = new Set<ProjectRole>(['Owner', 'Admin']);

const languageOptions = [
  { code: 'en', key: 'language.english' },
  { code: 'ru', key: 'language.russian' },
  { code: 'ja', key: 'language.japanese' },
  { code: 'zh', key: 'language.chinese' },
  { code: 'de', key: 'language.german' },
];

const hashColor = (seed?: string | number) => {
  const source = String(seed || 'user');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = source.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 72% 38%)`;
};

const initials = (name?: string) => (name || '?').slice(0, 1).toUpperCase();

const formatModified = (
  value: string | null | undefined,
  language: string,
  translate: (key: string, values?: Record<string, unknown>) => string,
) => {
  if (!value) {
    return translate('mainMenu.projects.modifiedNever');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return translate('mainMenu.projects.modifiedRecently');
  }
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return translate('mainMenu.projects.modifiedToday');
  }
  return translate('mainMenu.projects.modifiedDate', {
    date: date.toLocaleDateString(language, { month: 'short', day: 'numeric' }),
  });
};

const normalizeRole = (role?: string): ProjectRole | null =>
  roles.includes(role as ProjectRole) || role === 'Owner' ? (role as ProjectRole) : null;

const errorDetail = (error: unknown): string | null => {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (candidate.message) {
    return candidate.message;
  }
  return null;
};

const MainMenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, logout, updateAccount, deleteAccount } = useAuth();
  const { projects, loading, error, refreshProjects, createProject } = useProjects();

  const [expandedProjectId, setExpandedProjectId] = useState<string | number | null>(null);
  const [projectDetails, setProjectDetails] = useState<Record<string, Project>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ username: user?.username || '', email: user?.email || '' });
  const [accountError, setAccountError] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<Confirmation | null>(null);
  const [memberDraftProjectId, setMemberDraftProjectId] = useState<string | number | null>(null);
  const [memberDraft, setMemberDraft] = useState<WizardInvite>({ username: '', role: 'Editor' });
  const [projectEditId, setProjectEditId] = useState<string | number | null>(null);
  const [projectDraft, setProjectDraft] = useState({ name: '', description: '' });
  const [menuError, setMenuError] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [localDirectorySession, setLocalDirectorySession] = useState<LocalRenpyGameDirectorySession | null>(null);
  const [localDirectoryScan, setLocalDirectoryScan] = useState<LocalRenpyDirectoryScan | null>(null);
  const [wizardName, setWizardName] = useState('');
  const [wizardDescription, setWizardDescription] = useState('');
  const [wizardInvites, setWizardInvites] = useState<WizardInvite[]>([]);
  const [wizardInviteDraftOpen, setWizardInviteDraftOpen] = useState(false);
  const [wizardInviteDraft, setWizardInviteDraft] = useState<WizardInvite>({ username: '', role: 'Editor' });
  const [createdProjectId, setCreatedProjectId] = useState<string | number | null>(null);
  const [wizardError, setWizardError] = useState('');
  const [wizardBusy, setWizardBusy] = useState(false);

  useEffect(() => {
    setAccountDraft({ username: user?.username || '', email: user?.email || '' });
  }, [user?.email, user?.username]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((left, right) => {
        const leftTime = new Date(left.last_opened_at || left.updated_at || left.created_at || 0).getTime();
        const rightTime = new Date(right.last_opened_at || right.updated_at || right.created_at || 0).getTime();
        return rightTime - leftTime;
      }),
    [projects],
  );

  const loadProjectDetails = useCallback(async (projectId: string | number) => {
    const detail = await projectService.getProject(projectId);
    setProjectDetails((current) => ({ ...current, [String(projectId)]: detail }));
    return detail;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missingMembers = projects.filter(
      (project) => !(project.active_users?.length) && !projectDetails[String(project.id)],
    );
    if (!missingMembers.length) {
      return () => {
        cancelled = true;
      };
    }

    Promise.all(missingMembers.map((project) => projectService.getProject(project.id)))
      .then((details) => {
        if (cancelled) {
          return;
        }
        setProjectDetails((current) => ({
          ...current,
          ...Object.fromEntries(details.map((detail) => [String(detail.id), detail])),
        }));
      })
      .catch((loadError) => {
        console.error('Failed to preload project members:', loadError);
      });

    return () => {
      cancelled = true;
    };
  }, [loadProjectDetails, projectDetails, projects]);

  const roleLabel = (role?: string) => {
    const normalized = normalizeRole(role);
    if (!normalized) {
      return t('mainMenu.roles.none');
    }
    return t(`mainMenu.roles.${normalized.toLowerCase()}`);
  };

  const memberLabel = (username: string, role?: string) => `${username} ${roleLabel(role)}`;

  const handleProjectOpen = async (projectId: string | number) => {
    try {
      await projectService.markProjectOpened(projectId);
    } finally {
      navigate(`/editor?project=${projectId}`);
    }
  };

  const handleProjectToggle = async (event: React.SyntheticEvent, projectId: string | number) => {
    event.stopPropagation();
    const nextProjectId = expandedProjectId === projectId ? null : projectId;
    setExpandedProjectId(nextProjectId);
    setMenuError('');
    if (nextProjectId && !projectDetails[String(projectId)]) {
      try {
        await loadProjectDetails(projectId);
      } catch (loadError) {
        console.error('Failed to load project details:', loadError);
        setMenuError(t('mainMenu.errors.projectDetails'));
      }
    }
  };

  const handleRoleChoice = (projectId: string | number, member: ProjectMember, role: ProjectRole) => {
    setPendingConfirmation({
      kind: 'role',
      projectId,
      username: member.username,
      oldMember: memberLabel(member.username, member.role),
      newMember: memberLabel(member.username, role),
      role,
    });
  };

  const handleAddMember = (projectId: string | number) => {
    if (!memberDraft.username.trim()) {
      return;
    }
    setPendingConfirmation({
      kind: 'add',
      projectId,
      username: memberDraft.username.trim(),
      oldMember: memberLabel(memberDraft.username.trim(), undefined),
      newMember: memberLabel(memberDraft.username.trim(), memberDraft.role),
      role: memberDraft.role,
    });
  };

  const confirmAction = async () => {
    if (!pendingConfirmation) {
      return;
    }
    try {
      if (pendingConfirmation.kind === 'role' || pendingConfirmation.kind === 'add') {
        await projectService.shareProject(
          pendingConfirmation.projectId,
          pendingConfirmation.username,
          pendingConfirmation.role,
        );
        await loadProjectDetails(pendingConfirmation.projectId);
      }
      if (pendingConfirmation.kind === 'remove') {
        await projectService.removeProjectMember(pendingConfirmation.projectId, pendingConfirmation.username);
        await loadProjectDetails(pendingConfirmation.projectId);
      }
      if (pendingConfirmation.kind === 'deleteProject') {
        await projectService.deleteProject(pendingConfirmation.projectId);
        await refreshProjects();
      }
      if (pendingConfirmation.kind === 'deleteAccount') {
        await deleteAccount();
      }
      setMemberDraft({ username: '', role: 'Editor' });
      setMemberDraftProjectId(null);
      setPendingConfirmation(null);
    } catch (actionError) {
      console.error('Confirmed action failed:', actionError);
      setMenuError(t('mainMenu.errors.action'));
      setPendingConfirmation(null);
    }
  };

  const startProjectEdit = (project: Project) => {
    setProjectEditId(project.id);
    setProjectDraft({ name: project.name, description: project.description || '' });
  };

  const submitProjectEdit = async (projectId: string | number) => {
    const updatedProject = await projectService.updateProject(projectId, projectDraft);
    setProjectDetails((current) => ({ ...current, [String(projectId)]: { ...current[String(projectId)], ...updatedProject } }));
    setProjectEditId(null);
    await refreshProjects();
  };

  const openWizard = () => {
    setWizardOpen(true);
    setWizardStep(1);
    setLocalDirectorySession(null);
    setLocalDirectoryScan(null);
    setWizardName('');
    setWizardDescription('');
    setWizardInvites([]);
    setWizardInviteDraftOpen(false);
    setWizardInviteDraft({ username: '', role: 'Editor' });
    setCreatedProjectId(null);
    setWizardError('');
  };

  const handleConnectFolder = async () => {
    setWizardError('');
    try {
      const { session, scan } = await connectLocalRenpyGameRoot();
      setLocalDirectorySession(session);
      setLocalDirectoryScan(scan);
      if (!wizardName.trim()) {
        setWizardName(session.rootHandle.name);
      }
    } catch (connectError) {
      console.error('RenPy folder import failed:', connectError);
      setWizardError(connectError instanceof Error ? connectError.message : t('mainMenu.create.errors.folder'));
    }
  };

  const addWizardInvite = async () => {
    const username = wizardInviteDraft.username.trim();
    if (!username) {
      return;
    }
    setWizardBusy(true);
    setWizardError('');
    try {
      const validatedInvite = await projectService.validateProjectShareTarget(username, wizardInviteDraft.role);
      setWizardInvites((current) => [
        ...current.filter((invite) => invite.username.toLowerCase() !== validatedInvite.username.toLowerCase()),
        { username: validatedInvite.username, role: normalizeRole(validatedInvite.role) || wizardInviteDraft.role },
      ]);
      setWizardInviteDraft({ username: '', role: 'Editor' });
      setWizardInviteDraftOpen(false);
    } catch (inviteError) {
      console.error('Project invite validation failed:', inviteError);
      setWizardError(errorDetail(inviteError) || t('mainMenu.create.errors.invite'));
    } finally {
      setWizardBusy(false);
    }
  };

  const createWizardProject = async () => {
    if (!localDirectoryScan || !localDirectoryScan.rpyFiles.length) {
      setWizardError(t('mainMenu.create.errors.noFolder'));
      return;
    }
    if (!wizardName.trim()) {
      setWizardError(t('mainMenu.create.errors.name'));
      return;
    }
    setWizardBusy(true);
    setWizardError('');
    try {
      const project = await createProject(wizardName.trim(), wizardDescription.trim());
      await importProjectGraphFiles(
        String(project.id),
        localDirectoryScan.rpyFiles.map((entry) => entry.file),
        {
          filePaths: localDirectoryScan.rpyFiles.map((entry) => entry.path),
          assetCatalog: localDirectoryScan.catalog,
        },
      );
      for (const invite of wizardInvites) {
        await projectService.shareProject(project.id, invite.username, invite.role);
      }
      setCreatedProjectId(project.id);
      setWizardStep(3);
      await refreshProjects();
    } catch (createError) {
      console.error('Project creation failed:', createError);
      setWizardError(errorDetail(createError) || t('mainMenu.create.errors.create'));
    } finally {
      setWizardBusy(false);
    }
  };

  const saveAccountSettings = async () => {
    setAccountError('');
    const result = await updateAccount({
      username: accountDraft.username.trim(),
      email: accountDraft.email.trim(),
    });
    if (!result.success) {
      setAccountError(result.error || t('mainMenu.account.saveFailed'));
      return;
    }
    setAccountSettingsOpen(false);
  };

  const renderButtonContent = (icon: React.ReactNode, label: string) => (
    <span className="main-menu-button-content">
      {icon}
      <span>{label}</span>
    </span>
  );

  const renderMember = (project: Project, member: ProjectMember, canAdmin: boolean) => {
    const isOwnerMember = member.role === 'Owner';
    const canChangeRole = canAdmin && !isOwnerMember;
    return (
      <span className="main-menu-member" key={member.id}>
        <span className="main-menu-avatar" style={{ background: hashColor(member.id) }}>
          {initials(member.username)}
        </span>
        {canChangeRole ? (
          <button
            className="main-menu-member-remove"
            type="button"
            aria-label={t('mainMenu.members.removeAria', { username: member.username })}
            onClick={() =>
              setPendingConfirmation({
                kind: 'remove',
                projectId: project.id,
                username: member.username,
                oldMember: memberLabel(member.username, member.role),
                newMember: memberLabel(member.username, undefined),
              })
            }
          >
            <CloseRoundedIcon fontSize="small" />
          </button>
        ) : null}
        <span className="main-menu-member-name">{member.username}</span>
        {canChangeRole ? (
          <select
            className="main-menu-member-role"
            aria-label={t('mainMenu.members.roleAria', { username: member.username })}
            value={member.role}
            onChange={(event) => handleRoleChoice(project.id, member, event.target.value as ProjectRole)}
          >
            {[member.role, ...roles.filter((role) => role !== member.role)].map((role) => (
              <option value={role} key={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        ) : (
          <span className="main-menu-member-role main-menu-member-role--static">{roleLabel(member.role)}</span>
        )}
      </span>
    );
  };

  const renderProjectCut = (project: Project) => {
    const detail = projectDetails[String(project.id)] || project;
    const members = (detail.active_users || []) as ProjectMember[];
    const canAdmin = adminRoles.has(detail.role as ProjectRole);
    const isEditingProject = projectEditId === project.id;

    return (
      <div className="main-menu-cut">
        <div className="main-menu-cut-line">
          <div className="main-menu-cut-label">{t('mainMenu.project.project')}</div>
          {isEditingProject ? (
            <div className="main-menu-inline-form">
              <input
                className="main-menu-input"
                aria-label={t('mainMenu.project.name')}
                value={projectDraft.name}
                onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                className="main-menu-input"
                aria-label={t('mainMenu.project.description')}
                value={projectDraft.description}
                onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))}
              />
              <button className="main-menu-text-button" type="button" onClick={() => void submitProjectEdit(project.id)}>
                {renderButtonContent(<CheckRoundedIcon fontSize="small" />, t('common.save'))}
              </button>
            </div>
          ) : (
            <div className="main-menu-project-settings-line">
              <div>
                <strong>{detail.name}</strong>
                {detail.description ? <div className="main-menu-muted">{detail.description}</div> : null}
              </div>
              {canAdmin ? (
                <button className="main-menu-text-button" type="button" onClick={() => startProjectEdit(detail)}>
                  {t('common.edit')}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="main-menu-cut-line">
          <div className="main-menu-cut-label">{t('mainMenu.project.members')}</div>
          <div className="main-menu-members">
            {members.map((member) => renderMember(detail, member, canAdmin))}
            {canAdmin ? (
              <button
                className="main-menu-member-add"
                type="button"
                aria-label={t('mainMenu.members.addAria')}
                onClick={() => setMemberDraftProjectId(memberDraftProjectId === project.id ? null : project.id)}
              >
                <AddRoundedIcon fontSize="small" />
              </button>
            ) : null}
          </div>
          {canAdmin && memberDraftProjectId === project.id ? (
            <div className="main-menu-inline-form">
              <input
                className="main-menu-input"
                placeholder={t('mainMenu.account.nickname')}
                value={memberDraft.username}
                onChange={(event) => setMemberDraft((current) => ({ ...current, username: event.target.value }))}
              />
              <select
                className="main-menu-select"
                value={memberDraft.role}
                onChange={(event) => setMemberDraft((current) => ({ ...current, role: event.target.value as ProjectRole }))}
              >
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
              <button className="main-menu-text-button" type="button" onClick={() => handleAddMember(project.id)}>
                {renderButtonContent(<AddRoundedIcon fontSize="small" />, t('common.add'))}
              </button>
            </div>
          ) : null}
        </div>

        {canAdmin ? (
          <div className="main-menu-cut-line">
            <div className="main-menu-cut-label">{t('mainMenu.project.danger')}</div>
            <button
              className="main-menu-text-button main-menu-danger-button"
              type="button"
              onClick={() =>
                setPendingConfirmation({
                  kind: 'deleteProject',
                  projectId: project.id,
                  oldMember: detail.name,
                  newMember: t('mainMenu.confirm.deletedProject'),
                })
              }
            >
              {t('mainMenu.project.delete')}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderWizardProgress = () => (
    <div className="main-menu-wizard-steps" aria-label={t('mainMenu.create.stepsLabel')}>
      {([1, 2, 3] as const).map((step, index) => (
        <React.Fragment key={step}>
          <div className={`main-menu-wizard-pill${wizardStep === step ? ' main-menu-wizard-pill--active' : ''}`}>
            <span>{step}</span>
            <strong>
              {step === 1
                ? t('mainMenu.create.steps.import')
                : step === 2
                  ? t('mainMenu.create.steps.settings')
                  : t('mainMenu.create.steps.final')}
            </strong>
          </div>
          {index < 2 ? <span className="main-menu-wizard-arrow">→</span> : null}
        </React.Fragment>
      ))}
    </div>
  );

  const renderWizardInvites = () => (
    <div className="main-menu-members main-menu-wizard-members">
      {wizardInvites.map((invite) => (
        <span className="main-menu-member" key={invite.username}>
          <span className="main-menu-avatar" style={{ background: hashColor(invite.username) }}>
            {initials(invite.username)}
          </span>
          <button
            className="main-menu-member-remove"
            type="button"
            aria-label={t('mainMenu.members.removeAria', { username: invite.username })}
            onClick={() =>
              setWizardInvites((current) => current.filter((candidate) => candidate.username !== invite.username))
            }
          >
            <CloseRoundedIcon fontSize="small" />
          </button>
          <span className="main-menu-member-name">{invite.username}</span>
          <select
            className="main-menu-member-role"
            value={invite.role}
            onChange={(event) =>
              setWizardInvites((current) =>
                current.map((candidate) =>
                  candidate.username === invite.username
                    ? { ...candidate, role: event.target.value as ProjectRole }
                    : candidate,
                ),
              )
            }
          >
            {roles.map((role) => (
              <option value={role} key={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </span>
      ))}
      <button
        className="main-menu-member-add"
        type="button"
        aria-label={t('mainMenu.members.addAria')}
        onClick={() => setWizardInviteDraftOpen((current) => !current)}
      >
        <AddRoundedIcon fontSize="small" />
      </button>
    </div>
  );

  return (
    <main className="main-menu-surface">
      <div className="main-menu-chrome">
        <div className="main-menu-chrome-side">
          <div className="main-menu-chrome-bubble main-menu-brand-bubble">
            <img className="main-menu-brand-logo" src={brandLogoUrl} alt="renpy.online" />
          </div>
        </div>
        <div className="main-menu-chrome-side main-menu-user-chrome">
          <button
            className="main-menu-chrome-bubble main-menu-language-bubble"
            type="button"
            onClick={() => {
              setLanguageOpen((current) => !current);
              setProfileOpen(false);
            }}
            aria-label={t('mainMenu.language.change')}
          >
            <TranslateRoundedIcon fontSize="small" />
          </button>
          <button
            className="main-menu-chrome-bubble main-menu-user-bubble"
            type="button"
            onClick={() => {
              setProfileOpen((current) => !current);
              setLanguageOpen(false);
            }}
          >
            <span>{user?.username || t('mainMenu.account.fallbackUser')}</span>
            <span className="main-menu-avatar" style={{ background: hashColor(user?.id) }}>
              {initials(user?.username)}
            </span>
          </button>
        </div>
      </div>

      <section className="main-menu-layer">
        <div className="main-menu-project-shell">
          <h1 className="main-menu-project-title">{t('mainMenu.projects.title')}</h1>
          {menuError ? <div className="main-menu-error">{menuError}</div> : null}
          {error ? <div className="main-menu-error">{error.message}</div> : null}
          <div className="main-menu-project-scroll">
            <div className="main-menu-project-list">
              {loading ? <div className="main-menu-muted">{t('mainMenu.projects.loading')}</div> : null}
              {!loading && sortedProjects.length === 0 ? (
                <div className="main-menu-muted">{t('mainMenu.projects.empty')}</div>
              ) : null}
              {sortedProjects.map((project) => {
                const detail = projectDetails[String(project.id)] || project;
                const members = ((detail.active_users || []) as ProjectMember[]).slice(0, 4);
                const isOpen = expandedProjectId === project.id;
                return (
                  <article className="main-menu-project-row" key={project.id}>
                    <div
                      className="main-menu-project-summary"
                      onClick={() => void handleProjectOpen(project.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleProjectOpen(project.id);
                        }
                      }}
                    >
                      <span className="main-menu-project-name">{detail.name}</span>
                      <span className="main-menu-project-date">
                        {formatModified(detail.updated_at, i18n.language, t)}
                      </span>
                      <span className="main-menu-avatar-stack" aria-hidden="true">
                        {members.map((member) => (
                          <span
                            className="main-menu-stack-avatar"
                            style={{ background: hashColor(member.id) }}
                            key={member.id}
                          >
                            {initials(member.username)}
                          </span>
                        ))}
                      </span>
                      <button
                        className={`main-menu-caret${isOpen ? ' main-menu-caret--open' : ''}`}
                        type="button"
                        aria-label={isOpen ? t('mainMenu.projects.collapse') : t('mainMenu.projects.expand')}
                        onClick={(event) => void handleProjectToggle(event, project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            void handleProjectToggle(event, project.id);
                          }
                        }}
                      >
                        <KeyboardArrowDownRoundedIcon />
                      </button>
                    </div>
                    {isOpen ? renderProjectCut(project) : null}
                  </article>
                );
              })}
            </div>
          </div>
          <button className="main-menu-create-button" type="button" onClick={openWizard}>
            {renderButtonContent(<AddRoundedIcon fontSize="small" />, t('mainMenu.create.button'))}
          </button>
        </div>
      </section>

      {languageOpen ? (
        <div className="main-menu-popover" style={{ inlineSize: 220 }}>
          <div className="main-menu-language-list">
            {languageOptions.map((language) => (
              <button
                className="main-menu-language-option"
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
        </div>
      ) : null}

      {profileOpen ? (
        <div className="main-menu-popover">
          <div className="main-menu-profile-row">
            <span className="main-menu-profile-label">{t('mainMenu.account.nickname')}</span>
            <span className="main-menu-profile-value">{user?.username}</span>
          </div>
          <div className="main-menu-profile-row">
            <span className="main-menu-profile-label">{t('mainMenu.account.email')}</span>
            <span className="main-menu-profile-value">{user?.email}</span>
          </div>
          <div className="main-menu-popover-actions">
            <button className="main-menu-text-button" type="button" onClick={() => setAccountSettingsOpen(true)}>
              {renderButtonContent(<SettingsRoundedIcon fontSize="small" />, t('mainMenu.account.settings'))}
            </button>
            <button className="main-menu-text-button" type="button" onClick={logout}>
              {renderButtonContent(<LogoutRoundedIcon fontSize="small" />, t('mainMenu.account.logout'))}
            </button>
          </div>
        </div>
      ) : null}

      {accountSettingsOpen ? (
        <div className="main-menu-modal-backdrop">
          <section className="main-menu-modal">
            <h2 className="main-menu-modal-title">{t('mainMenu.account.settings')}</h2>
            <div className="main-menu-form-grid">
              {accountError ? <div className="main-menu-error">{accountError}</div> : null}
              <label>
                {t('mainMenu.account.nickname')}
                <input
                  value={accountDraft.username}
                  onChange={(event) => setAccountDraft((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
              <label>
                {t('mainMenu.account.email')}
                <input
                  type="email"
                  value={accountDraft.email}
                  onChange={(event) => setAccountDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <button
                className="main-menu-text-button main-menu-danger-button"
                type="button"
                onClick={() =>
                  setPendingConfirmation({
                    kind: 'deleteAccount',
                    oldMember: user?.username || t('mainMenu.account.account'),
                    newMember: t('mainMenu.confirm.deletedAccount'),
                  })
                }
              >
                {t('mainMenu.account.delete')}
              </button>
            </div>
            <div className="main-menu-modal-actions">
              <button className="main-menu-secondary-button" type="button" onClick={() => setAccountSettingsOpen(false)}>
                {t('common.back')}
              </button>
              <button className="main-menu-primary-button" type="button" onClick={() => void saveAccountSettings()}>
                {t('common.save')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="main-menu-modal-backdrop">
          <section className="main-menu-modal main-menu-modal--wizard">
            <h2 className="main-menu-modal-title">{t('mainMenu.create.title')}</h2>
            {renderWizardProgress()}

            {wizardError ? <div className="main-menu-error">{wizardError}</div> : null}

            {wizardStep === 1 ? (
              <div className="main-menu-form-grid">
                <div className="main-menu-folder-card">
                  <div>
                    <div className="main-menu-cut-label">{t('mainMenu.create.importLabel')}</div>
                    <strong>{localDirectorySession?.rootHandle.name || t('mainMenu.create.noFolder')}</strong>
                    <div className="main-menu-muted">
                      {localDirectoryScan
                        ? t('mainMenu.create.folderSummary', {
                            scripts: localDirectoryScan.rpyFiles.length,
                            assets: localDirectoryScan.catalog.entries.length,
                          })
                        : t('mainMenu.create.folderHint')}
                    </div>
                  </div>
                  <button className="main-menu-text-button" type="button" onClick={() => void handleConnectFolder()}>
                    {renderButtonContent(<FolderOpenRoundedIcon fontSize="small" />, t('mainMenu.create.chooseFolder'))}
                  </button>
                </div>
                <div className="main-menu-modal-actions">
                  <button className="main-menu-secondary-button" type="button" onClick={() => setWizardOpen(false)}>
                    {t('common.back')}
                  </button>
                  <button
                    className="main-menu-primary-button"
                    type="button"
                    disabled={!localDirectoryScan?.rpyFiles.length}
                    onClick={() => setWizardStep(2)}
                  >
                    {t('common.continue')}
                  </button>
                </div>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="main-menu-form-grid">
                <label>
                  {t('mainMenu.project.name')}
                  <input value={wizardName} onChange={(event) => setWizardName(event.target.value)} />
                </label>
                <label>
                  {t('mainMenu.project.description')}
                  <textarea value={wizardDescription} onChange={(event) => setWizardDescription(event.target.value)} />
                </label>
                <div className="main-menu-cut-line">
                  <div className="main-menu-cut-label">{t('mainMenu.project.members')}</div>
                  {renderWizardInvites()}
                  {wizardInviteDraftOpen ? (
                    <div className="main-menu-inline-form">
                      <input
                        className="main-menu-input"
                        placeholder={t('mainMenu.account.nickname')}
                        value={wizardInviteDraft.username}
                        onChange={(event) =>
                          setWizardInviteDraft((current) => ({ ...current, username: event.target.value }))
                        }
                      />
                      <select
                        className="main-menu-select"
                        value={wizardInviteDraft.role}
                        onChange={(event) =>
                          setWizardInviteDraft((current) => ({ ...current, role: event.target.value as ProjectRole }))
                        }
                      >
                        {roles.map((role) => (
                          <option value={role} key={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="main-menu-text-button"
                        type="button"
                        disabled={wizardBusy}
                        onClick={() => void addWizardInvite()}
                      >
                        {renderButtonContent(<AddRoundedIcon fontSize="small" />, t('common.add'))}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="main-menu-modal-actions">
                  <button className="main-menu-secondary-button" type="button" onClick={() => setWizardStep(1)}>
                    {t('common.back')}
                  </button>
                  <button
                    className="main-menu-primary-button"
                    type="button"
                    disabled={wizardBusy}
                    onClick={() => void createWizardProject()}
                  >
                    {wizardBusy ? t('mainMenu.create.creating') : t('mainMenu.create.button')}
                  </button>
                </div>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="main-menu-final">
                <h3 className="main-menu-modal-title">{t('mainMenu.create.final.title')}</h3>
                <button
                  className="main-menu-primary-button main-menu-primary-button--large"
                  type="button"
                  onClick={() => createdProjectId && navigate(`/editor?project=${createdProjectId}`)}
                >
                  {t('mainMenu.create.final.enter')}
                </button>
                <button className="main-menu-secondary-button" type="button" onClick={() => setWizardOpen(false)}>
                  {t('common.back')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {pendingConfirmation ? (
        <div className="main-menu-modal-backdrop">
          <section className="main-menu-modal main-menu-modal--confirm">
            <h2 className="main-menu-modal-title">{t('mainMenu.confirm.title')}</h2>
            <div className="main-menu-confirm-body">
              <div className="main-menu-muted">{t('mainMenu.confirm.description')}</div>
              <div className="main-menu-confirm-swap">
                <div className="main-menu-confirm-pill main-menu-confirm-pill--old">{pendingConfirmation.oldMember}</div>
                <div className="main-menu-confirm-arrow">→</div>
                <div className="main-menu-confirm-pill main-menu-confirm-pill--new">{pendingConfirmation.newMember}</div>
              </div>
            </div>
            <div className="main-menu-confirm-actions">
              <button
                className="main-menu-secondary-button main-menu-confirm-cancel"
                type="button"
                onClick={() => setPendingConfirmation(null)}
              >
                {t('common.cancel')}
              </button>
              <button className="main-menu-primary-button main-menu-confirm-approve" type="button" onClick={() => void confirmAction()}>
                {renderButtonContent(<CheckRoundedIcon fontSize="small" />, t('common.confirm'))}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <span className="main-menu-mobile-site" aria-hidden="true" />
    </main>
  );
};

export default MainMenuPage;
