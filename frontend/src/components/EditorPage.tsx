import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  MiniMap,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  useReactFlow // Add this import
} from 'reactflow';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  List,
  ListItem,
  ButtonGroup,
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
  Paper
} from '@mui/material';
import { styled } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import PanToolIcon from '@mui/icons-material/PanTool';
import ViewComfyIcon from '@mui/icons-material/ViewComfy';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';

// Import services from TypeScript files
import { parseScript, createNewScript } from '../services/api';
import { transformTreeToFlow } from '../utils/flowTransformer';
import './EditorPage.css';

// Width for the editor toolbar drawer
const drawerWidth = 60;
const expandedDrawerWidth = 240;

// Interface for user with status
interface ActiveUser {
  id: number;
  name: string;
  status: 'online' | 'editing' | 'afk' | 'away';
}

// Mock active users data with statuses
const activeUsers: ActiveUser[] = [
  { id: 1, name: 'User 1', status: 'editing' },
  { id: 2, name: 'User 2', status: 'online' },
  { id: 3, name: 'User 3', status: 'afk' },
];

// Status color mapping
const getStatusColor = (status: string, theme: any) => {
  switch (status) {
    case 'editing':
      return { color: theme.palette.success.main, label: 'Editing' };
    case 'online':
      return { color: theme.palette.info.main, label: 'Online' };
    case 'afk':
      return { color: theme.palette.warning.main, label: 'AFK' };
    case 'away':
      return { color: theme.palette.error.main, label: 'Away' };
    default:
      return { color: theme.palette.grey[500], label: 'Unknown' };
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

const EditorPageInternal: React.FC = () => {
  const theme = useTheme();
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('test project');
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true); // Changed to true by default
  const [expandedDrawer, setExpandedDrawer] = useState<boolean>(false);
  const [sideMenuVisible, setSideMenuVisible] = useState<boolean>(true); // New state for completely hiding/showing the drawer
  
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

  // Function to handle node clicks
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    console.log('Clicked node:', node);
    // Later: Open CodeMirror popup slice editor
  }, []);

  // Effect to extract LabelBlocks and set up tabs when parsedData changes
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
          // ...existing code for handling nodes object...
        }
        
        console.log('Extracted LabelBlocks:', extractedLabelBlocks);
        
        // If we still haven't found any LabelBlocks, create a default one
        if (extractedLabelBlocks.length === 0) {
          console.log('No LabelBlocks found, creating a default one');
          extractedLabelBlocks.push({
            id: 'default-label',
            name: 'Main Script'
          });
        }
        
        // Set the extracted label blocks
        setLabelBlocks(extractedLabelBlocks);
        
        // Set active tab to the first LabelBlock or maintain current selection if valid
        if (extractedLabelBlocks.length > 0) {
          if (!activeTabId || !extractedLabelBlocks.some(lb => lb.id === activeTabId)) {
            setActiveTabId(extractedLabelBlocks[0].id);
          }
        }
      } catch (error) {
        console.error('Error extracting LabelBlocks:', error);
        
        // Create a default tab in case of error
        const defaultLabelBlock = { id: 'default-label', name: 'Main Script' };
        setLabelBlocks([defaultLabelBlock]);
        setActiveTabId(defaultLabelBlock.id);
      }
    } else {
      // Reset LabelBlocks and active tab when there's no parsed data
      setLabelBlocks([]);
      setActiveTabId(null);
    }
  }, [parsedData, activeTabId]);

  // Effect to transform data when parsedData and activeTabId change
  useEffect(() => {
    if (parsedData && activeTabId) {
      try {
        // Pass activeTabId to transformTreeToFlow to filter nodes
        const { initialNodes, initialEdges } = transformTreeToFlow(parsedData, theme, activeTabId);
        console.log("Generated Nodes for tab:", activeTabId, initialNodes);
        console.log("Generated Edges for tab:", activeTabId, initialEdges);
        setNodes(initialNodes);
        setEdges(initialEdges);
        
        // Center view on the new nodes when they're loaded
        setTimeout(() => {
          if (reactFlowInstance && initialNodes.length > 0) {
            // Find the label block node to center on
            const labelNode = initialNodes.find(
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
  }, [parsedData, activeTabId, setNodes, setEdges, theme, reactFlowInstance]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.rpy')) {
      setError('Invalid file type. Please select a .rpy file.');
      return;
    }

    // Basic size check
    if (file.size > 1 * 1024 * 1024) {
      setError('File is too large (max 1MB).');
      return;
    }

    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setNodes([]);
    setEdges([]);

    try {
      const data = await parseScript(file);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree);
      console.log('Parsed data:', data);
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to parse script.');
      setScriptId(null);
      setFileName('');
      setParsedData(null);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  }, [setNodes, setEdges]);

  const handleCreateNew = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setNodes([]);
    setEdges([]);

    try {
      const timestamp = new Date().getTime();
      const newFilename = `new_script_${timestamp.toString(16)}.rpy`;
      const data = await createNewScript(newFilename);
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
  }, [setNodes, setEdges]);

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

  // Handle tab change with smooth centering
  const handleTabChange = (event: React.SyntheticEvent, newTabId: string) => {
    setActiveTabId(newTabId);
  };

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
          </Box>

          {scriptId && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ opacity: 0.7 }}>
                Editing: {fileName} (ID: {scriptId})
              </Typography>
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
          transition: 'all 0.3s ease',
          '& .MuiDrawer-paper': {
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
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Toolbar buttons */}
          <List sx={{ py: 1 }}>
            <ListItem disablePadding sx={{ display: 'block', textAlign: 'center', mb: 1 }}>
              <IconButton onClick={toggleDrawerExpansion} sx={{ mx: 'auto' }}>
                {expandedDrawer ? <ChevronLeftIcon /> : <ChevronRightIcon />}
              </IconButton>
            </ListItem>
            
            <Divider sx={{ my: 1, borderColor: theme.palette.divider }} />

            {/* Zoom and Pan Controls */}
            <ButtonGroup
              orientation="vertical"
              variant="outlined"
              size="small"
              sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                px: 1, 
                mb: 2,
                width: '100%'
              }}
            >
              <Tooltip title="Zoom In" placement="right">
                <Button 
                  onClick={handleZoomIn} 
                  sx={{ mb: 0.5, justifyContent: expandedDrawer ? 'flex-start' : 'center' }}
                >
                  <ZoomInIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>Zoom In</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title="Zoom Out" placement="right">
                <Button 
                  onClick={handleZoomOut} 
                  sx={{ mb: 0.5, justifyContent: expandedDrawer ? 'flex-start' : 'center' }}
                >
                  <ZoomOutIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>Zoom Out</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title="Toggle Pan Mode" placement="right">
                <Button 
                  onClick={togglePanMode} 
                  variant={isPanMode ? "contained" : "outlined"}
                  sx={{ mb: 0.5, justifyContent: expandedDrawer ? 'flex-start' : 'center' }}
                >
                  <PanToolIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>Pan Mode</Typography>}
                </Button>
              </Tooltip>
              <Tooltip title="Toggle Minimap" placement="right">
                <Button 
                  onClick={toggleMinimap} 
                  variant={showMinimap ? "contained" : "outlined"}
                  sx={{ justifyContent: expandedDrawer ? 'flex-start' : 'center' }}
                >
                  <ViewComfyIcon fontSize="small" />
                  {expandedDrawer && <Typography sx={{ ml: 1 }}>Minimap</Typography>}
                </Button>
              </Tooltip>
            </ButtonGroup>
            
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
            {expandedDrawer ? 'Active Users' : 'Users'}
          </Typography>

          <List sx={{ py: 0 }}>
            {activeUsers.map((user) => {
              const statusInfo = getStatusColor(user.status, theme);
              
              return (
                <ListItem 
                  key={user.id} 
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
                      {user.name.charAt(0)}
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
                        {user.name}
                      </Typography>
                      <Chip 
                        label={statusInfo.label}
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
                    <Tooltip title={`${user.name} - ${statusInfo.label}`} placement="right">
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          fontSize: '0.7rem',
                          color: statusInfo.color,
                          fontWeight: 600,
                        }}
                      >
                        {statusInfo.label}
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
        <EditorContainer>
          {!scriptId && !isLoading && (
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
                Get Started
              </Typography>
              <Typography variant="body1" sx={{ mb: 4, maxWidth: 500, textAlign: 'center' }}>
                Open an existing Ren'Py script (.rpy) or create a new one to start visualizing your story.
              </Typography>
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
                    Open .rpy File
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
                    Create New Script
                  </Button>
                </motion.div>
              </Box>
            </Box>
          )}

          {/* Loading state */} 
          {isLoading && (
            <Box
              sx={{
                // ... existing layout styles ...
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
              <Typography variant="h6">Loading...</Typography>
            </Box>
          )}

          {/* Error state */} 
          {error && (
            <Box
              sx={{
                // ... existing layout styles ...
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
              <Typography variant="h6">Error: {error}</Typography>
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
                fitView
                className="flow-canvas"
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
                {showMinimap && <MiniMap nodeColor={(node) => theme.custom.nodeColors[node.data?.originalData?.node_type] || theme.custom.nodeColors.action} />}
              </ReactFlow>
            </Box>
          )}
        </EditorContainer>
      </Box>
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
