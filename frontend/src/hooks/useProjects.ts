import { useState, useEffect } from 'react';
import projectService, { Project } from '../services/projectService';

interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: Error | null;
  refreshProjects: () => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project>;
}

/**
 * Custom hook to fetch and manage projects
 */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to fetch projects
  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectService.getUserProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch projects'));
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Function to create a new project and update the state
  const createProject = async (name: string, description: string): Promise<Project> => {
    try {
      const newProject = await projectService.createProject(name, description);
      setProjects(prevProjects => [...prevProjects, newProject]);
      return newProject;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create project');
      setError(error);
      throw error;
    }
  };

  return {
    projects,
    loading,
    error,
    refreshProjects: fetchProjects,
    createProject
  };
}

export default useProjects;
