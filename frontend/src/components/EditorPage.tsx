import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  apiClient,
  exportProjectGraphFiles,
  getProjectAssetCatalog,
  importProjectGraphFiles,
  loadProjectGraphCrdtDocument,
  saveProjectGraphCrdtSnapshot,
  updateProjectAssetCatalog,
} from '../services/api';
import {
  ProjectGraphCollaborationSession,
  connectProjectGraphCollaborationSocket,
  toProjectGraphWebSocketUrl,
  type ProjectGraphPersistenceStatus,
  type ProjectGraphPresenceUser,
  type ProjectGraphRemoteCursor,
  type ProjectGraphSocketHandle,
} from '../utils/projectGraphCollaboration';
import type { GraphPoint, ProjectGraphSnapshot } from '../utils/projectGraphProjection';
import projectService from '../services/projectService';
import {
  getEditorDevPerformanceEnabled,
  getEditorProjectId,
  getEditorVisibleOnlyEnabled,
} from './editorPageQuery';
import { ProjectGraphCanvas, type ProjectGraphEntityPositionChange } from './projectGraph/ProjectGraphCanvas';
import {
  connectLocalRenpyGameRoot,
  writeExportedScriptsToLocalGame,
  type LocalRenpyDirectoryScan,
  type LocalRenpyGameDirectorySession,
  type ProjectAssetCatalogPayload,
} from '../utils/localRenpyDirectory';

const EditorPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = getEditorProjectId(location.search);
  const showDevPerformancePanel = getEditorDevPerformanceEnabled(location.search);
  const onlyRenderVisibleElements = getEditorVisibleOnlyEnabled(location.search);
  const sessionRef = useRef<ProjectGraphCollaborationSession | null>(null);
  const socketRef = useRef<ProjectGraphSocketHandle | null>(null);
  const lastCursorSentAtRef = useRef(0);
  const [, startGraphTransition] = useTransition();
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
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
  const [saveStatus, setSaveStatus] = useState<ProjectGraphPersistenceStatus>('idle');
  const [projectName, setProjectName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ProjectGraphPresenceUser[]>([]);
  const [remoteCursorsByUserId, setRemoteCursorsByUserId] = useState<Record<string, ProjectGraphRemoteCursor>>({});

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
    setSaveStatus('idle');
    setParticipants([]);
    setRemoteCursorsByUserId({});
    sessionRef.current = null;

    loadProjectGraphCrdtDocument(projectId)
      .then((doc) => {
        if (!isActive) {
          return;
        }
        const session = new ProjectGraphCollaborationSession(doc, {
          sendUpdate: (update) => socketRef.current?.sendBinary(update),
          persistDebounceMs: 500,
          persistSnapshot: async (snapshot) => {
            await saveProjectGraphCrdtSnapshot(projectId, snapshot);
          },
          onPersistenceStatusChange: (updatedSaveStatus) =>
            startGraphTransition(() => setSaveStatus(updatedSaveStatus)),
          onGraphChange: (updatedGraph) => startGraphTransition(() => setGraph(updatedGraph)),
        });
        sessionRef.current = session;
        setGraph(session.graph);
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
      sessionRef.current = null;
    };
  }, [projectId, reloadKey]);

  useEffect(() => {
    if (!localDirectorySession || !assetCatalog || typeof URL.createObjectURL !== 'function') {
      setLocalAssetUrls({});
      return undefined;
    }

    let isActive = true;
    const createdUrls: string[] = [];
    console.info('[LocalRenpyAssets] Creating local object URLs for asset catalog.', {
      catalogEntries: assetCatalog.entries.length,
      mediaEntries: assetCatalog.entries.filter((entry) => entry.kind === 'image' || entry.kind === 'audio').length,
    });
    void Promise.all(
      assetCatalog.entries
        .filter((entry) => entry.kind === 'image' || entry.kind === 'audio')
        .map(async (entry) => {
          const file = await localDirectorySession.readAsset(entry.path);
          if (!file) {
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
          localUrlCount: Object.keys(nextLocalAssetUrls).length,
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

    const token = localStorage.getItem('auth_token');
    const apiBaseUrl = apiClient.defaults.baseURL;
    if (!token || !apiBaseUrl) {
      return undefined;
    }

    const socket = connectProjectGraphCollaborationSocket({
      url: toProjectGraphWebSocketUrl(apiBaseUrl, projectId, token),
      onUpdate: (update) => sessionRef.current?.receiveRemoteUpdate(update),
      onPresenceUsers: setParticipants,
      onRemoteCursor: (cursor) =>
        setRemoteCursorsByUserId((current) => ({
          ...current,
          [cursor.userId]: cursor,
        })),
    });
    socketRef.current = socket;

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [projectId, status]);

  const handleScenarioContentChange = useCallback((nodeId: string, content: string) => {
    sessionRef.current?.editScenarioContent(nodeId, content);
  }, []);

  const handleScenarioMetadataChange = useCallback((nodeId: string, metadataPatch: Record<string, unknown>) => {
    sessionRef.current?.editScenarioMetadata(nodeId, metadataPatch);
  }, []);

  const handleEntityPositionChange = useCallback((entityId: string, position: GraphPoint) => {
    sessionRef.current?.moveEntity(entityId, position);
  }, []);

  const handleEntityPositionsChange = useCallback((changes: ProjectGraphEntityPositionChange[]) => {
    sessionRef.current?.moveEntities(changes);
  }, []);

  const handleCanvasPointerActivity = useCallback((position: GraphPoint) => {
    const now = Date.now();
    if (now - lastCursorSentAtRef.current < 80) {
      return;
    }
    lastCursorSentAtRef.current = now;
    socketRef.current?.sendJson({
      type: 'cursor_update',
      x: position.x,
      y: position.y,
      activity: 'viewing canvas',
    });
  }, []);

  const handleInviteUser = useCallback((targetUser: string) => {
    socketRef.current?.sendJson({
      type: 'share_project',
      target_user_id: targetUser,
      role_id: 'role_editor',
    });
  }, []);

  const handleExportProjectGraph = useCallback(() => {
    if (!projectId || !sessionRef.current) {
      return;
    }

    setExportStatus('Exporting...');
    setExportedFiles(null);
    void exportProjectGraphFiles(projectId, sessionRef.current.graph)
      .then((files) => {
        setExportedFiles(files);
        setExportStatus(`Exported ${Object.keys(files).length} file(s).`);
      })
      .catch((error) => {
        console.error('Failed to export ProjectGraph:', error);
        setExportedFiles(null);
        setExportStatus('Export failed.');
      });
  }, [projectId]);

  const handleConnectLocalDirectory = useCallback(() => {
    setLocalDirectoryMessage('Requesting read/write access to the RenPy game root...');
    void connectLocalRenpyGameRoot()
      .then(({ session, scan }) => {
        setLocalDirectorySession(session);
        setLocalDirectoryScan(scan);
        setAssetCatalog(scan.catalog);
        setLocalDirectoryMessage(
          `Connected game folder: ${scan.rpyFiles.length} .rpy file(s), ${scan.catalog.entries.length} catalog file(s).`,
        );
      })
      .catch((error) => {
        console.error('Failed to connect local RenPy directory:', error);
        setLocalDirectorySession(null);
        setLocalDirectoryScan(null);
        setLocalDirectoryMessage(error instanceof Error ? error.message : 'Failed to connect local RenPy directory.');
      });
  }, []);

  const handleRefreshLocalAssets = useCallback(() => {
    if (!projectId || !localDirectorySession) {
      return;
    }
    setLocalDirectoryMessage('Refreshing local game catalog...');
    void localDirectorySession
      .scan()
      .then((scan) => {
        setLocalDirectoryScan(scan);
        setAssetCatalog(scan.catalog);
        return updateProjectAssetCatalog(projectId, scan.catalog).then(() => scan);
      })
      .then((scan) => {
        setLocalDirectoryMessage(`Catalog refreshed: ${scan.catalog.entries.length} file(s).`);
      })
      .catch((error) => {
        console.error('Failed to refresh local asset catalog:', error);
        setLocalDirectoryMessage('Catalog refresh failed.');
      });
  }, [localDirectorySession, projectId]);

  const handleWriteExportedScriptsToLocal = useCallback(() => {
    if (!localDirectorySession || !exportedFiles) {
      return;
    }
    setLocalDirectoryMessage('Writing exported .rpy files to local game folder...');
    void writeExportedScriptsToLocalGame(localDirectorySession, exportedFiles)
      .then((writtenCount) => localDirectorySession.scan().then((scan) => ({ scan, writtenCount })))
      .then(({ scan, writtenCount }) => {
        setLocalDirectoryScan(scan);
        setAssetCatalog(scan.catalog);
        setLocalDirectoryMessage(`Wrote ${writtenCount} .rpy file(s) to local game folder.`);
      })
      .catch((error) => {
        console.error('Failed to write exported scripts locally:', error);
        setLocalDirectoryMessage('Local script write failed.');
      });
  }, [exportedFiles, localDirectorySession]);

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
          setImportMessage(`Import blocked by ${result.diagnostics.blocking} problem(s).`);
          return;
        }
        if (!result.snapshot_available) {
          setImportStatus('error');
          setImportMessage('Import did not create a project graph snapshot.');
          return;
        }

        setImportStatus('idle');
        setImportMessage(
          `Imported ${result.file_count} .rpy file(s), ${result.label_count} label(s), ${result.node_count} node(s), ${result.catalog_entry_count ?? 0} catalog file(s).`,
        );
        setAssetCatalog(localDirectoryScan.catalog);
        const nextSearch = new URLSearchParams({ project: result.project_id });
        if (showDevPerformancePanel) {
          nextSearch.set('devPerf', '1');
        }
        if (onlyRenderVisibleElements) {
          nextSearch.set('visibleOnly', '1');
        }
        navigate(`/editor?${nextSearch.toString()}`, { replace: true });
        setReloadKey((value) => value + 1);
      })
      .catch((error) => {
        console.error('Failed to import ProjectGraph:', error);
        setImportStatus('error');
        setImportMessage('Import failed.');
      });
  }, [localDirectoryScan, navigate, onlyRenderVisibleElements, projectId, showDevPerformancePanel]);

  if (status === 'loading') {
    return (
      <div className="project-graph-canvas" style={{ display: 'grid', placeItems: 'center' }}>
        Loading project graph...
      </div>
    );
  }

  if (status === 'error' || !graph) {
    return (
      <div className="project-graph-canvas project-graph-canvas--empty">
        <div className="project-graph-import">
          <div className="project-graph-import__title">
            {projectId ? 'Import RenPy project files' : 'Project is not selected'}
          </div>
          {projectId ? (
            <>
              <div className="project-graph-import__message">
                Select the Ren&apos;Py game root. The editor scans only its <code>game</code> folder, uploads .rpy
                text and file names, and keeps images/audio local.
              </div>
              <button className="project-graph-import__button" onClick={handleConnectLocalDirectory} type="button">
                Connect RenPy game root
              </button>
              <button
                className="project-graph-import__button"
                disabled={!localDirectoryScan || localDirectoryScan.rpyFiles.length === 0 || importStatus === 'importing'}
                onClick={handleProjectGraphImport}
                type="button"
              >
                {importStatus === 'importing' ? 'Importing...' : 'Import'}
              </button>
              {localDirectoryMessage ? <div className="project-graph-import__message">{localDirectoryMessage}</div> : null}
              {importMessage ? <div className="project-graph-import__message">{importMessage}</div> : null}
            </>
          ) : (
            <div className="project-graph-import__message">Open the editor from a project.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', minHeight: 0 }}>
      {(localDirectorySession || assetCatalog || localDirectoryMessage) ? (
        <div className="project-graph-local-assets" aria-label="Local RenPy game folder">
          <span>
            Catalog: {assetCatalog?.entries.length ?? 0} file(s)
            {localDirectoryScan ? `, local ${localDirectoryScan.rpyFiles.length} .rpy` : ''}
          </span>
          {localDirectorySession ? (
            <button onClick={handleRefreshLocalAssets} type="button">
              Refresh assets
            </button>
          ) : (
            <button onClick={handleConnectLocalDirectory} type="button">
              Connect game root
            </button>
          )}
          <button disabled={!localDirectorySession || !exportedFiles} onClick={handleWriteExportedScriptsToLocal} type="button">
            Write exported .rpy locally
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
        saveStatus={saveStatus === 'idle' ? null : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
        showDevPerformancePanel={showDevPerformancePanel}
        onCanvasPointerActivity={handleCanvasPointerActivity}
        onEntityPositionChange={handleEntityPositionChange}
        onEntityPositionsChange={handleEntityPositionsChange}
        onExportProjectGraph={handleExportProjectGraph}
        onInviteUser={handleInviteUser}
        onScenarioContentChange={handleScenarioContentChange}
        onScenarioMetadataChange={handleScenarioMetadataChange}
      />
    </div>
  );
};

export default EditorPage;
