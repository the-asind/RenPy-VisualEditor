import React, { useMemo } from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
import WbSunnyRoundedIcon from '@mui/icons-material/WbSunnyRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';

interface AnimatedThemeToggleProps {
  mode: 'light' | 'dark';
  onToggle: () => void;
}

const AnimatedThemeToggle: React.FC<AnimatedThemeToggleProps> = ({ mode, onToggle }) => {
  const theme = useTheme();
  const isDark = mode === 'dark';

  const containerVariants = useMemo(() => ({
    light: {
      background: `linear-gradient(135deg,
        ${alpha(theme.palette.warning.light, 0.35)},
        ${alpha(theme.palette.info.light, 0.28)}
      )`,
      borderColor: alpha(theme.palette.warning.main, 0.5),
      boxShadow: `0 12px 24px -16px ${alpha(theme.palette.warning.main, 0.6)}`,
    },
    dark: {
      background: `linear-gradient(135deg,
        ${alpha(theme.palette.primary.dark, 0.3)},
        ${alpha(theme.palette.secondary.dark, 0.45)}
      )`,
      borderColor: alpha(theme.palette.secondary.main, 0.5),
      boxShadow: `0 12px 24px -16px ${alpha(theme.palette.secondary.main, 0.65)}`,
    },
  }), [theme.palette.info.light, theme.palette.primary.dark, theme.palette.secondary.dark, theme.palette.secondary.main, theme.palette.warning.light, theme.palette.warning.main]);

  const thumbVariants = useMemo(() => ({
    light: {
      x: 0,
      backgroundColor: alpha(theme.palette.common.white, 0.9),
      color: theme.palette.warning.main,
    },
    dark: {
      x: 30,
      backgroundColor: alpha(theme.palette.common.white, 0.2),
      color: theme.palette.info.light,
    },
  }), [theme.palette.common.white, theme.palette.info.light, theme.palette.warning.main]);

  const auraVariants = useMemo(() => ({
    light: {
      opacity: 0.55,
      scale: 1,
    },
    dark: {
      opacity: 0.8,
      scale: 1.08,
    },
  }), []);

  return (
    <Box
      component={motion.button}
      type="button"
      onClick={onToggle}
      initial={false}
      animate={isDark ? 'dark' : 'light'}
      variants={containerVariants}
      sx={{
        width: 64,
        height: 34,
        borderRadius: 999,
        borderWidth: 1.5,
        borderStyle: 'solid',
        padding: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        position: 'relative',
        cursor: 'pointer',
        overflow: 'hidden',
        background: 'transparent',
      }}
      whileTap={{ scale: 0.96 }}
    >
      <Box
        component={motion.span}
        variants={auraVariants}
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: `radial-gradient(circle at 20% 20%, ${alpha(theme.palette.common.white, 0.3)}, transparent 60%)`,
          filter: 'blur(12px)',
        }}
      />
      <Box
        component={motion.span}
        variants={thumbVariants}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        sx={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          boxShadow: `0 12px 20px -12px ${alpha(theme.palette.common.black, 0.8)}`,
        }}
      >
        {isDark ? (
          <DarkModeRoundedIcon sx={{ fontSize: 18 }} />
        ) : (
          <WbSunnyRoundedIcon sx={{ fontSize: 18 }} />
        )}
      </Box>
    </Box>
  );
};

export default AnimatedThemeToggle;
