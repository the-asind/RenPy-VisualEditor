import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  apiClient,
  exportProjectGraphFiles,
  importProjectGraphFiles,
  loadProjectGraphCrdtDocument,
  saveProjectGraphCrdtSnapshot,
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
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
          onPersistenceStatusChange: setSaveStatus,
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

  const handleProjectGraphImport = useCallback(() => {
    if (!projectId || selectedFiles.length === 0) {
      return;
    }

    setImportStatus('importing');
    setImportMessage(null);
    void importProjectGraphFiles(projectId, selectedFiles)
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
          `Imported ${result.file_count} file(s), ${result.label_count} label(s), ${result.node_count} node(s).`,
        );
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
  }, [navigate, onlyRenderVisibleElements, projectId, selectedFiles, showDevPerformancePanel]);

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
              <input
                accept=".rpy"
                className="project-graph-import__file"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
              <button
                className="project-graph-import__button"
                disabled={selectedFiles.length === 0 || importStatus === 'importing'}
                onClick={handleProjectGraphImport}
                type="button"
              >
                {importStatus === 'importing' ? 'Importing...' : 'Import'}
              </button>
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
      <ProjectGraphCanvas
        exportedFiles={exportedFiles}
        exportStatus={exportStatus}
        graph={graph}
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
