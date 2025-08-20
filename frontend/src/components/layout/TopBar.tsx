import React, { useState } from 'react';
import { AppBar, Toolbar, IconButton, Typography, Box, Menu, MenuItem, Button } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import AccountCircle from '@mui/icons-material/AccountCircle';
import TranslateIcon from '@mui/icons-material/Translate';
import SettingsIcon from '@mui/icons-material/Settings';
import { useThemeContext } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TopBar: React.FC = () => {
  const { mode, toggleTheme } = useThemeContext();
  const { isAuthenticated, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();

  // Language menu state
  const [langAnchorEl, setLangAnchorEl] = useState<null | HTMLElement>(null);
  const handleLangMenu = (e: React.MouseEvent<HTMLElement>) => setLangAnchorEl(e.currentTarget);
  const handleLangClose = () => setLangAnchorEl(null);
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    handleLangClose();
  };
  // Settings menu state
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const handleSettingsMenu = (e: React.MouseEvent<HTMLElement>) => setSettingsAnchorEl(e.currentTarget);
  const handleSettingsClose = () => setSettingsAnchorEl(null);

  const handleSettings = () => {
    navigate('/profile');
    handleSettingsClose();
  };

  const handleLogout = () => {
    logout();
    handleSettingsClose();
  };

  const handleHomeClick = () => {
    navigate('/');
  };

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: theme.palette.background.paper,
        color: theme.palette.text.primary,
      }}
      elevation={1}
    >
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="home"
          sx={{ mr: 2 }}
          onClick={handleHomeClick}
        >
          <HomeIcon />
        </IconButton>

        <Typography
          variant="h6"
          component="div"
          sx={{ ml: 1, flexGrow: 1 }}
          color="inherit"
        >
          {t('app.title')}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton sx={{ ml: 1 }} onClick={toggleTheme} color="inherit">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          {/* Language selector */}
          <IconButton
            size="large"
            aria-label="language"
            aria-controls="language-menu"
            aria-haspopup="true"
            onClick={handleLangMenu}
            color="inherit"
          >
            <TranslateIcon />
          </IconButton>
          <Menu
            id="language-menu"
            anchorEl={langAnchorEl}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            keepMounted
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            open={Boolean(langAnchorEl)}
            onClose={handleLangClose}
          >
            <MenuItem onClick={() => changeLanguage('en')}>{t('language.english')}</MenuItem>
            <MenuItem onClick={() => changeLanguage('ru')}>{t('language.russian')}</MenuItem>
            <MenuItem onClick={() => changeLanguage('ja')}>{t('language.japanese')}</MenuItem>
            <MenuItem onClick={() => changeLanguage('zh')}>{t('language.chinese')}</MenuItem>
            <MenuItem onClick={() => changeLanguage('de')}>{t('language.german')}</MenuItem>
          </Menu>
          {!isAuthenticated && (
            <>
              <Button color="inherit" onClick={() => navigate('/login')}>
                {t('menu.login')}
              </Button>
              <Button color="inherit" onClick={() => navigate('/register')}>
                {t('menu.register')}
              </Button>
            </>
          )}
          {/* Settings dropdown */}
          <IconButton
            size="large"
            aria-label="settings"
            aria-controls="settings-menu"
            aria-haspopup="true"
            onClick={handleSettingsMenu}
            color="inherit"
          >
            <SettingsIcon />
          </IconButton>
          <Menu
            id="settings-menu"
            anchorEl={settingsAnchorEl}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            keepMounted
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            open={Boolean(settingsAnchorEl)}
            onClose={handleSettingsClose}
          >
            <MenuItem onClick={handleSettings}>{t('menu.settings')}</MenuItem>
            {isAuthenticated && <MenuItem onClick={handleLogout}>{t('menu.logout')}</MenuItem>}
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
