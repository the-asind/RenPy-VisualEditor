import { createElement, type ReactNode } from 'react';
import { MarkerType, Node, Edge } from 'reactflow';
import { Theme, alpha } from '@mui/material/styles';
import type { ParsedNodeData } from './parsedNodeTypes';
import {
  buildNodeDisplayInfo,
  extractNodeMetadata,
  type NodeMetadata,
  type NodeStatus,
} from './nodeMetadata';

export interface FlowTransformerResult {
  initialNodes: Node[];
  initialEdges: Edge[];
}

export type VisualNodeType = 'label' | 'action' | 'if' | 'menu' | 'menuOption' | 'end';

export interface FlowNodeDisplay {
  title: string;
  summary: string;
  status?: NodeStatus;
  author?: string;
  tag?: string;
  tagColor?: string;
  type: VisualNodeType;
  typeLabel: string;
  accentColor: string;
}

export interface FlowNodeDataPayload {
  label?: ReactNode;
  originalData: ParsedNodeData;
  display: FlowNodeDisplay;
  metadata?: NodeMetadata;
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
  node: ParsedNodeData;
  result: NodeProcessResult;
  width: number;
}

// --- Configuration ---
const NODE_WIDTH = 320;
const NODE_HEIGHT_BASE = 88; // Unified node height matching single-header layout
const ACTION_LINE_HEIGHT = 1.5;
const VERTICAL_SPACING = 110;
const HORIZONTAL_SPACING_BASE = 20;

const ROOT_FONT_SIZE_PX = 16;
const DEFAULT_FONT_SIZE_PX = 14;

const parseCssSize = (
  value: string | number | undefined,
  relativeToPx: number
): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.endsWith('px')) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (trimmed.endsWith('rem')) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed * ROOT_FONT_SIZE_PX : null;
  }

  if (trimmed.endsWith('em')) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed * relativeToPx : null;
  }

  if (trimmed.endsWith('%')) {
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? (parsed / 100) * relativeToPx : null;
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return numeric * relativeToPx;
  }

  return null;
};

const getActionFontSizePx = (theme: Theme): number => {
  const body2FontSize = parseCssSize(theme.typography.body2?.fontSize, ROOT_FONT_SIZE_PX);
  if (body2FontSize !== null) {
    return body2FontSize;
  }

  const body1FontSize = parseCssSize(theme.typography.body1?.fontSize, ROOT_FONT_SIZE_PX);
  if (body1FontSize !== null) {
    return body1FontSize;
  }

  return DEFAULT_FONT_SIZE_PX;
};

const getActionLineHeightPx = (theme: Theme, fontSizePx?: number): number => {
  const resolvedFontSizePx = fontSizePx ?? getActionFontSizePx(theme);

  const body2LineHeight = parseCssSize(theme.typography.body2?.lineHeight, resolvedFontSizePx);
  if (body2LineHeight !== null) {
    return body2LineHeight;
  }

  const body1LineHeight = parseCssSize(theme.typography.body1?.lineHeight, resolvedFontSizePx);
  if (body1LineHeight !== null) {
    return body1LineHeight;
  }

  return ACTION_LINE_HEIGHT * resolvedFontSizePx;
};

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
  data: ParsedNodeData,
  position: { x: number; y: number },
  theme: Theme,
  style: Record<string, any> = {},
  display: FlowNodeDisplay,
  metadata?: NodeMetadata,
): Node => {
  const actionNodeFontSizePx = data.node_type === 'Action' ? getActionFontSizePx(theme) : null;
  const actionNodeLineHeightPx = data.node_type === 'Action'
    ? getActionLineHeightPx(theme, actionNodeFontSizePx ?? undefined)
    : null;

  const actionNodeLabel: ReactNode | null = data.node_type === 'Action'
    ? createElement(
        'div',
        {
          style: {
            whiteSpace: 'pre',
            lineHeight: actionNodeLineHeightPx ? `${actionNodeLineHeightPx}px` : undefined,
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.body2?.fontSize
              || theme.typography.body1?.fontSize
              || (actionNodeFontSizePx ? `${actionNodeFontSizePx}px` : undefined),
            letterSpacing: theme.typography.body2?.letterSpacing,
          },
        },
        display.summary,
      )
    : null;

  return {
    id,
    type: 'visualNode',
    data: {
      label: actionNodeLabel ?? display.summary,
      originalData: { ...data },
      display,
      metadata,
    },
    position,
    style: {
      width: NODE_WIDTH,
      background: 'transparent',
      border: 'none',
      padding: 0,
      ...style,
    },
  };
};

const resolveVisualType = (nodeType?: string): VisualNodeType => {
  switch (nodeType) {
    case 'LabelBlock':
      return 'label';
    case 'IfBlock':
      return 'if';
    case 'MenuBlock':
      return 'menu';
    case 'MenuOption':
      return 'menuOption';
    case 'EndBlock':
      return 'end';
    default:
      return 'action';
  }
};

const resolveTypeLabel = (type: VisualNodeType): string => {
  switch (type) {
    case 'label':
      return 'Label';
    case 'if':
      return 'If';
    case 'menu':
      return 'Menu';
    case 'menuOption':
      return 'Choice';
    case 'end':
      return 'End';
    default:
      return 'Action';
  }
};

const ACTION_ACCENT_COLORS = [
  '#4C6EF5',
  '#F76707',
  '#12B886',
  '#BE4BDB',
  '#FD7E14',
  '#228BE6',
  '#FF6B6B',
  '#15AABF',
];

const stringToIndex = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

const resolveActionAccentColor = (node: ParsedNodeData, theme: Theme): string => {
  const colors = theme.custom?.nodeColors ?? {};
  if (colors.action) {
    return colors.action;
  }

  const reference = typeof node.label_name === 'string' && node.label_name.trim().length > 0
    ? node.label_name.trim()
    : typeof node.id === 'string'
      ? node.id
      : typeof node.id === 'number'
        ? node.id.toString()
        : node.node_type || 'action';

  const index = stringToIndex(reference) % ACTION_ACCENT_COLORS.length;
  return ACTION_ACCENT_COLORS[index];
};

const resolveAccentColor = (type: VisualNodeType, theme: Theme, node: ParsedNodeData): string => {
  const colors = theme.custom?.nodeColors ?? {};
  switch (type) {
    case 'label':
      return colors.label || theme.palette.primary.main;
    case 'if':
      return colors.if || theme.palette.success.main;
    case 'menu':
      return colors.menu || theme.palette.info.main;
    case 'menuOption':
      return colors.menuOption || theme.palette.warning.main;
    case 'end':
      return colors.end || theme.palette.grey[500];
    default:
      return resolveActionAccentColor(node, theme);
  }
};

const buildDisplayForNode = (
  node: ParsedNodeData,
  scriptLines: string[],
  theme: Theme,
): { display: FlowNodeDisplay; metadata?: NodeMetadata } => {
  const visualType = resolveVisualType(node.node_type);
  const baseInfo = buildNodeDisplayInfo(scriptLines, node);
  const metadata = visualType === 'action' ? extractNodeMetadata(scriptLines, node) : undefined;
  const tagDrivenAccent = visualType === 'action'
    ? metadata?.tagColor?.trim() || undefined
    : undefined;

  let title = baseInfo.title?.trim() || '';
  let summary = baseInfo.summary?.trim() || '';

  if (visualType === 'label') {
    title = node.label_name || title || 'Label';
    summary = node.label_name || summary || title;
  } else if (visualType === 'menuOption') {
    const optionTitle = node.label_name || title;
    title = optionTitle || 'Choice';
    summary = summary || optionTitle || 'Choice';
  } else if (visualType === 'end') {
    title = 'End';
    summary = 'End';
  } else if (visualType === 'if') {
    title = summary.split('\n')[0] || 'If';
  }

  if (!title) {
    title = summary.split('\n')[0] || node.node_type || 'Node';
  }

  if (!summary) {
    summary = title;
  }

  return {
    display: {
      title,
      summary,
      status: visualType === 'action' ? metadata?.status : undefined,
      author: visualType === 'action' ? metadata?.author : undefined,
      tag: visualType === 'action' ? metadata?.tag : undefined,
      tagColor: visualType === 'action' ? metadata?.tagColor : undefined,
      type: visualType,
      typeLabel: resolveTypeLabel(visualType),
      accentColor: tagDrivenAccent || resolveAccentColor(visualType, theme, node),
    },
    metadata,
  };
};

const getNodeHeight = (): number => NODE_HEIGHT_BASE;

/**
 * Creates a standard React Flow edge object.
 */
type EdgeLabelVariant = 'if-true' | 'if-false';

interface CreateEdgeOptions {
  labelVariant?: EdgeLabelVariant;
  hideLabel?: boolean;
  strokeColor?: string;
}

const resolveLabelStyles = (
  variant: EdgeLabelVariant | undefined,
  theme: Theme
): { background: string; color: string; borderColor?: string } => {
  if (variant === 'if-true') {
    const base = theme.palette.success.main;
    return {
      background: alpha(base, theme.palette.mode === 'dark' ? 0.35 : 0.2),
      color: theme.palette.success.contrastText
        || (theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark),
      borderColor: alpha(base, theme.palette.mode === 'dark' ? 0.6 : 0.35),
    };
  }

  if (variant === 'if-false') {
    const base = theme.palette.error.main;
    return {
      background: alpha(base, theme.palette.mode === 'dark' ? 0.35 : 0.2),
      color: theme.palette.error.contrastText
        || (theme.palette.mode === 'dark' ? theme.palette.error.light : theme.palette.error.dark),
      borderColor: alpha(base, theme.palette.mode === 'dark' ? 0.6 : 0.35),
    };
  }

  const neutral = theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.black, 0.5)
    : theme.palette.common.white;
  return {
    background: neutral,
    color: theme.palette.text.primary,
    borderColor: theme.palette.mode === 'dark'
      ? alpha(theme.palette.common.white, 0.12)
      : alpha(theme.palette.common.black, 0.08),
  };
};

const createFlowEdge = (
  id: string,
  source: string,
  target: string,
  theme: Theme,
  label: string = '',
  type: string = 'vertical-turn',
  animated: boolean = false,
  options: CreateEdgeOptions = {}
): Edge => {
  const isEndBlockEdge = target.startsWith('end-');
  const hasLabel = Boolean(label && label.trim().length > 0 && !options.hideLabel);
  const labelStyles = hasLabel ? resolveLabelStyles(options.labelVariant, theme) : null;
  const branchStrokeColor = options.strokeColor
    || (options.labelVariant === 'if-true'
      ? theme.palette.success.main
      : options.labelVariant === 'if-false'
        ? theme.palette.error.main
        : undefined);
  const strokeColor = branchStrokeColor
    || (isEndBlockEdge
      ? theme.custom?.nodeColors?.end || theme.palette.divider
      : theme.custom?.edgeColor || theme.palette.divider);

  return {
    id,
    source,
    target,
    label: hasLabel ? label : undefined,
    type,
    animated,
    style: {
      strokeWidth: 2,
      stroke: strokeColor,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 15,
      height: 15,
      color: strokeColor,
    },
    ...(labelStyles
      ? {
          labelBgPadding: [4, 8],
          labelBgBorderRadius: 999,
          labelStyle: {
            fill: labelStyles.color,
            fontWeight: 700,
            fontSize: 12,
            textTransform: options.labelVariant ? 'uppercase' : 'none',
            letterSpacing: options.labelVariant ? 0.5 : undefined,
          },
          labelBgStyle: {
            fill: labelStyles.background,
            stroke: labelStyles.borderColor,
            strokeWidth: labelStyles.borderColor ? 1 : undefined,
          },
        }
      : {}),
  };
};

/**
 * Recursively processes the API node tree to generate React Flow nodes and edges.
 */
function processNodeRecursive(
  apiNode: ParsedNodeData,
  theme: Theme,
  scriptLines: string[],
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
  const nodeHeight = getNodeHeight(apiNode, theme);
  const { display, metadata } = buildDisplayForNode(apiNode, scriptLines, theme);

  const flowNode = createFlowNode(
    nodeId,
    apiNode,
    nodePosition,
    theme,
    { minHeight: nodeHeight, height: nodeHeight },
    display,
    metadata,
  );
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

  let currentY = startY + nodeHeight + VERTICAL_SPACING;
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
          trueNode, theme, scriptLines, parentInfoForTrue, startX, currentTrueY,
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
          falseNode, theme, scriptLines, parentInfoForFalse, startX, currentFalseY,
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
      targetTrueBranchMinX = startX + NODE_WIDTH + HORIZONTAL_SPACING_BASE;
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
        '',
        'vertical-turn',
        false,
        { labelVariant: 'if-true', hideLabel: true }
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
        '',
        'vertical-turn',
        false,
        { labelVariant: 'if-true', hideLabel: true }
      ));
    }

    if (falseBranchExists) {
      const firstFalseNodeId = apiNode.false_branch![0].id;
      currentEdges.push(createFlowEdge(
        createEdgeId(nodeId, firstFalseNodeId as string, 'false'),
        nodeId,
        firstFalseNodeId as string,
        theme,
        '',
        'vertical-turn',
        false,
        { labelVariant: 'if-false', hideLabel: true }
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
        '',
        'vertical-turn',
        false,
        { labelVariant: 'if-false', hideLabel: true }
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
          optionNode, theme, scriptLines, nextParentInfo, tempX, currentY, level + 1, nextSequentialNodeId
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
          '',
          'vertical-turn',
          false,
          { hideLabel: true }
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
        childNode, theme, scriptLines, parentInfoForChild, startX, currentY, level, nextChildId
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
  activeTabId: string | null = null,
  scriptLines: string[] = []
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
      const blockResult = processNodeRecursive(labelBlock, theme, scriptLines, null, initialX, currentY, 0, null);
      
      // Create a dedicated EndBlock for this label
      const endNodeId = `end-${labelBlock.id || `label-${labelBlocks.indexOf(labelBlock)}`}`;
      const endNodeY = blockResult.nextY;
      const endNodeX = blockResult.horizontalBounds.minX + 
                     (blockResult.horizontalBounds.maxX - 
                      blockResult.horizontalBounds.minX - NODE_WIDTH) / 2;
      
      const endNodeData: ParsedNodeData = { label_name: 'End', node_type: 'EndBlock' };
      const endNodeHeight = getNodeHeight(endNodeData, theme);
      const { display: endDisplay } = buildDisplayForNode(endNodeData, scriptLines, theme);

      const endNode = createFlowNode(
        endNodeId,
        endNodeData,
        { x: endNodeX, y: endNodeY },
        theme,
        { minHeight: endNodeHeight, height: endNodeHeight },
        endDisplay,
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
      currentY = endNodeY + endNodeHeight + VERTICAL_SPACING * 3;
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
