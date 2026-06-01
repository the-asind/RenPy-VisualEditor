export const getEditorProjectId = (search: string): string | null => {
  const projectId = new URLSearchParams(search).get('project');
  return projectId && projectId.trim() ? projectId : null;
};

export const getEditorDevPerformanceEnabled = (search: string): boolean => {
  const value = new URLSearchParams(search).get('devPerf');
  return value === '1' || value === 'true';
};

export const getEditorVisibleOnlyEnabled = (search: string): boolean => {
  const value = new URLSearchParams(search).get('visibleOnly');
  return value !== '0' && value !== 'false';
};
