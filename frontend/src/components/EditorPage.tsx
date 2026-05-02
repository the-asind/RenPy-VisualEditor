import { useCallback, useEffect, useRef, useState } from 'react';
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
  type ProjectGraphSocketHandle,
} from '../utils/projectGraphCollaboration';
import type { GraphPoint, ProjectGraphSnapshot } from '../utils/projectGraphProjection';
import { ProjectGraphCanvas } from './projectGraph/ProjectGraphCanvas';

export const getEditorProjectId = (search: string): string | null => {
  const projectId = new URLSearchParams(search).get('project');
  return projectId && projectId.trim() ? projectId : null;
};

const EditorPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = getEditorProjectId(location.search);
  const sessionRef = useRef<ProjectGraphCollaborationSession | null>(null);
  const socketRef = useRef<ProjectGraphSocketHandle | null>(null);
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<ProjectGraphPersistenceStatus>('idle');

  useEffect(() => {
    if (!projectId) {
      setGraph(null);
      setStatus('error');
      return;
    }

    let isActive = true;
    setStatus('loading');
    setGraph(null);
    setSaveStatus('idle');
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
          onGraphChange: setGraph,
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

  const handleEntityPositionChange = useCallback((entityId: string, position: GraphPoint) => {
    sessionRef.current?.moveEntity(entityId, position);
  }, []);

  const handleExportProjectGraph = useCallback(() => {
    if (!projectId || !sessionRef.current) {
      return;
    }

    setExportStatus('Exporting...');
    void exportProjectGraphFiles(projectId, sessionRef.current.graph)
      .then((files) => {
        setExportStatus(`Exported ${Object.keys(files).length} file(s).`);
      })
      .catch((error) => {
        console.error('Failed to export ProjectGraph:', error);
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
        navigate(`/editor?project=${encodeURIComponent(result.project_id)}`, { replace: true });
        setReloadKey((value) => value + 1);
      })
      .catch((error) => {
        console.error('Failed to import ProjectGraph:', error);
        setImportStatus('error');
        setImportMessage('Import failed.');
      });
  }, [navigate, projectId, selectedFiles]);

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
        exportStatus={exportStatus}
        graph={graph}
        saveStatus={saveStatus === 'idle' ? null : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
        onEntityPositionChange={handleEntityPositionChange}
        onExportProjectGraph={handleExportProjectGraph}
        onScenarioContentChange={handleScenarioContentChange}
      />
    </div>
  );
};

export default EditorPage;
