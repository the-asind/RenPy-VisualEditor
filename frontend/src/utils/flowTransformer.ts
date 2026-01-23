import { Edge, Node, Position } from 'reactflow';
import { ParsedNodeData } from './parsedNodeTypes';
import { ChoiceNodeType } from './renpyParser';
import { buildNodeDisplayInfo } from './nodeMetadata';

// Adjust layout constants
const HORIZONTAL_SPACING = 350;
const VERTICAL_SPACING = 200;

export const transformTreeToFlow = (
  rootNode: ParsedNodeData,
  theme: 'light' | 'dark',
  activeTabId: string,
  scriptLines: string[] // Add scriptLines to extract metadata
): { initialNodes: Node[]; initialEdges: Edge[] } => {
  console.time('transformTreeToFlow');
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let idCounter = 0;

  // Use a map to track positions of nodes at each level to prevent overlap
  const levelY: { [key: number]: number } = {};

  const processNodeRecursive = (
    node: ParsedNodeData,
    x: number,
    level: number,
    parentId: string | null = null
  ) => {
    // Determine Y position based on level
    let y = levelY[level] || 0;

    // Ensure we don't overlap with previous nodes at this level
    // Add some vertical spacing
    if (levelY[level] !== undefined) {
      y += VERTICAL_SPACING;
    } else {
        // Initial Y for this level
        y = level * 100; // This logic seems flawed if we use level for Y?
        // Wait, the previous code used x for level (horizontal) and y for vertical stack.
        // Let's stick to the previous logic or improve it.
        // If it's a tree, usually X is depth, Y is breadth? Or vice versa.
        // Let's assume Left-to-Right tree.
        y = 0;
    }

    // Actually, a simple tree layout algorithm is better.
    // Let's stick to a simple DFS layout for now, but we need to manage Y to avoid collisions.
    // A shared Y counter for the whole traversal is easiest for a list-like structure,
    // but for a tree we need to track max Y of children.
  };

  // Re-implementing a simple layout strategy:
  // We'll traverse depth-first.
  // We maintain a global Y cursor.
  // Each node is placed at (Depth * X_SPACING, Current_Y).
  // Then we process children.
  // If a node has no children, we increment Current_Y.
  // If a node has children, its Y is the average of children's Y?
  // Or just top-down:

  let currentY = 0;

  const traverse = (node: ParsedNodeData, depth: number, parentId: string | null) => {
    // If it's the root node (dummy), just process children
    if (node.node_type === 'root' && node.label_name === 'root') {
      node.children.forEach(child => traverse(child, depth, null));
      return;
    }

    const nodeId = node.id || `node_${idCounter++}`;
    const nodeType = mapRenPyTypeToFlowType(node.node_type);

    // Extract metadata (including offset)
    const { title, summary, status, author, tag, tagColor, offset } = buildNodeDisplayInfo(scriptLines, node);

    // Calculate position
    // Base position
    let startX = depth * HORIZONTAL_SPACING;
    let startY = currentY;

    // Apply offset from metadata if present
    if (offset) {
      startX += offset.x;
      startY += offset.y;
    }

    const flowNode: Node = {
      id: nodeId,
      type: nodeType,
      position: { x: startX, y: startY },
      data: {
        label: title,
        rawLabel: node.label_name, // Store raw label for editing
        content: summary, // Use summary for display
        startLine: node.start_line,
        endLine: node.end_line,
        nodeType: node.node_type,
        status,
        author,
        tag,
        tagColor,
        offset // Pass offset to data so we can update it? Or just for reference.
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true, // Enable dragging
    };

    nodes.push(flowNode);

    if (parentId) {
      edges.push({
        id: `e_${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: theme === 'dark' ? '#555' : '#ccc' },
      });
    }

    // Process children
    // If it's a Menu, children are MenuOptions
    // If it's If, children are Actions or other blocks
    // Note: This simple traversal stacks children vertically.
    
    if (node.children && node.children.length > 0) {
        // If we have children, we might want to center the parent Y relative to children?
        // For now, let's just place parent at top and children below.
        // Actually, "currentY" strategy works best for leaf nodes.
        // Parent Y should be derived?
        // Let's stick to "Pre-order" placement with incrementing Y for leaves.
        
        // However, if we simply increment Y for every node, the tree expands downwards.
        // That's fine.
        
        // But we want visual hierarchy.
        
        // Let's refine:
        // Render current node.
        // Recurse for children.
        // If no children, increment Y for next sibling.
    }
    
    // Reserve space for this node
    currentY += VERTICAL_SPACING;

    // Recurse
    node.children.forEach(child => {
        traverse(child, depth + 1, nodeId);
    });

    // Recurse for false branch (else/elif)
    if (node.false_branch) {
        node.false_branch.forEach(child => {
            traverse(child, depth + 1, nodeId);
        });
    }
  };

  traverse(rootNode, 0, null);

  console.log(`flowTransformer: Generated ${nodes.length} nodes and ${edges.length} edges.`);
  console.timeEnd('transformTreeToFlow');
  return { initialNodes: nodes, initialEdges: edges };
};

const mapRenPyTypeToFlowType = (renpyType: string): string => {
  switch (renpyType) {
    case ChoiceNodeType.MENU_BLOCK:
      return 'menuNode'; // Custom node type
    case ChoiceNodeType.MENU_OPTION:
      return 'choiceNode'; // Custom node type? Or just default.
    case ChoiceNodeType.IF_BLOCK:
      return 'decisionNode';
    case ChoiceNodeType.LABEL_BLOCK:
      return 'startNode'; // Or similar
    default:
      return 'actionNode'; // Default for Action
  }
};
