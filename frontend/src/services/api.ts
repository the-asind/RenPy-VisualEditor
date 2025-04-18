/// <reference types="vite/client" />
import axios, { AxiosError } from 'axios';
import React, { useState, useEffect } from 'react';
import { Box, useMediaQuery, BottomNavigation, BottomNavigationAction, Paper } from '@mui/material'; // Added Paper import

export interface ParsedScriptResponse {
  script_id: string;
  filename: string;
  tree: any;
}

const effectiveApiUrl = import.meta.env.VITE_API_URL;
// Log the URL being used to help debug
console.log('API Base URL configured:', effectiveApiUrl);

const apiClient = axios.create({
  baseURL: effectiveApiUrl, // Use the env variable directly
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Parses an uploaded RenPy script file.
 * @param file - The .rpy file to parse.
 * @returns The parsed script data (script_id, filename, tree).
 */
export const parseScript = async (file: File): Promise<ParsedScriptResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const targetUrl = apiClient.defaults.baseURL + '/scripts/parse'; // Construct full URL for logging
  console.log(`[API Request] POST ${targetUrl} with file: ${file.name}`);

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
 * @returns The parsed script data for the new file.
 */
export const createNewScript = async (filename: string = 'new_script.rpy'): Promise<ParsedScriptResponse> => {
  console.log(`[API Action] Attempting to create new script: ${filename}`);
  const defaultContent = 'label Start:\n    return'; // Basic Renpy script
  const blob = new Blob([defaultContent], { type: 'text/plain' });
  const file = new File([blob], filename, { type: 'text/plain' });

  // parseScript already has enhanced logging, so errors here will be detailed
  try {
    const result = await parseScript(file);
    console.log(`[API Action] Successfully created and parsed new script: ${filename}`);
    return result;
  } catch (error) {
    console.error(`[API Error] Failed during createNewScript for ${filename}. Error originated from parseScript call.`);
    // No need to log the error again here, parseScript does it.
    // Re-throw the error caught from parseScript
    throw error; // Re-throw the detailed error from parseScript
  }
};

// Add other API functions (getNodeContent, updateNodeContent, etc.) here later...

export default apiClient;
