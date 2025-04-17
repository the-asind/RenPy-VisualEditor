import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';

import { parseScript, createNewScript } from '../services/api';
import { transformTreeToFlow } from '../utils/flowTransformer'; 
import './EditorPage.css';
import logo from '../assets/logo.svg'; // Add a logo to your assets folder

const EditorPageInternal = () => {
  const [scriptId, setScriptId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Function to handle node clicks (placeholder for now)
  const onNodeClick = useCallback((event, node) => {
    console.log('Clicked node:', node);
    // Later: Open local editor popup
  }, []);

  // Effect to transform data when parsedData changes
  useEffect(() => {
    if (parsedData) {
      try {
        const { initialNodes, initialEdges } = transformTreeToFlow(parsedData);
        console.log("Generated Nodes:", initialNodes);
        console.log("Generated Edges:", initialEdges);
        setNodes(initialNodes);
        setEdges(initialEdges);
      } catch (transformError) {
        console.error("Error transforming tree to flow:", transformError);
        setError(`Failed to visualize script: ${transformError.message}`);
        setNodes([]);
        setEdges([]);
      }
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [parsedData, setNodes, setEdges]); // Add setNodes, setEdges as dependencies


  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files[0]; // Define file here
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.rpy')) {
      setError('Invalid file type. Please select a .rpy file.');
      return;
    }

    // Basic size check (e.g., 1MB) - backend validates more strictly
    if (file.size > 1 * 1024 * 1024) {
        setError('File is too large (max 1MB).');
        return;
    }

    setIsLoading(true);
    setError(null);
    setParsedData(null); // Clear previous data
    setNodes([]); // Clear flow
    setEdges([]); // Clear flow

    try {
      const data = await parseScript(file);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree); // Store parsed data (triggers useEffect)
      console.log('Parsed data:', data);
    } catch (err) {
      setError(err.detail || err.message || 'Failed to parse script.');
      setScriptId(null);
      setFileName('');
      setParsedData(null); // Ensure parsedData is null on error
    } finally {
      setIsLoading(false);
      event.target.value = null; // Reset file input value so the same file can be selected again
    }
  }, [setNodes, setEdges]); // Add setNodes, setEdges

  const handleCreateNew = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setParsedData(null); // Clear previous data
    setNodes([]); // Clear flow
    setEdges([]); // Clear flow

    try {
      const timestamp = new Date().getTime();
      const newFilename = `new_script_${timestamp.toString(16)}.rpy`; // Define newFilename here
      const data = await createNewScript(newFilename);
      setScriptId(data.script_id);
      setFileName(data.filename);
      setParsedData(data.tree); // Store parsed data (triggers useEffect)
      console.log('Created and parsed new script:', data);
    } catch (err) {
      setError(err.detail || err.message || 'Failed to create new script.');
      setScriptId(null);
      setFileName('');
      setParsedData(null); // Ensure parsedData is null on error
    } finally {
      setIsLoading(false);
    }
  }, [setNodes, setEdges]); // Add setNodes, setEdges

  // Callback for connecting edges (basic implementation)
   const onConnect = useCallback(
     (params) => setEdges((eds) => addEdge(params, eds)),
     [setEdges],
   );

  return (
    <div className="editor-container">
      {/* Header Bar */}
      <header className="editor-header">
        <div className="header-left">
          <div className="logo">
            <img src={logo} alt="Ren'Py Visual Editor" />
            <span>Ren'Py Visual Editor</span>
          </div>
          {scriptId && <div className="file-info">{fileName}</div>}
        </div>
        
        <div className="header-center">
          {scriptId && (
            <div className="editor-tools">
              <button className="tool-button">Select</button>
              <button className="tool-button">Connect</button>
              <button className="tool-button">Add Node</button>
            </div>
          )}
        </div>
        
        <div className="header-right">
          {scriptId && (
            <>
              <button className="action-button">Save</button>
              <button className="action-button">Export</button>
            </>
          )}
          <button className="action-button">Help</button>
        </div>
      </header>
      
      {/* Main Content Area */}
      <div className="main-content">
        {isLoading && <div className="loading-overlay"><div className="spinner"></div>Loading...</div>}
        {error && <div className="error-toast">Error: {error}</div>}
        
        {/* Welcome Screen */}
        {!scriptId && !isLoading && (
          <div className="welcome-screen">
            <div className="welcome-content">
              <h1>Welcome to Ren'Py Visual Editor</h1>
              <p>Open an existing Ren'Py script (.rpy) or create a new one to get started.</p>
              <div className="welcome-actions">
                <label htmlFor="file-upload" className="button primary-button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="none" d="M0 0h24v24H0z"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" fill="currentColor"/></svg>
                  Open .rpy File
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".rpy"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <button onClick={handleCreateNew} className="button secondary-button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="none" d="M0 0h24v24H0z"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v3H8v2h3v3h2v-3h3v-2h-3v-3zm-6 9h12V9h-5V4H7v16z" fill="currentColor"/></svg>
                  Create New Script
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Editor Canvas */}
        {scriptId && (
          <div className="editor-workspace">
            {/* Left Tools Panel */}
            <div className={`left-panel ${showLeftPanel ? 'expanded' : 'collapsed'}`}>
              <div className="panel-toggle" onClick={() => setShowLeftPanel(!showLeftPanel)}>
                {showLeftPanel ? '◀' : '▶'}
              </div>
              <div className="tool-group">
                <button className="tool-item">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" /></svg>
                  <span>Import</span>
                </button>
                <button className="tool-item">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M14,12H19.5L14,6.5V12M8,5H15L21,11V21A2,2 0 0,1 19,23H8C6.89,23 6,22.1 6,21V18H4V6C4,4.89 4.89,4 6,4H8V5M8,18V21H19V13H13V7H8V18Z" /></svg>
                  <span>Scripts</span>
                </button>
                <button className="tool-item">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z" /></svg>
                  <span>Node Types</span>
                </button>
              </div>
            </div>
            
            {/* Main Flow Canvas */}
            <div className="flow-container">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                edgesConnectable={false}
                nodesDraggable={true}
                nodesConnectable={false}
                maxZoom={8}
                minZoom={0.1}
              >
                <Background />
                <Controls className="flow-controls" />
                <MiniMap className="flow-minimap" />
                <Panel position="top-right" className="flow-panel">
                  <div className="file-details">
                    <span>ID: {scriptId}</span>
                  </div>
                </Panel>
              </ReactFlow>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Wrap the component with ReactFlowProvider
const EditorPage = () => (
  <ReactFlowProvider>
    <EditorPageInternal />
  </ReactFlowProvider>
);

export default EditorPage;