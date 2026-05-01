import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  apiClient,
  exportProjectGraphFiles,
  loadProjectGraphCrdtDocument,
  saveProjectGraphCrdtSnapshot,
} from '../services/api';
import {
  ProjectGraphCollaborationSession,
  connectProjectGraphCollaborationSocket,
  toProjectGraphWebSocketUrl,
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
  const projectId = getEditorProjectId(location.search);
  const sessionRef = useRef<ProjectGraphCollaborationSession | null>(null);
  const socketRef = useRef<ProjectGraphSocketHandle | null>(null);
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setGraph(null);
      setStatus('error');
      return;
    }

    let isActive = true;
    setStatus('loading');
    setGraph(null);
    sessionRef.current = null;

    loadProjectGraphCrdtDocument(projectId)
      .then((doc) => {
        if (!isActive) {
          return;
        }
        const session = new ProjectGraphCollaborationSession(doc, {
          sendUpdate: (update) => socketRef.current?.sendBinary(update),
          persistSnapshot: (snapshot) => {
            void saveProjectGraphCrdtSnapshot(projectId, snapshot).catch((error) => {
              console.error('Failed to persist ProjectGraph snapshot:', error);
            });
          },
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

  if (status === 'loading') {
    return (
      <div className="project-graph-canvas" style={{ display: 'grid', placeItems: 'center' }}>
        Loading project graph...
      </div>
    );
  }

  if (status === 'error' || !graph) {
    return (
      <div className="project-graph-canvas" style={{ display: 'grid', placeItems: 'center' }}>
        Project graph snapshot is not available.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', minHeight: 0 }}>
      <ProjectGraphCanvas
        exportStatus={exportStatus}
        graph={graph}
        onEntityPositionChange={handleEntityPositionChange}
        onExportProjectGraph={handleExportProjectGraph}
        onScenarioContentChange={handleScenarioContentChange}
      />
    </div>
  );
};

export default EditorPage;
