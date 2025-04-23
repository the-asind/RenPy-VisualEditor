// Type declarations for the flowTransformer utility

import { Node, Edge } from 'reactflow';
import { Theme } from '@mui/material/styles';

/**
 * The result of transforming parsed Ren'Py script to React Flow data structure
 */
export interface FlowTransformerResult {
  initialNodes: Node[];
  initialEdges: Edge[];
}

/**
 * Process result from node transformation
 */
export interface NodeProcessResult {
  nodes: Node[];
  edges: Edge[];
  nextY: number;
  horizontalBounds: {
    minX: number;
    maxX: number;
  };
}

/**
 * Transform a parsed Ren'Py script tree into React Flow nodes and edges
 * @param parsedData The parsed script tree data from the API
 * @param theme The current MUI theme
 * @param activeTabId Optional ID of the active tab/LabelBlock to filter nodes
 */
export function transformTreeToFlow(
  parsedData: any, 
  theme: Theme, 
  activeTabId?: string | null
): FlowTransformerResult;
