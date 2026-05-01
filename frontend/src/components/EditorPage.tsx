import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { loadProjectGraphSnapshot } from '../services/api';
import type { ProjectGraphSnapshot } from '../utils/projectGraphProjection';
import { ProjectGraphCanvas } from './projectGraph/ProjectGraphCanvas';

export const getEditorProjectId = (search: string): string | null => {
  const projectId = new URLSearchParams(search).get('project');
  return projectId && projectId.trim() ? projectId : null;
};

const EditorPage = () => {
  const location = useLocation();
  const projectId = getEditorProjectId(location.search);
  const [graph, setGraph] = useState<ProjectGraphSnapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!projectId) {
      setGraph(null);
      setStatus('error');
      return;
    }

    let isActive = true;
    setStatus('loading');
    setGraph(null);

    loadProjectGraphSnapshot(projectId)
      .then((loadedGraph) => {
        if (!isActive) {
          return;
        }
        setGraph(loadedGraph);
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
    };
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
      <ProjectGraphCanvas graph={graph} />
    </div>
  );
};

export default EditorPage;
