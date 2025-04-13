import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  ReactFlowProvider // Import Provider
} from 'reactflow';
import 'reactflow/dist/style.css'; // Import React Flow styles

import { parseScript, createNewScript } from '../services/api';
import { transformTreeToFlow } from '../utils/flowTransformer'; // We will create this utility
import './EditorPage.css';

const EditorPageInternal = () => { // Renamed to avoid conflict with export
  const [scriptId, setScriptId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);

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
    <div className="editor-page">
      <h1>Ren'Py Visual Editor</h1>

      {isLoading && <div className="loading">Loading...</div>}
      {error && <div className="error-message">Error: {error}</div>}

      {!scriptId && !isLoading && (
        // ... existing file options div ...
        <div className="file-options">
          <h2>Get Started</h2>
          <p>Open an existing Ren'Py script (.rpy) or create a new one.</p>
          <div className="button-group">
             <label htmlFor="file-upload" className="button button-open">
                Open .rpy File
             </label>
             <input
                id="file-upload"
                type="file"
                accept=".rpy"
                onChange={handleFileChange}
                style={{ display: 'none' }} // Hide the default input
             />
            <button onClick={handleCreateNew} className="button button-create">
              Create New Script
            </button>
          </div>
        </div>
      )}

      {scriptId && (
        <div className="editor-area">
          <h2>Editing: {fileName} (ID: {scriptId})</h2>
          {/* React Flow component will go here */}
          <div style={{ height: '80vh', width: '100%', border: '1px solid #ccc' }}>
             <ReactFlow
               nodes={nodes}
               edges={edges}
               onNodesChange={onNodesChange}
               onEdgesChange={onEdgesChange}
               onConnect={onConnect} // Add onConnect handler
               onNodeClick={onNodeClick} // Add onNodeClick handler
               fitView // Automatically fit the view to the nodes
               className="flow-canvas" // Add a class for potential specific styling
             >
               <Background />
               <Controls />
             </ReactFlow>
          </div>
          {/* Temporary display removed or commented out */}
          {/* <pre>{JSON.stringify(parsedData, null, 2)}</pre> */}
        </div>
      )}
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

