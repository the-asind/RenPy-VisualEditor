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
  MenuBlock: '#800000',  // maroon (burgundy)
  MenuOption: '#ffa500', // orange
  EndBlock: '#808080',   // gray
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
const createFlowEdge = (id, source, target, label = '', type = 'default', animated = false, markerEnd = { type: MarkerType.ArrowClosed }) => ({
  id,
  source,
  target,
  label,
  type, // e.g., 'step', 'smoothstep', 'straight'
  animated,
  markerEnd,
  style: { strokeWidth: 2 },
});

/**
 * Recursive function to process the tree and generate nodes and edges.
 * Tracks layout information (current Y position, horizontal offsets).
 *
 * Returns: { nodes: [], edges: [], nextY: number, horizontalBounds: { minX: number, maxX: number } }
 */
function processNodeRecursive(apiNode, parentNodeId = null, startX = 0, startY = 0, level = 0) {
  if (!apiNode) {
    return { nodes: [], edges: [], nextY: startY, horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } };
  }

  const nodeId = apiNode.id || `node-${Math.random().toString(16).slice(2)}`; // Ensure ID exists
  const nodeType = apiNode.node_type;
  const nodePosition = { x: startX, y: startY };

  const flowNode = createFlowNode(nodeId, nodeType, apiNode, nodePosition);
  let currentNodes = [flowNode];
  let currentEdges = [];

  if (parentNodeId) {
    // Add edge from parent, unless it's the root node's direct child (LabelBlock)
     if (nodeType !== 'LabelBlock') {
        currentEdges.push(createFlowEdge(createEdgeId(parentNodeId, nodeId), parentNodeId, nodeId));
     }
  }

  let currentY = startY + NODE_HEIGHT_BASE + VERTICAL_SPACING;
  let childrenMinX = startX;
  let childrenMaxX = startX + NODE_WIDTH;

  // --- Handle Children based on Node Type ---

  if (nodeType === 'IfBlock') {
    const horizontalShift = HORIZONTAL_SPACING_BASE * (level + 1); // Increase shift with nesting

    // 1. True Branch (children) - Shifted Right
    let trueBranchY = currentY;
    let trueBranchMinX = startX + horizontalShift / 2;
    let trueBranchMaxX = startX + horizontalShift / 2 + NODE_WIDTH;
    let lastTrueNodeId = nodeId; // Start connection from the IfBlock itself

    if (apiNode.children && apiNode.children.length > 0) {
      const trueBranchResult = processNodeRecursive(apiNode.children[0], nodeId, startX + horizontalShift / 2, currentY, level + 1);
      currentNodes = currentNodes.concat(trueBranchResult.nodes);
      // Add edge with "True" label
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.children[0].id, 'true'), nodeId, apiNode.children[0].id, 'True'));
      currentEdges = currentEdges.concat(trueBranchResult.edges);
      trueBranchY = trueBranchResult.nextY;
      trueBranchMinX = trueBranchResult.horizontalBounds.minX;
      trueBranchMaxX = trueBranchResult.horizontalBounds.maxX;
      lastTrueNodeId = trueBranchResult.nodes[trueBranchResult.nodes.length - 1]?.id || nodeId;
    } else {
        // If no true children, the 'True' path effectively ends here for layout purposes
        trueBranchY = currentY; // Keep Y the same
    }


    // 2. False Branch (false_branch) - Shifted Left
    let falseBranchY = currentY;
    let falseBranchMinX = startX - horizontalShift / 2;
    let falseBranchMaxX = startX - horizontalShift / 2 + NODE_WIDTH;
    let lastFalseNodeId = nodeId; // Start connection from the IfBlock itself

    if (apiNode.false_branch) {
      const falseBranchResult = processNodeRecursive(apiNode.false_branch, nodeId, startX - horizontalShift / 2, currentY, level + 1);
      currentNodes = currentNodes.concat(falseBranchResult.nodes);
       // Add edge with "False" label
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.false_branch.id, 'false'), nodeId, apiNode.false_branch.id, 'False'));
      currentEdges = currentEdges.concat(falseBranchResult.edges);
      falseBranchY = falseBranchResult.nextY;
      falseBranchMinX = falseBranchResult.horizontalBounds.minX;
      falseBranchMaxX = falseBranchResult.horizontalBounds.maxX;
      lastFalseNodeId = falseBranchResult.nodes[falseBranchResult.nodes.length - 1]?.id || nodeId;
    } else {
        // If no false branch, the 'False' path effectively ends here for layout purposes
        falseBranchY = currentY; // Keep Y the same
    }

    // Determine next Y and horizontal bounds
    currentY = Math.max(trueBranchY, falseBranchY);
    childrenMinX = Math.min(trueBranchMinX, falseBranchMinX);
    childrenMaxX = Math.max(trueBranchMaxX, falseBranchMaxX);

    // TODO: Connect dangling True/False branches to the next node or EndBlock
    // This requires knowing the 'next' node after the IfBlock, which is complex recursively.
    // For MVP, dangling ends might be acceptable, or connect to a placeholder EndBlock.


  } else if (nodeType === 'MenuBlock') {
    let menuOptionX = startX - ( (apiNode.children.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING_MENU) ) / 2; // Center options
    let maxOptionY = currentY;
    let firstOptionX = Infinity;
    let lastOptionX = -Infinity;

    apiNode.children.forEach((optionNode) => {
      const optionResult = processNodeRecursive(optionNode, nodeId, menuOptionX, currentY, level + 1);
      currentNodes = currentNodes.concat(optionResult.nodes);
      currentEdges = currentEdges.concat(optionResult.edges); // Includes edge from MenuBlock to Option
      maxOptionY = Math.max(maxOptionY, optionResult.nextY);
      firstOptionX = Math.min(firstOptionX, optionResult.horizontalBounds.minX);
      lastOptionX = Math.max(lastOptionX, optionResult.horizontalBounds.maxX);
      menuOptionX += NODE_WIDTH + HORIZONTAL_SPACING_MENU;
    });

    currentY = maxOptionY;
    childrenMinX = firstOptionX;
    childrenMaxX = lastOptionX;

  } else if (apiNode.children && apiNode.children.length > 0) {
    // Default: Process children vertically (Action, LabelBlock, MenuOption)
    let lastChildNodeId = nodeId;
    let childMinX = startX;
    let childMaxX = startX + NODE_WIDTH;

    for (let i = 0; i < apiNode.children.length; i++) {
        const childNode = apiNode.children[i];
        // For Action nodes, connect sequentially if parent isn't If/Menu
        const parentIdForChild = (nodeType === 'Action' || nodeType === 'LabelBlock' || nodeType === 'MenuOption') ? lastChildNodeId : nodeId;
        const childResult = processNodeRecursive(childNode, parentIdForChild, startX, currentY, level); // Keep same X for vertical stack
        currentNodes = currentNodes.concat(childResult.nodes);
        currentEdges = currentEdges.concat(childResult.edges);
        currentY = childResult.nextY;
        lastChildNodeId = childNode.id; // Update last node ID for sequential connection
        childMinX = Math.min(childMinX, childResult.horizontalBounds.minX);
        childMaxX = Math.max(childMaxX, childResult.horizontalBounds.maxX);
    }
     childrenMinX = childMinX;
     childrenMaxX = childMaxX;
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
  let allEdges = [];
  let currentY = 50; // Initial Y position for the first LabelBlock
  const initialX = 100; // Initial X

  if (!rootApiNode || !rootApiNode.children || rootApiNode.children.length === 0) {
    console.warn("Root node has no children (LabelBlocks).");
    return { initialNodes: [], initialEdges: [] };
  }

  // Process each LabelBlock
  let lastLabelBlockEndNodeId = null;
  rootApiNode.children.forEach((labelBlockNode, index) => {
    if (labelBlockNode.node_type === 'LabelBlock') {
      const labelBlockResult = processNodeRecursive(labelBlockNode, null, initialX, currentY, 0); // No parent for LabelBlock

      // Add an "End" node for this LabelBlock
      const endNodeId = `end-${labelBlockNode.id}`;
      const endNodeY = labelBlockResult.nextY; // Position after the last node in the block
      // Center the End node based on the horizontal bounds of the block
      const endNodeX = labelBlockResult.horizontalBounds.minX + (labelBlockResult.horizontalBounds.maxX - labelBlockResult.horizontalBounds.minX - NODE_WIDTH) / 2;

      const endNode = createFlowNode(endNodeId, 'EndBlock', { label_name: 'Конец', node_type: 'EndBlock' }, { x: endNodeX, y: endNodeY });

      allNodes = allNodes.concat(labelBlockResult.nodes);
      allNodes.push(endNode);
      allEdges = allEdges.concat(labelBlockResult.edges);

      // Connect the last node(s) of the LabelBlock tree to the End node
      // Find leaf nodes within this LabelBlock's result that don't have outgoing edges *within this block*
      const blockNodeIds = new Set(labelBlockResult.nodes.map(n => n.id));
      const nodesWithOutgoingEdges = new Set(labelBlockResult.edges.map(e => e.source));

      labelBlockResult.nodes.forEach(node => {
          if (!nodesWithOutgoingEdges.has(node.id)) {
              // Check if it's truly a leaf within this block's processing
              const isLeaf = !labelBlockResult.edges.some(edge => edge.source === node.id);
              // Also check it's not an If block waiting for connection logic
              if (isLeaf && node.meta.node_type !== 'IfBlock') {
                 allEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId), node.id, endNodeId));
              }
              // Basic connection for IfBlock leaves for now
              if (node.meta.node_type === 'IfBlock') {
                  // If no children, connect If itself
                  if (!node.meta.children || node.meta.children.length === 0) {
                     allEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId, 'true'), node.id, endNodeId, 'True'));
                  }
                   // If no false branch, connect If itself
                  if (!node.meta.false_branch) {
                     allEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId, 'false'), node.id, endNodeId, 'False'));
                  }
              }
          }
      });


      // Update currentY for the next LabelBlock, considering the End node height
      currentY = endNodeY + NODE_HEIGHT_BASE + VERTICAL_SPACING * 2; // Add extra spacing between LabelBlocks
      lastLabelBlockEndNodeId = endNodeId; // Keep track if needed later
    }
  });


  return { initialNodes: allNodes, initialEdges: allEdges };
}