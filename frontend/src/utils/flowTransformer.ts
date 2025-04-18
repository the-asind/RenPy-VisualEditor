import { MarkerType, Node, Edge, Position } from 'reactflow';
import { Theme } from '@mui/material/styles'; // Import Theme type

// Exported interface for the transformation result
export interface FlowTransformerResult {
  initialNodes: Node[];
  initialEdges: Edge[];
}

// Types for nodes in the parsed data
interface NodeData {
  id?: string;
  node_type?: string;
  label_name?: string;
  content?: string;
  next_id?: string;
  condition?: string;
  branches?: { [key: string]: any };
  options?: { [key: string]: any }[];
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
  theme: Theme, // Add theme parameter
  style: Record<string, any> = {}
): Node => {
  // Determine node color from theme based on node_type
  let backgroundColor = theme.custom.nodeColors.action;
  switch (data.node_type) {
    case 'LabelBlock':
      backgroundColor = theme.custom.nodeColors.label;
      break;
    case 'IfBlock':
      backgroundColor = theme.custom.nodeColors.if;
      break;
    case 'MenuBlock':
      backgroundColor = theme.custom.nodeColors.menu;
      break;
    case 'MenuOption':
      backgroundColor = theme.custom.nodeColors.menuOption;
      break;
    case 'EndBlock':
      backgroundColor = theme.custom.nodeColors.end;
      break;
  }

  return {
    id,
    type: 'default', 
    data: { 
      label: data.label_name || data.content || `Node ${id}`, // Use content if label_name is missing
      originalData: { ...data }
    },
    position,
    style: {
      background: backgroundColor,
      width: NODE_WIDTH,
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: '4px',
      padding: '10px',
      textAlign: 'center',
      color: theme.palette.getContrastText(backgroundColor), // Ensure text is readable
      ...style,
    }
  };
};

/**
 * Creates a standard React Flow edge object using theme colors.
 */
const createFlowEdge = (
  sourceId: string, 
  targetId: string, 
  theme: Theme,
  label?: string, 
  animated = false
): Edge => ({
  id: createEdgeId(sourceId, targetId, label),
  source: sourceId,
  target: targetId,
  label,
  animated,
  style: { stroke: theme.palette.divider, strokeWidth: 1.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
    color: theme.palette.divider,
  },
});

/**
 * Positions a node and its descendants recursively.
 */
const positionNodes = (
  nodeId: string, 
  nodes: Record<string, NodeData>, 
  theme: Theme, 
  startX = 0, 
  startY = 0, 
  processed = new Set<string>()
): {
  flowNodes: Node[];
  flowEdges: Edge[];
  width: number;
  endY: number;
} => {
  if (!nodeId || processed.has(nodeId)) {
    return { flowNodes: [], flowEdges: [], width: 0, endY: startY };
  }

  processed.add(nodeId);
  const node = nodes[nodeId];
  
  if (!node) {
    console.warn(`Node with ID ${nodeId} not found in nodes map`);
    return { flowNodes: [], flowEdges: [], width: 0, endY: startY };
  }

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  let totalWidth = NODE_WIDTH;
  let currentY = startY;

  // Create the current node using theme
  const currentNode = createFlowNode(
    nodeId,
    node.node_type || 'Default',
    node,
    { x: startX, y: startY },
    theme // Pass theme
  );
  flowNodes.push(currentNode);
  // Handle different node types
  if (node.node_type === 'IfBlock' && node.branches) {
    // Process if/else branches
    const ifBranch = node.branches.true;
    const elseBranch = node.branches.false;
    
    let ifWidth = 0;
    let elseWidth = 0;
    let maxBranchY = startY;
    
    if (ifBranch) {
      // Убедимся, что у нас есть ID ветки, если нет, используем строковую версию
      const branchId = ifBranch.id || (typeof ifBranch === 'string' ? ifBranch : null);
      
      if (branchId) {
        const ifResult = positionNodes(
          branchId,
          nodes,
          theme, // Pass theme
          startX - HORIZONTAL_SPACING_BASE, // Adjust positioning slightly
          startY + VERTICAL_SPACING,
          processed
        );
        
        flowNodes.push(...ifResult.flowNodes);
        flowEdges.push(...ifResult.flowEdges);
        flowEdges.push(createFlowEdge(nodeId, branchId, theme, 'true', true)); // Pass theme
        
        ifWidth = ifResult.width;
        maxBranchY = Math.max(maxBranchY, ifResult.endY);
      }
    }
      if (elseBranch) {
      // Аналогично для else ветки, убедимся что у нас есть ID
      const branchId = elseBranch.id || (typeof elseBranch === 'string' ? elseBranch : null);
      
      if (branchId) {
        const elseResult = positionNodes(
          branchId,
          nodes,
          theme, // Pass theme
          startX + NODE_WIDTH + HORIZONTAL_SPACING_BASE, // Adjust positioning slightly
          startY + VERTICAL_SPACING,
          processed
        );
        
        flowNodes.push(...elseResult.flowNodes);
        flowEdges.push(...elseResult.flowEdges);
        flowEdges.push(createFlowEdge(nodeId, branchId, theme, 'false', true)); // Pass theme
        
        elseWidth = elseResult.width;
        maxBranchY = Math.max(maxBranchY, elseResult.endY);
      }
    }
    
    totalWidth = Math.max(NODE_WIDTH, ifWidth + elseWidth + HORIZONTAL_SPACING_BASE * 2);
    currentY = maxBranchY + VERTICAL_SPACING;
  } else if (node.node_type === 'MenuBlock' && node.options && node.options.length > 0) {
    // Process menu options
    let maxOptionWidth = 0;
    let maxOptionY = startY;
    
    // Safe access to options array with type guard to satisfy TypeScript
    const options = node.options || [];
      options.forEach((option: any, index: number) => {
      // Проверяем наличие и тип ID опции, поддерживая разные форматы данных
      const optionId = option.id || 
                      (option.target_id) || 
                      (typeof option === 'string' ? option : null);
      
      if (!optionId) {
        console.warn('Menu option without ID found, skipping:', option);
        return;
      }
      
      const optionX = startX + (index - options.length / 2 + 0.5) * 
                     (NODE_WIDTH + HORIZONTAL_SPACING_BASE);
      
      // Если узел для этой опции не существует, создаем временный
      if (!nodes[optionId] && typeof option !== 'string') {
        nodes[optionId] = {
          id: optionId,
          node_type: 'MenuOption',
          label_name: option.text || `Option ${index+1}`,
          content: option.text || `Option content ${index+1}`,
          // Сохраняем ссылки на следующие узлы, если они есть
          next_id: option.next_id || option.target_id || null
        };
      }
      
      const optionResult = positionNodes(
        optionId,
        nodes,
        theme, // Pass theme
        optionX,
        startY + VERTICAL_SPACING,
        processed
      );
      
      flowNodes.push(...optionResult.flowNodes);
      flowEdges.push(...optionResult.flowEdges);
      flowEdges.push(createFlowEdge(nodeId, optionId, theme, option.text || `Option ${index+1}`)); // Pass theme
      
      maxOptionWidth = Math.max(maxOptionWidth, optionResult.width);
      maxOptionY = Math.max(maxOptionY, optionResult.endY);
    });
    
    totalWidth = Math.max(NODE_WIDTH, maxOptionWidth * node.options.length);
    currentY = maxOptionY + VERTICAL_SPACING;
      } else if (node.next_id) {
    // Process linear node with next_id
    const nextId = node.next_id;
    
    // Проверяем, существует ли следующий узел
    if (!nodes[nextId]) {
      console.warn(`Next node ID ${nextId} referenced by ${nodeId} not found in nodes map`);
      
      // Если узла нет, создаем временный заполнитель
      nodes[nextId] = {
        id: nextId,
        node_type: 'Action',
        label_name: `Node ${nextId}`,
        content: `Generated node referenced by ${nodeId}`
      };
    }
    
    const nextResult = positionNodes(
      nextId,
      nodes,
      theme, // Pass theme
      startX,
      startY + VERTICAL_SPACING,
      processed
    );
    
    flowNodes.push(...nextResult.flowNodes);
    flowEdges.push(...nextResult.flowEdges);
    flowEdges.push(createFlowEdge(nodeId, nextId, theme)); // Pass theme
    
    totalWidth = Math.max(NODE_WIDTH, nextResult.width);
    currentY = nextResult.endY;
  }

  return {
    flowNodes,
    flowEdges,
    width: totalWidth,
    endY: currentY
  };
};

/**
 * Transforms the parsed tree data into React Flow nodes and edges.
 * @param parsedData The data returned from the API
 * @param theme The current MUI theme
 * @param activeTabId Optional ID of the active tab/LabelBlock to filter nodes
 */
export const transformTreeToFlow = (parsedData: any, theme: Theme, activeTabId?: string | null): FlowTransformerResult => {
  try {
    // Handle different possible data structures more robustly
    console.log('TransformTreeToFlow received data:', parsedData, 'activeTabId:', activeTabId);
    
    // Safe access to nodes by handling different possible structures
    let nodes: Record<string, any> = {};
    let startNode: string | null = null;
    let selectedLabelBlockData: any = null;

    // Look for children first (since that's where the RenPy labelblocks appear to be)
    if (parsedData && parsedData.children && typeof parsedData.children === 'object') {
      console.log('Found children property with labels:', Object.keys(parsedData.children));
        // If activeTabId is specified and exists in children, use that specific child
      if (activeTabId && parsedData.children[activeTabId]) {
        console.log('Processing specific label block from children:', activeTabId);
        selectedLabelBlockData = parsedData.children[activeTabId];
        
        // Создаем полную структуру узлов для этого лейбла
        // Сначала добавляем сам лейбл-блок в качестве начального узла
        const labelId = activeTabId;
        
        // Строим полную карту узлов для этого лейбла, включая сам лейбл и все его дочерние элементы
        // Начинаем с копирования всех узлов из основного дерева
        nodes = {...parsedData.nodes}; // Копируем все узлы для сохранения связей
        
        // Для обеспечения работы с полной цепочкой зависимостей
        // проверяем, есть ли у selectedLabelBlockData свои узлы
        if (selectedLabelBlockData.nodes) {
          // Если у лейблока есть свои узлы, добавляем их
          Object.entries(selectedLabelBlockData.nodes).forEach(([nodeId, nodeData]: [string, any]) => {
            nodes[nodeId] = nodeData;
          });
          startNode = selectedLabelBlockData.start_node || activeTabId;
        } else if (selectedLabelBlockData.next_id) {
          // Если у лейбла есть прямая ссылка на следующий узел, используем ее
          startNode = activeTabId; // Начинаем с самого лейбла
        } else {
          // Если это простой узел без явных связей
          startNode = activeTabId;
        }
        
        // Убеждаемся, что сам лейбл-блок присутствует в нодах
        if (!nodes[activeTabId]) {
          // Добавляем лейбл-блок как узел, если его еще нет
          nodes[activeTabId] = selectedLabelBlockData;
        }
        
        console.log('Built complete node tree for label block:', Object.keys(nodes).length, 'nodes, starting with', startNode);
      } 
      // If no specific tab selected or it doesn't exist, use the first child or default
      else {
        // No specific tab selected, use the default structure
        nodes = parsedData;
        startNode = null;
      }
    }
    // Case 1: parsedData has nodes and start_node properties (standard structure)
    else if (parsedData && parsedData.nodes && typeof parsedData.nodes === 'object') {
      nodes = parsedData.nodes;
      startNode = parsedData.start_node || null;
    } 
    // Case 2: parsedData itself is a nodes object
    else if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
      nodes = parsedData;
      // Try to find a key that might be a start node
      const possibleStartNodeKeys = Object.keys(parsedData).filter(
        key => key.toLowerCase().includes('start') || 
              key.toLowerCase().includes('main') || 
              key.toLowerCase().includes('label')
      );
      if (possibleStartNodeKeys.length > 0) {
        startNode = possibleStartNodeKeys[0];
      }
    }
    
    // If we still don't have valid nodes, create an empty structure
    if (Object.keys(nodes).length === 0) {
      console.warn('No valid nodes found in parsedData, using default structure');
      nodes = {
        'default-node': {
          node_type: 'LabelBlock',
          label_name: 'Default Node',
          children: []
        }
      };
      startNode = 'default-node';
    }// Find all LabelBlocks in the parsed data
    const labelBlocks: Record<string, any> = {};
      // Special handling for the RenPy script structure with real label blocks
    const findRealLabelBlocks = () => {
      // Check for child nodes that might be the actual label blocks
      if (parsedData.children && typeof parsedData.children === 'object') {
        Object.entries(parsedData.children).forEach(([nodeId, nodeData]: [string, any]) => {
          if (nodeData && nodeData.node_type === 'LabelBlock' && nodeData.label_name) {
            labelBlocks[nodeId] = nodeData;
            console.log('Found real LabelBlock in transformer:', nodeId, nodeData.label_name);
          }
        });
      }
      
      // Also check in nodes
      if (nodes) {
        Object.entries(nodes).forEach(([nodeId, nodeData]: [string, any]) => {
          if (nodeData && nodeData.node_type === 'LabelBlock' && nodeData.label_name) {
            labelBlocks[nodeId] = nodeData;
            console.log('Found real LabelBlock in nodes:', nodeId, nodeData.label_name);
          }
        });
      }
    };
    
    findRealLabelBlocks();
    
    console.log('LabelBlocks found in transformer:', Object.keys(labelBlocks));
    console.log('Active Tab ID:', activeTabId);
    
    // If we already have a startNode from the selected label block's data structure, use that
    if (selectedLabelBlockData && startNode) {
      console.log('Using startNode from selected labelblock data:', startNode);
    }
    // If we have an activeTabId but didn't find it in the children structure yet
    else if (activeTabId) {
      // For numeric IDs or string IDs that match a label block
      if (labelBlocks[activeTabId]) {
        console.log('Using activeTabId as startNode (valid LabelBlock):', activeTabId);
        // We need to create nodes for this label block if they don't exist already
        if (!nodes[activeTabId]) {
          console.log('Creating node for labelblock that was missing in nodes map');
          const labelData = labelBlocks[activeTabId];
          nodes[activeTabId] = labelData;
        }
        startNode = activeTabId;
      } 
      // When activeTabId is a custom ID like 'label_name'
      else if (activeTabId === 'label_name' && parsedData.label_name) {
        // Create a simple node for the main scriptId
        const mainNodeId = 'main-script-node';
        nodes[mainNodeId] = {
          id: mainNodeId,
          node_type: 'Action',
          label_name: parsedData.label_name,
          content: 'Main script'
        };
        startNode = mainNodeId;
        console.log('Created node for label_name tab:', mainNodeId);
      }
      // For the default tab
      else if (activeTabId === 'default-label') {
        if (Object.keys(nodes).length > 0) {
          // Use the first node for default tab
          startNode = Object.keys(nodes)[0];
          console.log('Using first available node for default tab:', startNode);
        } else {
          // Create a default node
          const defaultNodeId = 'default-script-node';
          nodes[defaultNodeId] = {
            id: defaultNodeId,
            node_type: 'Action',
            label_name: 'Default Script',
            content: 'No content available'
          };
          startNode = defaultNodeId;
          console.log('Created default node:', defaultNodeId);
        }
      }
    }
    
    // If we still don't have a startNode, try various fallbacks
    if (!startNode) {
      // If there are actual LabelBlocks, use the first one
      if (Object.keys(labelBlocks).length > 0) {
        const firstLabelId = Object.keys(labelBlocks)[0];
        startNode = firstLabelId;
        
        // Make sure this node exists in the nodes collection
        if (!nodes[firstLabelId]) {
          nodes[firstLabelId] = labelBlocks[firstLabelId];
        }
        
        console.log('Using first real LabelBlock as startNode:', startNode);
      }
      // As a last resort, use the start_node if specified
      else if (parsedData.start_node) {
        startNode = parsedData.start_node;
        console.log('Using specified start_node:', startNode);
      } else if (Object.keys(nodes).length > 0) {
        // Just use the first available node
        startNode = Object.keys(nodes)[0];
        console.log('Using first available node as fallback:', startNode);
      } else {
        console.error('No valid nodes found for rendering');
        // Create a default node as last resort
        const fallbackNodeId = 'fallback-node';
        nodes[fallbackNodeId] = {
          id: fallbackNodeId,
          node_type: 'Action',
          label_name: 'Fallback Node',
          content: 'No valid content could be found for this tab'
        };
        startNode = fallbackNodeId;
      }
    }
    
    console.log('Final startNode selected:', startNode);
    console.log('Nodes available:', Object.keys(nodes));

    // Ensure startNode is not null before proceeding
    if (startNode === null) {
        console.error("Could not determine a valid start node. Returning empty flow.");
        return { initialNodes: [], initialEdges: [] };
    }

      // Check if startNode actually exists in nodes before positioning
    if (!nodes[startNode]) {
      console.error(`StartNode "${startNode}" doesn't exist in nodes map. Available nodes:`, Object.keys(nodes));
      
      // Create a simple placeholder node if the selected start node doesn't exist
      // Ensure startNode is not null here, although the check above should cover it
      nodes[startNode] = {
        node_type: 'Action',
        label_name: startNode, // Use the non-null startNode
        content: `Node for ${startNode}` // Use the non-null startNode
      };
    }
    
    // Position nodes starting from the selected LabelBlock
    // At this point, startNode is guaranteed to be a string due to the check above
    const { flowNodes, flowEdges } = positionNodes(startNode, nodes, theme, 0, 0); // Pass theme
    
    console.log('[Transformer] Generated nodes and edges:', { nodes: flowNodes, edges: flowEdges });
    
    return {
      initialNodes: flowNodes,
      initialEdges: flowEdges
    };
  } catch (error) {
    console.error('[Transformer] Error transforming tree to flow:', error);
    throw error;
  }
};
