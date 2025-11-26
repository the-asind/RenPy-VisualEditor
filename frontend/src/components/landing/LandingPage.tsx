import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import GestureRoundedIcon from '@mui/icons-material/GestureRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import DarkVeil from './DarkVeil';

const LandingPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const glassSurface = {
    background: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.25 : 0.6),
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(16px)',
  };

  const roadmapBadges = [
    { label: t('landing.badges.visualEditor'), color: theme.palette.primary.main },
    { label: t('landing.badges.twoWay'), color: theme.palette.secondary.main },
    { label: t('landing.badges.collab'), color: theme.palette.success.main },
    { label: t('landing.badges.wysiwyg'), color: theme.palette.warning.main },
  ];

  const benefitCards = [
    {
      title: t('landing.cards.visualFirst.title'),
      icon: <GestureRoundedIcon />,
      text: t('landing.cards.visualFirst.text'),
    },
    {
      title: t('landing.cards.twoWay.title'),
      icon: <SyncAltRoundedIcon />,
      text: t('landing.cards.twoWay.text'),
    },
    {
      title: t('landing.cards.collab.title'),
      icon: <PeopleAltRoundedIcon />,
      text: t('landing.cards.collab.text'),
    },
    {
      title: t('landing.cards.confidence.title'),
      icon: <SecurityRoundedIcon />,
      text: t('landing.cards.confidence.text'),
    },
  ];

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: 'calc(100vh - 64px)',
        overflow: 'hidden',
        color: theme.palette.text.primary,
        background: theme.palette.mode === 'dark'
          ? 'radial-gradient(circle at 20% 20%, rgba(76,29,149,0.35), transparent 35%), radial-gradient(circle at 80% 10%, rgba(14,165,233,0.25), transparent 30%), #0b1021'
          : 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.12), transparent 35%), radial-gradient(circle at 80% 10%, rgba(236,72,153,0.1), transparent 30%), #f4f7fb',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: theme.palette.mode === 'dark' ? 0.7 : 0.8,
          pointerEvents: 'none',
        }}
      >
        <DarkVeil
          hueShift={theme.palette.mode === 'dark' ? 220 : 180}
          scanlineIntensity={0.25}
          noiseIntensity={0.05}
          speed={0.55}
          scanlineFrequency={1.8}
          warpAmount={0.9}
        />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(145deg, ${alpha(theme.palette.background.default, 0.6)} 0%, ${alpha(theme.palette.background.default, 0.2)} 50%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1200,
          mx: 'auto',
          px: { xs: 3, md: 5 },
          py: { xs: 6, md: 8 },
        }}
      >
        <Stack spacing={4}>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Box
              sx={{
                ...glassSurface,
                borderRadius: 4,
                p: { xs: 3, md: 4 },
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.9fr' },
                gap: 3,
                alignItems: 'stretch',
              }}
            >
              <Stack spacing={2} sx={{ height: '100%', justifyContent: 'flex-start' }}>
                <Chip
                  label={t('landing.hero.tag')}
                  color="primary"
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                />
                <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {t('landing.hero.title')}
                  <br />
                  <Typography component="span" variant="h4" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                    {t('landing.hero.subtitle')}
                  </Typography>
                </Typography>
                <Typography variant="body1" sx={{ maxWidth: 720, color: alpha(theme.palette.text.primary, 0.85) }}>
                  {t('landing.hero.description')}
                </Typography>

                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<PlayArrowRoundedIcon />}
                    onClick={() => navigate('/register')}
                  >
                    {t('menu.register')}
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<LoginRoundedIcon />}
                    onClick={() => navigate('/login')}
                    sx={{ borderColor: alpha(theme.palette.primary.main, 0.5) }}
                  >
                    {t('menu.login')}
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} sx={{ mt: 'auto' }}>
                  {roadmapBadges.map((badge) => (
                    <Chip
                      key={badge.label}
                      label={badge.label}
                      size="small"
                      sx={{
                        color: badge.color,
                        borderColor: alpha(badge.color, 0.5),
                        background: alpha(badge.color, 0.08),
                        fontWeight: 600,
                      }}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Stack>

              <Stack spacing={2} alignItems="stretch" justifyContent="center">
                <Box
                  sx={{
                    ...glassSurface,
                    borderRadius: 3,
                    p: 0,
                    overflow: 'hidden',
                    position: 'relative',
                    minHeight: { xs: 220, md: 260 },
                  }}
                >
                  <Box
                    component="iframe"
                    src="https://www.youtube.com/embed/TYLyjyfUyfQ"
                    title={t('landing.hero.videoTitle')}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    sx={{
                      border: 0,
                      width: '100%',
                      height: '100%',
                      minHeight: { xs: 220, md: 260 },
                    }}
                  />
                </Box>
              </Stack>
            </Box>
          </motion.div>

          <Grid container spacing={3} sx={{ mt: -1 }}>
            {benefitCards.map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.title}>
                <Card
                  sx={{
                    height: '100%',
                    borderRadius: 3,
                    ...glassSurface,
                    background: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.15 : 0.75),
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: alpha(theme.palette.primary.main, 0.12),
                          color: theme.palette.primary.main,
                        }}
                      >
                        {card.icon}
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {card.title}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {card.text}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card
            sx={{
              ...glassSurface,
              borderRadius: 4,
              p: { xs: 3, md: 4 },
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' },
              gap: 3,
            }}
          >
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <SensorsRoundedIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {t('landing.realtime.title')}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('landing.realtime.description')}
              </Typography>
            </Stack>
            <Stack spacing={2} justifyContent="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('landing.realtime.ready')}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<PlayArrowRoundedIcon />}
                  onClick={() => navigate('/register')}
                >
                  {t('menu.register')}
                </Button>
                <Button
                  fullWidth
                  variant="text"
                  startIcon={<CodeRoundedIcon />}
                  onClick={() => navigate('/login')}
                  sx={{ color: theme.palette.text.primary }}
                >
                  {t('menu.login')}
                </Button>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      </Box>
    </Box>
  );
};

export default LandingPage;
