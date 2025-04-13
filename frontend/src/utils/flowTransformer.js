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
 * Returns: { nodes: [], edges: [], nextY: number, horizontalBounds: { minX: number, maxX: number } }
 */
function processNodeRecursive(apiNode, parentNodeId = null, startX = 0, startY = 0, level = 0, nextSequentialNodeId = null) {
  if (!apiNode) {
    return { nodes: [], edges: [], nextY: startY, horizontalBounds: { minX: startX, maxX: startX + NODE_WIDTH } };
  }

  const nodeId = apiNode.id || `node-${Math.random().toString(16).slice(2)}`; // Ensure ID exists
  const nodeType = apiNode.node_type;
  const nodePosition = { x: startX, y: startY };

  const flowNode = createFlowNode(nodeId, nodeType, apiNode, nodePosition);
  let currentNodes = [flowNode];
  let currentEdges = [];

  if (parentNodeId && nodeType !== 'LabelBlock') {
    // Add edge from parent, handling specific labels for If/Menu branches later
    if (apiNode.meta?.branchType !== 'true' && apiNode.meta?.branchType !== 'false') { // Avoid duplicate edges for If branches
      currentEdges.push(createFlowEdge(createEdgeId(parentNodeId, nodeId), parentNodeId, nodeId));
    }
  }

  let currentY = startY + NODE_HEIGHT_BASE + VERTICAL_SPACING;
  let childrenMinX = startX;
  let childrenMaxX = startX + NODE_WIDTH;

  // --- Handle Children based on Node Type ---

  if (nodeType === 'IfBlock') {
    const horizontalShift = HORIZONTAL_SPACING_BASE * (level + 1);

    // 1. True Branch (children)
    let trueBranchY = currentY;
    let trueBranchMinX = startX + horizontalShift / 2;
    let trueBranchMaxX = startX + horizontalShift / 2 + NODE_WIDTH;

    if (apiNode.children && apiNode.children.length > 0) {
      // Pass the overall nextSequentialNodeId down to the branch
      // Mark the child node's meta for edge labeling
      apiNode.children[0].meta = { ...(apiNode.children[0].meta || {}), branchType: 'true' };
      const trueBranchResult = processNodeRecursive(apiNode.children[0], nodeId, startX + horizontalShift / 2, currentY, level + 1, nextSequentialNodeId);
      currentNodes = currentNodes.concat(trueBranchResult.nodes);
      // Add edge from IfBlock to the *first* node of the true branch
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.children[0].id, 'true'), nodeId, apiNode.children[0].id, 'True'));
      currentEdges = currentEdges.concat(trueBranchResult.edges);
      trueBranchY = trueBranchResult.nextY;
      trueBranchMinX = trueBranchResult.horizontalBounds.minX;
      trueBranchMaxX = trueBranchResult.horizontalBounds.maxX;
    } else if (nextSequentialNodeId) {
      // No True children, but there's a next node: connect IfBlock directly to it
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId, 'true'), nodeId, nextSequentialNodeId, 'True'));
      trueBranchY = currentY; // Y doesn't advance
    }

    // 2. False Branch (false_branch)
    let falseBranchY = currentY;
    let falseBranchMinX = startX - horizontalShift / 2;
    let falseBranchMaxX = startX - horizontalShift / 2 + NODE_WIDTH;

    if (apiNode.false_branch) {
      // Pass the overall nextSequentialNodeId down to the branch
      apiNode.false_branch.meta = { ...(apiNode.false_branch.meta || {}), branchType: 'false' };
      const falseBranchResult = processNodeRecursive(apiNode.false_branch, nodeId, startX - horizontalShift / 2, currentY, level + 1, nextSequentialNodeId);
      currentNodes = currentNodes.concat(falseBranchResult.nodes);
      // Add edge from IfBlock to the *first* node of the false branch
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, apiNode.false_branch.id, 'false'), nodeId, apiNode.false_branch.id, 'False'));
      currentEdges = currentEdges.concat(falseBranchResult.edges);
      falseBranchY = falseBranchResult.nextY;
      falseBranchMinX = falseBranchResult.horizontalBounds.minX;
      falseBranchMaxX = falseBranchResult.horizontalBounds.maxX;
    } else if (nextSequentialNodeId) {
      // No False branch, but there's a next node: connect IfBlock directly to it
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId, 'false'), nodeId, nextSequentialNodeId, 'False'));
      falseBranchY = currentY; // Y doesn't advance
    }

    // Determine next Y and horizontal bounds
    currentY = Math.max(trueBranchY, falseBranchY);
    childrenMinX = Math.min(trueBranchMinX, falseBranchMinX);
    childrenMaxX = Math.max(trueBranchMaxX, falseBranchMaxX);

    // NOTE: The recursive calls now handle connecting the *end* of their branches to nextSequentialNodeId if applicable.

  } else if (nodeType === 'MenuBlock') {
    let menuOptionX = startX - ((apiNode.children.length - 1) * (NODE_WIDTH + HORIZONTAL_SPACING_MENU)) / 2; // Center options
    let maxOptionY = currentY;
    let firstOptionX = Infinity;
    let lastOptionX = -Infinity;

    apiNode.children.forEach((optionNode) => {
      // Pass the nextSequentialNodeId (node after the *entire* menu) down to the option's processing.
      // If the option itself ends with a jump/return, that logic isn't handled yet,
      // but if it falls through, it should connect to the node after the menu.
      const optionResult = processNodeRecursive(optionNode, nodeId, menuOptionX, currentY, level + 1, nextSequentialNodeId); // Pass nextSequentialNodeId
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
    let lastChildNodeId = nodeId;
    let childMinX = startX;
    let childMaxX = startX + NODE_WIDTH;

    for (let i = 0; i < apiNode.children.length; i++) {
      const childNode = apiNode.children[i];
      const nextChildId = (i + 1 < apiNode.children.length) ? apiNode.children[i + 1].id : nextSequentialNodeId;
      const parentIdForChild = lastChildNodeId;
      const childResult = processNodeRecursive(childNode, parentIdForChild, startX, currentY, level, nextChildId);
      currentNodes = currentNodes.concat(childResult.nodes);
      currentEdges = currentEdges.concat(childResult.edges);
      currentY = childResult.nextY;
      lastChildNodeId = childNode.id;
      childMinX = Math.min(childMinX, childResult.horizontalBounds.minX);
      childMaxX = Math.max(childMaxX, childResult.horizontalBounds.maxX);
    }
    childrenMinX = childMinX;
    childrenMaxX = childMaxX;
  } else {
    if (nextSequentialNodeId) {
      currentEdges.push(createFlowEdge(createEdgeId(nodeId, nextSequentialNodeId), nodeId, nextSequentialNodeId));
    }
  }

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
      const nextLabelBlockId = null;
      const labelBlockResult = processNodeRecursive(labelBlockNode, null, initialX, currentY, 0, nextLabelBlockId);

      const endNodeId = `end-${labelBlockNode.id}`;
      const endNodeY = labelBlockResult.nextY;
      const endNodeX = labelBlockResult.horizontalBounds.minX + (labelBlockResult.horizontalBounds.maxX - labelBlockResult.horizontalBounds.minX - NODE_WIDTH) / 2;
      const endNode = createFlowNode(endNodeId, 'EndBlock', { label_name: 'Возврат', node_type: 'EndBlock' }, { x: endNodeX, y: endNodeY });

      allNodes = allNodes.concat(labelBlockResult.nodes);
      allNodes.push(endNode);

      // Separate edges from the recursive result
      labelBlockResult.edges.forEach(edge => {
          if (edge.target.startsWith('end-')) {
              endBlockEdges.push(edge);
          } else {
              otherEdges.push(edge);
          }
      });

      const nodesWithOutgoingEdges = new Set(labelBlockResult.edges.map(e => e.source));

      labelBlockResult.nodes.forEach(node => {
          if (!nodesWithOutgoingEdges.has(node.id)) {
              const alreadyConnectedFalse = node.meta.node_type === 'IfBlock' &&
                                          !node.meta.false_branch &&
                                          labelBlockResult.edges.some(e => e.source === node.id && e.label === 'False');

              if (!alreadyConnectedFalse) {
                 // Add leaf-to-end edges to the endBlockEdges array
                 endBlockEdges.push(createFlowEdge(createEdgeId(node.id, endNodeId, 'leaf'), node.id, endNodeId));
              }
          }
      });

      currentY = endNodeY + NODE_HEIGHT_BASE + VERTICAL_SPACING * 2;
    }
  });

  // Concatenate arrays, putting endBlockEdges first
  const finalEdges = endBlockEdges.concat(otherEdges);

  return { initialNodes: allNodes, initialEdges: finalEdges };
}