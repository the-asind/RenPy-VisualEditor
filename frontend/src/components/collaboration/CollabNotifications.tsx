import React, { useState, useEffect } from 'react';
import { 
  Snackbar,
  Alert,
  AlertTitle,
  Stack,
  Typography,
  Avatar
} from '@mui/material';
import { useCollab } from '../../contexts/CollabContext';

interface CollabNotification {
  id: string;
  type: 'joined' | 'left' | 'editing' | 'updated' | 'locked' | 'unlocked';
  username: string;
  nodeId?: string;
  timestamp: Date;
  message: string;
}

interface CollabNotificationsProps {
  currentScriptId?: string;
  maxNotifications?: number;
}

export const CollabNotifications: React.FC<CollabNotificationsProps> = ({ 
  currentScriptId,
  maxNotifications = 5
}) => {
  const [notifications, setNotifications] = useState<CollabNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<CollabNotification | null>(null);
  
  const { scriptUsers, nodeLocks } = useCollab();
  
  // Effect to handle new users joining
  useEffect(() => {
    const userMap = new Map<string, boolean>();
    
    // Create a notification when a new user joins
    scriptUsers.forEach(user => {
      if (!userMap.has(user.user_id)) {
        const newNotification: CollabNotification = {
          id: `join-${user.user_id}-${new Date().getTime()}`,
          type: 'joined',
          username: user.username,
          timestamp: new Date(),
          message: `${user.username} joined the editing session`
        };
        
        addNotification(newNotification);
        userMap.set(user.user_id, true);
      }
    });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptUsers.length]); // Only trigger when the number of users changes
  
  // Effect to handle node locking changes
  useEffect(() => {
    const lockMap = new Map<string, boolean>();
    
    // Create notifications for new locks
    nodeLocks.forEach(lock => {
      const lockId = `${lock.node_id}-${lock.user_id}`;
      if (!lockMap.has(lockId)) {
        const newNotification: CollabNotification = {
          id: `lock-${lockId}-${new Date().getTime()}`,
          type: 'locked',
          username: lock.username,
          nodeId: lock.node_id,
          timestamp: new Date(),
          message: `${lock.username} locked a node for editing`
        };
        
        addNotification(newNotification);
        lockMap.set(lockId, true);
      }
    });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeLocks.length]); // Only trigger when the number of locks changes
  
  // Function to add a new notification
  const addNotification = (notification: CollabNotification) => {
    setNotifications(prev => {
      // Add new notification to the beginning of the array
      const updated = [notification, ...prev];
      
      // Keep only the most recent notifications up to maxNotifications
      return updated.slice(0, maxNotifications);
    });
    
    // Show the notification
    setCurrentNotification(notification);
    setOpen(true);
  };
  
  // Handle notification close
  const handleClose = () => {
    setOpen(false);
  };
  
  // Custom notifications from collaboration events can be added here
  // This would be triggered from the CollabContext event listeners
  
  return (
    <>
      {currentNotification && (
        <Snackbar 
          open={open} 
          autoHideDuration={5000} 
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert 
            severity={
              currentNotification.type === 'joined' ? 'info' :
              currentNotification.type === 'left' ? 'warning' :
              currentNotification.type === 'editing' ? 'info' :
              currentNotification.type === 'updated' ? 'success' :
              currentNotification.type === 'locked' ? 'warning' :
              'info'
            }
            onClose={handleClose}
            sx={{ 
              width: '100%',
              boxShadow: 3,
              '& .MuiAlert-icon': {
                alignItems: 'center'
              }
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar 
                sx={{ 
                  width: 24, 
                  height: 24,
                  fontSize: '0.75rem',
                  bgcolor: 
                    currentNotification.type === 'joined' ? 'info.main' :
                    currentNotification.type === 'locked' ? 'warning.main' :
                    currentNotification.type === 'updated' ? 'success.main' :
                    'primary.main'
                }}
              >
                {currentNotification.username.substring(0, 2).toUpperCase()}
              </Avatar>
              <div>
                <AlertTitle>
                  {currentNotification.type === 'joined' ? 'User Joined' :
                   currentNotification.type === 'left' ? 'User Left' :
                   currentNotification.type === 'editing' ? 'Editing Started' :
                   currentNotification.type === 'updated' ? 'Node Updated' :
                   currentNotification.type === 'locked' ? 'Node Locked' :
                   'Collaboration Update'}
                </AlertTitle>
                <Typography variant="body2">
                  {currentNotification.message}
                </Typography>
              </div>
            </Stack>
          </Alert>
        </Snackbar>
      )}
    </>
  );
};
