import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import GestureRoundedIcon from '@mui/icons-material/GestureRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
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
import GlassIcons, { GlassIconsItem } from './GlassIcons';

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

  const iconItems: GlassIconsItem[] = [
    { icon: <HubRoundedIcon fontSize="medium" />, color: 'blue', label: 'Visual nodes' },
    { icon: <SyncAltRoundedIcon fontSize="medium" />, color: 'purple', label: 'Two-way sync' },
    { icon: <PeopleAltRoundedIcon fontSize="medium" />, color: 'red', label: 'Collaboration' },
    { icon: <GestureRoundedIcon fontSize="medium" />, color: 'indigo', label: 'Branch tool' },
    { icon: <CodeRoundedIcon fontSize="medium" />, color: 'orange', label: 'Keeps formatting' },
    { icon: <SecurityRoundedIcon fontSize="medium" />, color: 'green', label: 'Auth ready' },
  ];

  const roadmapBadges = [
    { label: 'Visual node-based editor', color: theme.palette.primary.main },
    { label: 'Two-way Ren’Py ↔ graph conversion', color: theme.palette.secondary.main },
    { label: 'Real-time collaborative editing', color: theme.palette.success.main },
    { label: 'Direct script editing with WYSIWYG nodes', color: theme.palette.warning.main },
  ];

  const benefitCards = [
    {
      title: 'Visual-first editing',
      icon: <GestureRoundedIcon />,
      text: 'Design branching dialogues on a node canvas while the engine tracks exact line ranges in the Ren’Py file.',
    },
    {
      title: 'Two-way conversion',
      icon: <SyncAltRoundedIcon />,
      text: 'Switch between graph and script without losing structure; keep formatting intact for writers and reviewers.',
    },
    {
      title: 'Collaboration built in',
      icon: <PeopleAltRoundedIcon />,
      text: 'WebSocket updates, live presence, and the roadmap toward conflict resolution, history, and undo/redo.',
    },
    {
      title: 'Operational confidence',
      icon: <SecurityRoundedIcon />,
      text: 'FastAPI backend, auth, project storage, uploads/downloads, and SQLite persistence ready for teams.',
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
                gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' },
                gap: 3,
              }}
            >
              <Stack spacing={2}>
                <Chip
                  label="Ren'Py Visual Editor"
                  color="primary"
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                />
                <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  Визуальный редактор Ren&apos;Py
                  <br />
                  <Typography component="span" variant="h4" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                    Build branching stories without fighting the script file.
                  </Typography>
                </Typography>
                <Typography variant="body1" sx={{ maxWidth: 720, color: alpha(theme.palette.text.primary, 0.85) }}>
                  Visual node-based editing, two-way Ren&apos;Py conversion, and real-time collaboration.
                  Keep every line formatted as authors expect while teams co-edit scenes and branches.
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

                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
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
                <Box sx={{ ...glassSurface, borderRadius: 3, p: 2 }}>
                  <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 1.2, mb: 1 }}>
                    Liquid Glass Highlights
                  </Typography>
                  <GlassIcons items={iconItems} className="glass-icons-grid" />
                </Box>
              </Stack>
            </Box>
          </motion.div>

          <Grid container spacing={3}>
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

          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>
              <Card
                sx={{
                  ...glassSurface,
                  borderRadius: 4,
                  p: 3,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <BoltRoundedIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Branch creation workflow
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Build menus and conditionals straight from the graph editor while the API injects correct Ren’Py
                  snippets. Perfect for menu-heavy visual novels.
                </Typography>
                <Stack spacing={1.5}>
                  {[
                    'Activate the branch tool, click a node, and pick menu or if/elif/else.',
                    'Preview generated Ren’Py snippets before saving.',
                    'Insert directly into the script and see the graph update instantly.',
                  ].map((step, index) => (
                    <Stack
                      key={step}
                      direction="row"
                      alignItems="flex-start"
                      spacing={1.5}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        background: alpha(theme.palette.primary.main, 0.07),
                      }}
                    >
                      <Chip label={`0${index + 1}`} size="small" color="primary" />
                      <Typography variant="body2">{step}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            </Grid>

            <Grid item xs={12} md={5}>
              <Card
                sx={{
                  ...glassSurface,
                  borderRadius: 4,
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AutoFixHighRoundedIcon color="secondary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Why teams pick this editor
                  </Typography>
                </Stack>
                <Divider sx={{ borderColor: alpha(theme.palette.divider, 0.6) }} />
                <Stack spacing={1}>
                  {[
                    'Keeps original script formatting while you edit nodes.',
                    'WYSIWYG dialogue editor for fast polish.',
                    'Upload/download support for sharing builds.',
                    'Auth, project management, and SQLite persistence included.',
                  ].map((item) => (
                    <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: alpha(theme.palette.secondary.main, 0.9),
                          mt: 0.6,
                        }}
                      />
                      <Typography variant="body2">{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            </Grid>
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
                  Real-time ready
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                WebSocket-powered collaboration, project-level access control, and presence indicators are already in
                place. Next up: conflict resolution and history/undo on the roadmap.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label="FastAPI backend" variant="outlined" />
                <Chip label="ReactFlow graph" variant="outlined" />
                <Chip label="SQLite persistence" variant="outlined" />
                <Chip label="Auth + project roles" variant="outlined" />
              </Stack>
            </Stack>
            <Stack spacing={2} justifyContent="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Ready to test it?
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
