import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  apiClient,
  commitProjectGraphContinuation,
  commitProjectGraphStructure,
  createProjectSessionToken,
  exportProjectGraphFiles,
  getProjectAssetCatalog,
  importProjectGraphFiles,
  loadProjectGraphCrdtDocument,
  saveProjectGraphCrdtSnapshot,
  updateProjectAssetCatalog,
  validateProjectGraphContinuation,
} from '../services/api';
import {
  ProjectGraphCollaborationSession,
  connectProjectGraphCollaborationSocket,
  retainActiveProjectGraphRemoteCursors,
  toProjectGraphWebSocketUrl,
  type ProjectGraphPersistenceStatus,
  type ProjectGraphPresenceUser,
  type ProjectGraphRemoteCursor,
  type ProjectGraphSocketHandle,
} from '../utils/projectGraphCollaboration';
import type { GraphPoint, ProjectGraphSnapshot } from '../utils/projectGraphProjection';
import type { ProjectGraphReadModelStats, ProjectGraphReadModelUpdate } from '../utils/projectGraphReadModel';
import type { ProjectGraphStructureCommand } from '../utils/projectGraphStructure';
import projectService from '../services/projectService';
import {
  getEditorDevPerformanceEnabled,
  getEditorIncrementalReadModelEnabled,
  getEditorProjectId,
  getEditorVisibleOnlyEnabled,
} from './editorPageQuery';
import {
  ProjectGraphCanvas,
  type ProjectGraphEntityPositionChange,
  type ProjectGraphPresenceActivityUpdate,
} from './projectGraph/ProjectGraphCanvas';
import type { ActionEditorNextActionRequest } from './actionEditor/ActionEditorSidebar';
import type { ActionEditorTextSplice } from './actionEditor/actionEditorModel';
import {
  buildLocalWriteManifest,
  connectLocalRenpyGameRoot,
  formatLocalWriteManifestConfirmation,
  writeExportedScriptsToLocalGame,
  type LocalRenpyDirectoryScan,
  type LocalRenpyGameDirectorySession,
  type ProjectAssetCatalogPayload,
} from '../utils/localRenpyDirectory';
import { useRenpyOnlineDocumentTitle } from '../utils/pageTitle';

const EditorPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = getEditorProjectId(location.search);
  const showDevPerformancePanel = getEditorDevPerformanceEnabled(location.search);
  const onlyRenderVisibleElements = getEditorVisibleOnlyEnabled(location.search);
  const incrementalReadModel = getEditorIncrementalReadModelEnabled(location.search);
  const sessionRef = useRef<ProjectGraphCollaborationSession | null>(null);
  const socketRef = useRef<ProjectGraphSocketHandle | null>(null);
  const lastCursorSentAtRef = useRef(0);
  const [, startGraphTransition] = useTransition();
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [readModelUpdate, setReadModelUpdate] = useState<ProjectGraphReadModelUpdate | null>(null);
  const [readModelStats, setReadModelStats] = useState<ProjectGraphReadModelStats | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [localDirectorySession, setLocalDirectorySession] = useState<LocalRenpyGameDirectorySession | null>(null);
  const [localDirectoryScan, setLocalDirectoryScan] = useState<LocalRenpyDirectoryScan | null>(null);
  const [localDirectoryMessage, setLocalDirectoryMessage] = useState<string | null>(null);
  const [assetCatalog, setAssetCatalog] = useState<ProjectAssetCatalogPayload | null>(null);
  const [localAssetUrls, setLocalAssetUrls] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportedFiles, setExportedFiles] = useState<Record<string, string> | null>(null);
  const [isWritingLocalScripts, setIsWritingLocalScripts] = useState(false);
  const [saveStatus, setSaveStatus] = useState<ProjectGraphPersistenceStatus>('idle');
  const [projectName, setProjectName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ProjectGraphPresenceUser[]>([]);
  const [remoteCursorsByUserId, setRemoteCursorsByUserId] = useState<Record<string, ProjectGraphRemoteCursor>>({});

  useRenpyOnlineDocumentTitle(projectName);

  useEffect(() => {
    if (!projectId) {
      setProjectName(null);
      setGraph(null);
      setStatus('error');
      return;
    }

    let isActive = true;
    setStatus('loading');
    setGraph(null);
    setReadModelUpdate(null);
    setReadModelStats(null);
    setSaveStatus('idle');
    setParticipants([]);
    setRemoteCursorsByUserId({});
    sessionRef.current = null;

    loadProjectGraphCrdtDocument(projectId)
      .then((doc) => {
        if (!isActive) {
          return;
        }
        let session: ProjectGraphCollaborationSession;
        session = new ProjectGraphCollaborationSession(doc, {
          incrementalReadModel,
          sendUpdate: (update) => socketRef.current?.sendBinary(update),
          persistDebounceMs: 500,
          persistSnapshot: async (snapshot) => {
            await saveProjectGraphCrdtSnapshot(projectId, snapshot);
          },
          onPersistenceStatusChange: (updatedSaveStatus) =>
            startGraphTransition(() => setSaveStatus(updatedSaveStatus)),
          onGraphChange: (updatedGraph, update) => startGraphTransition(() => {
            setGraph(updatedGraph);
            if (update.mode !== 'no-change') {
              setReadModelUpdate(update);
            }
            setReadModelStats(session.readModelStats);
          }),
        });
        sessionRef.current = session;
        setGraph(session.graph);
        setReadModelStats(session.readModelStats);
        setStatus('ready');
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.error('Failed to load ProjectGraph snapshot:', error);
        setStatus('error');
      });

    return () => {
      isActive = false;
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [incrementalReadModel, projectId, reloadKey]);

  useEffect(() => {
    if (!localDirectorySession || !assetCatalog || typeof URL.createObjectURL !== 'function') {
      if (assetCatalog && !localDirectorySession) {
        console.info('[LocalRenpyAssets] Asset catalog is loaded without a connected local RenPy directory.', {
          catalogEntries: assetCatalog.entries.length,
          mediaEntries: assetCatalog.entries.filter((entry) => entry.kind === 'image' || entry.kind === 'audio').length,
        });
      }
      setLocalAssetUrls({});
      return undefined;
    }

    let isActive = true;
    const createdUrls: string[] = [];
    const missingLocalAssets: Array<{
      path: string;
      kind: string;
      renpyNames?: string[];
    }> = [];
    const mediaEntries = assetCatalog.entries.filter((entry) => entry.kind === 'image' || entry.kind === 'audio');
    console.info('[LocalRenpyAssets] Creating local object URLs for asset catalog.', {
      catalogEntries: assetCatalog.entries.length,
      mediaEntries: mediaEntries.length,
    });
    void Promise.all(
      mediaEntries
        .map(async (entry) => {
          const file = await localDirectorySession.readAsset(entry.path);
          if (!file) {
            missingLocalAssets.push({
              path: entry.path,
              kind: entry.kind,
              renpyNames: entry.renpyNames,
            });
            console.warn('[LocalRenpyAssets] Catalog entry exists but local file could not be read.', {
              path: entry.path,
              kind: entry.kind,
              renpyNames: entry.renpyNames,
            });
            return null;
          }
          const url = URL.createObjectURL(file);
          createdUrls.push(url);
          return [entry.path, url] as const;
        }),
    ).then((pairs) => {
      if (isActive) {
        const nextLocalAssetUrls = Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair !== null));
        console.info('[LocalRenpyAssets] Local object URL creation finished.', {
          requestedMediaCount: mediaEntries.length,
          localUrlCount: Object.keys(nextLocalAssetUrls).length,
          missingLocalAssetCount: missingLocalAssets.length,
          missingLocalAssets: missingLocalAssets.slice(0, 10),
        });
        setLocalAssetUrls(nextLocalAssetUrls);
      } else {
        for (const url of createdUrls) {
          URL.revokeObjectURL(url);
        }
      }
    }).catch((error) => {
      console.error('[LocalRenpyAssets] Failed to create local asset object URLs.', error);
      if (isActive) {
        setLocalAssetUrls({});
      }
    });

    return () => {
      isActive = false;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [assetCatalog, localDirectorySession]);

  useEffect(() => {
    if (!projectId) {
      setProjectName(null);
      return;
    }

    let isActive = true;
    setProjectName(null);
    void projectService
      .getProject(projectId)
      .then((project) => {
        if (isActive) {
          setProjectName(project.name);
        }
      })
      .catch((error) => {
        if (isActive) {
          console.error('Failed to load project details:', error);
          setProjectName(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setAssetCatalog(null);
      return;
    }

    let isActive = true;
    void getProjectAssetCatalog(projectId)
      .then((response) => {
        if (isActive) {
          setAssetCatalog(response?.catalog ?? null);
        }
      })
      .catch((error) => {
        if (isActive) {
          console.error('Failed to load project asset catalog:', error);
          setAssetCatalog(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [projectId, reloadKey]);

  useEffect(() => {
    if (!projectId || status !== 'ready') {
      return undefined;
    }

    const apiBaseUrl = apiClient.defaults.baseURL;
    if (!apiBaseUrl) {
      return undefined;
    }

    let isActive = true;
    let socket: ProjectGraphSocketHandle | null = null;

    void createProjectSessionToken(projectId)
      .then((sessionToken) => {
        if (!isActive) {
          return;
        }

        socket = connectProjectGraphCollaborationSocket({
          url: toProjectGraphWebSocketUrl(apiBaseUrl, projectId),
          authToken: sessionToken.access_token,
          onUpdate: (update) => sessionRef.current?.receiveRemoteUpdate(update),
          onOpen: () => sessionRef.current?.resendPendingUpdates(),
          onPresenceUsers: (users) => {
            setParticipants(users);
            setRemoteCursorsByUserId((current) => retainActiveProjectGraphRemoteCursors(current, users));
          },
          onRemoteCursor: (cursor) =>
            setRemoteCursorsByUserId((current) => ({
              ...current,
              [cursor.userId]: cursor,
            })),
        });
        socketRef.current = socket;
      })
      .catch((error) => {
        if (isActive) {
          console.error('Failed to create project collaboration session token:', error);
        }
      });

    return () => {
      isActive = false;
      socket?.close();
      if (socket && socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [projectId, status]);

  const handleScenarioContentChange = useCallback((nodeId: string, content: string) => {
    sessionRef.current?.editScenarioContent(nodeId, content);
  }, []);

  const handleScenarioContentSplice = useCallback((nodeId: string, splice: ActionEditorTextSplice) => {
    sessionRef.current?.applyScenarioTextSplice({ nodeId, ...splice });
  }, []);

  const handleScenarioMetadataChange = useCallback((nodeId: string, metadataPatch: Record<string, unknown>) => {
    sessionRef.current?.editScenarioMetadata(nodeId, metadataPatch);
  }, []);

  const handleActionEditorNextAction = useCallback(async (sourceNodeId: string, request: ActionEditorNextActionRequest) => {
    await validateProjectGraphContinuation(projectId, request);
    const command = {
      action: request.action,
      conditionalDraft: request.conditionalDraft,
      menuDraft: request.menuDraft,
      sourceNodeId,
      targetLabelId: request.targetLabelId,
      target: request.target,
    };
    const result = await commitProjectGraphContinuation(projectId, command);
    sessionRef.current?.applyAuthoritativeUpdate(result.update);
    return result.result.selectedNodeId ?? null;
  }, [projectId]);

  const handleCreateStructure = useCallback(async (command: ProjectGraphStructureCommand) => {
    const result = await commitProjectGraphStructure(projectId, command);
    sessionRef.current?.applyAuthoritativeUpdate(result.update);
    return result.result.selectedEntityId ?? null;
  }, [projectId]);

  const handleSourceFileContentChange = useCallback((fileId: string, content: string) => {
    sessionRef.current?.editSourceFileContent(fileId, content);
  }, []);

  const handleEntityPositionChange = useCallback((entityId: string, position: GraphPoint) => {
    sessionRef.current?.moveEntity(entityId, position);
  }, []);

  const handleEntityPositionsChange = useCallback((changes: ProjectGraphEntityPositionChange[]) => {
    sessionRef.current?.moveEntities(changes);
  }, []);

  const handlePresenceActivity = useCallback((update: ProjectGraphPresenceActivityUpdate) => {
    const now = Date.now();
    if (update.activity === 'viewing_canvas' && now - lastCursorSentAtRef.current < 80) {
      return;
    }
    lastCursorSentAtRef.current = now;
    socketRef.current?.sendJson({
      type: 'cursor_update',
      x: update.position.x,
      y: update.position.y,
      activity: update.activity,
      ...(update.targetNodeId ? { targetNodeId: update.targetNodeId } : {}),
    });
  }, []);

  const handleInviteUser = useCallback((targetUser: string) => {
    socketRef.current?.sendJson({
      type: 'share_project',
      target_user_id: targetUser,
      role_id: 'role_editor',
    });
  }, []);

  const exportProjectGraph = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!projectId || !sessionRef.current) {
      return null;
    }

    setExportStatus(t('editorPage.export.exporting'));
    setExportedFiles(null);
    try {
      const files = await exportProjectGraphFiles(projectId, sessionRef.current.graph);
      setExportedFiles(files);
      setExportStatus(t('editorPage.export.exported', { count: Object.keys(files).length }));
      return files;
    } catch (error) {
      console.error('Failed to export ProjectGraph:', error);
      setExportedFiles(null);
      setExportStatus(t('editorPage.export.failed'));
      return null;
    }
  }, [projectId, t]);

  const handleExportProjectGraph = useCallback(() => {
    void exportProjectGraph();
  }, [exportProjectGraph]);

  const handleConnectLocalDirectory = useCallback(() => {
    setLocalDirectoryMessage(t('editorPage.local.requestingAccess'));
    void connectLocalRenpyGameRoot()
      .then(({ session, scan }) => {
        setLocalDirectorySession(session);
        setLocalDirectoryScan(scan);
        setAssetCatalog(scan.catalog);
        setLocalDirectoryMessage(
          t('editorPage.local.connected', { scripts: scan.rpyFiles.length, assets: scan.catalog.entries.length }),
        );
      })
      .catch((error) => {
        console.error('Failed to connect local RenPy directory:', error);
        setLocalDirectorySession(null);
        setLocalDirectoryScan(null);
        setLocalDirectoryMessage(error instanceof Error ? error.message : t('editorPage.local.connectFailed'));
      });
  }, [t]);

  const handleRefreshLocalAssets = useCallback(() => {
    if (!projectId || !localDirectorySession) {
      return;
    }
    setLocalDirectoryMessage(t('editorPage.local.refreshing'));
    void localDirectorySession
      .scan()
      .then((scan) => {
        setLocalDirectoryScan(scan);
        setAssetCatalog(scan.catalog);
        return updateProjectAssetCatalog(projectId, scan.catalog).then(() => scan);
      })
      .then((scan) => {
        setLocalDirectoryMessage(t('editorPage.local.refreshed', { count: scan.catalog.entries.length }));
      })
      .catch((error) => {
        console.error('Failed to refresh local asset catalog:', error);
        setLocalDirectoryMessage(t('editorPage.local.refreshFailed'));
      });
  }, [localDirectorySession, projectId, t]);

  const handleWriteExportedScriptsToLocal = useCallback(() => {
    if (!localDirectorySession || isWritingLocalScripts) {
      return;
    }
    setIsWritingLocalScripts(true);
    setLocalDirectoryMessage(t('editorPage.export.exporting'));
    void (async () => {
      const files = await exportProjectGraph();
      if (!files) {
        setLocalDirectoryMessage(t('editorPage.export.failed'));
        return;
      }

      setLocalDirectoryMessage(t('editorPage.local.writing'));
      const manifest = await buildLocalWriteManifest(localDirectorySession, files);
      if (typeof window.confirm === 'function' && !window.confirm(formatLocalWriteManifestConfirmation(manifest))) {
        setLocalDirectoryMessage(null);
        return;
      }
      const writtenCount = await writeExportedScriptsToLocalGame(localDirectorySession, files);
      const scan = await localDirectorySession.scan();
      setLocalDirectoryScan(scan);
      setAssetCatalog(scan.catalog);
      setLocalDirectoryMessage(t('editorPage.local.written', { count: writtenCount }));
    })()
      .catch((error) => {
        console.error('Failed to write exported scripts locally:', error);
        setLocalDirectoryMessage(t('editorPage.local.writeFailed'));
      })
      .finally(() => setIsWritingLocalScripts(false));
  }, [exportProjectGraph, isWritingLocalScripts, localDirectorySession, t]);

  const handleProjectGraphImport = useCallback(() => {
    if (!projectId || !localDirectoryScan || localDirectoryScan.rpyFiles.length === 0) {
      return;
    }

    setImportStatus('importing');
    setImportMessage(null);
    void importProjectGraphFiles(
      projectId,
      localDirectoryScan.rpyFiles.map((script) => script.file),
      {
        filePaths: localDirectoryScan.rpyFiles.map((script) => script.path),
        assetCatalog: localDirectoryScan.catalog,
      },
    )
      .then((result) => {
        if (result.diagnostics.blocking > 0) {
          setImportStatus('error');
          setImportMessage(t('editorPage.import.blocked', { count: result.diagnostics.blocking }));
          return;
        }
        if (!result.snapshot_available) {
          setImportStatus('error');
          setImportMessage(t('editorPage.import.noSnapshot'));
          return;
        }

        setImportStatus('idle');
        setImportMessage(
          t('editorPage.import.complete', {
            files: result.file_count,
            labels: result.label_count,
            nodes: result.node_count,
            assets: result.catalog_entry_count ?? 0,
          }),
        );
        setAssetCatalog(localDirectoryScan.catalog);
        const nextSearch = new URLSearchParams({ project: result.project_id });
        if (showDevPerformancePanel) {
          nextSearch.set('devPerf', '1');
        }
        if (onlyRenderVisibleElements) {
          nextSearch.set('visibleOnly', '1');
        }
        if (!incrementalReadModel) {
          nextSearch.set('incrementalReadModel', '0');
        }
        navigate(`/editor?${nextSearch.toString()}`, { replace: true });
        setReloadKey((value) => value + 1);
      })
      .catch((error) => {
        console.error('Failed to import ProjectGraph:', error);
        setImportStatus('error');
        setImportMessage(t('editorPage.import.failed'));
      });
  }, [incrementalReadModel, localDirectoryScan, navigate, onlyRenderVisibleElements, projectId, showDevPerformancePanel, t]);

  if (status === 'loading') {
    return (
      <div className="project-graph-canvas" style={{ display: 'grid', placeItems: 'center' }}>
        {t('editorPage.loading')}
      </div>
    );
  }

  if (status === 'error' || !graph) {
    return (
      <div className="project-graph-canvas project-graph-canvas--empty">
        <div className="project-graph-import">
          <div className="project-graph-import__title">
            {projectId ? t('editorPage.import.title') : t('editorPage.noProject')}
          </div>
          {projectId ? (
            <>
              <div className="project-graph-import__message">
                {t('editorPage.import.descriptionBefore')} <code>game</code> {t('editorPage.import.descriptionAfter')}
              </div>
              <button className="project-graph-import__button" onClick={handleConnectLocalDirectory} type="button">
                {t('editorPage.local.connectRoot')}
              </button>
              <button
                className="project-graph-import__button"
                disabled={!localDirectoryScan || localDirectoryScan.rpyFiles.length === 0 || importStatus === 'importing'}
                onClick={handleProjectGraphImport}
                type="button"
              >
                {importStatus === 'importing' ? t('editorPage.import.importing') : t('editorPage.import.action')}
              </button>
              {localDirectoryMessage ? <div className="project-graph-import__message">{localDirectoryMessage}</div> : null}
              {importMessage ? <div className="project-graph-import__message">{importMessage}</div> : null}
            </>
          ) : (
            <div className="project-graph-import__message">{t('editorPage.openFromProject')}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', minHeight: 0 }}>
      {(localDirectorySession || assetCatalog || localDirectoryMessage) ? (
        <div className="project-graph-local-assets" aria-label={t('editorPage.local.aria')}>
          <span>
            {t('editorPage.local.catalog', { count: assetCatalog?.entries.length ?? 0 })}
            {localDirectoryScan ? t('editorPage.local.scripts', { count: localDirectoryScan.rpyFiles.length }) : ''}
          </span>
          {localDirectorySession ? (
            <button onClick={handleRefreshLocalAssets} type="button">
              {t('editorPage.local.refresh')}
            </button>
          ) : (
            <button onClick={handleConnectLocalDirectory} type="button">
              {t('editorPage.local.connectRoot')}
            </button>
          )}
          <button disabled={!localDirectorySession || isWritingLocalScripts} onClick={handleWriteExportedScriptsToLocal} type="button">
            {t('editorPage.local.writeExported')}
          </button>
          {localDirectoryMessage ? <small>{localDirectoryMessage}</small> : null}
        </div>
      ) : null}
      <ProjectGraphCanvas
        assetCatalog={assetCatalog}
        exportedFiles={exportedFiles}
        exportStatus={exportStatus}
        graph={graph}
        localAssetUrls={localAssetUrls}
        onlyRenderVisibleElements={onlyRenderVisibleElements}
        participants={participants}
        projectName={projectName}
        remoteCursors={Object.values(remoteCursorsByUserId)}
        readModelUpdate={readModelUpdate}
        readModelStats={readModelStats}
        saveStatus={saveStatus === 'idle' ? null : saveStatus === 'saving' ? t('editorPage.save.saving') : saveStatus === 'saved' ? t('editorPage.save.saved') : t('editorPage.save.failed')}
        showDevPerformancePanel={showDevPerformancePanel}
        onActionEditorNextAction={handleActionEditorNextAction}
        onCreateStructure={handleCreateStructure}
        onPresenceActivity={handlePresenceActivity}
        onEntityPositionChange={handleEntityPositionChange}
        onEntityPositionsChange={handleEntityPositionsChange}
        onExportProjectGraph={handleExportProjectGraph}
        onInviteUser={handleInviteUser}
        onScenarioContentChange={handleScenarioContentChange}
        onScenarioContentSplice={handleScenarioContentSplice}
        onScenarioMetadataChange={handleScenarioMetadataChange}
        onSourceFileContentChange={handleSourceFileContentChange}
      />
    </div>
  );
};

export default EditorPage;
