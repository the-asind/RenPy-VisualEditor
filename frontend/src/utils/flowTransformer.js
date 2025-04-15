import { MarkerType } from 'reactflow';

// --- Configuration ---
const NODE_WIDTH = 250;
const NODE_HEIGHT_BASE = 60; // Base height, can increase with content
const VERTICAL_SPACING = 80;
const HORIZONTAL_SPACING_BASE = 200; // Base horizontal spacing for branches/menus
const HORIZONTAL_SPACING_MENU = 150; // Specific spacing for menu options

// --- Node Styling (Based on README-architecture.md) ---
const nodeColors = {
  LabelBlock: '#f0e68c', // yellow (khaki)
  Action: '#f5f5f5',     // pale or off-white (whitesmoke)
  IfBlock: '#90ee90',    // green (lightgreen)
  MenuBlock: '#966666',  // maroon (burgundy)
  MenuOption: '#ffa500', // orange
  EndBlock: '#eeeeee',   // gray (updated color)
  Default: '#ffffff',    // white (fallback)
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
    // height: NODE_HEIGHT_BASE, // Auto-height might be better with default node
    border: '1px solid #555',
    borderRadius: '4px',
    padding: '10px',
    textAlign: 'center',
    ...style,
  },
  // Store original data for potential use (e.g., clicking)
  meta: { ...data }
});

/**
 * Creates a standard React Flow edge object.
 */
const createFlowEdge = (id, source, target, label = '', type = 'default', animated = false, markerEnd = { type: MarkerType.ArrowClosed }) => {
  const isEndBlockEdge = target.startsWith('end-'); // Check if target is an EndBlock
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
      stroke: isEndBlockEdge ? '#eeeeee' : '#b1b1b7', // Light gray for EndBlock edges, default otherwise
    },
  };
};

/**
 * Recursive function to process the tree and generate nodes and edges.
 * Tracks layout information (current Y position, horizontal offsets).
 * Connects branches/sequences to the next sequential node if provided.
 *
 * @param {object} apiNode - The current node object from the API response.
 * @param {object|null} parentInfo - Info about the parent { id: string, type: string } or null for root/LabelBlock.
 * @param {number} startX - Starting X position for this node.
 * @param {number} startY - Starting Y position for this node.
 * @param {number} level - Current nesting level (for horizontal spacing).
 * @param {string|null} nextSequentialNodeId - The ID of the node that should follow the current sequence/branch.
 *
 * Returns: { nodes: [], edges: [], nextY: number, horizontalBounds: { minX: number, maxX: number } }
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

  // --- Default Edge Creation ---
  // Create a standard edge from the parent if one exists. Specific logic below might modify it.
  // Do not create a default edge if the parent was an IfBlock or MenuBlock,
  // as connections originate from their branches/options instead.
  if (parentInfo && nodeType !== 'LabelBlock' && parentInfo.type !== 'IfBlock' && parentInfo.type !== 'MenuBlock') {
    currentEdges.push(createFlowEdge(createEdgeId(parentInfo.id, nodeId), parentInfo.id, nodeId));
  }

  let currentY = startY + NODE_HEIGHT_BASE + VERTICAL_SPACING;
  let childrenMinX = startX;
  let childrenMaxX = startX + NODE_WIDTH;
  const nextParentInfo = { id: nodeId, type: nodeType }; // Info for children of this node

  // --- Child Processing based on Node Type ---

  if (nodeType === 'IfBlock') {
    const horizontalShift = HORIZONTAL_SPACING_BASE * (level + 1);

    // 1. True Branch (children)
    let trueBranchY = currentY;
    let trueBranchMinX = startX + horizontalShift / 2;
    let trueBranchMaxX = startX + horizontalShift / 2 + NODE_WIDTH;
    if (apiNode.children && apiNode.children.length > 0) {
      const trueBranchResult = processNodeRecursive(apiNode.children[0], nextParentInfo, startX + horizontalShift / 2, currentY, level + 1, nextSequentialNodeId);
      // Find and modify the edge created by the child to add the "True" label
      const edgeToModify = trueBranchResult.edges.find(e => e.source === nodeId && e.target === apiNode.children[0].id);
      if (edgeToModify) {
        edgeToModify.label = 'True';
        // Update ID to reflect label change if needed for uniqueness (optional but good practice)
        edgeToModify.id = createEdgeId(nodeId, apiNode.children[0].id, 'true');
      } else {
        // Fallback: If edge wasn't found (shouldn't happen with current logic), add it explicitly
         currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.children[0].id, 'true'), nodeId, apiNode.children[0].id, 'True'));
      }
      currentNodes = currentNodes.concat(trueBranchResult.nodes);
      currentEdges = currentEdges.concat(trueBranchResult.edges);
      trueBranchY = trueBranchResult.nextY;
      trueBranchMinX = trueBranchResult.horizontalBounds.minX;
      trueBranchMaxX = trueBranchResult.horizontalBounds.maxX;
    } else if (nextSequentialNodeId) {
        trueBranchY = currentY;
    }

    // 2. False Branch (false_branch)
    let falseBranchY = currentY;
    let falseBranchMinX = startX - horizontalShift / 2;
    let falseBranchMaxX = startX - horizontalShift / 2 + NODE_WIDTH;
    if (apiNode.false_branch) {
      const falseBranchResult = processNodeRecursive(apiNode.false_branch, nextParentInfo, startX - horizontalShift / 2, currentY, level + 1, nextSequentialNodeId);
      // Find and modify the edge created by the child to add the "False" label
      const edgeToModify = falseBranchResult.edges.find(e => e.source === nodeId && e.target === apiNode.false_branch.id);
       if (edgeToModify) {
        edgeToModify.label = 'False';
        edgeToModify.id = createEdgeId(nodeId, apiNode.false_branch.id, 'false');
      } else {
         currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.false_branch.id, 'false'), nodeId, apiNode.false_branch.id, 'False'));
      }
      currentNodes = currentNodes.concat(falseBranchResult.nodes);
      currentEdges = currentEdges.concat(falseBranchResult.edges);
      falseBranchY = falseBranchResult.nextY;
      falseBranchMinX = falseBranchResult.horizontalBounds.minX;
      falseBranchMaxX = falseBranchResult.horizontalBounds.maxX;
    } else if (nextSequentialNodeId) {
        // If there's no explicit false branch, but there is a node to go to next,
        // create a "False" edge directly from the IfBlock to that next node.
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId, 'false'), nodeId, nextSequentialNodeId, 'False'));
        falseBranchY = currentY; // Keep Y coordinate calculation consistent
    }

    currentY = Math.max(trueBranchY, falseBranchY);
    childrenMinX = Math.min(trueBranchMinX, falseBranchMinX);
    childrenMaxX = Math.max(trueBranchMaxX, falseBranchMaxX);

  } else if (nodeType === 'MenuBlock') {
    let menuOptionX = startX - ((apiNode.children.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING_MENU)) / 2;
    let maxOptionY = currentY;
    let firstOptionX = Infinity;
    let lastOptionX = -Infinity;

    apiNode.children.forEach((optionNode) => {
      // Pass nextSequentialNodeId for fall-through logic after the menu option's branch
      const optionResult = processNodeRecursive(optionNode, nextParentInfo, menuOptionX, currentY, level + 1, nextSequentialNodeId);
      // Explicitly create the edge from MenuBlock to this MenuOption
      // This was previously (incorrectly) handled by the default edge creation logic
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, optionNode.id, 'option'), nodeId, optionNode.id));
      
      currentNodes = currentNodes.concat(optionResult.nodes);
      currentEdges = currentEdges.concat(optionResult.edges);
      maxOptionY = Math.max(maxOptionY, optionResult.nextY);
      firstOptionX = Math.min(firstOptionX, optionResult.horizontalBounds.minX);
      lastOptionX = Math.max(lastOptionX, optionResult.horizontalBounds.maxX);
      menuOptionX += NODE_WIDTH + HORIZONTAL_SPACING_MENU;
    });

    currentY = maxOptionY;
    childrenMinX = firstOptionX;
    childrenMaxX = lastOptionX;

  } else if (apiNode.children && apiNode.children.length > 0) {
    // Default: Process children vertically (Action, LabelBlock children, MenuOption children)
    let lastChildNodeId = nodeId;
    let lastChildNodeType = nodeType;
    let childMinX = startX;
    let childMaxX = startX + NODE_WIDTH;

    for (let i = 0; i < apiNode.children.length; i++) {
        const childNode = apiNode.children[i];
        const nextChildId = (i + 1 < apiNode.children.length) ? apiNode.children[i+1].id : nextSequentialNodeId;
        // Parent info for the child is the previous node in the sequence
        const parentInfoForChild = { id: lastChildNodeId, type: lastChildNodeType };

        const childResult = processNodeRecursive(childNode, parentInfoForChild, startX, currentY, level, nextChildId);
        currentNodes = currentNodes.concat(childResult.nodes);
        currentEdges = currentEdges.concat(childResult.edges);
        currentY = childResult.nextY;
        lastChildNodeId = childNode.id; // Update last node ID for next iteration
        lastChildNodeType = childNode.node_type;
        childMinX = Math.min(childMinX, childResult.horizontalBounds.minX);
        childMaxX = Math.max(childMaxX, childResult.horizontalBounds.maxX);
    }
     childrenMinX = childMinX;
     childrenMaxX = childMaxX;
  } else {
    // Leaf node: Connect to the next sequential node if it exists.
    if (nextSequentialNodeId) {
        currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId), nodeId, nextSequentialNodeId));
    }
  }

  // --- Return Results ---
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
 * Processes the root node which contains LabelBlocks as children.
 */
export function transformTreeToFlow(rootApiNode) {
  let allNodes = [];
  let endBlockEdges = []; // Edges leading to EndBlocks
  let otherEdges = []; // All other edges
  let currentY = 50;
  const initialX = 100;

  if (!rootApiNode || !rootApiNode.children || rootApiNode.children.length === 0) {
    console.warn("Root node has no children (LabelBlocks).");
    return { initialNodes: [], initialEdges: [] };
  }

  rootApiNode.children.forEach((labelBlockNode, index) => {
    if (labelBlockNode.node_type === 'LabelBlock') {
      const nextLabelBlockId = null; // Assume no sequential connection between LabelBlocks for now
      // Initial call for a LabelBlock has no parentInfo
      const labelBlockResult = processNodeRecursive(labelBlockNode, null, initialX, currentY, 0, nextLabelBlockId);

      const endNodeId = `end-${labelBlockNode.id}`;
      const endNodeY = labelBlockResult.nextY;
      const endNodeX = labelBlockResult.horizontalBounds.minX + (labelBlockResult.horizontalBounds.maxX - labelBlockResult.horizontalBounds.minX - NODE_WIDTH) / 2;
      const endNode = createFlowNode(endNodeId, 'EndBlock', { label_name: 'Конец', node_type: 'EndBlock' }, { x: endNodeX, y: endNodeY });

      allNodes = allNodes.concat(labelBlockResult.nodes);
      allNodes.push(endNode);

      // Separate edges: those created by recursive calls AND those added for missing branches/leaves
      const allGeneratedEdges = labelBlockResult.edges;

      // Find leaf nodes within this block's results
      const nodeIdsInBlock = new Set(labelBlockResult.nodes.map(n => n.id));
      const sourceNodesInBlock = new Set();
       allGeneratedEdges.forEach(edge => {
           // Only consider edges where the source is within this block's nodes
           if (nodeIdsInBlock.has(edge.source)) {
               sourceNodesInBlock.add(edge.source);
           }
       });


      labelBlockResult.nodes.forEach(node => {
          // If a node within this block has no outgoing edges *created during its processing*, connect it to EndBlock
          if (!sourceNodesInBlock.has(node.id)) {
              // Add leaf-to-end edges to the endBlockEdges array
              endBlockEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId, 'leaf'), node.id, endNodeId));
          }
      });

       // Add all other edges generated during processing to the correct arrays
       allGeneratedEdges.forEach(edge => {
           if (!edge.target.startsWith('end-')) { // Avoid double-adding edges already added by leaf check
                if (edge.target === endNodeId) { // Check if it's an edge already pointing to EndBlock (e.g. from leaf logic)
                    if (!endBlockEdges.some(e => e.id === edge.id)) { // Add only if not already added
                        endBlockEdges.push(edge);
                    }
                } else {
                    otherEdges.push(edge);
                }
           } else if (!endBlockEdges.some(e => e.id === edge.id)) { // Add to endBlockEdges if target is EndBlock and not already added
                endBlockEdges.push(edge);
           }
       });


      currentY = endNodeY + NODE_HEIGHT_BASE + VERTICAL_SPACING * 2;
    }
  });

  // Concatenate arrays, putting endBlockEdges first
  const finalEdges = endBlockEdges.concat(otherEdges);

  // Deduplicate edges just in case (based on ID)
  const uniqueEdges = Array.from(new Map(finalEdges.map(edge => [edge.id, edge])).values());


  return { initialNodes: allNodes, initialEdges: uniqueEdges };
}