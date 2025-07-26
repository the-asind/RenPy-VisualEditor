import * as React from 'react';
import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

// Define the types of messages we expect to receive
type MessageTypes = 
  | 'user_joined_project'
  | 'user_left_project'
  | 'user_joined_script'
  | 'user_left_script'
  | 'node_locked'
  | 'node_unlocked'
  | 'node_editing'
  | 'node_updated'
  | 'locks_released'
  | 'active_users'
  | 'node_locks'
  | 'project_shared'
  | 'lock_result'
  | 'error'
  | 'pong';

// Define the structure for collaborator information
export interface CollaboratorInfo {
  user_id: string;
  username: string;
  editing_script: string | null;
}

// Define the structure of node locks
interface NodeLock {
  node_id: string;
  user_id: string;
  username: string;
  locked_at: string;
}

// Define the WebSocket context type
type CollabContextType = {
  // Connection state
  connected: boolean;
  connecting: boolean;
  projectUsers: CollaboratorInfo[];
  scriptUsers: CollaboratorInfo[];
  nodeLocks: NodeLock[];
  
  // Connection methods
  connectToProject: (projectId: string) => void;
  disconnectFromProject: () => void;
  connectToScript: (scriptId: string) => void;
  disconnectFromScript: () => void;
  
  // Editing methods
  lockNode: (nodeId: string) => Promise<boolean>;
  releaseNodeLock: (nodeId: string) => void;
  startEditingNode: (nodeId: string) => void;
  updateNode: (nodeId: string, content: string) => void;
  
  // Helper methods
  isNodeLocked: (nodeId: string) => boolean;
  getNodeLocker: (nodeId: string) => CollaboratorInfo | null;
};

const CollabContext = createContext<CollabContextType | undefined>(undefined);

export function CollabProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token, user } = useAuth();
  
  // WebSocket connections
  const projectWsRef = useRef<WebSocket | null>(null);
  const scriptWsRef = useRef<WebSocket | null>(null);
  
  // Connection state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  
  // Collaboration state
  const [projectUsers, setProjectUsers] = useState<CollaboratorInfo[]>([]);
  const [scriptUsers, setScriptUsers] = useState<CollaboratorInfo[]>([]);
  const [nodeLocks, setNodeLocks] = useState<NodeLock[]>([]);
  
  // Clean up WebSocket connections when component unmounts
  useEffect(() => {
    return () => {
      if (projectWsRef.current) {
        projectWsRef.current.close();
      }
      if (scriptWsRef.current) {
        scriptWsRef.current.close();
      }
    };
  }, []);

  // Connect to a project
  const connectToProject = useCallback((projectId: string) => {
    if (!isAuthenticated || !token) {
      console.error("Cannot connect: Not authenticated");
      return;
    }
    
    setConnecting(true);
    setProjectId(projectId);
    
    // Close existing connection if any
    if (projectWsRef.current) {
      projectWsRef.current.close();
    }
    
    // Determine WebSocket base URL from runtime or build config
    const WS_URL =
      (window as any).RUNTIME_CONFIG?.VITE_WS_URL ||
      import.meta.env.VITE_WS_URL ||
      (window as any).RUNTIME_CONFIG?.VITE_API_URL?.replace(/\/?api$/, '') ||
      import.meta.env.VITE_API_URL?.replace(/\/?api$/, '') ||
      'ws://localhost:9000';

    // Create new connection
    const ws = new WebSocket(`${WS_URL}/api/ws/project/${projectId}?token=${token}`);
    
    ws.onopen = () => {
      console.log(`Connected to project ${projectId}`);
      setConnected(true);
      setConnecting(false);
      
      // Start ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleProjectMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
      setConnecting(false);
    };
    
    ws.onclose = () => {
      console.log('Project WebSocket disconnected');
      setConnected(false);
      setConnecting(false);
    };
    
    projectWsRef.current = ws;
  }, [isAuthenticated, token]);
  
  // Disconnect from project
  const disconnectFromProject = useCallback(() => {
    if (projectWsRef.current) {
      projectWsRef.current.close();
      projectWsRef.current = null;
    }
    
    setProjectId(null);
    setConnected(false);
    setProjectUsers([]);
  }, []);
  
  // Connect to a script
  const connectToScript = useCallback((scriptId: string) => {
    if (!isAuthenticated || !token) {
      console.error("Cannot connect: Not authenticated");
      return;
    }
    
    setScriptId(scriptId);
    
    // Close existing connection if any
    if (scriptWsRef.current) {
      scriptWsRef.current.close();
    }
    
    // Determine WebSocket base URL from runtime or build config
    const WS_URL =
      (window as any).RUNTIME_CONFIG?.VITE_WS_URL ||
      import.meta.env.VITE_WS_URL ||
      (window as any).RUNTIME_CONFIG?.VITE_API_URL?.replace(/\/?api$/, '') ||
      import.meta.env.VITE_API_URL?.replace(/\/?api$/, '') ||
      'ws://localhost:9000';

    // Create new connection
    const ws = new WebSocket(`${WS_URL}/api/ws/script/${scriptId}?token=${token}`);
    
    ws.onopen = () => {
      console.log(`Connected to script ${scriptId}`);
      
      // Start ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleScriptMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('Script WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('Script WebSocket disconnected');
      setScriptUsers([]);
      setNodeLocks([]);
    };
    
    scriptWsRef.current = ws;
  }, [isAuthenticated, token]);
  
  // Disconnect from script
  const disconnectFromScript = useCallback(() => {
    if (scriptWsRef.current) {
      scriptWsRef.current.close();
      scriptWsRef.current = null;
    }
    
    setScriptId(null);
    setScriptUsers([]);
    setNodeLocks([]);
  }, []);
  
  // Handle messages received on the project WebSocket
  const handleProjectMessage = (message: any) => {
    switch (message.type as MessageTypes) {
      case 'user_joined_project':
        // Add new user to project users if not already there
        setProjectUsers(prev => {
          if (!prev.find(u => u.user_id === message.user_id)) {
            return [...prev, {
              user_id: message.user_id,
              username: message.username,
              editing_script: null
            }];
          }
          return prev;
        });
        break;
        
      case 'user_left_project':
        // Remove user from project users
        setProjectUsers(prev => prev.filter(u => u.user_id !== message.user_id));
        break;
        
      case 'active_users':
        // Update full list of active users
        const updatedUsers = message.users.map((user: any) => ({
          user_id: user.user_id,
          username: user.username,
          editing_script: user.editing_script || null
        }));
        setProjectUsers(updatedUsers);
        break;
        
      case 'project_shared':
        // Handle project sharing notification
        console.log(`Project shared with ${message.username}`);
        break;
    
      case 'lock_result':
      // Lock results are handled at the script level
      break;
        
      case 'error':
        console.error(`WebSocket error: ${message.message}`);
        break;
        
      case 'pong':
        // Ping response, do nothing
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  };
  
  // Handle messages received on the script WebSocket
  const handleScriptMessage = (message: any) => {
    switch (message.type as MessageTypes) {
      case 'user_joined_script':
        // Add new user to script users if not already there
        setScriptUsers(prev => {
          if (!prev.find(u => u.user_id === message.user_id)) {
            return [...prev, {
              user_id: message.user_id,
              username: message.username,
              editing_script: scriptId
            }];
          }
          return prev.map(u => 
            u.user_id === message.user_id ? { ...u, editing_script: scriptId } : u
          );
        });
        setProjectUsers(prev => prev.map(u => 
            u.user_id === message.user_id ? { ...u, editing_script: scriptId } : u
        ));
        break;
        
      case 'user_left_script':
        // Remove user from script users
        setScriptUsers(prev => prev.filter(u => u.user_id !== message.user_id));
        setProjectUsers(prev => prev.map(u => 
            u.user_id === message.user_id ? { ...u, editing_script: null } : u
        ));
        break;
        
      case 'node_locked':
        // Add new lock
        setNodeLocks(prev => [
          ...prev, 
          {
            node_id: message.node_id,
            user_id: message.user_id,
            username: message.username,
            locked_at: message.timestamp
          }
        ]);
        break;
        
      case 'node_unlocked':
        // Remove lock
        setNodeLocks(prev => prev.filter(lock => lock.node_id !== message.node_id));
        break;
        
      case 'locks_released':
        // Remove multiple locks
        setNodeLocks(prev => prev.filter(lock => !message.nodes.includes(lock.node_id)));
        break;
        
      case 'node_locks':
        // Update full list of locks
        const updatedLocks = message.locks.map((lock: any) => ({
          node_id: lock.node_id,
          user_id: lock.user_id,
          username: lock.username,
          locked_at: lock.locked_at
        }));
        setNodeLocks(updatedLocks);
        break;
        
      case 'node_editing':
        // Handle notification that someone is editing a node
        console.log(`${message.username} is editing node ${message.node_id}`);
        break;
        
      case 'node_updated':
        // Handle node content update
        console.log(`${message.username} updated node ${message.node_id}`);
        break;
      
      case 'lock_result':
        // Handled separately by lockNode promise
        break;
        
      case 'error':
        console.error(`WebSocket error: ${message.message}`);
        break;
        
      case 'pong':
        // Ping response, do nothing
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  };
  
  // Request a lock on a node
  const lockNode = async (nodeId: string): Promise<boolean> => {
    if (!scriptWsRef.current || !user) {
      return false;
    }
    
    const currentWs = scriptWsRef.current;

    return new Promise((resolve) => {
      const handleLockResult = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'lock_result' && message.node_id === nodeId) {
            currentWs?.removeEventListener('message', handleLockResult);
            resolve(message.success);
          }
        } catch (error) {
          console.error('Error processing lock result:', error);
          currentWs?.removeEventListener('message', handleLockResult);
          resolve(false);
        }
      };
      
      currentWs.addEventListener('message', handleLockResult);
      
      currentWs.send(JSON.stringify({
        type: 'lock_node',
        node_id: nodeId,
        timestamp: new Date().toISOString()
      }));
      
      setTimeout(() => {
        currentWs?.removeEventListener('message', handleLockResult);
        resolve(false); 
      }, 5000);
    });
  };
  
  // Release a lock on a node
  const releaseNodeLock = (nodeId: string) => {
    if (!scriptWsRef.current || !user) {
      return;
    }
    
    scriptWsRef.current.send(JSON.stringify({
      type: 'unlock_node',
      node_id: nodeId,
      timestamp: new Date().toISOString()
    }));
  };
  
  // Notify others that you're editing a node
  const startEditingNode = (nodeId: string) => {
    if (!scriptWsRef.current || !user) {
      return;
    }
    
    scriptWsRef.current.send(JSON.stringify({
      type: 'start_editing',
      node_id: nodeId,
      timestamp: new Date().toISOString()
    }));
  };
  
  // Update node content
  const updateNode = (nodeId: string, content: string) => {
    if (!scriptWsRef.current || !user) {
      return;
    }
    
    scriptWsRef.current.send(JSON.stringify({
      type: 'update_node',
      node_id: nodeId,
      content,
      timestamp: new Date().toISOString()
    }));
  };
  
  // Check if a node is locked
  const isNodeLocked = (nodeId: string): boolean => {
    return nodeLocks.some(lock => lock.node_id === nodeId);
  };
  
  // Get the user who locked a node
  const getNodeLocker = (nodeId: string): CollaboratorInfo | null => {
    const lock = nodeLocks.find(lock => lock.node_id === nodeId);
    if (!lock) return null;
    
    const user = projectUsers.find(u => u.user_id === lock.user_id);

    return user ? {
      user_id: lock.user_id,
      username: lock.username,
      editing_script: user.editing_script
    } : null;
  };
  
  const contextValue = useMemo(
    () => ({
      connected,
      connecting,
      projectUsers,
      scriptUsers,
      nodeLocks,
      connectToProject,
      disconnectFromProject,
      connectToScript,
      disconnectFromScript,
      lockNode,
      releaseNodeLock,
      startEditingNode,
      updateNode,
      isNodeLocked,
      getNodeLocker
    }),
    [
      connected,
      connecting,
      projectUsers,
      scriptUsers,
      nodeLocks,
      connectToProject,
      disconnectFromProject,
      connectToScript,
      disconnectFromScript,
      lockNode,
      releaseNodeLock,
      startEditingNode,
      updateNode,
      isNodeLocked,
      getNodeLocker
    ]
  );

  return (
    <CollabContext.Provider value={contextValue}>
      {children}
    </CollabContext.Provider>
  );
}

export function useCollab() {
  const context = useContext(CollabContext);
  if (context === undefined) {
    throw new Error('useCollab must be used within a CollabProvider');
  }
  return context;
}
