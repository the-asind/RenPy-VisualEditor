import React, { useState, useEffect } from 'react';
import { Box, useMediaQuery, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import FolderIcon from '@mui/icons-material/Folder';
import PeopleIcon from '@mui/icons-material/People';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useTranslation } from 'react-i18next';

import TopBar from './components/layout/TopBar';
import Sidebar from './components/layout/Sidebar';
import AppRoutes from './routes/AppRoutes';

function App() {
  const theme = useTheme();
  const { t } = useTranslation();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [mobileNavValue, setMobileNavValue] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine if we're in the editor mode
  const isEditorMode = location.pathname.includes('/editor');
  const isHomePage = location.pathname === '/';
  const showSidebar = !isEditorMode && !isHomePage;

  // Update mobile nav value based on current route
  useEffect(() => {
    const path = location.pathname;
    if (path === '/') setMobileNavValue(0);
    else if (path.includes('/projects')) setMobileNavValue(1);
    else if (path.includes('/users')) setMobileNavValue(2);
    else if (path.includes('/profile')) setMobileNavValue(3);
    // Add more conditions if needed
  }, [location.pathname]);

  const handleMobileNavChange = (event: React.SyntheticEvent, newValue: number) => {
    setMobileNavValue(newValue);
    switch (newValue) {
      case 0: navigate('/'); break;
      case 1: navigate('/projects'); break; // Assuming /projects route exists
      case 2: navigate('/users'); break; // Assuming /users route exists
      case 3: navigate('/profile'); break; // Assuming /profile route exists
      default: navigate('/');
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      bgcolor: theme.palette.background.default,
      // overflow: 'hidden', // Allow scrolling within child containers
    }}>
      {/* Top Bar - Conditionally rendered */}
      {!isEditorMode && <TopBar />}

      <Box sx={{
        display: 'flex',
        flex: 1,
        // overflow: 'hidden', // Allow child content to scroll
        // Remove top padding in editor mode, apply only when TopBar is visible
        pt: isEditorMode ? 0 : 8
      }}>
        {/* Sidebar - Conditionally rendered (hide on home and editor) */}
        {showSidebar && <Sidebar isEditorMode={isEditorMode} />}

        {/* Main Content Area */} 
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            overflowY: 'auto', // enable vertical scrolling for overflowing content
            p: 0, // Remove padding, pages handle their own
            position: 'relative',
            // Apply padding at the bottom on mobile only when NOT in editor mode
            pb: isMobile && !isEditorMode ? 8 : 0
          }}
        >
          {/* AppRoutes will render either HomePage or EditorPage */} 
          <AppRoutes />
        </Box>
      </Box>

      {/* Mobile Bottom Navigation - Only on non-editor pages and mobile */} 
      {isMobile && !isEditorMode && (
        <BottomNavigation
          showLabels
          value={mobileNavValue}
          onChange={handleMobileNavChange}
          sx={{ 
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            zIndex: (theme) => theme.zIndex.drawer + 1, // Ensure it's above content
            borderTop: `1px solid ${theme.palette.divider}`
          }}
        >
          <BottomNavigationAction label={t('nav.home')} icon={<HomeIcon />} />
          <BottomNavigationAction label={t('nav.projects')} icon={<FolderIcon />} />
          <BottomNavigationAction label={t('nav.profile')} icon={<AccountCircleIcon />} />
        </BottomNavigation>
      )}
    </Box>
  );
}

export default App;
