import React, { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  MiniMap,
  Node,
  Viewport,
  Connection,
  useReactFlow
} from 'reactflow';
import {  Box,
  Drawer,
  Typography,
  IconButton,
  List,
  ListItem,
  Button,
  Avatar,
  Chip,
  AppBar,
  Toolbar,
  Tooltip,
  useTheme,
  alpha,
  Divider,
  Tabs,
  Tab,
  Paper,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  SelectChangeEvent,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  ListItemButton
} from '@mui/material';
import { styled } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import PanToolIcon from '@mui/icons-material/PanTool';
import ViewComfyIcon from '@mui/icons-material/ViewComfy';
import InputIcon from '@mui/icons-material/Input';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';

import { parseScript, createNewScript, getNodeContent, updateNodeContent, getScriptContent, loadExistingScript, insertNode } from '../services/api';
import projectService, { Project } from '../services/projectService';
import { transformTreeToFlow } from '../utils/flowTransformer';
import { visualNodeTypes } from './nodes/nodeTypes';
import { buildNodeDisplayInfo } from '../utils/nodeMetadata';
import NodeEditorPopup from './NodeEditorPopup';
import './EditorPage.css';
import VerticalTurnEdge from './edges/VerticalTurnEdge';
import {
  type ProjectTag,
  loadProjectTags,
  persistProjectTags,
  sortProjectTags,
} from '../utils/projectTags';

// Width for the editor toolbar drawer
const drawerWidth = 60;
const expandedDrawerWidth = 240;

import { useCollab } from '../contexts/CollabContext';
import MenuBranchDialog from './branching/MenuBranchDialog';
import ConditionBranchDialog from './branching/ConditionBranchDialog';
import {
  buildBranchSnippet,
  type BranchDialogResult,
  type MenuBranchDialogResult,
  type ConditionBranchDialogResult,
} from '../utils/branching';
import { analyzeAndStripIndent } from '../utils/indentation';

// Status color mapping
const getStatusColor = (status: string, theme: any) => {
  switch (status) {
    case 'editing':
      return { color: theme.palette.success.main };
    case 'online':
      return { color: theme.palette.info.main };
    case 'afk':
      return { color: theme.palette.warning.main };
    case 'away':
      return { color: theme.palette.error.main };
    default:
      return { color: theme.palette.grey[500] };
  }
};

// Styled components
const GlassAppBar = styled(AppBar)(({ theme }) => ({
  backdropFilter: 'blur(12px)',
  backgroundColor: theme.custom.glass.background,
  boxShadow: theme.custom.glass.shadow,
  borderBottom: `1px solid ${theme.custom.glass.border}`,
  zIndex: 1200, // Ensure it's above the ReactFlow canvas
}));

const EditorContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0, // Cover full screen
  left: 0,
  right: 0,
  bottom: 0,
  overflow: 'hidden', // Prevent scrollbars
  backgroundColor: theme.palette.background.default,
  zIndex: 1, // Base layer
}));

interface ScriptNodeIndexEntry {
  nodeId: string;
  nodeType: string;
  labelId: string | null;
  labelName: string;
  startLine: number | null;
  endLine: number | null;
}

interface SearchResultEntry {
  nodeId: string;
  labelId: string | null;
  labelName: string;
  lineNumber: number;
  text: string;
}

const EditorPageInternal: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    connectToProject,
    disconnectFromProject,
    connectToScript,
    disconnectFromScript,
    projectUsers,
    scriptUsers,
    structureUpdate
  } = useCollab();
  
  // Project ID is required from URL
  const projectId = searchParams.get('project');
  
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true); // Changed to true by default
  const [expandedDrawer, setExpandedDrawer] = useState<boolean>(false);
  const [sideMenuVisible, setSideMenuVisible] = useState<boolean>(true); // New state for completely hiding/showing the drawer
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pendingNodeFocus, setPendingNodeFocus] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const manualNodeFocusRef = useRef<boolean>(false);
  const focusNodeAfterReloadRef = useRef<string | null>(null);
  const [scriptLines, setScriptLines] = useState<string[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [branchToolActive, setBranchToolActive] = useState<boolean>(false);
  const [branchMenuPosition, setBranchMenuPosition] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [selectedBranchNode, setSelectedBranchNode] = useState<Node | null>(null);
  const [activeBranchDialog, setActiveBranchDialog] = useState<'menu' | 'condition' | null>(null);
  const [branchIndentation, setBranchIndentation] = useState<string>('');
  const [isBranchSubmitting, setIsBranchSubmitting] = useState<boolean>(false);

  const deactivateBranchTool = useCallback(() => {
    setBranchToolActive(false);
    setBranchMenuPosition(null);
    setSelectedBranchNode(null);
    setActiveBranchDialog(null);
    setBranchIndentation('');
  }, []);

  // State for LabelBlocks and tabs
  const [labelBlocks, setLabelBlocks] = useState<Array<{ id: string, name: string }>>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // React Flow states
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [zoom, setZoom] = useState<number>(1);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const reactFlowInstance = useReactFlow(); // Add ReactFlow instance ref
  const edgeTypes = useMemo(() => ({ 'vertical-turn': VerticalTurnEdge }), []);

  // --- NEW: viewport ref and helpers ---
  const savedViewportRef = useRef<Viewport | null>(null);
  const prevActiveTabId = useRef<string | null>(null); // Ref to track tab changes
  const isGraphReloading = useRef(false);

  const captureViewport = useCallback(() => {
    if (reactFlowInstance) {
      savedViewportRef.current = reactFlowInstance.getViewport();
    }
  }, [reactFlowInstance]);
  // --- END viewport helpers ---

  // --- NEW: track active label name for tab stabilization ---
  const [activeLabelName, setActiveLabelName] = useState<string | null>(null);
  // --- END ---

  const scriptNodeIndex = React.useMemo<ScriptNodeIndexEntry[]>(() => {
    if (!parsedData) {
      return [];
    }

    const entries: ScriptNodeIndexEntry[] = [];

    const traverse = (node: any, currentLabelId: string | null, currentLabelName: string): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      const nodeId: string = node.id ?? '';
      const nodeType: string = node.node_type ?? '';
      const displayInfo = buildNodeDisplayInfo(scriptLines, node);
      const computedTitle: string = displayInfo.title || node.label_name || currentLabelName || '';
      let nextLabelId = currentLabelId;
      let nextLabelName = currentLabelName;

      if (nodeType === 'LabelBlock') {
        nextLabelId = nodeId || node.label_name || null;
        nextLabelName = node.label_name ?? currentLabelName ?? '';
      }

      const startLine = typeof node.start_line === 'number' ? node.start_line : null;
      const endLine = typeof node.end_line === 'number' ? node.end_line : null;

      if (nodeType === 'LabelBlock') {
        entries.push({
          nodeId: nodeId,
          nodeType,
          labelId: nextLabelId,
          labelName: nextLabelName ?? computedTitle ?? '',
          startLine,
          endLine
        });
      } else if (nextLabelId) {
        entries.push({
          nodeId: nodeId,
          nodeType,
          labelId: nextLabelId,
          labelName: computedTitle,
          startLine,
          endLine
        });
      }

      if (Array.isArray(node.children)) {
        node.children.forEach((child: any) => traverse(child, nextLabelId ?? currentLabelId ?? null, nextLabelName ?? labelName ?? ''));
      }

      if (Array.isArray(node.false_branch)) {
        node.false_branch.forEach((child: any) => traverse(child, nextLabelId ?? currentLabelId ?? null, nextLabelName ?? labelName ?? ''));
      }
    };

    traverse(parsedData, null, '');

    return entries;
  }, [parsedData, scriptLines]);

  const lineToNodeMap = React.useMemo(() => {
    const map = new Map<number, ScriptNodeIndexEntry>();

    const sortedEntries = [...scriptNodeIndex].sort((a, b) => {
      const aLength = (a.endLine ?? a.startLine ?? 0) - (a.startLine ?? 0);
      const bLength = (b.endLine ?? b.startLine ?? 0) - (b.startLine ?? 0);
      return aLength - bLength;
    });

    sortedEntries.forEach(entry => {
      if (entry.startLine === null || entry.endLine === null) {
        return;
      }
      const start = Math.max(entry.startLine, 0);
      const end = Math.max(entry.endLine, entry.startLine);

      for (let i = start; i <= end; i += 1) {
        if (!map.has(i)) {
          map.set(i, entry);
        }
      }
    });

    return map;
  }, [scriptNodeIndex]);

  const searchResults = React.useMemo<SearchResultEntry[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const results: SearchResultEntry[] = [];

    scriptLines.forEach((line, index) => {
      if (!line || !line.toLowerCase().includes(query)) {
        return;
      }

      const nodeEntry = lineToNodeMap.get(index);
      if (!nodeEntry) {
        return;
      }

      results.push({
        nodeId: nodeEntry.nodeId,
        labelId: nodeEntry.labelId,
        labelName: nodeEntry.labelName,
        lineNumber: index,
        text: line.trim()
      });
    });

    return results;
  }, [lineToNodeMap, scriptLines, searchQuery]);

  const selectedBranchNodeName = useMemo(() => {
    if (!selectedBranchNode) {
      return '';
    }

    return (
      (selectedBranchNode.data as any)?.display?.title
      || selectedBranchNode.data?.originalData?.label_name
      || t('editor.nodeEditor.unnamed')
    );
  }, [selectedBranchNode, t]);

  useEffect(() => {
    if (isSearchDialogOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchDialogOpen]);

  useEffect(() => {
    if (!scriptId) {
      setScriptLines([]);
      return;
    }

    let isMounted = true;

    const fetchScriptContent = async () => {
      try {
        const content = await getScriptContent(scriptId);
        if (isMounted) {
          setScriptLines(content.split(/\r?\n/));
        }
      } catch (fetchError) {
        console.error('Failed to fetch script content for search:', fetchError);
      }
    };

    fetchScriptContent();

    return () => {
      isMounted = false;
    };
  }, [scriptId]);

  useEffect(() => {
    deactivateBranchTool();
  }, [deactivateBranchTool, scriptId]);

  useEffect(() => {
    return () => {
      deactivateBranchTool();
    };
  }, [deactivateBranchTool]);

  // Function to toggle the editor toolbar drawer
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  // Function to completely hide/show the side menu
  const toggleSideMenu = () => {
    setSideMenuVisible(!sideMenuVisible);
  };

  const toggleDrawerExpansion = () => {
    setExpandedDrawer(!expandedDrawer);
  };

  const toggleBranchTool = useCallback(() => {
    if (!scriptId) {
      setBranchToolActive(false);
      return;
    }

    setBranchToolActive((prev) => {
      if (prev) {
        setBranchMenuPosition(null);
        setSelectedBranchNode(null);
        setActiveBranchDialog(null);
        setBranchIndentation('');
      }
      return !prev;
    });
  }, [scriptId]);
  const handleOpenSearchDialog = () => {
    setIsSearchDialogOpen(true);
  };

  const handleCloseSearchDialog = () => {
    setIsSearchDialogOpen(false);
    setSearchQuery('');
  };
  // State for Node Editor Popup
  const [selectedNodeForEdit, setSelectedNodeForEdit] = useState<Node | null>(null);
  const [isEditorPopupOpen, setIsEditorPopupOpen] = useState<boolean>(false);
  const [editorInitialContent, setEditorInitialContent] = useState<string>('');
  const [isFetchingNodeContent, setIsFetchingNodeContent] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  // Function to handle node clicks - Opens the editor popup
  const onNodeClick = useCallback(async (event: React.MouseEvent, node: Node) => {
    console.log('Clicked node:', node);

    if (branchToolActive) {
      event.preventDefault();
      event.stopPropagation();

      if (node.type === 'endNode' || node.data?.originalData?.node_type === 'End') {
        setSnackbarMessage(t('editor.branchToolInvalidNode'));
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
        return;
      }

      if (!scriptId) {
        setSnackbarMessage(t('editor.errorNoScriptId'));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        deactivateBranchTool();
        return;
      }

      const startLine = node.data?.originalData?.start_line;
      const endLine = node.data?.originalData?.end_line;

      if (endLine === undefined || endLine === null) {
        setSnackbarMessage(t('editor.errorMissingNodeLines'));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        return;
      }

      const rawContent = node.data?.originalData?.content;
      let contentForIndent = '';
      if (typeof rawContent === 'string') {
        contentForIndent = rawContent;
      } else if (Array.isArray(rawContent)) {
        contentForIndent = rawContent.join('\n');
      } else if (typeof startLine === 'number' && typeof endLine === 'number' && scriptLines.length >= endLine) {
        contentForIndent = scriptLines.slice(Math.max(0, startLine - 1), endLine).join('\n');
      }

      const indentInfo = analyzeAndStripIndent(contentForIndent || '', t);
      if (indentInfo.error) {
        setSnackbarMessage(indentInfo.error);
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
      }

      setBranchIndentation(indentInfo.indent || '');
      setSelectedBranchNode(node);
      setBranchMenuPosition({ mouseX: event.clientX, mouseY: event.clientY });
      return;
    }

    if (node.type === 'endNode' || node.data?.originalData?.node_type === 'End') {
      console.log('Clicked on an End node, not opening editor.');
      return;
    }

    if (!scriptId) {
      console.error('Cannot fetch node content without scriptId');
      setSnackbarMessage(t('editor.errorNoScriptId'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    const startLine = node.data?.originalData?.start_line;
    const endLine = node.data?.originalData?.end_line;

    if (startLine === undefined || endLine === undefined) {
      console.error('Node data is missing start_line or end_line:', node.data);
      setSnackbarMessage(t('editor.errorMissingNodeLines'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setSelectedNodeForEdit(node);
    setIsFetchingNodeContent(true);
    setIsEditorPopupOpen(true);
    setEditorInitialContent('');

    try {
      const contentResponse = await getNodeContent(scriptId, startLine, endLine);
      setEditorInitialContent(contentResponse.content);
    } catch (fetchError: any) {
      console.error('Error fetching node content:', fetchError);
      setSnackbarMessage(fetchError.message || t('editor.errorFetchContent'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      setIsEditorPopupOpen(false);
      setSelectedNodeForEdit(null);
    } finally {
      setIsFetchingNodeContent(false);
    }
  }, [
    branchToolActive,
    scriptId,
    t,
    scriptLines,
    deactivateBranchTool,
  ]);
  const reloadScriptData = useCallback(async () => {
    if (!scriptId || !fileName) {
      console.error("Cannot reload script data without scriptId and fileName");
      return;
    }

    deactivateBranchTool();
    isGraphReloading.current = true;
    if (!focusNodeAfterReloadRef.current) {
      captureViewport(); // <-- capture before reload
    } else {
      savedViewportRef.current = null;
    }

    setIsLoading(true);
    try {


      const scriptContent = await getScriptContent(scriptId);
      setScriptLines(scriptContent.split(/\r?\n/));
      const blob = new Blob([scriptContent], { type: 'text/plain' });
      const file = new File([blob], fileName, { type: 'text/plain' });
        console.log("Re-parsing script to get updated nodes and edges");
      const projectId = currentProject?.id?.toString();
      const data = await parseScript(file, projectId);
      
      
      setParsedData(data.tree);
      
      console.log("Script data fully reloaded after node edit");
    } catch (error) {
      console.error("Failed to reload script data:", error);
      setSnackbarMessage(t('editor.errorReloadScript'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      isGraphReloading.current = false;
      focusNodeAfterReloadRef.current = null;
      manualNodeFocusRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [scriptId, fileName, t, captureViewport, currentProject, deactivateBranchTool]);

  useEffect(() => {
    if (!structureUpdate || !scriptId) {
      return;
    }

    if (structureUpdate.script_id === scriptId && !isGraphReloading.current) {
      void reloadScriptData();
    }
  }, [structureUpdate, scriptId, reloadScriptData]);

  const handleBranchMenuClose = useCallback(() => {
    deactivateBranchTool();
  }, [deactivateBranchTool]);

  const handleBranchOptionSelect = useCallback((type: 'menu' | 'condition') => {
    setActiveBranchDialog(type);
    setBranchMenuPosition(null);
    setBranchToolActive(false);
  }, []);

  const handleBranchDialogClose = useCallback(() => {
    setIsBranchSubmitting(false);
    deactivateBranchTool();
  }, [deactivateBranchTool]);

  const handleBranchDialogSubmit = useCallback(async (result: BranchDialogResult) => {
    if (!scriptId || !selectedBranchNode) {
      setSnackbarMessage(t('editor.errorNoScriptId'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    const endLine = selectedBranchNode.data?.originalData?.end_line;
    if (typeof endLine !== 'number') {
      setSnackbarMessage(t('editor.errorMissingNodeLines'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    const insertionLine = endLine + 1;
    const normalizedIndent = branchIndentation || result.indent || '';
    const normalizedResult = { ...result, indent: normalizedIndent } as BranchDialogResult;
    const snippet = buildBranchSnippet(normalizedResult);

    setIsBranchSubmitting(true);
    try {
      await insertNode(scriptId, insertionLine, result.type, snippet);
      const nodeTitle =
        (selectedBranchNode.data as any)?.display?.title
        || selectedBranchNode.data?.originalData?.label_name
        || t('editor.nodeEditor.unnamed');
      const successKey =
        result.type === 'menu'
          ? 'editor.branchInsertSuccessMenu'
          : 'editor.branchInsertSuccessCondition';
      setSnackbarMessage(t(successKey, { nodeName: nodeTitle }));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      await reloadScriptData();
    } catch (error: any) {
      console.error('Error inserting node:', error);
      setSnackbarMessage(error?.message || t('editor.branchInsertError'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setIsBranchSubmitting(false);
      setActiveBranchDialog(null);
      deactivateBranchTool();
    }
  }, [
    branchIndentation,
    deactivateBranchTool,
    reloadScriptData,
    scriptId,
    selectedBranchNode,
    t,
    insertNode,
  ]);

  const handleMenuDialogSubmit = useCallback((payload: MenuBranchDialogResult) => {
    void handleBranchDialogSubmit(payload);
  }, [handleBranchDialogSubmit]);

  const handleConditionDialogSubmit = useCallback((payload: ConditionBranchDialogResult) => {
    void handleBranchDialogSubmit(payload);
  }, [handleBranchDialogSubmit]);

  const handleSaveNodeContent = useCallback(async (startLine: number, endLine: number, newContent: string) => {
    if (!scriptId || !selectedNodeForEdit) {
      throw new Error(t('editor.errorSaveNoContext'));
    }

    const nodeStartLine = selectedNodeForEdit.data?.originalData?.start_line;
    const nodeEndLine = selectedNodeForEdit.data?.originalData?.end_line;

    console.log(`Saving node ${selectedNodeForEdit.id} (lines ${nodeStartLine}-${nodeEndLine})`);

    if (!nodeStartLine || !nodeEndLine) {
      throw new Error(t('editor.errorMissingLines'));
    }

    const targetNodeId = String(selectedNodeForEdit.id);
    focusNodeAfterReloadRef.current = targetNodeId;
    manualNodeFocusRef.current = true;

    try {
      const updateResponse = await updateNodeContent(scriptId, nodeStartLine, nodeEndLine, newContent);
      console.log('Node update response:', updateResponse);

      // Always reload script data to refresh the graph after any content change
      console.log('Reloading script data to refresh graph after node content update');
      await reloadScriptData();

      setPendingNodeFocus(targetNodeId);
      focusNodeAfterReloadRef.current = null;

      setSnackbarMessage(t('editor.saveSuccess'));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (saveError: any) {
      console.error("Error saving node content:", saveError);
      setSnackbarMessage(saveError.message || t('editor.errorSaveGeneric'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      focusNodeAfterReloadRef.current = null;
      manualNodeFocusRef.current = false;
      throw saveError;
    }
  }, [scriptId, selectedNodeForEdit, t, reloadScriptData, setPendingNodeFocus]);

  
  const handleDownloadScript = useCallback(async () => {
    if (!scriptId || !fileName) {
      setSnackbarMessage(t('editor.errorNoFileToSave'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      
      const content = await getScriptContent(scriptId);
      
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      
      
      const url = window.URL.createObjectURL(blob);
      
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName; 
      
      
      document.body.appendChild(link);
      link.click();
      
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSnackbarMessage(t('editor.saveToLocalSuccess'));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error: any) {
      console.error('Error downloading script:', error);
      setSnackbarMessage(error.message || t('editor.saveToLocalError'));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, [scriptId, fileName, t]);

  
  const handleSwitchToGlobalEditor = useCallback(() => {
    console.log("Switching to global editor...");
    
    setSnackbarMessage(t('editor.globalEditorNotImplemented'));
    setSnackbarSeverity('warning');
    setSnackbarOpen(true);
  }, [t]);

  
  const handleCloseEditorPopup = () => {
    setIsEditorPopupOpen(false);
    setSelectedNodeForEdit(null);
    setEditorInitialContent('');
  };

  
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };
  
  
  useEffect(() => {
    if (parsedData) {
      try {
        // Log the parsed data to better understand its structure
        console.log('ParsedData structure:', parsedData);
        
        // Extract LabelBlocks
        const extractedLabelBlocks: Array<{ id: string, name: string }> = [];
        
        // Handle the structure from RESPONSE_PARSER.txt directly
        if (parsedData.children && Array.isArray(parsedData.children)) {
          // This matches the structure in RESPONSE_PARSER.txt where labelblocks are direct children of root
          parsedData.children.forEach((node: any) => {
            if (node.node_type === 'LabelBlock') {
              extractedLabelBlocks.push({
                id: node.id,
                name: node.label_name || `Label ${node.id}` 
              });
              console.log('Found LabelBlock:', node.label_name, node.id);
            }
          });
        } 
        // Fallback to other structure types if needed
        else if (parsedData.tree && parsedData.tree.children && Array.isArray(parsedData.tree.children)) {
          // Some API responses wrap the data in a 'tree' property
          parsedData.tree.children.forEach((node: any) => {
            if (node.node_type === 'LabelBlock') {
              extractedLabelBlocks.push({
                id: node.id,
                name: node.label_name || `Label ${node.id}`
              });
            }
          });
        }
        // Object structure handling (key-value pairs of label blocks)
        else if (parsedData.nodes && typeof parsedData.nodes === 'object') {
          Object.entries(parsedData.nodes).forEach(([key, node]: [string, any]) => {
            if (node.node_type === 'LabelBlock') {
              extractedLabelBlocks.push({
                id: key,
                name: node.label_name || `Label ${key}`
              });
            }
          });
        }
        
        console.log('Extracted LabelBlocks:', extractedLabelBlocks);
        
        // If we still haven't found any LabelBlocks, create a default one
        if (extractedLabelBlocks.length === 0) {
          console.log('No LabelBlocks found, creating a default one');
          extractedLabelBlocks.push({
            id: 'default-label',
            name: t('editor.defaultLabel')
          });
        }
        
        // Set the extracted label blocks
        setLabelBlocks(extractedLabelBlocks);

        // --- NEW: try to restore tab by label name first ---
        if (extractedLabelBlocks.length > 0) {
          let nextTabId = extractedLabelBlocks[0].id;
          if (activeLabelName) {
            const prevByName = extractedLabelBlocks.find(lb => lb.name === activeLabelName);
            if (prevByName) {
              nextTabId = prevByName.id;
            }
          } else if (activeTabId && extractedLabelBlocks.some(lb => lb.id === activeTabId)) {
            nextTabId = activeTabId;
          }
          setActiveTabId(nextTabId);
        }
        // --- END ---

      } catch (error) {
        console.error('Error extracting LabelBlocks:', error);
        
        // Create a default tab in case of error
        const defaultLabelBlock = { id: 'default-label', name: t('editor.defaultLabel') };
        setLabelBlocks([defaultLabelBlock]);
        setActiveTabId(defaultLabelBlock.id);
      }
    } else {
      setLabelBlocks([]);
      setActiveTabId(null);
    }
  }, [parsedData, activeTabId, activeLabelName, t]);

  // Effect to transform data when parsedData and activeTabId change
  useEffect(() => {
    if (parsedData && activeTabId) {
      try {
        // Pass activeTabId to transformTreeToFlow to filter nodes
        const { initialNodes, initialEdges } = transformTreeToFlow(parsedData, theme, activeTabId, scriptLines);
        console.log("Generated Nodes for tab:", activeTabId, initialNodes);
        console.log("Generated Edges for tab:", activeTabId, initialEdges);
        setNodes(initialNodes);
        setEdges(initialEdges);
        
      } catch (transformError: any) {
        console.error("Error transforming tree to flow:", transformError);
        setError(`Failed to visualize script: ${transformError.message}`);
        setNodes([]);
        setEdges([]);
      }
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [parsedData, activeTabId, setNodes, setEdges, theme, scriptLines]);

  // Effect to handle viewport: restore on graph update, or center on tab change
  useLayoutEffect(() => {
    // If a reload was triggered, restore the viewport when needed.
    if (isGraphReloading.current) {
      if (savedViewportRef.current) {
        if (reactFlowInstance && nodes.length > 0) {
          reactFlowInstance.setViewport({ ...savedViewportRef.current });
          savedViewportRef.current = null; // Consume the saved viewport
          isGraphReloading.current = false; // Reset the flag, the restoration is done
        }
        return; // Prevent centering logic from running during a reload
      }

      // No saved viewport means we can resume normal behaviour immediately
      isGraphReloading.current = false;
    }

    // This logic now only runs for manual tab changes, not for reloads.
    const tabChanged = prevActiveTabId.current !== activeTabId;
    prevActiveTabId.current = activeTabId;

    if (manualNodeFocusRef.current) {
      return;
    }

    if (tabChanged && activeTabId && reactFlowInstance) {
        setTimeout(() => {
          const currentNodes = reactFlowInstance.getNodes();
          if (currentNodes.length > 0) {
            // Find the label block node to center on
            const labelNode = currentNodes.find(
              node => node.id === activeTabId || 
                    (node.data?.originalData?.node_type === 'LabelBlock')
            );
            
            if (labelNode) {
              // Center on the label node position
              reactFlowInstance.setCenter(
                labelNode.position.x + 250 / 2,
                labelNode.position.y + 50 / 2,
                { zoom: 1, duration: 800 }
              );
            } else {
              // If no label node found, fit the view to all nodes
              reactFlowInstance.fitView({ padding: 0.2, duration: 800 });
            }
          }
        }, 100); // Small delay to ensure nodes are rendered
    }
  }, [nodes, activeTabId, reactFlowInstance]);
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    isGraphReloading.current = true;
    captureViewport(); // <-- capture before parseScript

    if (!file.name.toLowerCase().endsWith('.rpy')) {
      setError(t('editor.invalidFileType'));
      return;
    }

    // Basic size check
    if (file.size > 1 * 1024 * 1024) {
      setError(t('editor.fileTooLarge'));
      return;
    }

    // Ensure we have a valid project before uploading
    if (!currentProject || !currentProject.id) {
      setError(t('editor.noProjectSelected'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setNodes([]);
    setEdges([]);

    try {
      const projectId = currentProject.id.toString();
      const data = await parseScript(file, projectId);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree);
      console.log('Parsed data:', data);
    } catch (err: any) {
      setError(err.detail || err.message || t('editor.parseError'));
      setScriptId(null);
      setFileName('');
      setParsedData(null);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  }, [setNodes, setEdges, t, currentProject, captureViewport]);
  const handleCreateNew = useCallback(async () => {
    if (!currentProject || !currentProject.id) {
      setError(t('editor.noProjectSelected'));
      return;
    }

    isGraphReloading.current = true;
    captureViewport(); // <-- capture before createNewScript

    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setNodes([]);
    setEdges([]);

    try {
      const timestamp = new Date().getTime();
      const newFilename = `new_script_${timestamp.toString(16)}.rpy`;
      const projectId = currentProject.id.toString();
      const data = await createNewScript(newFilename, projectId);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree);
      console.log('Created and parsed new script:', data);
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to create new script.');
      setScriptId(null);
      setFileName('');
      setParsedData(null);
    } finally {
      setIsLoading(false);
    }
  }, [setNodes, setEdges, t, currentProject, captureViewport]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Helper functions for zoom and pan controls
  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(prevZoom * 1.2, 8));
    if (reactFlowInstance) {
      reactFlowInstance.zoomTo(Math.min(zoom * 1.2, 8));
    }
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom * 0.8, 0.05)); // Lower minimum zoom to 0.05
    if (reactFlowInstance) {
      reactFlowInstance.zoomTo(Math.max(zoom * 0.8, 0.05));
    }
  };

  const togglePanMode = () => {
    setIsPanMode(!isPanMode);
  };

  const toggleMinimap = () => {
    setShowMinimap(!showMinimap);
  };

  const handleSearchResultClick = useCallback((result: SearchResultEntry) => {
    if (!result || !result.nodeId) {
      setIsSearchDialogOpen(false);
      setSearchQuery('');
      manualNodeFocusRef.current = false;
      return;
    }

    manualNodeFocusRef.current = true;
    setPendingNodeFocus(result.nodeId);

    if (result.labelId) {
      if (result.labelId !== activeTabId) {
        const matchingLabel = labelBlocks.find((lb) => lb.id === result.labelId);
        if (matchingLabel) {
          setActiveLabelName(matchingLabel.name);
        } else if (result.labelName) {
          setActiveLabelName(result.labelName);
        }
        setActiveTabId(result.labelId);
      } else if (result.labelName) {
        setActiveLabelName(result.labelName);
      }
    }

    setIsSearchDialogOpen(false);
    setSearchQuery('');
  }, [activeTabId, labelBlocks, setActiveTabId, setActiveLabelName]);

  useEffect(() => {
    if (!pendingNodeFocus || !reactFlowInstance) {
      return;
    }

    const node = reactFlowInstance.getNode(pendingNodeFocus);
    if (!node) {
      return;
    }

    const width = typeof node.width === 'number'
      ? node.width
      : typeof node.style?.width === 'number'
        ? node.style.width as number
        : 250;

    const height = typeof node.height === 'number'
      ? node.height
      : typeof node.style?.height === 'number'
        ? node.style.height as number
        : 50;

    reactFlowInstance.setCenter(
      node.position.x + width / 2,
      node.position.y + height / 2,
      { zoom: 1, duration: 800 }
    );

    manualNodeFocusRef.current = false;
    setPendingNodeFocus(null);
  }, [nodes, pendingNodeFocus, reactFlowInstance]);

  // Handle tab change with smooth centering
  const handleTabChange = (event: React.SyntheticEvent, newTabId: string) => {
    setActiveTabId(newTabId);
    // Найти имя label-а по id и сохранить
    const lb = labelBlocks.find(lb => lb.id === newTabId);
    if (lb) setActiveLabelName(lb.name);
  };  // Load available projects
  const loadProjects = useCallback(async () => {
    try {
      const projects = await projectService.getUserProjects();
      // We no longer need this since project ID is required from URL
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  const handleProjectTagsChange = useCallback((tags: ProjectTag[]) => {
    setProjectTags(tags);
    persistProjectTags(projectId, tags);
  }, [projectId]);

  // Load specific project from URL parameter
  const loadProjectFromUrl = useCallback(async (projectId: string) => {
    setIsLoadingProject(true);
    try {
      const project = await projectService.getProject(projectId);
      setCurrentProject(project);
      setProjectName(project.name);
      setError(null);
      console.log(`Loaded project from URL: ${project.name} (${projectId})`);
    } catch (error) {
      console.error('Failed to load project from URL:', error);
      setError(t('editor.projectNotFound'));    } finally {
      setIsLoadingProject(false);
    }
  }, [t]);

  // Check URL parameters and load project (required)
  useEffect(() => {
    if (!projectId) {
      setError(t('editor.missingProjectId'));
      return;
    }    
    loadProjectFromUrl(projectId);
  }, [projectId, loadProjectFromUrl, t]);

  // Establish WebSocket connections for collaboration
  useEffect(() => {
    if (projectId) {
      connectToProject(projectId);
    }
    return () => {
      disconnectFromProject();
    };
  }, [projectId, connectToProject, disconnectFromProject]);

  useEffect(() => {
    if (scriptId) {
      connectToScript(scriptId);
    } else {
      disconnectFromScript();
    }
    return () => {
      disconnectFromScript();
    };
  }, [scriptId, connectToScript, disconnectFromScript]);

  useEffect(() => {
    if (projectId) {
      const storedTags = loadProjectTags(projectId);
      setProjectTags(sortProjectTags(storedTags));
    } else {
      setProjectTags([]);
    }
  }, [projectId]);

  // Handle loading existing script
  const handleLoadExistingScript = useCallback(async (scriptId: string, filename: string) => {
    isGraphReloading.current = true;
    captureViewport(); // <-- capture before loadExistingScript

    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setNodes([]);
    setEdges([]);

    try {
      const data = await loadExistingScript(scriptId);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree);
      console.log('Loaded existing script:', data);
    } catch (err: any) {
      setError(err.detail || err.message || t('editor.loadScriptError'));
      setScriptId(null);
      setFileName('');
      setParsedData(null);
    } finally {
      setIsLoading(false);
    }
  }, [setNodes, setEdges, t, captureViewport]);

  // Combine project and script users for display
  const combinedUsers = React.useMemo(() => {
    const editing = scriptUsers.map(u => ({ ...u, status: 'editing' as const }));
    const others = projectUsers
      .filter(u => !scriptUsers.some(su => su.user_id === u.user_id))
      .map(u => ({ ...u, status: 'online' as const }));
    return [...editing, ...others];
  }, [projectUsers, scriptUsers]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Glass-effect top bar */}
      <GlassAppBar position="fixed">
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', color: theme.palette.primary.main }}>
          <Box display="flex" alignItems="center">
            <IconButton
              color="inherit"
              aria-label="toggle drawer"
              edge="start"
              onClick={toggleDrawer}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography 
              variant="h6" 
              noWrap 
              component="div" 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                fontSize: '1.25rem' 
              }}
            >
              <span style={{ fontWeight: 600}}>Ren'Py Visual Editor </span>
              <span style={{ 
                opacity: 0.7, 
                marginLeft: 8, 
                marginRight: 8, 
                fontWeight: 400,
              }}>→</span>
              <span style={{ 
                fontWeight: 500 
              }}>{projectName}</span>
            </Typography>
          </Box>          {scriptId && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ opacity: 0.7, mr: 2 }}>
                {t('editor.editingFile', { fileName, scriptId })}
              </Typography>
              <Tooltip title={t('editor.saveToLocal')}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleDownloadScript}
                  startIcon={<SaveIcon />}
                  sx={{ ml: 1 }}
                >
                  {t('editor.saveToLocal')}
                </Button>
              </Tooltip>
            </Box>
          )}
        </Toolbar>
        
        {/* LabelBlock Tabs */}
        {scriptId && labelBlocks.length > 0 && (
          <Paper 
            sx={{ 
              px: 1, 
              borderTopLeftRadius: 0, 
              borderTopRightRadius: 0,
              backgroundColor: theme.custom.glass.background,
              backdropFilter: 'blur(12px)',
              borderBottom: `1px solid ${theme.custom.glass.border}`,
              boxShadow: 'none',
            }}
            elevation={0}
          >
            <Tabs 
              value={activeTabId} 
              onChange={handleTabChange} // Use the new handler
              variant="scrollable"
              scrollButtons="auto"
              aria-label="labelblock tabs"
              sx={{ 
                minHeight: 42, // Slightly smaller tabs
                '& .MuiTabs-indicator': {
                  backgroundColor: theme.custom.nodeColors.label, // Use the LabelBlock color for the indicator
                  height: 3, // Thicker indicator for emphasis
                }
              }}
            >
              {labelBlocks.map((labelBlock) => (
                <Tab 
                  key={labelBlock.id} 
                  value={labelBlock.id} 
                  label={labelBlock.name} 
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: activeTabId === labelBlock.id ? 600 : 400,
                    minHeight: 42, // Match the Tabs minHeight
                    py: 0.5,
                  }} 
                />
              ))}
            </Tabs>
          </Paper>
        )}
      </GlassAppBar>

      {/* Left collapsible toolbar */}
      <Box 
        className="toggle-menu-button"
        onClick={toggleSideMenu}
        sx={{
          opacity: sideMenuVisible ? 0 : 1, // Only visible when menu is hidden
          transition: 'opacity 0.3s ease',
          backgroundColor: theme.custom.glass.background, 
          border: `1px solid ${theme.custom.glass.border}`,
          boxShadow: theme.custom.glass.shadow,
          color: theme.palette.text.primary,
        }}
      >
        <ChevronRightIcon />
      </Box>

      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen && sideMenuVisible} // Modified to respect both states
        sx={{
          width: expandedDrawer ? expandedDrawerWidth : drawerWidth,
          flexShrink: 0,
          position: 'absolute',
          zIndex: 1100, // Lower than AppBar but above the canvas
          transition: 'all 0.3s ease',          '& .MuiDrawer-paper': {
            width: expandedDrawer ? expandedDrawerWidth : drawerWidth,
            boxSizing: 'border-box',
            top: 64, // AppBar height
            height: 'calc(100% - 64px)',
            backgroundColor: theme.custom.glass.background,
            backdropFilter: 'blur(12px)',
            borderRight: `1px solid ${theme.custom.glass.border}`,
            boxShadow: theme.custom.glass.shadow,
            transform: sideMenuVisible ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease, opacity 0.3s ease',
            overflow: 'hidden', // Prevent horizontal scroll
            overflowY: 'auto', // Allow vertical scroll only
          },
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          overflow: 'hidden' // Prevent horizontal scroll
        }}>
          {/* Toolbar buttons */}
          <List sx={{ py: 1 }}>
            <ListItem disablePadding sx={{ display: 'block', textAlign: 'center', mb: 1 }}>
              <IconButton onClick={toggleDrawerExpansion} sx={{ mx: 'auto' }}>
                {expandedDrawer ? <ChevronLeftIcon /> : <ChevronRightIcon />}
              </IconButton>
            </ListItem>
            
            <Divider sx={{ my: 1, borderColor: theme.palette.divider }} />            {/* Zoom and Pan Controls */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                px: 1,
                mb: 2,
                gap: 0.5
              }}
            >
              <Tooltip title={t('editor.search')} placement="right">
                <span>
                  <Button
                    onClick={handleOpenSearchDialog}
                    variant="outlined"
                    size="small"
                    disabled={!scriptId || nodes.length === 0 || scriptLines.length === 0}
                    sx={{
                      justifyContent: expandedDrawer ? 'flex-start' : 'center',
                      minWidth: expandedDrawer ? 'auto' : 40,
                      width: '100%'
                    }}
                  >
                    <SearchIcon fontSize="small" />
                    {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.search')}</Typography>}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={t('editor.zoomIn')} placement="right">
                <Button
                  onClick={handleZoomIn}
                  variant="outlined"
                  size="small"
                  sx={{ 
                    justifyContent: expandedDrawer ? 'flex-start' : 'center',
                    minWidth: expandedDrawer ? 'auto' : 40,
                    width: '100%'
                  }}
                >
                  <ZoomInIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.zoomIn')}</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title={t('editor.zoomOut')} placement="right">
                <Button
                  onClick={handleZoomOut}
                  variant="outlined"
                  size="small"
                  sx={{ 
                    justifyContent: expandedDrawer ? 'flex-start' : 'center',
                    minWidth: expandedDrawer ? 'auto' : 40,
                    width: '100%'
                  }}
                >
                  <ZoomOutIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.zoomOut')}</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title={t('editor.branchTool')} placement="right">
                <span>
                  <Button
                    onClick={toggleBranchTool}
                    variant={branchToolActive ? 'contained' : 'outlined'}
                    size="small"
                    disabled={!scriptId}
                    sx={{
                      justifyContent: expandedDrawer ? 'flex-start' : 'center',
                      minWidth: expandedDrawer ? 'auto' : 40,
                      width: '100%'
                    }}
                  >
                    <InputIcon fontSize="small" />
                    {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.branchTool')}</Typography>}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={t('editor.panMode')} placement="right">
                <Button
                  onClick={togglePanMode}
                  variant={isPanMode ? "contained" : "outlined"}
                  size="small"
                  sx={{ 
                    justifyContent: expandedDrawer ? 'flex-start' : 'center',
                    minWidth: expandedDrawer ? 'auto' : 40,
                    width: '100%'
                  }}
                >
                  <PanToolIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.panMode')}</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title={t('editor.minimap')} placement="right">
                <Button 
                  onClick={toggleMinimap} 
                  variant={showMinimap ? "contained" : "outlined"}
                  size="small"
                  sx={{ 
                    justifyContent: expandedDrawer ? 'flex-start' : 'center',
                    minWidth: expandedDrawer ? 'auto' : 40,
                    width: '100%'
                  }}
                >
                  <ViewComfyIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>{t('editor.minimap')}</Typography>}
                </Button>
              </Tooltip>
            </Box>
            
            <Divider sx={{ my: 1, borderColor: theme.palette.divider }} />
          </List>

          {/* Active Users section */}
          <Typography
            variant="subtitle2"
            sx={{
              px: expandedDrawer ? 2 : 'auto',
              py: 1,
              textAlign: expandedDrawer ? 'left' : 'center',
              color: theme.palette.text.secondary,
              fontWeight: 500,
            }}
          >
            {expandedDrawer ? t('sidebar.activeUsers') : t('nav.users')}
          </Typography>

          <List sx={{ py: 0 }}>
            {combinedUsers.map((user) => {
              const statusInfo = getStatusColor(user.status, theme);
              
              return (
                <ListItem
                  key={user.user_id}
                  sx={{
                    py: 1,
                    px: expandedDrawer ? 2 : 1,
                    flexDirection: expandedDrawer ? 'row' : 'column',
                    alignItems: expandedDrawer ? 'center' : 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Box sx={{ position: 'relative', mb: expandedDrawer ? 0 : 1 }}>
                    <Avatar 
                      sx={{ 
                        width: 36, 
                        height: 36, 
                        bgcolor: user.status === 'editing' ? theme.palette.success.main : theme.palette.primary.main,
                        fontSize: '1rem',
                        fontWeight: 600,
                      }}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box 
                      sx={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: statusInfo.color,
                        border: '2px solid',
                        borderColor: theme.palette.background.paper,
                      }}
                    />
                  </Box>
                  
                  {expandedDrawer && (
                    <Box sx={{ ml: 1.5, display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                        {user.username}
                      </Typography>
                      <Chip 
                        label={t(`editor.status.${user.status}`)}
                        size="small"
                        sx={{ 
                          height: 20, 
                          fontSize: '0.7rem',
                          backgroundColor: alpha(statusInfo.color, theme.custom.statusChipAlpha),
                          color: statusInfo.color,
                          fontWeight: 600,
                          mt: 0.5,
                        }} 
                      />
                    </Box>
                  )}
                  
                  {!expandedDrawer && (
                    <Tooltip title={`${user.name} - ${t(`editor.status.${user.status}`)}`} placement="right">
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontSize: '0.7rem',
                          color: statusInfo.color,
                          fontWeight: 600,
                        }}
                      >
                        {t(`editor.status.${user.status}`)}
                      </Typography>
                    </Tooltip>
                  )}
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>

      {/* Main editor content - full screen */}
      <Box
        component="main"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          padding: 0,
          margin: 0,
          zIndex: 1, // Base layer
          overflow: 'hidden',
        }}
      >
        <EditorContainer className={branchToolActive ? 'branch-tool-active' : undefined}>
          {/* Loading project state */}
          {isLoadingProject && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                p: 3,
              }}
            >
              <CircularProgress size={60} sx={{ mb: 2 }} />
              <Typography variant="h6">
                {t('editor.loadingProject')}
              </Typography>
            </Box>
          )}

          {/* Project loaded but no script selected */}
          {!scriptId && !isLoading && !isLoadingProject && currentProject && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                p: 3,
                maxWidth: '800px',
                margin: '0 auto',
              }}
            >
              <Typography variant="h4" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
                {currentProject.name}
              </Typography>
              {currentProject.description && (
                <Typography variant="body1" sx={{ mb: 4, textAlign: 'center', color: 'text.secondary' }}>
                  {currentProject.description}
                </Typography>
              )}
              
              {/* Show existing scripts if any */}
              {currentProject.scripts && currentProject.scripts.length > 0 && (
                <Box sx={{ mb: 4, width: '100%' }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('editor.existingScripts')}
                  </Typography>
                  <Grid container spacing={2}>
                    {currentProject.scripts.map((script: any) => (
                      <Grid item xs={12} sm={6} md={4} key={script.id}>
                        <Card 
                          sx={{ 
                            cursor: 'pointer',
                            '&:hover': { 
                              boxShadow: 4,
                              transform: 'translateY(-2px)',
                            },
                            transition: 'all 0.2s ease-in-out'
                          }}                          onClick={() => {
                            // Load existing script
                            handleLoadExistingScript(script.id, script.filename);
                          }}
                        >
                          <CardContent>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                              {script.filename}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {t('editor.clickToOpen')}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
              
              {/* Action buttons */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    component="label"
                    variant="contained"
                    size="large"
                    sx={{ px: 3, py: 1.5 }}
                  >
                    {t('editor.uploadScript')}
                    <input
                      type="file"
                      accept=".rpy"
                      onChange={handleFileChange}
                      hidden
                    />
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={handleCreateNew}
                    sx={{ px: 3, py: 1.5 }}
                  >
                    {t('editor.createNewScript')}
                  </Button>
                </motion.div>
              </Box>
            </Box>
          )}

          {/* No project selected (fallback to project selection) */}
          {!scriptId && !isLoading && !isLoadingProject && !currentProject && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                p: 3,
                backgroundColor: theme.custom.fileOptions.background,
                border: `1px solid ${theme.custom.fileOptions.border}`,
                borderRadius: '8px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>
                {t('editor.getStarted')}
              </Typography>              <Typography variant="body1" sx={{ mb: 4, maxWidth: 500, textAlign: 'center' }}>
                {currentProject ? 
                  t('editor.workingWithProject', { projectName: currentProject.name }) :
                  t('editor.loadingProject')
                }
              </Typography>
              
              {/* Show existing scripts in project */}
              {currentProject?.scripts && currentProject.scripts.length > 0 && (
                <Box sx={{ mb: 3, minWidth: 400 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('editor.existingScripts')}
                  </Typography>
                  <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                    {currentProject.scripts.map((script) => (
                      <ListItem 
                        key={script.id} 
                        button
                        onClick={() => handleLoadExistingScript(script.id, script.filename)}
                        sx={{ 
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1
                        }}
                      >
                        <ListItemText 
                          primary={script.filename}
                          secondary={`Last updated: ${new Date(script.updated_at).toLocaleDateString()}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                }}
              >
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    component="label"
                    variant="contained"
                    size="large"
                    sx={{ px: 3, py: 1.5 }}
                  >
                    {t('editor.openFile')}
                    <input
                      type="file"
                      accept=".rpy"
                      onChange={handleFileChange}
                      hidden
                    />
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={handleCreateNew}
                    sx={{ px: 3, py: 1.5 }}
                  >
                    {t('editor.createNew')}
                  </Button>
                </motion.div>
              </Box>
            </Box>
          )}

          {/* Loading state */} 
          {isLoading && (
            <Box
              sx={{
                // Use theme for styling
                backgroundColor: theme.custom.loading.background,
                border: `1px solid ${theme.custom.loading.border}`,
                borderRadius: '4px',
                p: 3,
                backdropFilter: 'blur(8px)',
                display: 'inline-block', // Correctly placed inside sx
                position: 'absolute', 
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 5, 
              }}
            >
              <Typography variant="h6">{t('editor.loading')}</Typography>
            </Box>
          )}

          {/* Error state */} 
          {error && (
            <Box
              sx={{
                // Use theme for styling
                backgroundColor: theme.custom.error.background,
                border: `1px solid ${theme.custom.error.border}`,
                color: theme.custom.error.color,
                borderRadius: '4px',
                p: 3,
                backdropFilter: 'blur(8px)',
                display: 'inline-block', // Correctly placed inside sx
                position: 'absolute', 
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 5, 
              }}
            >
              <Typography variant="h6">{t('editor.error', { error })}</Typography>
            </Box>
          )}

          {scriptId && !isLoading && !error && (
            <Box sx={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%',
              zIndex: 10 // Ensure it's at the right layer in the stack
            }} className="flow-canvas-container">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                className="flow-canvas"
                edgeTypes={edgeTypes}
                nodeTypes={visualNodeTypes}
                nodesConnectable={false}
                nodesDraggable={true}
                defaultViewport={{ x: 0, y: 0, zoom: zoom }}
                minZoom={0.05} // Set minimum zoom to 0.05 (much more zoomed out)
                maxZoom={10}   // Allow a bit more zoom in too
                panOnScroll={true}
                panOnDrag={true}
                selectionOnDrag={false}
                zoomOnScroll={true}
                zoomOnPinch={true}
                preventScrolling={true}
              >
                <Background color={theme.palette.divider} />
                <Controls />
                {showMinimap && (
                  <MiniMap
                    nodeColor={(node) => {
                      const customColors = theme.custom?.nodeColors ?? {};
                      return (
                        (node.data as any)?.display?.accentColor
                        || customColors[node.data?.originalData?.node_type]
                        || customColors.action
                        || theme.palette.primary.main
                      );
                    }}
                  />
                )}
              </ReactFlow>
            </Box>
          )}
          <Menu
            open={Boolean(branchMenuPosition)}
            onClose={handleBranchMenuClose}
            anchorReference="anchorPosition"
            anchorPosition={branchMenuPosition ? { top: branchMenuPosition.mouseY, left: branchMenuPosition.mouseX } : undefined}
          >
            <MenuItem onClick={() => handleBranchOptionSelect('menu')}>
              {t('editor.branchMenuOption')}
            </MenuItem>
            <MenuItem onClick={() => handleBranchOptionSelect('condition')}>
              {t('editor.branchConditionOption')}
            </MenuItem>
          </Menu>
          <MenuBranchDialog
            open={activeBranchDialog === 'menu'}
            onClose={handleBranchDialogClose}
            onSubmit={handleMenuDialogSubmit}
            nodeName={selectedBranchNodeName || t('editor.nodeEditor.unnamed')}
            indentation={branchIndentation}
            submitting={isBranchSubmitting}
          />
          <ConditionBranchDialog
            open={activeBranchDialog === 'condition'}
            onClose={handleBranchDialogClose}
            onSubmit={handleConditionDialogSubmit}
            nodeName={selectedBranchNodeName || t('editor.nodeEditor.unnamed')}
            indentation={branchIndentation}
            submitting={isBranchSubmitting}
          />
        </EditorContainer>
      </Box>

      <Dialog
        open={isSearchDialogOpen}
        onClose={handleCloseSearchDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('editor.search')}</DialogTitle>
        <DialogContent dividers>
          <TextField
            inputRef={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('editor.searchPlaceholder')}
            fullWidth
            margin="dense"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <List sx={{ mt: 2, maxHeight: 320, overflowY: 'auto' }}>
            {searchQuery.trim() && searchResults.length === 0 && (
              <ListItem>
                <ListItemText primary={t('editor.searchNoResults')} />
              </ListItem>
            )}
            {searchResults.map((result) => (
              <ListItemButton
                key={`${result.nodeId}-${result.lineNumber}`}
                onClick={() => handleSearchResultClick(result)}
              >
                <ListItemText
                  primary={result.text}
                  secondary={t('editor.searchResultInfo', {
                    line: result.lineNumber + 1,
                    label: result.labelName || t('editor.defaultLabel')
                  })}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSearchDialog}>{t('button.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Node Editor Popup */}
      {selectedNodeForEdit && scriptId && (
        <NodeEditorPopup
          open={isEditorPopupOpen}
          onClose={handleCloseEditorPopup}
          nodeData={selectedNodeForEdit}
          initialContent={editorInitialContent}
          scriptId={scriptId}
          onSave={handleSaveNodeContent}
          onSwitchToGlobal={handleSwitchToGlobalEditor}
          isLoading={isFetchingNodeContent}
          projectTags={projectTags}
          onProjectTagsChange={handleProjectTagsChange}
        />
      )}

      {/* Snackbar для уведомлений */}
      <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
          <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
              {snackbarMessage}
          </Alert>
      </Snackbar>
    </Box>
  );
};

// Wrapped component with ReactFlowProvider
const EditorPage: React.FC = () => {
  return (
    <ReactFlowProvider>
      <EditorPageInternal />
    </ReactFlowProvider>
  );
};

export default EditorPage;
