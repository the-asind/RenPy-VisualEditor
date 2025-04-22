import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  project_id: string;
  filename: string;
  created_at: string;
  updated_at: string;
}

export const projectService = {
  /**
   * Create a new project
   */
  async createProject(name: string): Promise<Project> {
    const response = await axios.post(`${API_URL}/projects`, { name });
    return response.data;
  },

  /**
   * Get all projects for current user
   */
  async getProjects(): Promise<Project[]> {
    const response = await axios.get(`${API_URL}/projects`);
    return response.data;
  },

  /**
   * Create a new script in a project
   */
  async createScript(projectId: string, filename: string, content: string): Promise<Script> {
    const response = await axios.post(`${API_URL}/projects/${projectId}/scripts`, {
      filename,
      content
    });
    return response.data;
  },

  /**
   * Get all scripts in a project
   */
  async getScripts(projectId: string): Promise<Script[]> {
    const response = await axios.get(`${API_URL}/projects/${projectId}/scripts`);
    return response.data;
  }
};
