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
    name: 'Visual Novel Demo', 
    description: 'A simple visual novel demonstrating basic gameplay mechanics and character dialogues.',
    scriptCount: 3,
    hasEditAccess: false
  },
  { 
    id: 2, 
    name: 'Branching Storyline', 
    description: 'Complex narrative with multiple endings based on player choices throughout the game.',
    scriptCount: 7,
    hasEditAccess: true
  },
  { 
    id: 3, 
    name: 'Character Introduction', 
    description: 'Character development sequences with backstories and personality traits.',
    scriptCount: 4,
    hasEditAccess: false
  },
  { 
    id: 4, 
    name: 'Mystery Adventure', 
    description: 'Interactive detective story with clues, evidence collection, and suspect interrogation.',
    scriptCount: 12,
    hasEditAccess: true
  },
];

const HomePage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

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
          My Projects
        </Typography>
      </Box>

      {/* Recent Projects Section */}
      <Typography 
        variant="subtitle1" 
        sx={{ 
          mb: 3, 
          fontWeight: 600,
          ml: 1
        }}
      >
        Recent Projects
      </Typography>

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
                  {project.scriptCount} script{project.scriptCount !== 1 ? 's' : ''}
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
                    Editor
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
                    Viewer
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
                  aria-label="Open project"
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Share project"
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
                Create New Project
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                align="center"
              >
                Start building your next Ren'Py visual novel project
              </Typography>
            </Card>
          </motion.div>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;
