// Type declarations for the flowTransformer utility

import { Node, Edge } from 'reactflow';

/**
 * The result of transforming parsed Ren'Py script to React Flow data structure
 */
export interface FlowTransformerResult {
  initialNodes: Node[];
  initialEdges: Edge[];
}

/**
 * Transform a parsed Ren'Py script tree into React Flow nodes and edges
 * @param parsedData The parsed script tree data from the API
 * @returns Object containing initialNodes and initialEdges for React Flow
 */
export function transformTreeToFlow(parsedData: any): FlowTransformerResult;
