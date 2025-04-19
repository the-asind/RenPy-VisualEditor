import { MarkerType } from 'reactflow';

// --- Configuration ---
const NODE_WIDTH = 250;
const NODE_HEIGHT_BASE = 50; // Base height, can increase with content
const VERTICAL_SPACING = 80;
const HORIZONTAL_SPACING_BASE = 20; // Unified horizontal spacing for all branches (if/else and menu options)

// --- Node Styling ---
const nodeColors = {
  LabelBlock: '#f0e68c',
  Action: '#f5f5f5',
  IfBlock: '#90ee90',
  MenuBlock: '#966666',
  MenuOption: '#ffa500',
  EndBlock: '#eeeeee',
  Default: '#ffffff',
};

const getNodeColor = (nodeType) => nodeColors[nodeType] || nodeColors.Default;

// --- Helper Functions ---

/**
 * Generates a unique ID for edges.
 */
const createEdgeId = (sourceId, targetId, label = '') => `edge-${sourceId}-${targetId}${label ? `-${label}` : ''}`;

/**
 * Creates a standard React Flow node object.
 */
const createFlowNode = (id, type, data, position, style = {}) => ({
  id,
  type: 'default', // Using default node type for now, can customize later
  data: { label: data.label_name || `Node ${id}` }, // Use label_name for display
  position,
  style: {
    background: getNodeColor(data.node_type || type),
    width: NODE_WIDTH,
    // Auto-height is handled by the default node type
    border: '1px solid #555',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    ...style,
  },
  // Store original API data for potential use (e.g., node inspection/editing)
  meta: { ...data }
});

/**
 * Creates a standard React Flow edge object.
 */
const createFlowEdge = (id, source, target, label = '', type = 'default', animated = false, markerEnd = { type: MarkerType.ArrowClosed }) => {
  const isEndBlockEdge = target.startsWith('end-'); // Check if target is an EndBlock for specific styling
  return {
    id,
    source,
    target,
    label,
    type, // e.g., 'step', 'smoothstep', 'straight'
    animated,
    markerEnd,
    style: {
      strokeWidth: 2,
      stroke: isEndBlockEdge ? '#eeeeee' : '#b1b1b7', // Use distinct color for edges leading to EndBlock
    },
  };
};

/**
 * Recursively processes the API node tree to generate React Flow nodes and edges.
 * Calculates layout positions (X, Y) and horizontal boundaries for each node and its subtree.
 * Connects sequential nodes and handles branching logic (IfBlock, MenuBlock).
 *
 * @param {object} apiNode - The current node object from the API response.
 * @param {object|null} parentInfo - Info about the parent { id: string, type: string } or null for root/LabelBlock.
 * @param {number} startX - Starting X position for this node.
 * @param {number} startY - Starting Y position for this node.
 * @param {number} level - Current nesting level (primarily for debugging/potential future use).
 * @param {string|null} nextSequentialNodeId - The ID of the node that should logically follow the current sequence/branch, used for connecting flow ends.
 *
 * Returns: { nodes: Array<object>, edges: Array<object>, nextY: number, horizontalBounds: { minX: number, maxX: number } }
 *          - nodes: Array of React Flow nodes generated from this subtree.
 *          - edges: Array of React Flow edges generated from this subtree.
 *          - nextY: The Y coordinate below the lowest point of this subtree, for placing subsequent nodes.
 *          - horizontalBounds: The minimum and maximum X coordinates occupied by this subtree.
 */
function processNodeRecursive(apiNode, parentInfo = null, startX = 0, startY = 0, level = 0, nextSequentialNodeId = null) {
  if (!apiNode) {
    return { nodes: [], edges: [], nextY: startY, horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } };
  }

  const nodeId = apiNode.id || `node-${Math.random().toString(16).slice(2)}`;
  const nodeType = apiNode.node_type;
  const nodePosition = { x: startX, y: startY };

  const flowNode = createFlowNode(nodeId, nodeType, apiNode, nodePosition);
  let currentNodes = [flowNode];
  let currentEdges = [];

  // Create edge from parent unless it's a special branching node (If/Menu) or the root (LabelBlock)
  if (parentInfo && nodeType !== 'LabelBlock' && parentInfo.type !== 'IfBlock' && parentInfo.type !== 'MenuBlock') {
    currentEdges.push(createFlowEdge(createEdgeId(parentInfo.id, nodeId), parentInfo.id, nodeId));
  }

  let currentY = startY + NODE_HEIGHT_BASE + VERTICAL_SPACING;
  let childrenMinX = startX;
  let childrenMaxX = startX + NODE_WIDTH;
  const nextParentInfo = { id: nodeId, type: nodeType }; // Pass current node info to children

  // --- Child Processing based on Node Type ---
  if (nodeType === 'IfBlock') {
    // --- Layout Algorithm for IfBlock ---
    // Processes both branches recursively first, then calculates horizontal positions
    // to center the branches under the IfBlock node.
    
    // Process true branch (use startX as temporary reference)
    // Updated to handle all children nodes, not just the first one
    let trueBranchResult = { nodes: [], edges: [], nextY: currentY, horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } };
    
    // Check if true branch exists and has elements
    if (apiNode.children && apiNode.children.length > 0) {
        let lastTrueNodeId = nodeId;
        let lastTrueNodeType = nodeType;
        let currentTrueY = currentY;
        
        // Process each node in the true branch sequence
        for (let i = 0; i < apiNode.children.length; i++) {
            const trueNode = apiNode.children[i];
            const nextTrueNodeId = (i + 1 < apiNode.children.length) ? apiNode.children[i+1].id : nextSequentialNodeId;
            const parentInfoForTrue = { id: lastTrueNodeId, type: lastTrueNodeType };
            
            const trueNodeResult = processNodeRecursive(trueNode, parentInfoForTrue, startX, currentTrueY, level + 1, nextTrueNodeId);
            
            // Add this node's results to our collection
            trueBranchResult.nodes = trueBranchResult.nodes.concat(trueNodeResult.nodes);
            trueBranchResult.edges = trueBranchResult.edges.concat(trueNodeResult.edges);
            
            // Update for next iteration
            currentTrueY = trueNodeResult.nextY;
            lastTrueNodeId = trueNode.id;
            lastTrueNodeType = trueNode.node_type;
            
            // Update horizontal bounds
            trueBranchResult.horizontalBounds.minX = Math.min(trueBranchResult.horizontalBounds.minX, trueNodeResult.horizontalBounds.minX);
            trueBranchResult.horizontalBounds.maxX = Math.max(trueBranchResult.horizontalBounds.maxX, trueNodeResult.horizontalBounds.maxX);
        }
        
        // Update the final Y position
        trueBranchResult.nextY = currentTrueY;
    }// Process false branch (use startX as temporary reference)
    // Directly process the false branch nodes without using a container
    let falseBranchResult = { nodes: [], edges: [], nextY: currentY, horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } };
    
    // Check if false branch exists and has elements
    if (apiNode.false_branch && apiNode.false_branch.length > 0) {
        let lastFalseNodeId = nodeId;
        let lastFalseNodeType = nodeType;
        let currentFalseY = currentY;
        
        // Process each node in the false branch sequence
        for (let i = 0; i < apiNode.false_branch.length; i++) {
            const falseNode = apiNode.false_branch[i];
            const nextFalseNodeId = (i + 1 < apiNode.false_branch.length) ? apiNode.false_branch[i+1].id : nextSequentialNodeId;
            const parentInfoForFalse = { id: lastFalseNodeId, type: lastFalseNodeType };
            
            const falseNodeResult = processNodeRecursive(falseNode, parentInfoForFalse, startX, currentFalseY, level + 1, nextFalseNodeId);
            
            // Add this node's results to our collection
            falseBranchResult.nodes = falseBranchResult.nodes.concat(falseNodeResult.nodes);
            falseBranchResult.edges = falseBranchResult.edges.concat(falseNodeResult.edges);
            
            // Update for next iteration
            currentFalseY = falseNodeResult.nextY;
            lastFalseNodeId = falseNode.id;
            lastFalseNodeType = falseNode.node_type;
            
            // Update horizontal bounds
            falseBranchResult.horizontalBounds.minX = Math.min(falseBranchResult.horizontalBounds.minX, falseNodeResult.horizontalBounds.minX);
            falseBranchResult.horizontalBounds.maxX = Math.max(falseBranchResult.horizontalBounds.maxX, falseNodeResult.horizontalBounds.maxX);
        }
        
        // Update the final Y position
        falseBranchResult.nextY = currentFalseY;
    }

    // 2. Calculate widths and required horizontal shifts for centering
    const trueBranchExists = trueBranchResult.nodes.length > 0;
    const falseBranchExists = falseBranchResult.nodes.length > 0;

    const trueWidth = trueBranchExists ? trueBranchResult.horizontalBounds.maxX - trueBranchResult.horizontalBounds.minX : 0;
    const falseWidth = falseBranchExists ? falseBranchResult.horizontalBounds.maxX - falseBranchResult.horizontalBounds.minX : 0;

    let deltaX_true = 0;
    let deltaX_false = 0;
    let targetTrueBranchMinX = startX; // Default position if only true branch exists
    let targetFalseBranchMinX = startX; // Default position if only false branch exists

    if (trueBranchExists && falseBranchExists) {
        const gap = HORIZONTAL_SPACING_BASE;
        const totalChildWidth = falseWidth + trueWidth + gap;
        // Calculate starting X to center the combined structure under the parent IfBlock
        const combinedStartX = startX + NODE_WIDTH / 2 - totalChildWidth / 2;

        targetFalseBranchMinX = combinedStartX;
        targetTrueBranchMinX = combinedStartX + falseWidth + gap;

        // Calculate shift needed for each branch based on its original recursive layout position
        deltaX_false = targetFalseBranchMinX - falseBranchResult.horizontalBounds.minX;
        deltaX_true = targetTrueBranchMinX - trueBranchResult.horizontalBounds.minX;
    } else if (trueBranchExists) {
        // Center the single true branch under the parent
        targetTrueBranchMinX = startX + NODE_WIDTH / 2 - trueWidth / 2;
        deltaX_true = targetTrueBranchMinX - trueBranchResult.horizontalBounds.minX;
    } else if (falseBranchExists) {
        // Center the single false branch under the parent
        targetFalseBranchMinX = startX + NODE_WIDTH / 2 - falseWidth / 2;
        deltaX_false = targetFalseBranchMinX - falseBranchResult.horizontalBounds.minX;
    }

    // 3. Adjust node positions and bounds for both branches based on calculated deltas
    if (trueBranchExists) {
        trueBranchResult.nodes.forEach(node => { node.position.x += deltaX_true; });
        trueBranchResult.horizontalBounds.minX += deltaX_true;
        trueBranchResult.horizontalBounds.maxX += deltaX_true;
    }
    if (falseBranchExists) {
        falseBranchResult.nodes.forEach(node => { node.position.x += deltaX_false; });
        falseBranchResult.horizontalBounds.minX += deltaX_false;
        falseBranchResult.horizontalBounds.maxX += deltaX_false;
    }    // 4. Create edges from IfBlock to the start of each branch (or to the next sequential node if a branch is empty)
    if (trueBranchExists) {
        // Get the first node in the true branch - directly from the first element in apiNode.children
        const firstTrueNodeId = apiNode.children[0].id;
        
        // Create edge from IF node to the first true branch node
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, firstTrueNodeId, 'true'), nodeId, firstTrueNodeId, 'True'));
        
        // Remove any default edges that might have been created by the recursive processing
        trueBranchResult.edges = trueBranchResult.edges.filter(edge => !(edge.source === nodeId && edge.target === firstTrueNodeId));
    } else if (nextSequentialNodeId) {
        // If no true branch, connect IfBlock directly to the next node in the main flow with "True" label
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId, 'true'), nodeId, nextSequentialNodeId, 'True'));
    }if (falseBranchExists) {
        // Get the first node in the false branch - this is now directly the first node from apiNode.false_branch
        const firstFalseNodeId = apiNode.false_branch[0].id;
        
        // Create edge from IF node to the first false branch node
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, firstFalseNodeId, 'false'), nodeId, firstFalseNodeId, 'False'));
        
        // Remove any default edges that might have been created by the recursive processing
        falseBranchResult.edges = falseBranchResult.edges.filter(edge => !(edge.source === nodeId && edge.target === firstFalseNodeId));
    } else if (nextSequentialNodeId) {
        // If no false branch, connect IfBlock directly to the next node with "False" label
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId, 'false'), nodeId, nextSequentialNodeId, 'False'));
    }

    // 5. Combine nodes and edges from both branches
    currentNodes = currentNodes.concat(trueBranchResult.nodes, falseBranchResult.nodes);
    currentEdges = currentEdges.concat(trueBranchResult.edges, falseBranchResult.edges);

    // 6. Calculate final Y position and overall horizontal bounds for the IfBlock structure
    currentY = Math.max(trueBranchResult.nextY, falseBranchResult.nextY);
    childrenMinX = Math.min(
        trueBranchExists ? trueBranchResult.horizontalBounds.minX : Infinity,
        falseBranchExists ? falseBranchResult.horizontalBounds.minX : Infinity
    );
    childrenMaxX = Math.max(
        trueBranchExists ? trueBranchResult.horizontalBounds.maxX : -Infinity,
        falseBranchExists ? falseBranchResult.horizontalBounds.maxX : -Infinity
    );
    // Ensure bounds are valid even if one or both branches were empty
     if (!isFinite(childrenMinX)) childrenMinX = startX;
     if (!isFinite(childrenMaxX)) childrenMaxX = startX + NODE_WIDTH;
  } else if (nodeType === 'MenuBlock') {
    // --- Layout Algorithm for MenuBlock (similar to IfBlock approach) ---
    // First, process all options to get their dimensions, then position them with proper spacing
    
    // 1. Process each menu option to determine its structure and bounds
    const optionResults = [];
    let maxOptionY = currentY;
    let tempX = startX; // Temporary X for initial processing
    
    // Process each option to get its structure
    apiNode.children.forEach((optionNode) => {
      const optionResult = processNodeRecursive(optionNode, nextParentInfo, tempX, currentY, level + 1, nextSequentialNodeId);
      optionResults.push({
        node: optionNode,
        result: optionResult,
        width: optionResult.horizontalBounds.maxX - optionResult.horizontalBounds.minX
      });
      
      maxOptionY = Math.max(maxOptionY, optionResult.nextY);
    });
    
    // 2. Calculate total width and spacing
    const totalWidth = optionResults.reduce((sum, option) => sum + option.width, 0) 
                    + (optionResults.length - 1) * HORIZONTAL_SPACING_BASE;
    
    // 3. Calculate starting X to center the combined structure under the parent MenuBlock
    const startingX = startX + NODE_WIDTH / 2 - totalWidth / 2;
    
    // 4. Position each option with proper spacing and create connections
    let currentX = startingX;
    let firstOptionX = Infinity;
    let lastOptionX = -Infinity;
    
    optionResults.forEach((optionData) => {
      const { node: optionNode, result: optionResult, width } = optionData;
      
      // Calculate shift needed to position this option
      const deltaX = currentX - optionResult.horizontalBounds.minX;
      
      // Apply shift to all nodes in this option
      optionResult.nodes.forEach(node => { node.position.x += deltaX; });
      
      // Create edge from MenuBlock to this MenuOption
      const optionStartNodeId = optionNode.id;
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, optionStartNodeId, 'option'), nodeId, optionStartNodeId));
      
      // Remove the default edge possibly created by the child's recursive call
      optionResult.edges = optionResult.edges.filter(edge => !(edge.source === nodeId && edge.target === optionStartNodeId));
      
      // Add nodes and edges to the main collection
      currentNodes = currentNodes.concat(optionResult.nodes);
      currentEdges = currentEdges.concat(optionResult.edges);
      
      // Track horizontal bounds
      firstOptionX = Math.min(firstOptionX, currentX);
      lastOptionX = Math.max(lastOptionX, currentX + width);
      
      // Move X for next option
      currentX += width + HORIZONTAL_SPACING_BASE;
    });

    currentY = maxOptionY; // Set current Y below the lowest menu option
    childrenMinX = firstOptionX;
    childrenMaxX = lastOptionX;

  } else if (apiNode.children && apiNode.children.length > 0) {
    // Process a standard sequence of child nodes vertically
    let lastChildNodeId = nodeId;
    let lastChildNodeType = nodeType;
    let childMinX = startX;
    let childMaxX = startX + NODE_WIDTH;

    for (let i = 0; i < apiNode.children.length; i++) {
        const childNode = apiNode.children[i];
        // Determine the ID of the node that should follow the *current* child
        const nextChildId = (i + 1 < apiNode.children.length) ? apiNode.children[i+1].id : nextSequentialNodeId;
        // The parent for the *current* child is the *previous* child in the sequence (or the initial parent node)
        const parentInfoForChild = { id: lastChildNodeId, type: lastChildNodeType };

        const childResult = processNodeRecursive(childNode, parentInfoForChild, startX, currentY, level, nextChildId);
        currentNodes = currentNodes.concat(childResult.nodes);
        currentEdges = currentEdges.concat(childResult.edges);
        currentY = childResult.nextY; // Update Y position for the next child
        lastChildNodeId = childNode.id; // Update last child info for the next iteration's parent link
        lastChildNodeType = childNode.node_type;
        // Track horizontal bounds of the sequence
        childMinX = Math.min(childMinX, childResult.horizontalBounds.minX);
        childMaxX = Math.max(childMaxX, childResult.horizontalBounds.maxX);
    }
     childrenMinX = childMinX;
     childrenMaxX = childMaxX;
  } else {
    // Leaf node in the current branch/sequence
    if (nextSequentialNodeId) {
        // If there's a designated next node, create an edge to it
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId), nodeId, nextSequentialNodeId));
    }
    // Otherwise, this branch implicitly ends here (will be connected to EndBlock later if it's a leaf of a LabelBlock)
  }

  // Return the collected nodes, edges, the next available Y position, and the calculated horizontal bounds
  return {
    nodes: currentNodes,
    edges: currentEdges,
    nextY: currentY,
    horizontalBounds: {
        minX: Math.min(startX, childrenMinX), // Overall min X includes the node itself and its children
        maxX: Math.max(startX + NODE_WIDTH, childrenMaxX) // Overall max X
    }
  };
}

/**
 * Main transformation function.
 * Iterates through LabelBlocks in the root API node, processes each using
 * processNodeRecursive, adds EndBlocks, and connects leaf nodes to them.
 */
export function transformTreeToFlow(rootApiNode) {
  let allNodes = [];
  let endBlockEdges = []; // Collect edges leading specifically to EndBlocks
  let otherEdges = [];    // Collect all other generated edges
  let currentY = 50;      // Initial Y position for the first LabelBlock
  const initialX = 100;   // Initial X position for LabelBlocks

  if (!rootApiNode || !rootApiNode.children || rootApiNode.children.length === 0) {
    console.warn("Root node has no children (LabelBlocks). Cannot generate flow.");
    return { initialNodes: [], initialEdges: [] };
  }

  // Process each LabelBlock as a separate flow starting point
  rootApiNode.children.forEach((labelBlockNode, index) => {
    if (labelBlockNode.node_type === 'LabelBlock') {
      // Currently, LabelBlocks are treated independently; no automatic connection between them.
      const nextLabelBlockId = null;
      const labelBlockResult = processNodeRecursive(labelBlockNode, null, initialX, currentY, 0, nextLabelBlockId);

      // Create a dedicated EndBlock for this LabelBlock flow
      const endNodeId = `end-${labelBlockNode.id}`;
      const endNodeY = labelBlockResult.nextY; // Place EndBlock below the content of the LabelBlock
      // Center the EndBlock horizontally based on the calculated bounds of the LabelBlock's content
      const endNodeX = labelBlockResult.horizontalBounds.minX + (labelBlockResult.horizontalBounds.maxX - labelBlockResult.horizontalBounds.minX - NODE_WIDTH) / 2;
      const endNode = createFlowNode(endNodeId, 'EndBlock', { label_name: 'Конец', node_type: 'EndBlock' }, { x: endNodeX, y: endNodeY });

      allNodes = allNodes.concat(labelBlockResult.nodes);
      allNodes.push(endNode);

      const allGeneratedEdges = labelBlockResult.edges;

      // Identify nodes within this LabelBlock that are "leaf" nodes (have no outgoing edges *within this block*)
      const nodeIdsInBlock = new Set(labelBlockResult.nodes.map(n => n.id));
      const sourceNodesInBlock = new Set();
       allGeneratedEdges.forEach(edge => {
           // Only consider edges where the source is part of the current LabelBlock's nodes
           if (nodeIdsInBlock.has(edge.source)) {
               sourceNodesInBlock.add(edge.source);
           }
       });

      // Connect leaf nodes (nodes without outgoing edges within the block) to the EndBlock
      labelBlockResult.nodes.forEach(node => {
          // Exclude the LabelBlock node itself from automatically connecting to EndBlock
          if (node.id !== labelBlockNode.id && !sourceNodesInBlock.has(node.id)) {
              // Check if an edge to the end node wasn't already created by processNodeRecursive (e.g., from an empty if/menu branch)
              const existingEdgeToEnd = allGeneratedEdges.find(edge => edge.source === node.id && edge.target === endNodeId);
              if (!existingEdgeToEnd) {
                 endBlockEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId, 'leaf'), node.id, endNodeId));
              }
          }
      });

       // Categorize generated edges: those pointing to *any* EndBlock vs. others
       allGeneratedEdges.forEach(edge => {
        if (edge.target.startsWith('end-')) {
             // Ensure EndBlock edges are not duplicated
             if (!endBlockEdges.some(e => e.id === edge.id)) {
                 endBlockEdges.push(edge);
             }
        } else {
             otherEdges.push(edge);
        }
    });

   // Update Y position for the next LabelBlock, adding extra spacing
   currentY = endNodeY + NODE_HEIGHT_BASE + VERTICAL_SPACING * 2;
 }
});

// Combine edges, ensuring EndBlock edges are potentially styled differently or handled separately if needed later
const finalEdges = otherEdges.concat(endBlockEdges);

// Remove duplicate edges (can happen due to recursive calls and explicit edge creation)
const uniqueEdges = Array.from(new Map(finalEdges.map(edge => [edge.id, edge])).values());

return { initialNodes: allNodes, initialEdges: uniqueEdges };
}