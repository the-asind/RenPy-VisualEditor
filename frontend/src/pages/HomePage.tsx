import React from 'react';
import { 
  Box, Typography, Grid, Card, CardContent, Button,
  IconButton, useTheme
} from '@mui/material';
import { motion } from 'framer-motion';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ShareIcon from '@mui/icons-material/Share';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Project {
  id: number;
  name: string;
  description: string;
  scriptCount: number;
  hasEditAccess?: boolean;
}

const projects: Project[] = [
  { 
    id: 1, 
    name: 'test', 
    description: 'Simple test project description.',
    scriptCount: 3,
    hasEditAccess: false
  },
  { 
    id: 2, 
    name: 'Разветвленный Сюжет', 
    description: 'Сложное повествование с несколькими концовками.',
    scriptCount: 7,
    hasEditAccess: true
  },
  { 
    id: 3, 
    name: 'Тренинг-система', 
    description: 'Интерактивный тренинг с вопросами и ответами.',
    scriptCount: 4,
    hasEditAccess: false
  },
  { 
    id: 4, 
    name: 'Симуляция', 
    description: 'Симуляция реального мира с элементами «вопрос-ответ».',
    scriptCount: 12,
    hasEditAccess: true
  },
  { 
    id: 5, 
    name: 'Новый проект', 
    description: 'Описание нового проекта.',
    scriptCount: 0,
    hasEditAccess: true
  },
];

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleOpenProject = (projectId: number) => {
    navigate(`/editor?project=${projectId}`);
  };

  const handleCreateNewProject = () => {
    console.log('Create new project');
  };

  return (
    <Box sx={{ p: 4, height: '100%' }}>
      {/* Page Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 5
        }}
      >
        <Typography 
          variant="h4" 
          component="h1" 
          sx={{ 
            fontWeight: 700,
            fontSize: '2rem',
          }}
        >
          {t('home.projects')}
        </Typography>
      </Box>

      {/* Recent Projects Section */}

      <Grid container spacing={3}>
        {projects.map((project) => (
          <Grid item xs={12} sm={6} lg={4} xl={3} key={project.id}>
            <Card
              sx={{
                height: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                p: 0,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              {/* Project Header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Typography 
                  sx={{ 
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {t('projects.script', { count: project.scriptCount })}
                </Typography>
                
                {project.hasEditAccess ? (
                  <Button
                    size="small"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      textTransform: 'none',
                      backgroundColor: theme.palette.primary.main,
                      color: 'white',
                      '&:hover': {
                        backgroundColor: theme.palette.primary.dark,
                      }
                    }}
                  >
                    {t('button.editor')}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      textTransform: 'none',
                      borderColor: theme.palette.primary.main,
                      color: theme.palette.primary.main,
                    }}
                  >
                    {t('button.viewer')}
                  </Button>
                )}
              </Box>

              {/* Project Content */}
              <CardContent sx={{ flex: 1, p: 2, pt: 2 }}>
                <Typography 
                  variant="h6"
                  sx={{ 
                    fontWeight: 600,
                    mb: 1.5,
                    fontSize: '1.2rem',
                  }}
                >
                  {project.name}
                </Typography>
                
                <Typography 
                  variant="body2" 
                  color="text.secondary"
                  sx={{
                    mb: 1,
                    fontSize: '0.95rem',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {project.description}
                </Typography>
              </CardContent>
              
              {/* Action Buttons */}
              <Box 
                sx={{ 
                  display: 'flex',
                  justifyContent: 'flex-end',
                  p: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  gap: 1
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => handleOpenProject(project.id)}
                  aria-label={t('action.openProject')}
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('action.shareProject')}
                >
                  <ShareIcon fontSize="small" />
                </IconButton>
              </Box>
            </Card>
          </Grid>
        ))}
        
        {/* "Create New" Card */}
        <Grid item xs={12} sm={6} lg={4} xl={3}>
          <motion.div
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.98 }}
            style={{ height: '100%' }}
          >
            <Card
              onClick={handleCreateNewProject}
              sx={{
                height: '100%',
                minHeight: 230,
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                p: 3,
                cursor: 'pointer',
                border: '1px dashed',
                borderColor: theme.palette.divider,
                backgroundColor: theme.palette.background.paper,
              }}
            >
              <Box
                sx={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  mb: 2,
                  bgcolor: theme.palette.primary.main,
                  color: '#fff',
                }}
              >
                <AddIcon sx={{ fontSize: 30 }} />
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                }}
              >
                {t('button.createNewProjectTitle')}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                align="center"
              >
                {t('button.createNewProjectDesc')}
              </Typography>
            </Card>
          </motion.div>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
