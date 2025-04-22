import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Drawer,
  Box,
  Divider,
  Badge,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Avatar
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SaveIcon from '@mui/icons-material/Save';
import PeopleIcon from '@mui/icons-material/People';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import HomeIcon from '@mui/icons-material/Home';
import HistoryIcon from '@mui/icons-material/History';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCollab } from '../../contexts/CollabContext';
import { UsersList } from './UsersList';
import { CollabNotifications } from './CollabNotifications';
import theme from "../../themes/light"

interface EditorToolbarProps {
  scriptId?: string;
  scriptName?: string;
  onSave?: () => void;
  onOpenFullEditor?: () => void;
  onExitEditor?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  scriptId,
  scriptName = 'Untitled Script',
  onSave,
  onOpenFullEditor,
  onExitEditor
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { projectUsers, scriptUsers, nodeLocks } = useCollab();
  
  // State for drawer and menus
  const [usersDrawerOpen, setUsersDrawerOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<null | HTMLElement>(null);
  
  // User menu handlers
  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };
  
  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };
  
  // Actions menu handlers
  const handleActionsMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setActionsMenuAnchor(event.currentTarget);
  };
  
  const handleActionsMenuClose = () => {
    setActionsMenuAnchor(null);
  };
  
  // Drawer handlers
  const toggleUsersDrawer = () => {
    setUsersDrawerOpen(!usersDrawerOpen);
  };
  
  // Handle logout
  const handleLogout = () => {
    handleUserMenuClose();
    logout();
    navigate('/login');
  };
  
  // Handle navigation to home
  const handleHomeClick = () => {
    if (onExitEditor) {
      onExitEditor();
    } else {
      navigate('/');
    }
  };
  
  // Format user initials for avatar
  const getUserInitials = () => {
    if (!user || !user.username) return '?';
    return user.username.substring(0, 2).toUpperCase();
  };
  
  // Generate random color for user avatar (consistent for same user)
  const getUserAvatarColor = () => {
    if (!user || !user.username) return theme.palette.primary.main;
    
    const colors = [
      '#f44336', '#e91e63', '#9c27b0', '#673ab7',
      '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
      '#009688', '#4caf50', '#8bc34a', '#cddc39',
      '#ffc107', '#ff9800', '#ff5722'
    ];
    
    let hash = 0;
    for (let i = 0; i < user.username.length; i++) {
      hash = user.username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };
  
  return (
    <>
      <AppBar position="fixed" color="default" elevation={1}>
        <Toolbar>
          {/* Left section: Home button and script title */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: { xs: 1, md: 0 } }}>
            <Tooltip title="Return to dashboard">
              <IconButton 
                edge="start" 
                color="inherit"
                aria-label="home"
                onClick={handleHomeClick}
              >
                <HomeIcon />
              </IconButton>
            </Tooltip>
            
            <Typography 
              variant="h6" 
              noWrap 
              component="div" 
              sx={{ ml: 2, display: { xs: 'none', sm: 'block' } }}
            >
              {scriptName}
            </Typography>
          </Box>
          
          {/* Center section: App title (on medium+ screens) */}
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ 
              flexGrow: 1, 
              textAlign: 'center',
              display: { xs: 'none', md: 'block' }
            }}
          >
            RenPy Visual Editor
          </Typography>
          
          {/* Right section: Action buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Save button */}
            {onSave && (
              <Tooltip title="Save changes">
                <IconButton color="inherit" onClick={onSave}>
                  <SaveIcon />
                </IconButton>
              </Tooltip>
            )}
            
            {/* Users button with badge showing count */}
            <Tooltip title="Show collaborators">
              <IconButton 
                color="inherit" 
                onClick={toggleUsersDrawer}
                sx={{ ml: 1 }}
              >
                <Badge 
                  badgeContent={scriptUsers.length} 
                  color="primary"
                  overlap="circular"
                  max={99}
                >
                  <PeopleIcon />
                </Badge>
              </IconButton>
            </Tooltip>
            
            {/* Node locks indicator */}
            <Tooltip title={`${nodeLocks.length} locked ${nodeLocks.length === 1 ? 'node' : 'nodes'}`}>
              <IconButton color="inherit" sx={{ ml: 1 }}>
                <Badge 
                  badgeContent={nodeLocks.length} 
                  color="warning"
                  overlap="circular"
                  max={99}
                >
                  {nodeLocks.length > 0 ? <LockIcon /> : <LockOpenIcon />}
                </Badge>
              </IconButton>
            </Tooltip>
            
            {/* More actions menu */}
            <Tooltip title="More actions">
              <IconButton 
                color="inherit"
                onClick={handleActionsMenuOpen}
                sx={{ ml: 1 }}
              >
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
            
            {/* User avatar */}
            <Tooltip title={user?.username || 'User'}>
              <IconButton
                onClick={handleUserMenuOpen}
                sx={{ ml: 1 }}
                size="small"
              >
                <Avatar 
                  sx={{ 
                    bgcolor: getUserAvatarColor(),
                    width: 32,
                    height: 32
                  }}
                >
                  {getUserInitials()}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>
      
      {/* User menu */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={handleUserMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle1">{user?.username}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <CloseIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
      
      {/* Actions menu */}
      <Menu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleActionsMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {onOpenFullEditor && (
          <MenuItem onClick={() => {
            handleActionsMenuClose();
            onOpenFullEditor();
          }}>
            <ListItemIcon>
              <CodeIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Open Full Editor</ListItemText>
          </MenuItem>
        )}
        
        <MenuItem onClick={handleActionsMenuClose}>
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View History</ListItemText>
        </MenuItem>
      </Menu>
      
      {/* Users drawer */}
      <Drawer
        anchor="right"
        open={usersDrawerOpen}
        onClose={() => setUsersDrawerOpen(false)}
      >
        <Box
          sx={{ width: 300, p: 2 }}
          role="presentation"
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Collaborators</Typography>
            <IconButton onClick={() => setUsersDrawerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <UsersList
            users={scriptUsers}
            title="Users Editing This Script"
            currentScriptId={scriptId}
            emptyMessage="No one is editing this script"
          />
          
          <UsersList
            users={projectUsers.filter(
              u => !scriptUsers.some(su => su.user_id === u.user_id)
            )}
            title="Other Project Members"
            emptyMessage="No other project members online"
          />
        </Box>
      </Drawer>
      
      {/* Real-time notifications */}
      <CollabNotifications currentScriptId={scriptId} />
    </>
  );
};
