/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';
import {
  importProjectGraphCrdtSnapshot,
  type ProjectGraphCrdtDoc,
  projectGraphFromCrdtDoc,
} from '../utils/projectGraphCrdt';
import type { ProjectGraphSnapshot } from '../utils/projectGraphProjection';
import type { ProjectAssetCatalogPayload } from '../utils/localRenpyDirectory';
import type { ActionEditorNextActionRequest } from '../components/actionEditor/ActionEditorSidebar';
import type { ProjectGraphStructureCommand } from '../utils/projectGraphStructure';

export const validateProjectGraphContinuation = async (
  projectId: string,
  request: ActionEditorNextActionRequest,
): Promise<void> => {
  await apiClient.post(`/projects/${projectId}/validate-continuation`, request);
};

export interface CommitProjectGraphContinuationRequest extends ActionEditorNextActionRequest {
  sourceNodeId: string;
  baseRevision?: number;
}

export interface CommitProjectGraphContinuationResult {
  createdNodeIds: string[];
  selectedNodeId: string;
  createdTargetIds: {
    files: string[];
    labels: string[];
    labelStarts: string[];
  };
}

export interface CommitProjectGraphContinuationResponse {
  update: Uint8Array;
  revision: number | null;
  result: CommitProjectGraphContinuationResult;
}

const decodeBase64JsonHeader = <T,>(value: unknown): T => {
  if (typeof value !== 'string' || !value) {
    throw new Error('Missing ProjectGraph command result header');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

export const commitProjectGraphContinuation = async (
  projectId: string,
  request: CommitProjectGraphContinuationRequest,
): Promise<CommitProjectGraphContinuationResponse> => {
  const response = await apiClient.post<ArrayBuffer>(
    `/projects/${projectId}/continuation-commands`,
    request,
    { responseType: 'arraybuffer' },
  );
  const revisionHeader = response.headers['x-project-graph-revision'];
  const revision = typeof revisionHeader === 'string' ? Number.parseInt(revisionHeader, 10) : null;
  return {
    update: new Uint8Array(response.data),
    revision: Number.isFinite(revision) ? revision : null,
    result: decodeBase64JsonHeader<CommitProjectGraphContinuationResult>(
      response.headers['x-project-graph-command-result'],
    ),
  };
};

export type CommitProjectGraphStructureRequest = ProjectGraphStructureCommand & { baseRevision?: number };

export interface CommitProjectGraphStructureResult {
  selectedEntityId: string | null;
  createdEntityIds: {
    files: string[];
    labels: string[];
    labelStarts: string[];
    nodes: string[];
  };
  deletedEntityIds?: {
    files: string[];
    labels: string[];
    labelStarts: string[];
    nodes: string[];
    edges: string[];
    diagnostics: string[];
  };
}

export interface CommitProjectGraphStructureResponse {
  update: Uint8Array;
  revision: number | null;
  result: CommitProjectGraphStructureResult;
}

export const commitProjectGraphStructure = async (
  projectId: string,
  request: CommitProjectGraphStructureRequest,
): Promise<CommitProjectGraphStructureResponse> => {
  const response = await apiClient.post<ArrayBuffer>(
    `/projects/${projectId}/structure-commands`, request, { responseType: 'arraybuffer' },
  );
  const revisionHeader = response.headers['x-project-graph-revision'];
  const revision = typeof revisionHeader === 'string' ? Number.parseInt(revisionHeader, 10) : null;
  return {
    update: new Uint8Array(response.data),
    revision: Number.isFinite(revision) ? revision : null,
    result: decodeBase64JsonHeader<CommitProjectGraphStructureResult>(
      response.headers['x-project-graph-command-result'],
    ),
  };
};

export interface ProjectGraphDiagnosticsSummary {
  total: number;
  blocking: number;
  info: number;
  warning: number;
  error: number;
}

export interface ProjectGraphImportResult {
  project_id: string;
  file_count: number;
  label_count: number;
  label_start_count: number;
  node_count: number;
  edge_count: number;
  diagnostics: ProjectGraphDiagnosticsSummary;
  snapshot_available: boolean;
  catalog_entry_count?: number;
}

export interface ProjectAssetCatalogResponse {
  project_id: string;
  catalog: ProjectAssetCatalogPayload;
  revision: number;
  updated_by: string;
  updated_at: string | null;
}

export interface ClockworkLibraryDemoPreviewResponse {
  project_id: string;
  graph: ProjectGraphSnapshot;
  asset_catalog: ProjectAssetCatalogPayload;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
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

export const createProjectSessionToken = async (projectId: string): Promise<AuthTokenResponse> => {
  const response = await apiClient.post<AuthTokenResponse>('/auth/session-token', { project_id: projectId });
  return response.data;
};

export const getProjectGraphCrdtSnapshot = async (projectId: string): Promise<Uint8Array> => {
  const targetUrl = `${apiClient.defaults.baseURL}/projects/${projectId}/graph-snapshot`;
  console.log(`[API Request] GET ${targetUrl} for ProjectGraph CRDT snapshot`);

  try {
    const response = await apiClient.get<ArrayBuffer>(`/projects/${projectId}/graph-snapshot`, {
      responseType: 'arraybuffer',
    });
    return new Uint8Array(response.data);
  } catch (error) {
    console.error('[API Error] Failed during getProjectGraphCrdtSnapshot call.');
    console.error('Project ID:', projectId);

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }

    throw axiosError.response?.data || new Error(`Failed to load ProjectGraph snapshot. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

export const loadProjectGraphSnapshot = async (projectId: string): Promise<ProjectGraphSnapshot> => {
  const snapshot = await getProjectGraphCrdtSnapshot(projectId);
  const doc = importProjectGraphCrdtSnapshot(snapshot);
  return projectGraphFromCrdtDoc(doc);
};

export const loadProjectGraphCrdtDocument = async (projectId: string): Promise<ProjectGraphCrdtDoc> => {
  const snapshot = await getProjectGraphCrdtSnapshot(projectId);
  return importProjectGraphCrdtSnapshot(snapshot);
};

export const importProjectGraphFiles = async (
  projectId: string,
  files: File[],
  options?: {
    filePaths?: string[];
    assetCatalog?: ProjectAssetCatalogPayload;
  },
): Promise<ProjectGraphImportResult> => {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  if (options?.filePaths) {
    for (const filePath of options.filePaths) {
      formData.append('file_paths', filePath);
    }
  }
  if (options?.assetCatalog) {
    formData.append('asset_catalog', JSON.stringify(options.assetCatalog));
  }

  const targetUrl = `${apiClient.defaults.baseURL}/projects/${projectId}/graph-import`;
  console.log(`[API Request] POST ${targetUrl} with ${files.length} ProjectGraph import file(s)`);

  try {
    const response = await apiClient.post<ProjectGraphImportResult>(
      `/projects/${projectId}/graph-import`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during importProjectGraphFiles call.');
    console.error('Project ID:', projectId);
    console.error('Files:', files.map((file) => file.name).join(', '));

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }

    throw axiosError.response?.data || new Error(`Failed to import ProjectGraph. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

export const openClockworkLibraryDemoProject = async (): Promise<ProjectGraphImportResult> => {
  try {
    const response = await apiClient.post<ProjectGraphImportResult>('/projects/demo/clockwork-library');
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw axiosError.response?.data || error;
  }
};

export const loadClockworkLibraryDemoPreview = async (): Promise<ClockworkLibraryDemoPreviewResponse> => {
  try {
    const response = await apiClient.get<ClockworkLibraryDemoPreviewResponse>('/projects/demo/clockwork-library/preview');
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw axiosError.response?.data || error;
  }
};

export const getProjectAssetCatalog = async (projectId: string): Promise<ProjectAssetCatalogResponse | null> => {
  try {
    const response = await apiClient.get<ProjectAssetCatalogResponse>(`/projects/${projectId}/asset-catalog`);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      return null;
    }
    throw axiosError.response?.data || error;
  }
};

export const updateProjectAssetCatalog = async (
  projectId: string,
  assetCatalog: ProjectAssetCatalogPayload,
): Promise<ProjectAssetCatalogResponse> => {
  try {
    const response = await apiClient.put<ProjectAssetCatalogResponse>(`/projects/${projectId}/asset-catalog`, assetCatalog);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw axiosError.response?.data || error;
  }
};

export const saveProjectGraphCrdtSnapshot = async (
  projectId: string,
  snapshot: Uint8Array,
): Promise<{ status: string }> => {
  const targetUrl = `${apiClient.defaults.baseURL}/projects/${projectId}/graph-snapshot`;
  console.log(`[API Request] PUT ${targetUrl} for ProjectGraph CRDT snapshot`);

  try {
    const body = snapshot.buffer.slice(snapshot.byteOffset, snapshot.byteOffset + snapshot.byteLength);
    const response = await apiClient.put<{ status: string }>(`/projects/${projectId}/graph-snapshot`, body, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      transformRequest: [() => body],
    });
    return response.data;
  } catch (error) {
    console.error('[API Error] Failed during saveProjectGraphCrdtSnapshot call.');
    console.error('Project ID:', projectId);

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }

    throw axiosError.response?.data || new Error(`Failed to save ProjectGraph snapshot. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

export const exportProjectGraphFiles = async (
  projectId: string,
  graph: ProjectGraphSnapshot,
): Promise<Record<string, string>> => {
  const targetUrl = `${apiClient.defaults.baseURL}/projects/${projectId}/graph-export`;
  console.log(`[API Request] POST ${targetUrl} to export ProjectGraph`);

  try {
    const response = await apiClient.post<{ files: Record<string, string> }>(
      `/projects/${projectId}/graph-export`,
      graph,
    );
    return response.data.files;
  } catch (error) {
    console.error('[API Error] Failed during exportProjectGraphFiles call.');
    console.error('Project ID:', projectId);

    const axiosError = error as AxiosError;

    if (axiosError.response) {
      console.error('Error Response Data:', axiosError.response.data);
      console.error('Error Response Status:', axiosError.response.status);
    } else if (axiosError.request) {
      console.error('Error Request:', axiosError.request);
    } else {
      console.error('Error Message:', axiosError.message);
    }

    throw axiosError.response?.data || new Error(`Failed to export ProjectGraph. Status: ${axiosError.response?.status || 'unknown'}. ${axiosError.message}`);
  }
};

// Export the API client
export default apiClient;
