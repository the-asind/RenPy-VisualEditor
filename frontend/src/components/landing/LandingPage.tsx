import React from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { keyframes } from '@emotion/react';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded';
import DeviceHubRoundedIcon from '@mui/icons-material/DeviceHubRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const veilDrift = keyframes`
  0% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(10px, -12px, 0) scale(1.05); }
  100% { transform: translate3d(-6px, 8px, 0) scale(1); }
`;

const float = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0); }
`;

type GlassIconProps = {
  accent: string;
  children: React.ReactNode;
};

const GlassIcon = ({ accent, children }: GlassIconProps) => (
  <Box
    sx={{
      width: 54,
      height: 54,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '18px',
      position: 'relative',
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${alpha('#FFFFFF', 0.12)}, ${alpha(
        '#FFFFFF',
        0.02,
      )})`,
      border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
      boxShadow: `0 12px 40px ${alpha(accent, 0.28)}, inset 0 1px 0 ${alpha('#FFFFFF', 0.6)}`,
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 1,
        borderRadius: '16px',
        background: `linear-gradient(145deg, ${alpha(accent, 0.12)}, ${alpha(
          accent,
          0.05,
        )})`,
        opacity: 0.9,
      },
      '& > *': {
        position: 'relative',
        color: accent,
      },
    }}
  >
    {children}
  </Box>
);

const DarkVeilBackground = ({ accent }: { accent: string }) => (
  <Box
    aria-hidden
    sx={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      background: `
        radial-gradient(circle at 15% 20%, ${alpha(accent, 0.16)}, transparent 28%),
        radial-gradient(circle at 80% 10%, ${alpha('#5eead4', 0.16)}, transparent 25%),
        radial-gradient(circle at 70% 70%, ${alpha('#a855f7', 0.18)}, transparent 35%),
        linear-gradient(135deg, #05030f 0%, #0b1030 40%, #0c122e 100%)
      `,
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: '-20%',
        background: `conic-gradient(from 120deg, ${alpha(
          accent,
          0.12,
        )}, transparent, ${alpha('#22d3ee', 0.12)}, transparent 70%)`,
        filter: 'blur(90px)',
        animation: `${veilDrift} 18s ease-in-out infinite`,
        opacity: 0.6,
      },
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: '-10%',
        background: `radial-gradient(circle at 40% 60%, ${alpha('#8b5cf6', 0.25)}, transparent 45%)`,
        filter: 'blur(120px)',
        mixBlendMode: 'screen',
        opacity: 0.55,
      },
    }}
  />
);

const FeatureCard = ({
  title,
  subtitle,
  icon,
  accent,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
}) => (
  <motion.div
    whileHover={{ y: -6, scale: 1.01 }}
    transition={{ type: 'spring', stiffness: 180, damping: 15 }}
    style={{ height: '100%' }}
  >
    <Card
      sx={{
        height: '100%',
        p: 3,
        borderRadius: 3,
        background: alpha('#0f172a', 0.55),
        border: `1px solid ${alpha('#ffffff', 0.08)}`,
        backdropFilter: 'blur(16px)',
        boxShadow: `0 10px 40px ${alpha('#000', 0.35)}, inset 0 1px 0 ${alpha('#fff', 0.15)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <GlassIcon accent={accent}>{icon}</GlassIcon>
      <Typography variant="h6" sx={{ color: '#f8fafc', fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: alpha('#e2e8f0', 0.75), lineHeight: 1.6 }}>
        {subtitle}
      </Typography>
    </Card>
  </motion.div>
);

const LandingPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const primary = theme.palette.primary.main;

  const benefits = [
    {
      title: 'Визуальный редактор узлов',
      subtitle: 'Стройте сюжетную карту Ren\'Py в стиле ReactFlow без ручного кода.',
      icon: <DeviceHubRoundedIcon />,
      accent: '#7c3aed',
    },
    {
      title: 'Двусторонняя синхронизация',
      subtitle: 'Конвертируйте Ren\'Py ↔ визуальная схема, сохраняя форматирование и ссылки на строки.',
      icon: <SyncRoundedIcon />,
      accent: '#22d3ee',
    },
    {
      title: 'Совместная работа',
      subtitle: 'Видимость присутствия, обновления в реальном времени и безопасное редактирование.',
      icon: <CloudDoneRoundedIcon />,
      accent: '#34d399',
    },
    {
      title: 'WYSIWYG диалоги',
      subtitle: 'Редактор реплик и ветвлений с предпросмотром и вставкой блоков меню/условий.',
      icon: <EditRoundedIcon />,
      accent: '#f472b6',
    },
    {
      title: 'Надёжный парсер',
      subtitle: 'Прямые ссылки на строки сценария, меньше ошибок при конвертации и коммитах.',
      icon: <SecurityRoundedIcon />,
      accent: '#38bdf8',
    },
    {
      title: 'Бэкенд + API',
      subtitle: 'FastAPI, SQLite, загрузка/выгрузка файлов, WebSocket для синхронизации.',
      icon: <BoltRoundedIcon />,
      accent: '#f59e0b',
    },
  ];

  const roadmap = [
    'Сборка узлов и связей drag-and-drop',
    'История правок и версии файлов',
    'Расширенные конструкции Ren\'Py (переходы, спрайты, эффекты)',
    'Автообновление графа при правке текста',
  ];

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        color: '#e5e7eb',
        pb: { xs: 10, md: 12 },
      }}
    >
      <DarkVeilBackground accent={primary} />

      {/* Floating glass icons to echo GlassIcons pack */}
      <Box
        sx={{
          position: 'absolute',
          top: '12%',
          right: { xs: '6%', md: '10%' },
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 1,
        }}
      >
        <Box sx={{ animation: `${float} 6s ease-in-out infinite` }}>
          <GlassIcon accent="#8b5cf6">
            <AutoGraphRoundedIcon fontSize="medium" />
          </GlassIcon>
        </Box>
        <Box sx={{ animation: `${float} 7s ease-in-out infinite`, animationDelay: '0.6s' }}>
          <GlassIcon accent="#22d3ee">
            <TimelineRoundedIcon fontSize="medium" />
          </GlassIcon>
        </Box>
      </Box>

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2, pt: { xs: 11, md: 14 } }}>
        <Grid container spacing={6} alignItems="center">
          <Grid item xs={12} md={7}>
            <Stack spacing={3}>
              <Chip
                label="Liquid Glass • React Design • Dark Veil"
                sx={{
                  alignSelf: 'flex-start',
                  background: alpha('#ffffff', 0.08),
                  color: '#cbd5e1',
                  border: `1px solid ${alpha('#ffffff', 0.2)}`,
                  backdropFilter: 'blur(8px)',
                  borderRadius: '999px',
                  px: 1.5,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              />
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '2.8rem', md: '3.6rem' },
                  color: '#f8fafc',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  textShadow: `0 10px 40px ${alpha(primary, 0.35)}`,
                }}
              >
                Редактор визуальных новелл на Ren&apos;Py с эффектом жидкого стекла.
              </Typography>
              <Typography
                sx={{
                  color: alpha('#e2e8f0', 0.8),
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                  maxWidth: 720,
                  lineHeight: 1.7,
                }}
              >
                Создавайте ветвящиеся истории без ручного кода: визуальный граф, двусторонняя
                конвертация Ren&apos;Py ↔ узлы, живое сотрудничество и надёжный парсер, который
                сохраняет структуру исходного сценария.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate('/register')}
                  endIcon={<PlayArrowRoundedIcon />}
                  sx={{
                    py: 1.6,
                    px: 3.4,
                    fontWeight: 700,
                    borderRadius: '14px',
                    textTransform: 'none',
                    background: `linear-gradient(135deg, ${primary}, ${alpha(primary, 0.7)})`,
                    boxShadow: `0 18px 45px ${alpha(primary, 0.4)}`,
                  }}
                >
                  Начать бесплатно
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => navigate('/login')}
                  sx={{
                    py: 1.6,
                    px: 3,
                    fontWeight: 700,
                    borderRadius: '14px',
                    textTransform: 'none',
                    color: '#e2e8f0',
                    borderColor: alpha('#e2e8f0', 0.3),
                    backdropFilter: 'blur(10px)',
                    background: alpha('#0f172a', 0.6),
                    '&:hover': {
                      borderColor: alpha('#e2e8f0', 0.6),
                      background: alpha('#0f172a', 0.8),
                    },
                  }}
                >
                  Смотреть редактор
                </Button>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                {['Визуальные узлы', 'Реальное время', 'RenPy ↔ схема', 'Коллаборация'].map(
                  (item) => (
                    <Chip
                      key={item}
                      label={item}
                      variant="outlined"
                      sx={{
                        color: '#cbd5e1',
                        borderColor: alpha('#cbd5e1', 0.3),
                        background: alpha('#ffffff', 0.03),
                        backdropFilter: 'blur(10px)',
                      }}
                    />
                  ),
                )}
              </Stack>
            </Stack>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card
              sx={{
                p: 3,
                borderRadius: 3,
                background: alpha('#0b1226', 0.75),
                border: `1px solid ${alpha('#ffffff', 0.1)}`,
                boxShadow: `0 25px 70px ${alpha('#000', 0.45)}, inset 0 1px 0 ${alpha(
                  '#fff',
                  0.08,
                )}`,
                backdropFilter: 'blur(18px)',
              }}
            >
              <Stack spacing={2.4}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <GlassIcon accent={primary}>
                    <DeviceHubRoundedIcon />
                  </GlassIcon>
                  <Box>
                    <Typography sx={{ color: '#e2e8f0', fontWeight: 700 }}>
                      Работайте как в Figma, публикуйте как в Ren&apos;Py
                    </Typography>
                    <Typography variant="body2" sx={{ color: alpha('#cbd5e1', 0.7) }}>
                      Ветвление, условия, меню, реплики — всё доступно прямо в графе.
                    </Typography>
                  </Box>
                </Stack>

                <Divider sx={{ borderColor: alpha('#ffffff', 0.08) }} />

                <Grid container spacing={2}>
                  {[
                    { label: '2-way sync', value: 'Готово' },
                    { label: 'Live presence', value: 'Онлайн' },
                    { label: 'Parser', value: 'fast/precise' },
                  ].map((item) => (
                    <Grid item xs={4} key={item.label}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          background: alpha('#ffffff', 0.04),
                          border: `1px solid ${alpha('#ffffff', 0.06)}`,
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{ color: '#cbd5e1', letterSpacing: 0.2, fontSize: '0.85rem' }}
                        >
                          {item.label}
                        </Typography>
                        <Typography sx={{ color: '#f8fafc', fontWeight: 800, fontSize: '1.1rem' }}>
                          {item.value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    background: `linear-gradient(135deg, ${alpha(primary, 0.22)}, ${alpha(
                      '#0ea5e9',
                      0.2,
                    )})`,
                    border: `1px solid ${alpha('#ffffff', 0.12)}`,
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                  }}
                >
                  <GlassIcon accent="#22d3ee">
                    <PlayArrowRoundedIcon />
                  </GlassIcon>
                  <Box>
                    <Typography sx={{ color: '#f8fafc', fontWeight: 700 }}>
                      Воспроизведите ветку прямо из узлов
                    </Typography>
                    <Typography variant="body2" sx={{ color: alpha('#e2e8f0', 0.75) }}>
                      Быстрый предпросмотр диалогов и выборов без ручной сборки билда.
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 9 }}>
          <Stack spacing={2} sx={{ mb: 4 }}>
            <Typography variant="h5" sx={{ color: '#f8fafc', fontWeight: 800 }}>
              Бенефиты из README, собранные в одну ленту
            </Typography>
            <Typography sx={{ color: alpha('#e2e8f0', 0.7) }}>
              Вдохновлено Roadmap: визуальный редактор, двусторонняя конвертация, живой бэкенд,
              коллаборация, база проектов и безопасное хранение сценариев.
            </Typography>
          </Stack>
          <Grid container spacing={2.6}>
            {benefits.map((benefit) => (
              <Grid key={benefit.title} item xs={12} sm={6} md={4}>
                <FeatureCard
                  title={benefit.title}
                  subtitle={benefit.subtitle}
                  icon={benefit.icon}
                  accent={benefit.accent}
                />
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box
          sx={{
            mt: 8,
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            background: alpha('#0b1226', 0.7),
            border: `1px solid ${alpha('#ffffff', 0.08)}`,
            boxShadow: `0 18px 50px ${alpha('#000', 0.4)}`,
            backdropFilter: 'blur(14px)',
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ color: '#f8fafc', fontWeight: 800 }}>
                  Как работает визуальный бранчинг
                </Typography>
                <Typography sx={{ color: alpha('#cbd5e1', 0.78), lineHeight: 1.6 }}>
                  Используйте инструмент Branch прямо в редакторе: выберите узел, создайте меню или
                  if/elif/else, заполните форму, превью блока и сохраните. Скрипт обновится через
                  API, граф перерисуется, а все участники увидят изменения через WebSocket.
                </Typography>
                <Stack spacing={1}>
                  {roadmap.map((item) => (
                    <Stack
                      key={item}
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{
                        p: 1,
                        borderRadius: 2,
                        background: alpha('#ffffff', 0.03),
                        border: `1px solid ${alpha('#ffffff', 0.06)}`,
                      }}
                    >
                      <GlassIcon accent="#8b5cf6">
                        <TimelineRoundedIcon fontSize="small" />
                      </GlassIcon>
                      <Typography sx={{ color: '#e2e8f0' }}>{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: alpha('#0d1a36', 0.8),
                  border: `1px solid ${alpha('#ffffff', 0.1)}`,
                  boxShadow: `0 16px 40px ${alpha('#000', 0.35)}`,
                }}
              >
                <Stack spacing={2.2}>
                  <Typography sx={{ color: '#cbd5e1', fontWeight: 700 }}>
                    Что получаете сразу
                  </Typography>
                  <Stack spacing={1.4}>
                    {[
                      'Парсер Ren\'Py, который сохраняет оригинальный стиль и формат',
                      'Режим прямого редактирования текста сценария с якорями узлов',
                      'Загрузка/выгрузка проектов, SQLite + FastAPI',
                      'Присутствие пользователей и обновления через WebSocket',
                    ].map((item) => (
                      <Stack key={item} direction="row" spacing={1.5} alignItems="center">
                        <GlassIcon accent="#22d3ee">
                          <BoltRoundedIcon fontSize="small" />
                        </GlassIcon>
                        <Typography sx={{ color: '#e2e8f0' }}>{item}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </Box>

        <Card
          sx={{
            mt: 8,
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            background: `linear-gradient(135deg, ${alpha(primary, 0.18)}, ${alpha('#0ea5e9', 0.14)})`,
            border: `1px solid ${alpha('#ffffff', 0.14)}`,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 24px 60px ${alpha(primary, 0.35)}`,
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography
                variant="h5"
                sx={{
                  color: '#f8fafc',
                  fontWeight: 800,
                  mb: 1,
                }}
              >
                Визуальный рендер, Liquid Glass UI и готовность к продакшену.
              </Typography>
              <Typography sx={{ color: alpha('#e2e8f0', 0.8), mb: 2 }}>
                Подключите проект и начните строить сюжет: двусторонняя конвертация, сетка узлов,
                коллаборация и безопасный бэкенд. Всё, что описано в README, доступно сразу после
                логина.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => navigate('/register')}
                  sx={{
                    px: 3,
                    py: 1.3,
                    fontWeight: 700,
                    borderRadius: '12px',
                    textTransform: 'none',
                  }}
                >
                  Создать проект
                </Button>
                <Button
                  variant="text"
                  onClick={() => navigate('/login')}
                  sx={{
                    color: '#f8fafc',
                    textTransform: 'none',
                    fontWeight: 700,
                  }}
                >
                  Уже есть аккаунт
                </Button>
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={1.2}>
                <Typography sx={{ color: '#cbd5e1', fontWeight: 700 }}>Статус</Typography>
                <Stack direction="row" spacing={1.4} alignItems="center">
                  <GlassIcon accent="#34d399">
                    <CloudDoneRoundedIcon />
                  </GlassIcon>
                  <Box>
                    <Typography sx={{ color: '#f8fafc', fontWeight: 700 }}>Онлайн</Typography>
                    <Typography variant="body2" sx={{ color: alpha('#e2e8f0', 0.7) }}>
                      WebSocket синхронизация включена
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1.4} alignItems="center">
                  <GlassIcon accent="#f59e0b">
                    <AutoGraphRoundedIcon />
                  </GlassIcon>
                  <Box>
                    <Typography sx={{ color: '#f8fafc', fontWeight: 700 }}>Перфоманс</Typography>
                    <Typography variant="body2" sx={{ color: alpha('#e2e8f0', 0.7) }}>
                      Парсер и граф оптимизированы для больших сценариев
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </Grid>
          </Grid>
        </Card>
      </Container>
    </Box>
  );
};

export default LandingPage;
