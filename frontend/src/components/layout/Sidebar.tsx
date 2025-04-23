import React from 'react';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Avatar, Box, Fab, Toolbar, Typography, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const drawerWidth = 180;

// Mock data for active users
const activeUsers = [
  { id: 1, name: 'User 1' },
  { id: 2, name: 'User 2' }
];

// Mock data for projects
const projects = [
  { id: 'alpha', name: 'Project Alpha' },
  { id: 'beta', name: 'Project Beta' }
];

interface SidebarProps {
  isEditorMode?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isEditorMode = false }) => {
  const theme = useTheme();
  const location = useLocation();
  const { t } = useTranslation();
  
  // Only show users section in editor mode
  const showActiveUsers = isEditorMode || location.pathname.includes('/editor');
  
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { 
          width: drawerWidth, 
          boxSizing: 'border-box',
          background: theme.palette.mode === 'dark' ? '#1a2544' : undefined,
          borderRight: 'none',
        },
      }}
    >
      <Toolbar /> {/* Offset content below AppBar */}
      <Box sx={{ 
        overflow: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        pt: 2,
        px: 0,
      }}>
        {showActiveUsers && (
          <>
            <Typography 
              component="div" 
              sx={{ 
                px: 3, 
                pb: 1, 
                fontWeight: 600, 
                fontSize: '0.95rem',
                color: theme.palette.text.secondary 
              }}
            >
              {t('sidebar.activeUsers')}
            </Typography>
            <List sx={{ py: 0 }}>
              {activeUsers.map((user) => (
                <ListItem 
                  key={user.id} 
                  sx={{ 
                    py: 1,
                    px: 3,
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'dark' 
                        ? 'rgba(255, 255, 255, 0.05)' 
                        : 'rgba(0, 0, 0, 0.04)'
                    }
                  }}
                >
                  <Avatar 
                    sx={{ 
                      width: 28, 
                      height: 28, 
                      bgcolor: user.id === 1 ? 'primary.main' : 'secondary.main',
                      mr: 2,
                      fontSize: '0.875rem'
                    }}
                  >
                    {user.id}
                  </Avatar>
                  <ListItemText 
                    primary={user.name} 
                    primaryTypographyProps={{ 
                      fontSize: '1rem',
                      fontWeight: 500,
                    }} 
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {showActiveUsers && (
          <>
            <Typography 
              component="div" 
              sx={{ 
                px: 3, 
                py: 1, 
                mt: 2, 
                fontWeight: 600, 
                fontSize: '0.95rem',
                color: theme.palette.text.secondary 
              }}
            >
              {t('nav.projects')}
            </Typography>
            <List sx={{ py: 0 }}>
              {projects.map((project) => (
                <ListItem 
                  key={project.id} 
                  sx={{ 
                    py: 1,
                    px: 3,
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'dark' 
                        ? 'rgba(255, 255, 255, 0.05)' 
                        : 'rgba(0, 0, 0, 0.04)'
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FolderIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary={project.name}
                    primaryTypographyProps={{ 
                      fontSize: '1rem',
                      fontWeight: 400,
                    }} 
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}

        {/* Spacer to push FAB to bottom */}
        <Box sx={{ flexGrow: 1 }} />

        {/* New Project FAB */}
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
          <Fab 
            color="primary" 
            aria-label={t('button.createNewProjectTitle')}
            size="medium"
          >
            <AddIcon />
          </Fab>
        </Box>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
