import axios from 'axios';

// Base URL for API calls - read from environment variables or use default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create axios instance with default configuration
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export interface Project {
  id: number | string;
  name: string;
  description: string;
  scriptCount?: number;  // Derived from the number of scripts associated with a project
  hasEditAccess?: boolean; // Derived from role
  owner_id?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
  active_users?: any[];
  scripts?: any[];
}

const projectService = {  /**
   * Get all projects accessible by the current user
   */  async getUserProjects(): Promise<Project[]> {
    try {
      const response = await api.get('/projects');
      
      // Handle different response formats - check if data is an array or if it's nested
      const projectsArray = Array.isArray(response.data) 
        ? response.data 
        : (response.data.projects || response.data.data || []);
      
      // Transform projects to match the frontend interface
      // and calculate additional properties
      return projectsArray.map((project: any) => ({
        id: project.id,
        name: project.name,
        description: project.description || '',
        scriptCount: project.scriptCount || 0,
        hasEditAccess: project.role === 'Owner' || project.role === 'Editor',
        owner_id: project.owner_id,
        role: project.role,
        created_at: project.created_at,
        updated_at: project.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  },

  /**
   * Create a new project
   */  async createProject(name: string, description: string): Promise<Project> {
    try {
      const response = await api.post('/projects', {
        name,
        description
      });
      
      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description || '',
        scriptCount: 0,
        hasEditAccess: true // User is the creator, so they have edit access
      };
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  },
  /**
   * Get details for a specific project
   */  async getProject(projectId: string | number): Promise<Project> {
    try {
      const response = await api.get(`/projects/${projectId}`);
      
      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description || '',
        scriptCount: response.data.scripts ? response.data.scripts.length : 0,
        hasEditAccess: response.data.role === 'Owner' || response.data.role === 'Editor',
        owner_id: response.data.owner_id,
        role: response.data.role,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        active_users: response.data.active_users,
        scripts: response.data.scripts,
      };
    } catch (error) {
      console.error(`Error fetching project ${projectId}:`, error);
      throw error;
    }
  },

  /**
   * Update project details
   */
  async updateProject(projectId: string | number, data: { name?: string, description?: string }): Promise<Project> {
    try {
      // TODO: #issue/44 - Backend doesn't have direct update endpoint yet, build it when available
      const response = await api.patch(`/projects/${projectId}`, data);
      
      return {
        id: response.data.id,
        name: response.data.name,
        description: response.data.description || '',
        hasEditAccess: true
      };
    } catch (error) {
      console.error(`Error updating project ${projectId}:`, error);
      throw error;
    }
  },

  /**
   * Share project with another user or update user's role
   */
  async shareProject(projectId: string | number, userId: string, roleId: string | null): Promise<void> {
    try {
      await api.post(`/projects/${projectId}/share`, {
        user_id: userId,
        role: roleId
      });
    } catch (error) {
      console.error(`Error sharing project ${projectId} with user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Create a new script in a project
   */
  async createScript(projectId: string | number, filename: string, content: string): Promise<any> {
    try {
      const response = await api.post(`/projects/${projectId}/scripts`, {
        filename,
        content
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error creating script in project ${projectId}:`, error);
      throw error;
    }
  }
};

export default projectService;
