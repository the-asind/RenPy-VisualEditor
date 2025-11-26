import React, { useState } from 'react';
import { AppBar, Toolbar, IconButton, Typography, Box, Menu, MenuItem, Tooltip, useMediaQuery } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import { useThemeContext } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { alpha, useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnimatedThemeToggle from './AnimatedThemeToggle';
import GlassSurface from './GlassSurface';

const TopBar: React.FC = () => {
  const { mode, toggleTheme } = useThemeContext();
  const { isAuthenticated, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
      position="sticky"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        background: 'transparent',
        color: theme.palette.text.primary,
        boxShadow: 'none',
        px: { xs: 1, sm: 2.5 },
        pt: { xs: 0.75, sm: 1.25 },
        pb: { xs: 0.5, sm: 1 },
      }}
      elevation={0}
    >
      <Toolbar disableGutters sx={{ minHeight: isMobile ? 70 : 80, justifyContent: 'center' }}>
        <GlassSurface
          width="100%"
          height={isMobile ? 64 : 72}
          borderRadius={isMobile ? 14 : 18}
          brightness={60}
          opacity={0.92}
          backgroundOpacity={theme.palette.mode === 'dark' ? 0.1 : 0.18}
          saturation={1.15}
          style={{ maxWidth: isMobile ? '100%' : 1140 }}
        >
          <Box
            sx={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: { xs: 1.25, sm: 2 },
              px: { xs: 1.5, sm: 2.25 },
            }}
          >
            <Box
              role="link"
              tabIndex={0}
              onClick={handleHomeClick}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHomeClick()}
              sx={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: { xs: 1.1, sm: 1.4 },
                py: 0.75,
                borderRadius: 999,
                background: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.06 : 0.14),
                color: theme.palette.text.primary,
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'lowercase',
                boxShadow: `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.3)}`,
                minWidth: 0,
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                renpy.online
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.25 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5 }}>
                <AnimatedThemeToggle mode={mode} onToggle={toggleTheme} />
              </Box>
              <Tooltip title={isAuthenticated ? t('nav.profile') : t('menu.login')}>
                <IconButton
                  size="medium"
                  onClick={() => navigate(isAuthenticated ? '/profile' : '/login')}
                  sx={{
                    bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.08 : 0.16),
                    color: theme.palette.text.primary,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.12 : 0.22),
                    },
                  }}
                >
                  <AccountCircleRoundedIcon />
                </IconButton>
              </Tooltip>
              {/* Language selector */}
              <Tooltip title={t('language.select', { defaultValue: 'Language' })}>
                <IconButton
                  size="medium"
                  aria-label="language"
                  aria-controls="language-menu"
                  aria-haspopup="true"
                  onClick={handleLangMenu}
                  sx={{
                    bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.08 : 0.16),
                    color: theme.palette.text.primary,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.12 : 0.22),
                    },
                  }}
                >
                  <TranslateIcon />
                </IconButton>
              </Tooltip>
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
              {/* Settings dropdown */}
              <Tooltip title={t('menu.settings')}>
                <IconButton
                  size="medium"
                  aria-label="settings"
                  aria-controls="settings-menu"
                  aria-haspopup="true"
                  onClick={handleSettingsMenu}
                  sx={{
                    bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.08 : 0.16),
                    color: theme.palette.text.primary,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.12 : 0.22),
                    },
                  }}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
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
          </Box>
        </GlassSurface>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;
