import React from 'react';
import { 
  List, 
  ListItem, 
  ListItemAvatar, 
  ListItemText, 
  Avatar, 
  Box, 
  Typography, 
  Badge, 
  Tooltip,
  Paper
} from '@mui/material';
import { styled } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import { CollaboratorInfo } from '../../contexts/CollabContext';

// Styled components
const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#44b700',
    color: '#44b700',
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    '&::after': {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      animation: 'ripple 1.2s infinite ease-in-out',
      border: '1px solid currentColor',
      content: '""',
    },
  },
  '@keyframes ripple': {
    '0%': {
      transform: 'scale(.8)',
      opacity: 1,
    },
    '100%': {
      transform: 'scale(2.4)',
      opacity: 0,
    },
  },
}));

interface UserStatusProps {
  user: CollaboratorInfo;
  currentScriptId?: string;
}

const UserStatus: React.FC<UserStatusProps> = ({ user, currentScriptId }) => {
  // Determine if user is editing the current script
  const isEditingCurrent = user.editing_script === currentScriptId;
  
  // Generate avatar from username
  const generateAvatarText = (username: string): string => {
    return username.substring(0, 2).toUpperCase();
  };
  
  // Generate random color based on username (consistent for same username)
  const generateAvatarColor = (username: string): string => {
    const colors = [
      '#f44336', '#e91e63', '#9c27b0', '#673ab7', 
      '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
      '#009688', '#4caf50', '#8bc34a', '#cddc39',
      '#ffc107', '#ff9800', '#ff5722'
    ];
    
    // Simple hash function to get consistent color for same username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };
  
  return (
    <ListItem>
      <ListItemAvatar>
        <Tooltip 
          title={`${user.username} is ${isEditingCurrent ? 'editing this script' : 'online'}`} 
          arrow
        >
          <StyledBadge
            overlap="circular"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            variant="dot"
          >
            <Avatar 
              sx={{ 
                bgcolor: generateAvatarColor(user.username),
                width: 40, 
                height: 40
              }}
            >
              {generateAvatarText(user.username)}
            </Avatar>
          </StyledBadge>
        </Tooltip>
      </ListItemAvatar>
      <ListItemText
        primary={user.username}
        secondary={
          isEditingCurrent ? (
            <Typography
              component="span"
              variant="body2"
              color="primary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <EditIcon fontSize="small" />
              Editing this script
            </Typography>
          ) : "Online"
        }
      />
    </ListItem>
  );
};

interface UsersListProps {
  users: CollaboratorInfo[];
  title: string;
  currentScriptId?: string;
  emptyMessage?: string;
}

export const UsersList: React.FC<UsersListProps> = ({
  users,
  title,
  currentScriptId,
  emptyMessage = "No users online"
}) => {
  return (
    <Paper 
      elevation={2}
      sx={{ 
        p: 2,
        mb: 3,
        maxWidth: 320,
        overflow: 'hidden'
      }}
    >
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      
      {users.length > 0 ? (
        <List sx={{ width: '100%' }}>
          {users.map((user) => (
            <UserStatus 
              key={user.user_id} 
              user={user} 
              currentScriptId={currentScriptId} 
            />
          ))}
        </List>
      ) : (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {emptyMessage}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};
