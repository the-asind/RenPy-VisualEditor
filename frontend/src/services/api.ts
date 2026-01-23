/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';

export interface ParsedScriptResponse {
  script_id: string;
  filename: string;
  tree: any;
}

// Интерфейс для ответа при получении содержимого узла
export interface NodeContentResponse {
  content: string;
  start_line: number;
  end_line: number;
}

// Интерфейс для ответа при обновлении содержимого узла
export interface UpdateNodeResponse {
  message: string;
  line_diff: number;
  content: string;
}

export interface InsertNodeResponse {
  start_line: number;
  end_line: number;
  line_count: number;
  tree: any;
}

const runtimeConfig = typeof window !== 'undefined' ? (window as any).RUNTIME_CONFIG : undefined;
const effectiveApiUrl = runtimeConfig?.VITE_API_URL || import.meta.env.VITE_API_URL;
// Log the URL being used to help debug
console.log('API Base URL configured:', effectiveApiUrl);

export const apiClient = axios.create({
  baseURL: effectiveApiUrl, // Use the env variable directly
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests if available
apiClient.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * Parses an uploaded RenPy script file.
 * @param file - The .rpy file to parse.
 * @param projectId - Optional project ID to associate the script with.
 * @returns The parsed script data (script_id, filename, tree).
 */
export const parseScript = async (file: File, projectId?: string): Promise<ParsedScriptResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Add project_id if provided
  if (projectId) {
    formData.append('project_id', projectId);
  }

  const targetUrl = apiClient.defaults.baseURL + '/scripts/parse'; // Construct full URL for logging
  console.log(`[API Request] POST ${targetUrl} with file: ${file.name}${projectId ? ` for project: ${projectId}` : ''}`);

  try {
    const response = await apiClient.post<ParsedScriptResponse>('/scripts/parse', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('[API Response] parseScript successful:', response.data);
    return response.data;
  } catch (error) {
    // --- Enhanced Error Logging ---
    console.error('[API Error] Failed during parseScript call.');
    console.error('Target URL:', targetUrl);
    console.error('File Name:', file.name);
    
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
      console.error('Error Response Headers:', axiosError.response.headers);
    } else if (axiosError.request) {
      // The request was made but no response was received
      console.error('Error Request:', axiosError.request);
      console.error('No response received from server. Check network connection and backend status.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error Message:', axiosError.message);
    }
    console.error('Full Error Object:', error);
    // --- End Enhanced Error Logging ---

    // Re-throw a more informative error if possible, otherwise the original
    throw axiosError.response?.data || new Error(`Failed to parse script '${file.name}'. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

/**
 * Creates a new script file with default content.
 * @param filename - The desired filename.
 * @param projectId - Optional project ID to associate the script with.
 * @returns The parsed script data for the new file.
 */
export const createNewScript = async (filename: string = 'new_script.rpy', projectId?: string): Promise<ParsedScriptResponse> => {
  console.log(`[API Action] Attempting to create new script: ${filename}${projectId ? ` for project: ${projectId}` : ''}`);
  const defaultContent = 'label Start:\n    return'; // Basic Renpy script
  const blob = new Blob([defaultContent], { type: 'text/plain' });
  const file = new File([blob], filename, { type: 'text/plain' });

  // parseScript already has enhanced logging, so errors here will be detailed
  try {
    const result = await parseScript(file, projectId);
    console.log(`[API Action] Successfully created and parsed new script: ${filename}`);
    return result;
  } catch (error) {
    console.error(`[API Error] Failed during createNewScript for ${filename}. Error originated from parseScript call.`);
    // Re-throw the error caught from parseScript
    throw error; // Re-throw the detailed error from parseScript
  }
};

/**
 * Получает содержимое узла на основе его начальной и конечной строки.
 * @param scriptId - ID скрипта, к которому принадлежит узел.
 * @param startLine - Начальная строка узла.
 * @param endLine - Конечная строка узла.
 * @returns Обещание с содержимым узла.
 */
export const getNodeContent = async (
  scriptId: string, 
  startLine: number, 
  endLine: number
): Promise<NodeContentResponse> => {
  const targetUrl = `${apiClient.defaults.baseURL}/scripts/node-content/${scriptId}`;
  console.log(`[API Request] GET ${targetUrl} for node lines ${startLine}-${endLine}`);
  
  try {
    const response = await apiClient.get<NodeContentResponse>(`/scripts/node-content/${scriptId}`, {
      params: { start_line: startLine, end_line: endLine },
    });
    console.log('[API Response] getNodeContent successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during getNodeContent call.');
    console.error('Script ID:', scriptId);
    console.error('Start line:', startLine);
    console.error('End line:', endLine);
    
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }
    
    throw axiosError.response?.data || new Error(`Failed to get node content. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

/**
 * Обновляет содержимое узла в скрипте.
 * @param scriptId - ID скрипта, к которому принадлежит узел.
 * @param startLine - Начальная строка узла (до редактирования).
 * @param endLine - Конечная строка узла (до редактирования).
 * @param content - Новое содержимое узла.
 * @returns Обещание с информацией об обновлении.
 */
export const updateNodeContent = async (
  scriptId: string,
  startLine: number,
  endLine: number,
  content: string
): Promise<UpdateNodeResponse> => {
  const targetUrl = `${apiClient.defaults.baseURL}/scripts/update-node/${scriptId}`;
  console.log(`[API Request] POST ${targetUrl} to update node lines ${startLine}-${endLine}`);
  
  try {
    const response = await apiClient.post<UpdateNodeResponse>(
      `/scripts/update-node/${scriptId}`,
      { content }, // Отправляем содержимое в теле запроса
      { params: { start_line: startLine, end_line: endLine } } // Строки в параметрах запроса
    );
    console.log('[API Response] updateNodeContent successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during updateNodeContent call.');
    console.error('Script ID:', scriptId);
    console.error('Start line:', startLine);
    console.error('End line:', endLine);
    console.error('Content length:', content.length);
    
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }
    
    throw axiosError.response?.data || new Error(`Failed to update node content. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

export const insertNode = async (
  scriptId: string,
  insertionLine: number,
  nodeType: string,
  content: string,
): Promise<InsertNodeResponse> => {
  const targetUrl = `${apiClient.defaults.baseURL}/scripts/insert-node/${scriptId}`;
  console.log(`[API Request] POST ${targetUrl} to insert ${nodeType} at line ${insertionLine}`);

  try {
    const response = await apiClient.post<InsertNodeResponse>(
      `/scripts/insert-node/${scriptId}`,
      { content, node_type: nodeType },
      { params: { insertion_line: insertionLine } },
    );
    console.log('[API Response] insertNode successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during insertNode call.');
    console.error('Script ID:', scriptId);
    console.error('Insertion line:', insertionLine);
    console.error('Node type:', nodeType);

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }

    throw axiosError.response?.data || new Error(`Failed to insert node. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

/**
 * Получает полное содержимое скрипта для сохранения на локальный диск.
 * @param scriptId - ID скрипта.
 * @returns Обещание с полным содержимым скрипта.
 */
export const getScriptContent = async (scriptId: string): Promise<string> => {
  const targetUrl = `${apiClient.defaults.baseURL}/scripts/download/${scriptId}`;
  console.log(`[API Request] GET ${targetUrl} for full script content`);
  
  try {
    const response = await apiClient.get<{content: string, filename: string}>(`/scripts/download/${scriptId}`);
    console.log('[API Response] getScriptContent successful');
    return response.data.content;
  } catch (error) {
    console.error('[API Error] Failed during getScriptContent call.');
    console.error('Script ID:', scriptId);
    
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }
    
    throw axiosError.response?.data || new Error(`Failed to get full script content. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

/**
 * Loads an existing script by its ID and returns parsed data.
 * @param scriptId - The ID of the script to load.
 * @returns The script content and parsed tree data.
 */
export const loadExistingScript = async (scriptId: string): Promise<ParsedScriptResponse> => {
  const targetUrl = `${apiClient.defaults.baseURL}/scripts/load/${scriptId}`;
  console.log(`[API Request] GET ${targetUrl} to load existing script`);
  
  try {
    const response = await apiClient.get<ParsedScriptResponse>(`/scripts/load/${scriptId}`);
    console.log('[API Response] loadExistingScript successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during loadExistingScript call.');
    console.error('Script ID:', scriptId);
    
    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }
    
    throw axiosError.response?.data || new Error(`Failed to load script. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

// Export the API client
export default apiClient;
