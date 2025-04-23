import React from 'react';
import { 
  Box,
  Tooltip,
  Avatar,
  Typography,
  Chip,
  IconButton
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useCollab } from '../../contexts/CollabContext';
import { styled } from '@mui/material/styles';

const LockChip = styled(Chip)(({ theme }) => ({
  position: 'absolute',
  top: -12,
  right: -12,
  zIndex: 5,
  backgroundColor: theme.palette.error.main,
  '& .MuiChip-avatar': {
    width: 24,
    height: 24,
    fontSize: 12
  }
}));

interface NodeLockIndicatorProps {
  nodeId: string;
  className?: string;
  showRequestLock?: boolean;
  onRequestLock?: () => void;
}

export const NodeLockIndicator: React.FC<NodeLockIndicatorProps> = ({
  nodeId,
  className,
  showRequestLock = false,
  onRequestLock
}) => {
  const { isNodeLocked, getNodeLocker, lockNode, releaseNodeLock } = useCollab();
  
  const locked = isNodeLocked(nodeId);
  const locker = locked ? getNodeLocker(nodeId) : null;
  
  // Generate avatar text from username (first two characters)
  const getAvatarText = (username: string): string => {
    return username.substring(0, 2).toUpperCase();
  };

  // Function to handle requesting a lock
  const handleRequestLock = async () => {
    const success = await lockNode(nodeId);
    if (success && onRequestLock) {
      onRequestLock();
    }
  };

  // Function to release a lock
  const handleReleaseLock = () => {
    releaseNodeLock(nodeId);
  };
  
  if (locked && locker) {
    return (
      <Tooltip
        title={`Locked by ${locker.username}`}
        placement="top"
        arrow
      >
        <LockChip
          className={className}
          icon={<LockIcon />}
          label={locker.username}
          avatar={<Avatar>{getAvatarText(locker.username)}</Avatar>}
        />
      </Tooltip>
    );
  }
  
  if (showRequestLock) {
    return (
      <Tooltip title="Click to lock for editing" placement="top" arrow>
        <Box className={className} sx={{ position: 'absolute', top: -12, right: -12, zIndex: 5 }}>
          <IconButton
            size="small"
            onClick={handleRequestLock}
            color="primary"
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              boxShadow: 1,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 1)',
              }
            }}
          >
            <LockOpenIcon fontSize="small" />
          </IconButton>
        </Box>
      </Tooltip>
    );
  }
  
  return null;
};

// Component to show active users editing a specific node
interface NodeEditorsProps {
  nodeId: string;
  showUserCount?: boolean;
}

export const NodeEditors: React.FC<NodeEditorsProps> = ({ nodeId, showUserCount = true }) => {
  const { scriptUsers } = useCollab();
  
  // TODO: In a real app, it should track which user is editing which node through WebSocket messages
  const editorsForNode: string[] = [];
  
  if (editorsForNode.length === 0) return null;
  
  return (
    <Box 
      sx={{ 
        position: 'absolute',
        bottom: -10,
        right: -10,
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.paper',
        boxShadow: 1,
        borderRadius: 10,
        px: 1,
        py: 0.5
      }}
    >
      {showUserCount && (
        <Typography variant="caption" sx={{ mr: 1 }}>
          {editorsForNode.length}
        </Typography>
      )}
      
      <AvatarGroup max={3}>
        {editorsForNode.map(username => (
          <Tooltip key={username} title={`${username} is viewing`}>
            <Avatar 
              sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
            >
              {username.substring(0, 2).toUpperCase()}
            </Avatar>
          </Tooltip>
        ))}
      </AvatarGroup>
    </Box>
  );
};

// Temporary component definition to avoid errors 
// Replace this with an actual import from Material UI
// This is to simulate the AvatarGroup component
const AvatarGroup: React.FC<{
  max?: number;
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex' }}>
      {children}
    </Box>
  );
};
