// Type declarations for the API service

/**
 * Represents the response from the script parsing API
 */
export interface ParsedScriptResponse {
  script_id: string;
  filename: string;
  tree: any; // Replace with a more specific type if available
}

/**
 * Parse an uploaded Ren'Py script file
 * @param file The .rpy file to parse
 * @returns Promise with the parsed script data
 */
export function parseScript(file: File): Promise<ParsedScriptResponse>;

/**
 * Create a new empty script with the given filename
 * @param filename The name for the new script
 * @returns Promise with the new script data
 */
export function createNewScript(filename: string): Promise<ParsedScriptResponse>;
