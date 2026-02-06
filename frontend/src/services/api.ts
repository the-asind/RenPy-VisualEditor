import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  ParsedScriptResponse,
  NodeContentResponse,
  UpdateNodeResponse,
  InsertNodeResponse
} from './api.d';
import { RenPyParser } from '../utils/renpyParser';

// Create a configured axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- API Functions ---

/**
 * Parses a script file.
 * Now handles client-side parsing if backend returns raw content.
 */
export const parseScript = async (file: File, projectId?: string): Promise<ParsedScriptResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) {
    formData.append('project_id', projectId);
  }

  try {
    // If backend returns just content, we parse it here.
    // If backend returns tree, we use it (backward compatibility).
    const response = await apiClient.post<ParsedScriptResponse>('/scripts/parse', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response.data.content && !response.data.tree) {
        console.log('[API] Client-side parsing uploaded script...');
        const parser = new RenPyParser();
        response.data.tree = parser.parse(response.data.content);
    }

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error uploading/parsing script:', axiosError);
    throw axiosError.response?.data || new Error('Failed to parse script');
  }
};

/**
 * Creates a new script file with default content.
 */
export const createNewScript = async (filename: string = 'new_script.rpy', projectId?: string): Promise<ParsedScriptResponse> => {
  const defaultContent = 'label Start:\n    return';
  const blob = new Blob([defaultContent], { type: 'text/plain' });
  const file = new File([blob], filename, { type: 'text/plain' });

  return parseScript(file, projectId);
};

/**
 * Gets node content.
 */
export const getNodeContent = async (
  scriptId: string, 
  startLine: number, 
  endLine: number
): Promise<NodeContentResponse> => {
  try {
    const response = await apiClient.get<NodeContentResponse>(`/scripts/node-content/${scriptId}`, {
      params: { start_line: startLine, end_line: endLine },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error getting node content:', axiosError);
    throw axiosError.response?.data || new Error('Failed to get node content');
  }
};

/**
 * Updates node content.
 */
export const updateNodeContent = async (
  scriptId: string,
  startLine: number,
  endLine: number,
  content: string
): Promise<UpdateNodeResponse> => {
  try {
    const response = await apiClient.post<UpdateNodeResponse>(
      `/scripts/update-node/${scriptId}`,
      { content },
      { params: { start_line: startLine, end_line: endLine } }
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error updating node content:', axiosError);
    throw axiosError.response?.data || new Error('Failed to update node content');
  }
};

export const insertNode = async (
  scriptId: string,
  insertionLine: number,
  nodeType: string,
  content: string,
): Promise<InsertNodeResponse> => {
  try {
    const response = await apiClient.post<InsertNodeResponse>(
      `/scripts/insert-node/${scriptId}`,
      { content, node_type: nodeType },
      { params: { insertion_line: insertionLine } },
    );
    // If insertNode returns updated content (not tree), we might need to handle it?
    // Usually insertion triggers a reload or local update.
    // For now, assume callers reload or backend returns tree (if not changed yet).
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error inserting node:', axiosError);
    throw axiosError.response?.data || new Error('Failed to insert node');
  }
};

/**
 * Gets full script content.
 */
export const getScriptContent = async (scriptId: string): Promise<string> => {
  try {
    const response = await apiClient.get<{content: string, filename: string}>(`/scripts/download/${scriptId}`);
    return response.data.content;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error downloading script:', axiosError);
    throw axiosError.response?.data || new Error('Failed to download script');
  }
};

/**
 * Loads an existing script.
 */
export const loadExistingScript = async (scriptId: string): Promise<ParsedScriptResponse> => {
  try {
    const response = await apiClient.get<ParsedScriptResponse>(`/scripts/load/${scriptId}`);
    
    if (response.data.content && !response.data.tree) {
        console.log('[API] Client-side parsing existing script...');
        const parser = new RenPyParser();
        response.data.tree = parser.parse(response.data.content);
    }
    
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error loading script:', axiosError);
    throw axiosError.response?.data || new Error('Failed to load script');
  }
};

export default apiClient;
