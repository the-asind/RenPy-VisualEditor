import { MarkerType, Node, Edge } from 'reactflow';
import { Theme } from '@mui/material/styles'; 

export interface FlowTransformerResult {
  initialNodes: Node[];
  initialEdges: Edge[];
}

interface NodeData {
  id?: string;
  node_type?: string;
  label_name?: string;
  content?: string;
  next_id?: string;
  condition?: string;
  children?: any[];
  false_branch?: any[];
  [key: string]: any;
}

interface NodeProcessResult {
  nodes: Node[];
  edges: Edge[];
  nextY: number;
  horizontalBounds: {
    minX: number;
    maxX: number;
  };
}

interface MenuOptionProcessResult {
  node: NodeData;
  result: NodeProcessResult;
  width: number;
}

// --- Configuration ---
const NODE_WIDTH = 250;
const NODE_HEIGHT_BASE = 50; // Base height, can increase with content
const VERTICAL_SPACING = 80;
const HORIZONTAL_SPACING_BASE = 20;

// --- Helper Functions ---

/**
 * Generates a unique ID for edges.
 */
const createEdgeId = (sourceId: string, targetId: string, label = ''): string => 
  `edge-${sourceId}-${targetId}${label ? `-${label}` : ''}`;

/**
 * Creates a standard React Flow node object using theme colors.
 */
const createFlowNode = (
  id: string, 
  type: string, 
  data: NodeData, 
  position: { x: number, y: number }, 
  theme: Theme,
  style: Record<string, any> = {}
): Node => {  // Determine node color from theme based on node_type
  let backgroundColor = theme.custom?.nodeColors?.action || theme.palette.primary.main;
  switch (data.node_type) {
    case 'LabelBlock':
      backgroundColor = theme.custom?.nodeColors?.label || theme.palette.primary.main;
      break;
    case 'IfBlock':
      backgroundColor = theme.custom?.nodeColors?.if || theme.palette.success.main;
      break;
    case 'MenuBlock':
      backgroundColor = theme.custom?.nodeColors?.menu || theme.palette.error.main;
      break;
    case 'MenuOption':
      backgroundColor = theme.custom?.nodeColors?.menuOption || theme.palette.warning.main;
      break;
    case 'EndBlock':
      backgroundColor = theme.custom?.nodeColors?.end || theme.palette.grey[500];
      break;
  }

  return {
    id,
    type: 'default', 
    data: { 
      label: data.label_name || data.content || `Node ${id}`, 
      originalData: { ...data }  // Store original data for reference
    },
    position,
    style: {
      background: backgroundColor,
      width: NODE_WIDTH,
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: '4px',
      padding: '10px',
      textAlign: 'center',
      color: theme.palette.getContrastText(backgroundColor),
      ...style,
    }
  };
};

/**
 * Creates a standard React Flow edge object.
 */
const createFlowEdge = (
  id: string,
  source: string,
  target: string,
  theme: Theme,
  label: string = '',
  type: string = 'default',
  animated: boolean = false
): Edge => {
  const isEndBlockEdge = target.startsWith('end-');

  return {
    id,
    source,
    target,
    label,
    type,
    animated,    style: {
      strokeWidth: 2,
      stroke: isEndBlockEdge 
        ? theme.custom?.nodeColors?.end || theme.palette.divider
        : theme.custom?.edgeColor || theme.palette.divider,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 15,
      height: 15,
      color: isEndBlockEdge 
        ? theme.custom?.nodeColors?.end || theme.palette.divider
        : theme.custom?.edgeColor || theme.palette.divider,
    },
  };
};

/**
 * Recursively processes the API node tree to generate React Flow nodes and edges.
 */
function processNodeRecursive(
  apiNode: NodeData,
  theme: Theme,
  parentInfo: { id: string, type: string } | null = null,
  startX: number = 0,
  startY: number = 0,
  level: number = 0,
  nextSequentialNodeId: string | null = null
): NodeProcessResult {
  if (!apiNode) {
    return {
      nodes: [],
      edges: [],
      nextY: startY,
      horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH }
    };
  }

  const nodeId = apiNode.id || `node-${Math.random().toString(16).slice(2)}`;
  const nodeType = apiNode.node_type || 'Default';
  const nodePosition = { x: startX, y: startY };

  const flowNode = createFlowNode(nodeId, nodeType, apiNode, nodePosition, theme);
  let currentNodes: Node[] = [flowNode];
  let currentEdges: Edge[] = [];

  // Create edge from parent unless it's a special branching node or the root
  if (parentInfo && nodeType !== 'LabelBlock' && parentInfo.type !== 'IfBlock' && parentInfo.type !== 'MenuBlock') {
    currentEdges.push(createFlowEdge(
      createEdgeId(parentInfo.id, nodeId),
      parentInfo.id,
      nodeId,
      theme
    ));
  }

  let currentY = startY + NODE_HEIGHT_BASE + VERTICAL_SPACING;
  let childrenMinX = startX;
  let childrenMaxX = startX + NODE_WIDTH;
  const nextParentInfo = { id: nodeId, type: nodeType };

  // --- Child Processing based on Node Type ---
  if (nodeType === 'IfBlock') {
    // --- Layout Algorithm for IfBlock ---
    // Process true branch (children)
    let trueBranchResult: NodeProcessResult = { 
      nodes: [], edges: [], nextY: currentY, 
      horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } 
    };
    
    if (apiNode.children && apiNode.children.length > 0) {
      let lastTrueNodeId = nodeId;
      let lastTrueNodeType = nodeType;
      let currentTrueY = currentY;
      
      for (let i = 0; i < apiNode.children.length; i++) {
        const trueNode = apiNode.children[i];
        const nextTrueNodeId = (i + 1 < apiNode.children.length) ? 
          apiNode.children[i+1].id : nextSequentialNodeId;
        const parentInfoForTrue = { id: lastTrueNodeId, type: lastTrueNodeType };
        
        const trueNodeResult = processNodeRecursive(
          trueNode, theme, parentInfoForTrue, startX, currentTrueY, 
          level + 1, nextTrueNodeId
        );
        
        trueBranchResult.nodes = trueBranchResult.nodes.concat(trueNodeResult.nodes);
        trueBranchResult.edges = trueBranchResult.edges.concat(trueNodeResult.edges);
        
        currentTrueY = trueNodeResult.nextY;
        lastTrueNodeId = trueNode.id as string;
        lastTrueNodeType = trueNode.node_type as string;
        
        trueBranchResult.horizontalBounds.minX = Math.min(
          trueBranchResult.horizontalBounds.minX, 
          trueNodeResult.horizontalBounds.minX
        );
        trueBranchResult.horizontalBounds.maxX = Math.max(
          trueBranchResult.horizontalBounds.maxX, 
          trueNodeResult.horizontalBounds.maxX
        );
      }
      
      trueBranchResult.nextY = currentTrueY;
    }

    // Process false branch
    let falseBranchResult: NodeProcessResult = { 
      nodes: [], edges: [], nextY: currentY, 
      horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } 
    };
    
    if (apiNode.false_branch && apiNode.false_branch.length > 0) {
      let lastFalseNodeId = nodeId;
      let lastFalseNodeType = nodeType;
      let currentFalseY = currentY;
      
      for (let i = 0; i < apiNode.false_branch.length; i++) {
        const falseNode = apiNode.false_branch[i];
        const nextFalseNodeId = (i + 1 < apiNode.false_branch.length) ? 
          apiNode.false_branch[i+1].id : nextSequentialNodeId;
        const parentInfoForFalse = { id: lastFalseNodeId, type: lastFalseNodeType };
        
        const falseNodeResult = processNodeRecursive(
          falseNode, theme, parentInfoForFalse, startX, currentFalseY, 
          level + 1, nextFalseNodeId
        );
        
        falseBranchResult.nodes = falseBranchResult.nodes.concat(falseNodeResult.nodes);
        falseBranchResult.edges = falseBranchResult.edges.concat(falseNodeResult.edges);
        
        currentFalseY = falseNodeResult.nextY;
        lastFalseNodeId = falseNode.id as string;
        lastFalseNodeType = falseNode.node_type as string;
        
        falseBranchResult.horizontalBounds.minX = Math.min(
          falseBranchResult.horizontalBounds.minX, 
          falseNodeResult.horizontalBounds.minX
        );
        falseBranchResult.horizontalBounds.maxX = Math.max(
          falseBranchResult.horizontalBounds.maxX, 
          falseNodeResult.horizontalBounds.maxX
        );
      }
      
      falseBranchResult.nextY = currentFalseY;
    }

    // Calculate widths and required horizontal shifts for centering
    const trueBranchExists = trueBranchResult.nodes.length > 0;
    const falseBranchExists = falseBranchResult.nodes.length > 0;

    const trueWidth = trueBranchExists ? 
      trueBranchResult.horizontalBounds.maxX - trueBranchResult.horizontalBounds.minX : 0;
    const falseWidth = falseBranchExists ? 
      falseBranchResult.horizontalBounds.maxX - falseBranchResult.horizontalBounds.minX : 0;

    let deltaX_true = 0;
    let deltaX_false = 0;
    let targetTrueBranchMinX = startX;
    let targetFalseBranchMinX = startX;

    if (trueBranchExists && falseBranchExists) {
      const gap = HORIZONTAL_SPACING_BASE;
      const totalChildWidth = falseWidth + trueWidth + gap;
      const combinedStartX = startX + NODE_WIDTH / 2 - totalChildWidth / 2;

      targetFalseBranchMinX = combinedStartX;
      targetTrueBranchMinX = combinedStartX + falseWidth + gap;

      deltaX_false = targetFalseBranchMinX - falseBranchResult.horizontalBounds.minX;
      deltaX_true = targetTrueBranchMinX - trueBranchResult.horizontalBounds.minX;
    } else if (trueBranchExists) {
      targetTrueBranchMinX = startX + NODE_WIDTH / 2 - trueWidth / 2;
      deltaX_true = targetTrueBranchMinX - trueBranchResult.horizontalBounds.minX;
    } else if (falseBranchExists) {
      targetFalseBranchMinX = startX + NODE_WIDTH / 2 - falseWidth / 2;
      deltaX_false = targetFalseBranchMinX - falseBranchResult.horizontalBounds.minX;
    }

    // Adjust node positions
    if (trueBranchExists) {
      trueBranchResult.nodes.forEach(node => { node.position.x += deltaX_true; });
      trueBranchResult.horizontalBounds.minX += deltaX_true;
      trueBranchResult.horizontalBounds.maxX += deltaX_true;
    }
    if (falseBranchExists) {
      falseBranchResult.nodes.forEach(node => { node.position.x += deltaX_false; });
      falseBranchResult.horizontalBounds.minX += deltaX_false;
      falseBranchResult.horizontalBounds.maxX += deltaX_false;
    }

    // Create edges to branches
    if (trueBranchExists) {
      const firstTrueNodeId = apiNode.children![0].id;
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, firstTrueNodeId as string, 'true'),
        nodeId,
        firstTrueNodeId as string,
        theme,
        'True'
      ));
      
      trueBranchResult.edges = trueBranchResult.edges.filter(
        edge => !(edge.source === nodeId && edge.target === firstTrueNodeId)
      );
    } else if (nextSequentialNodeId) {
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, nextSequentialNodeId, 'true'),
        nodeId,
        nextSequentialNodeId,
        theme,
        'True'
      ));
    }

    if (falseBranchExists) {
      const firstFalseNodeId = apiNode.false_branch![0].id;
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, firstFalseNodeId as string, 'false'),
        nodeId,
        firstFalseNodeId as string,
        theme,
        'False'
      ));
      
      falseBranchResult.edges = falseBranchResult.edges.filter(
        edge => !(edge.source === nodeId && edge.target === firstFalseNodeId)
      );
    } else if (nextSequentialNodeId) {
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, nextSequentialNodeId, 'false'),
        nodeId,
        nextSequentialNodeId,
        theme,
        'False'
      ));
    }

    // Combine nodes and edges
    currentNodes = currentNodes.concat(trueBranchResult.nodes, falseBranchResult.nodes);
    currentEdges = currentEdges.concat(trueBranchResult.edges, falseBranchResult.edges);

    // Calculate final Y position and overall horizontal bounds
    currentY = Math.max(trueBranchResult.nextY, falseBranchResult.nextY);
    childrenMinX = Math.min(
      trueBranchExists ? trueBranchResult.horizontalBounds.minX : Infinity,
      falseBranchExists ? falseBranchResult.horizontalBounds.minX : Infinity
    );
    childrenMaxX = Math.max(
      trueBranchExists ? trueBranchResult.horizontalBounds.maxX : -Infinity,
      falseBranchExists ? falseBranchResult.horizontalBounds.maxX : -Infinity
    );
    
    // Ensure bounds are valid even if branches were empty
    if (!isFinite(childrenMinX)) childrenMinX = startX;
    if (!isFinite(childrenMaxX)) childrenMaxX = startX + NODE_WIDTH;

  } else if (nodeType === 'MenuBlock') {
    // --- Layout Algorithm for MenuBlock ---
    // Process each option to determine its structure and bounds
    const optionResults: MenuOptionProcessResult[] = [];
    let maxOptionY = currentY;
    let tempX = startX;
    
    if (apiNode.children && apiNode.children.length > 0) {
      // Process each option
      for (const optionNode of apiNode.children) {
        const optionResult = processNodeRecursive(
          optionNode, theme, nextParentInfo, tempX, currentY, level + 1, nextSequentialNodeId
        );
        
        optionResults.push({
          node: optionNode,
          result: optionResult,
          width: optionResult.horizontalBounds.maxX - optionResult.horizontalBounds.minX
        });
        
        maxOptionY = Math.max(maxOptionY, optionResult.nextY);
      }
      
      // Calculate total width and spacing
      const totalWidth = optionResults.reduce((sum, option) => sum + option.width, 0) 
        + (optionResults.length - 1) * HORIZONTAL_SPACING_BASE;
      
      // Calculate starting X to center options
      const startingX = startX + NODE_WIDTH / 2 - totalWidth / 2;
      
      // Position each option
      let currentX = startingX;
      let firstOptionX = Infinity;
      let lastOptionX = -Infinity;
      
      for (const optionData of optionResults) {
        const { node: optionNode, result: optionResult, width } = optionData;
        
        // Calculate shift needed to position this option
        const deltaX = currentX - optionResult.horizontalBounds.minX;
        
        // Apply shift to nodes
        optionResult.nodes.forEach(node => { node.position.x += deltaX; });
        
        // Create edge from MenuBlock to this option
        const optionStartNodeId = optionNode.id as string;
        currentEdges.push(createFlowEdge(
          createEdgeId(nodeId, optionStartNodeId, 'option'),
          nodeId,
          optionStartNodeId,
          theme,
          optionNode.label_name || `Option ${optionNode.id}`
        ));
        
        // Remove default edge possibly created by the child's recursive call
        optionResult.edges = optionResult.edges.filter(
          edge => !(edge.source === nodeId && edge.target === optionStartNodeId)
        );
        
        // Add nodes and edges to collection
        currentNodes = currentNodes.concat(optionResult.nodes);
        currentEdges = currentEdges.concat(optionResult.edges);
        
        // Track horizontal bounds
        firstOptionX = Math.min(firstOptionX, currentX);
        lastOptionX = Math.max(lastOptionX, currentX + width);
        
        // Move X for next option
        currentX += width + HORIZONTAL_SPACING_BASE;
      }

      currentY = maxOptionY;
      childrenMinX = firstOptionX;
      childrenMaxX = lastOptionX;
      
      // Ensure bounds are valid
      if (!isFinite(childrenMinX)) childrenMinX = startX;
      if (!isFinite(childrenMaxX)) childrenMaxX = startX + NODE_WIDTH;
    }

  } else if (apiNode.children && apiNode.children.length > 0) {
    // Process standard sequence of child nodes vertically
    let lastChildNodeId = nodeId;
    let lastChildNodeType = nodeType;
    let childMinX = startX;
    let childMaxX = startX + NODE_WIDTH;

    for (let i = 0; i < apiNode.children.length; i++) {
      const childNode = apiNode.children[i];
      const nextChildId = (i + 1 < apiNode.children.length) ? 
        apiNode.children[i+1].id as string : nextSequentialNodeId;
      const parentInfoForChild = { id: lastChildNodeId, type: lastChildNodeType };

      const childResult = processNodeRecursive(
        childNode, theme, parentInfoForChild, startX, currentY, level, nextChildId
      );
      
      currentNodes = currentNodes.concat(childResult.nodes);
      currentEdges = currentEdges.concat(childResult.edges);
      currentY = childResult.nextY;
      lastChildNodeId = childNode.id as string;
      lastChildNodeType = childNode.node_type as string;
      
      childMinX = Math.min(childMinX, childResult.horizontalBounds.minX);
      childMaxX = Math.max(childMaxX, childResult.horizontalBounds.maxX);
    }
    
    childrenMinX = childMinX;
    childrenMaxX = childMaxX;
  } else {
    // Leaf node in the current branch/sequence
    if (nextSequentialNodeId) {
      // If there's a next node, create an edge to it
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, nextSequentialNodeId),
        nodeId,
        nextSequentialNodeId,
        theme
      ));
    }
  }

  // Return the collected nodes, edges, next Y position, and horizontal bounds
  return {
    nodes: currentNodes,
    edges: currentEdges,
    nextY: currentY,
    horizontalBounds: {
      minX: Math.min(startX, childrenMinX), 
      maxX: Math.max(startX + NODE_WIDTH, childrenMaxX)
    }
  };
}

/**
 * Main transformation function.
 * Processes the API tree and returns React Flow compatible nodes and edges.
 */
export const transformTreeToFlow = (
  parsedData: any, 
  theme: Theme, 
  activeTabId?: string | null
): FlowTransformerResult => {
  try {
    console.log('TransformTreeToFlow input:', parsedData, 'activeTabId:', activeTabId);
    
    let rootNode = parsedData;
    let labelBlocks: NodeData[] = [];
    
    // Find all LabelBlocks in the data structure
    if (rootNode.children && Array.isArray(rootNode.children)) {
      labelBlocks = rootNode.children.filter(
        (child: NodeData) => child.node_type === 'LabelBlock'
      );
      console.log('Found LabelBlocks:', labelBlocks.map((lb: NodeData) => lb.id || lb.label_name));
    }
    
    // If no label blocks found but children exists as an object (not array)
    if (labelBlocks.length === 0 && rootNode.children && typeof rootNode.children === 'object') {
      // Try to extract label blocks from object structure
      Object.entries(rootNode.children).forEach(([key, value]: [string, any]) => {
        if (value && value.node_type === 'LabelBlock') {
          labelBlocks.push(value);
        }
      });
    }
    
    // If no label blocks found in children, look for them at the root level
    if (labelBlocks.length === 0 && typeof rootNode === 'object') {
      // Check if root itself might be a label block
      if (rootNode.node_type === 'LabelBlock') {
        labelBlocks = [rootNode];
      } 
      // Or if it's an object containing multiple nodes
      else if (!Array.isArray(rootNode)) {
        Object.entries(rootNode).forEach(([key, value]: [string, any]) => {
          if (value && value.node_type === 'LabelBlock') {
            labelBlocks.push(value);
          }
        });
      }
    }
    
    let allNodes: Node[] = [];
    let allEdges: Edge[] = [];
    
    // If we have no label blocks, return empty result
    if (labelBlocks.length === 0) {
      console.error('No LabelBlocks found in the data');
      return { initialNodes: [], initialEdges: [] };
    }
    
    // Filter to just the active tab if specified
    if (activeTabId) {
      const activeBlock = labelBlocks.find(
        (lb: NodeData) => lb.id === activeTabId || lb.label_name === activeTabId
      );
      
      if (activeBlock) {
        labelBlocks = [activeBlock];
      }
    }
    
    // Process all label blocks (or just the active one if filtered)
    let currentY = 50; // Initial Y position
    const initialX = 100; // Initial X position
    
    for (const labelBlock of labelBlocks) {
      // Process this label block
      const blockResult = processNodeRecursive(labelBlock, theme, null, initialX, currentY, 0, null);
      
      // Create a dedicated EndBlock for this label
      const endNodeId = `end-${labelBlock.id || `label-${labelBlocks.indexOf(labelBlock)}`}`;
      const endNodeY = blockResult.nextY;
      const endNodeX = blockResult.horizontalBounds.minX + 
                     (blockResult.horizontalBounds.maxX - 
                      blockResult.horizontalBounds.minX - NODE_WIDTH) / 2;
      
      const endNode = createFlowNode(
        endNodeId,
        'EndBlock',
        { label_name: 'End', node_type: 'EndBlock' },
        { x: endNodeX, y: endNodeY },
        theme
      );
      
      // Add nodes
      allNodes = allNodes.concat(blockResult.nodes);
      allNodes.push(endNode);
      
      // Process edges
      const blockEdges = blockResult.edges;
      const nodeIdsInBlock = new Set(blockResult.nodes.map(n => n.id));
      const sourceNodesInBlock = new Set<string>();
      
      blockEdges.forEach(edge => {
        if (nodeIdsInBlock.has(edge.source)) {
          sourceNodesInBlock.add(edge.source);
        }
      });
      
      // Connect leaf nodes to EndBlock
      blockResult.nodes.forEach(node => {
        // Exclude the LabelBlock node itself from auto-connecting to EndBlock
        if (node.id !== labelBlock.id && !sourceNodesInBlock.has(node.id)) {
          // Check if an edge to the end node wasn't already created
          const existingEdgeToEnd = blockEdges.find(
            edge => edge.source === node.id && edge.target === endNodeId
          );
          
          if (!existingEdgeToEnd) {
            blockEdges.push(createFlowEdge(
              createEdgeId(node.id, endNodeId, 'leaf'),
              node.id,
              endNodeId,
              theme
            ));
          }
        }
      });
      
      // Add all edges
      allEdges = allEdges.concat(blockEdges);
      
      // Update Y position for next label block with spacing
      currentY = endNodeY + NODE_HEIGHT_BASE + VERTICAL_SPACING * 3;
    }
    
    // Remove duplicate edges
    const uniqueEdges = Array.from(
      new Map(allEdges.map(edge => [edge.id, edge])).values()
    );
    
    return {
      initialNodes: allNodes,
      initialEdges: uniqueEdges
    };
    
  } catch (error) {
    console.error('Error transforming tree to flow:', error);
    return { initialNodes: [], initialEdges: [] };
  }
};
